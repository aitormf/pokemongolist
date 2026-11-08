"""
Eventos de Pokémon GO y Pokémon disponibles en cada uno.

Fuentes:
  - ScrapedDuck (https://github.com/bigfoott/ScrapedDuck): JSON con la lista de
    eventos de LeekDuck y lo que está activo ahora (incursiones, huevos,
    investigación de campo, Team GO Rocket).
  - Páginas de evento de LeekDuck (https://leekduck.com/events/...): ScrapedDuck
    no incluye la lista de Pokémon de la mayoría de eventos, así que se lee de
    la propia página. Se hace con pocas peticiones, de una en una y con pausa,
    y no se vuelve a leer una página descargada hace menos de DETAIL_TTL.

Cada Pokémon se enlaza con nuestras formas (PokemonForm) a partir del nombre del
icono de LeekDuck, para poder cruzarlo con los flags de los usuarios.
"""

import asyncio
import hashlib
import logging
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import httpx
from bs4 import BeautifulSoup, Tag
from sqlalchemy.orm import Session

from app.models import Event, EventPokemon, PokemonForm, SourceVersion
from app.services.assets import asset_form

log = logging.getLogger(__name__)

SCRAPEDDUCK_BASE = "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/"
USER_AGENT = "PokeWish/1.0 (visor de eventos autoalojado)"

# Pausa entre páginas de LeekDuck y antigüedad máxima de una página ya leída
PAGE_DELAY_SECONDS = 1.5
DETAIL_TTL = timedelta(hours=20)

# Fechas sin "Z" son hora local: puede que el evento siga activo en alguna zona
# horaria hasta 14 h después de su hora de fin en UTC
LOCAL_TIME_MARGIN = timedelta(hours=14)

# Tipos de evento sin Pokémon que mostrar: no se descarga su página
SKIP_DETAIL_TYPES = {"go-battle-league", "go-pass"}

# Sección de la página de LeekDuck (clase del <h2 class="event-section-header X">)
# → sección propia. None = se ignora.
SECTION_MAP = {
    "spawns": "spawns",
    "photobomb": "spawns",
    "raids": "raids",
    "eggs": "eggs",
    "research": "research",
    "max-battles": "max_battles",
    "features": "featured",
    "shiny": None,
    "sales": None,
    "bonuses": None,
}

PM_ICON_RE = re.compile(
    r"^pm(\d+)(?:\.f([A-Z0-9_]+))?(?:\.c([A-Z0-9_]+))?(?:\.g\d)?(?:\.s)?\.icon\.png$"
)
OLD_ICON_RE = re.compile(r"^pokemon_icon_(\d+)_(\d+)(?:_\d+)?(?:_shiny)?\.png$")
CAPTURE_ICON_RE = re.compile(r"^poke_capture_(\d+)_")
PAREN_RE = re.compile(r"\(([^)]+)\)")
# Prefijos del nombre en LeekDuck que no forman parte del nombre de la especie
NAME_PREFIX_RE = re.compile(
    r"^(?:(?:Mega|Primal|Shadow|Dynamax|Gigantamax|Eternamax|Mighty|Apex)\s+)+"
)

_update_lock = asyncio.Lock()


# ── Utilidades ────────────────────────────────────────────────────────────────

def _text(el: Tag | None) -> str:
    return " ".join(el.get_text(" ", strip=True).split()) if el else ""


def _parse_dt(value: str | None) -> tuple[datetime | None, bool]:
    """Devuelve (fecha como UTC, es_hora_local)."""
    if not value:
        return None, False
    is_local = not value.endswith("Z")
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None, is_local
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt, is_local


def is_finished(end: str | None, now: datetime | None = None) -> bool:
    dt, is_local = _parse_dt(end)
    if dt is None:
        return False
    now = now or datetime.now(timezone.utc)
    return dt + (LOCAL_TIME_MARGIN if is_local else timedelta(0)) < now


# ── Enlace con nuestras formas ────────────────────────────────────────────────

class FormIndex:
    """Índice de PokemonForm por (nº pokédex, sufijo de forma de los assets)."""

    def __init__(self, forms: list[PokemonForm]):
        self.by_key: dict[tuple[int, str | None], str] = {}
        self.by_dex: dict[int, list[str]] = defaultdict(list)
        self.dex_by_species: dict[str, int] = {}
        for pf in forms:
            suffix = asset_form(pf.pokemon_id, pf.form) if pf.form else None
            self.by_key[(pf.pokedex_number, suffix)] = pf.id
            if pf.form:
                # Algunos iconos usan la forma completa (pm201.fUNOWN_A)
                self.by_key.setdefault((pf.pokedex_number, pf.form), pf.id)
            self.by_dex[pf.pokedex_number].append(pf.id)
            self.dex_by_species[pf.pokemon_id] = pf.pokedex_number

    def _dex_from_name(self, name: str) -> int | None:
        """"Gigantamax Duraludon" → 884, "Mr. Mime" → 122 (por pokemon_id)."""
        species = NAME_PREFIX_RE.sub("", PAREN_RE.sub("", name)).strip()
        key = re.sub(r"[^A-Z0-9]+", "_", species.upper()).strip("_")
        return self.dex_by_species.get(key)

    def match(self, name: str, image_url: str | None) -> tuple[int | None, str | None]:
        """Devuelve (nº pokédex, id de forma) o (None, None) si no se reconoce."""
        filename = (image_url or "").split("?", 1)[0].rsplit("/", 1)[-1]
        dex: int | None = None
        form: str | None = None
        if m := PM_ICON_RE.match(filename):
            dex, form = int(m.group(1)), m.group(2)
        elif m := OLD_ICON_RE.match(filename) or CAPTURE_ICON_RE.match(filename):
            dex = int(m.group(1))
        else:
            dex = self._dex_from_name(name)
        if dex is None:
            return None, None

        # 1. Forma explícita en el icono (pm103.fALOLA)
        if form and (dex, form) in self.by_key:
            return dex, self.by_key[(dex, form)]
        # 2. Forma entre paréntesis en el nombre ("Giratina (Altered)")
        if pm := PAREN_RE.search(name):
            candidate = re.sub(r"[^A-Z0-9]+", "_", pm.group(1).upper()).strip("_")
            for c in (candidate, f"{candidate}_FORME"):
                if (dex, c) in self.by_key:
                    return dex, self.by_key[(dex, c)]
        # 3. Forma base
        if (dex, None) in self.by_key:
            return dex, self.by_key[(dex, None)]
        if len(self.by_dex.get(dex, [])) == 1:
            return dex, self.by_dex[dex][0]
        return dex, None


# ── Lectura de páginas de LeekDuck ────────────────────────────────────────────

def _section_of(header: Tag) -> str | None:
    """Sección a partir de <h2 class="event-section-header spawns">."""
    for cls in header.get("class") or []:
        if cls == "event-section-header":
            continue
        if cls in SECTION_MAP:
            return SECTION_MAP[cls]
        return "other"
    return "other"


def parse_event_page(html: str) -> tuple[list[dict], list[str]]:
    """
    Extrae los Pokémon y las bonificaciones de una página de evento de LeekDuck.

    Recorre el artículo en orden: los <h2 class="event-section-header X">
    marcan la sección (apariciones, incursiones…), y los demás <h2>/<h3> la
    subsección (p. ej. "Three-Star Raids"). Los Pokémon antes de cualquier
    sección se consideran destacados.
    """
    soup = BeautifulSoup(html, "html.parser")
    article = soup.select_one("article.event-page") or soup
    for el in article.select(".event-related-links, .event-related-title"):
        el.decompose()

    items: list[dict] = []
    bonuses: list[str] = []
    seen: set[tuple] = set()
    section: str | None = "featured"
    skip_section = False
    subsection: str | None = None

    def add(name: str, image: str | None, shiny: bool, note: str | None = None):
        if not name or skip_section:
            return
        key = (section, subsection, name, image, note)
        if key in seen:
            return
        seen.add(key)
        items.append({
            "section": section,
            "subsection": subsection,
            "name": name,
            "image_url": image,
            "can_be_shiny": shiny,
            "note": note,
        })

    for el in article.find_all(True):
        classes = el.get("class") or []
        if el.name == "h2":
            if "event-section-header" in classes:
                mapped = _section_of(el)
                skip_section = mapped is None
                section = mapped or section
                subsection = None
            else:
                subsection = _text(el) or None
            continue
        if el.name == "h3":
            subsection = _text(el) or None
            continue

        if el.name == "li" and "pkmn-list-item" in classes:
            img = el.select_one(".pkmn-list-img img")
            add(
                _text(el.select_one(".pkmn-name")),
                img.get("src") if img else None,
                el.select_one("img.shiny-icon") is not None,
            )
        elif el.name == "div" and "reward" in classes:
            img = el.select_one("img.reward-image")
            src = img.get("src") if img else ""
            if "pokemon_icons" not in (src or ""):
                continue  # recompensa que no es un Pokémon (objetos, polvo…)
            task_li = el.find_parent("li")
            task = _text(task_li.select_one(".task")) if task_li else ""
            label = el.select_one(".reward-label")
            add(
                _text(label),
                src,
                el.select_one("img.shiny-icon") is not None,
                note=task or None,
            )
        elif "bonus-text" in classes:
            text = _text(el)
            if text and text not in bonuses:
                bonuses.append(text)

    return items, bonuses


def _items_from_extra_data(extra: dict) -> tuple[list[dict], list[str]]:
    """Listas estructuradas de ScrapedDuck; se usan si la página no da nada."""
    items: list[dict] = []
    bonuses: list[str] = []

    def add(section, p, subsection=None):
        items.append({
            "section": section,
            "subsection": subsection,
            "name": p.get("name", ""),
            "image_url": p.get("image"),
            "can_be_shiny": bool(p.get("canBeShiny")),
            "note": None,
        })

    for p in (extra.get("raidbattles") or {}).get("bosses") or []:
        add("raids", p)
    for p in (extra.get("spotlight") or {}).get("list") or []:
        add("spawns", p)
    cd = extra.get("communityday") or {}
    for p in cd.get("spawns") or []:
        add("spawns", p)
    bonuses = [b.get("text") for b in cd.get("bonuses") or [] if b.get("text")]
    return items, bonuses


# ── Pseudo-eventos con lo activo ahora mismo ──────────────────────────────────

def _raid_tier_label(tier: str) -> str:
    m = re.search(r"(\d)-Star", tier)
    prefix = "Incursiones oscuras" if "Shadow" in tier else "Incursiones"
    if m:
        return f"{prefix} {m.group(1)}★"
    if "Mega" in tier:
        return "Megaincursiones"
    return tier


def _current_raids(data: list[dict]) -> list[dict]:
    return [
        {
            "section": "raids",
            "subsection": _raid_tier_label(r.get("tier", "")),
            "name": r.get("name", ""),
            "image_url": r.get("image"),
            "can_be_shiny": bool(r.get("canBeShiny")),
            "note": None,
        }
        for r in data
    ]


def _current_eggs(data: list[dict]) -> list[dict]:
    items = []
    for e in data:
        sub = f"Huevos {e.get('eggType', '')}".strip()
        if e.get("isAdventureSync"):
            sub += " · Sincroaventura"
        if e.get("isGiftExchange"):
            sub += " · Regalos"
        if e.get("isRouteGift"):
            sub += " · Rutas"
        items.append({
            "section": "eggs",
            "subsection": sub,
            "name": e.get("name", ""),
            "image_url": e.get("image"),
            "can_be_shiny": bool(e.get("canBeShiny")),
            "note": "Regional" if e.get("isRegional") else None,
        })
    return items


def _current_research(data: list[dict]) -> list[dict]:
    items = []
    for task in data:
        text = _text(BeautifulSoup(task.get("text", ""), "html.parser"))
        seen = set()
        for r in task.get("rewards") or []:
            if "pokemon_icons" not in (r.get("image") or ""):
                continue
            key = (r.get("name"), r.get("image"))
            if key in seen:
                continue
            seen.add(key)
            items.append({
                "section": "research",
                "subsection": text or None,
                "name": r.get("name", ""),
                "image_url": r.get("image"),
                "can_be_shiny": bool(r.get("canBeShiny")),
                "note": None,
            })
    return items


def _current_rocket(data: list[dict]) -> list[dict]:
    items = []
    slots = (("firstPokemon", 1), ("secondPokemon", 2), ("thirdPokemon", 3))
    for leader in data:
        sub = " · ".join(x for x in (leader.get("name"), leader.get("title")) if x)
        for key, pos in slots:
            for p in leader.get(key) or []:
                note = f"Posición {pos}"
                catchable = bool(p.get("isEncounter"))
                if catchable:
                    note += " · se puede capturar"
                items.append({
                    "section": "rocket",
                    "subsection": sub or None,
                    "name": p.get("name", ""),
                    "image_url": p.get("image"),
                    # Solo cuenta como shiny disponible si se puede capturar
                    "can_be_shiny": catchable and bool(p.get("canBeShiny")),
                    "note": note,
                })
    return items


CURRENT_SOURCES = (
    # (id, nombre, fichero de ScrapedDuck, conversor)
    ("current-raids", "Incursiones", "raids.json", _current_raids),
    ("current-eggs", "Huevos", "eggs.json", _current_eggs),
    ("current-research", "Investigación de campo", "research.json", _current_research),
    ("current-rocket", "Team GO Rocket", "rocketLineups.json", _current_rocket),
)


# ── Actualización ─────────────────────────────────────────────────────────────

def _store_pokemon(event: Event, items: list[dict], index: FormIndex) -> None:
    event.pokemon.clear()
    for pos, it in enumerate(items):
        dex, form_id = index.match(it["name"], it["image_url"])
        event.pokemon.append(EventPokemon(
            section=it["section"],
            subsection=(it["subsection"] or None),
            position=pos,
            name=it["name"][:128],
            image_url=it["image_url"],
            can_be_shiny=it["can_be_shiny"],
            note=it["note"],
            pokedex_number=dex,
            pokemon_form_id=form_id,
        ))


async def _fetch_json(client: httpx.AsyncClient, filename: str):
    r = await client.get(SCRAPEDDUCK_BASE + filename)
    r.raise_for_status()
    return r.json()


async def fetch_remote_version() -> str | None:
    """Versión = hash del events.json de ScrapedDuck."""
    try:
        async with httpx.AsyncClient(timeout=15, headers={"User-Agent": USER_AGENT}) as c:
            r = await c.get(SCRAPEDDUCK_BASE + "events.json")
            r.raise_for_status()
            return hashlib.sha256(r.content).hexdigest()[:10]
    except Exception as e:
        log.warning("No se pudo obtener versión de eventos: %s", e)
        return None


async def update_events(db: Session) -> dict:
    async with _update_lock:
        return await _update_events(db)


async def _update_events(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    index = FormIndex(db.query(PokemonForm).all())
    stats = {"events": 0, "pages_fetched": 0, "page_errors": 0, "deleted": 0}

    async with httpx.AsyncClient(
        timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        r = await client.get(SCRAPEDDUCK_BASE + "events.json")
        r.raise_for_status()
        version = hashlib.sha256(r.content).hexdigest()[:10]
        raw_events = [e for e in r.json() if not is_finished(e.get("end"), now)]

        # Eventos terminados o que ya no aparecen en la fuente
        keep_ids = {e["eventID"] for e in raw_events} | {c[0] for c in CURRENT_SOURCES}
        stale = db.query(Event).filter(Event.id.notin_(keep_ids)).all()
        for ev in stale:
            db.delete(ev)
        stats["deleted"] = len(stale)

        # Lo activo ahora mismo
        for ev_id, name, filename, convert in CURRENT_SOURCES:
            try:
                data = await _fetch_json(client, filename)
            except Exception as e:
                log.warning("No se pudo descargar %s: %s", filename, e)
                continue
            ev = db.get(Event, ev_id) or Event(id=ev_id)
            ev.name = name
            ev.event_type = "current"
            ev.is_current = True
            ev.updated_at = now
            ev.detail_fetched_at = now
            db.add(ev)
            _store_pokemon(ev, convert(data), index)

        # Eventos activos y próximos
        first_page = True
        for raw in raw_events:
            ev = db.get(Event, raw["eventID"]) or Event(id=raw["eventID"])
            ev.name = raw.get("name") or raw["eventID"]
            ev.event_type = raw.get("eventType") or "event"
            ev.heading = raw.get("heading")
            ev.link = raw.get("link")
            ev.image = raw.get("image")
            ev.start = raw.get("start")
            ev.end = raw.get("end")
            ev.is_current = False
            ev.updated_at = now
            db.add(ev)
            stats["events"] += 1

            fresh = ev.detail_fetched_at and now - ev.detail_fetched_at < DETAIL_TTL
            if fresh or ev.event_type in SKIP_DETAIL_TYPES:
                if not fresh:
                    ev.pokemon.clear()
                    ev.bonuses = []
                    ev.detail_fetched_at = now
                continue

            items: list[dict] = []
            bonuses: list[str] = []
            if ev.link:
                if not first_page:
                    await asyncio.sleep(PAGE_DELAY_SECONDS)
                first_page = False
                try:
                    page = await client.get(ev.link)
                    page.raise_for_status()
                    items, bonuses = parse_event_page(page.text)
                    stats["pages_fetched"] += 1
                except Exception as e:
                    stats["page_errors"] += 1
                    log.warning("No se pudo leer la página de %s: %s", ev.id, e)

            if not items:
                extra_items, extra_bonuses = _items_from_extra_data(raw.get("extraData") or {})
                items = extra_items
                bonuses = bonuses or extra_bonuses

            _store_pokemon(ev, items, index)
            ev.bonuses = bonuses
            ev.detail_fetched_at = now

    sv = db.get(SourceVersion, "events")
    if sv:
        sv.local_version = version
        sv.remote_version = version
        sv.last_updated_at = now
        sv.last_checked_at = now

    db.commit()
    log.info("Eventos actualizados: %s", stats)
    return stats


async def check_remote_version(db: Session) -> None:
    remote_v = await fetch_remote_version()
    sv = db.get(SourceVersion, "events")
    if sv:
        sv.remote_version = remote_v
        sv.last_checked_at = datetime.now(timezone.utc)
        db.commit()
