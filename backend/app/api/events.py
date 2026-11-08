import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.api.pokemon import _enrich
from app.auth import get_current_user
from app.db import get_db
from app.models import Event, EventPokemon, PokemonForm, User
from app.services.events import is_finished
from app.services.translations import get_pokemon_names

router = APIRouter(prefix="/api/events", tags=["events"])

# Variantes que nuestras formas no distinguen: se enlazan con la forma base,
# pero se indica la variante en el nombre y se usa la imagen de LeekDuck
VARIANTS = (
    ("Mega ", "Mega", True),
    ("Primal ", "Primigenio", True),
    ("Gigantamax ", "Gigamax", True),
    ("Dynamax ", "Dinamax", False),
    ("Shadow ", "Oscuro", False),
)


def _variant(source_name: str) -> tuple[str | None, bool]:
    """Devuelve (etiqueta de variante en español, usar imagen de LeekDuck)."""
    for prefix, label, own_image in VARIANTS:
        if re.match(rf"^{prefix}", source_name):
            return label, own_image
    return None, False


def _pokemon_out(ep: EventPokemon, pf: PokemonForm | None, names: dict) -> dict:
    variant, use_source_image = _variant(ep.name)
    out = {
        "section": ep.section,
        "subsection": ep.subsection,
        "source_name": ep.name,
        "name": ep.name,
        "variant": variant,
        "image_url": ep.image_url,
        "can_be_shiny": ep.can_be_shiny,
        "note": ep.note,
        "pokedex_number": ep.pokedex_number,
        "form_id": None,
        "has_shiny": None,
    }
    if pf:
        enriched = _enrich(pf, names)
        out["form_id"] = pf.id
        out["name"] = enriched["name"]
        out["has_shiny"] = pf.has_shiny
        if not use_source_image:
            out["image_url"] = enriched["image_url"]
    return out


@router.get("")
def list_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pokémon activos ahora mismo (incursiones, huevos, investigación, Rocket) y
    eventos activos o próximos con sus Pokémon. Los eventos terminados se
    excluyen; el filtrado exacto por hora local lo hace el navegador.
    """
    names = get_pokemon_names(current_user.language)
    events = (
        db.query(Event)
        .options(selectinload(Event.pokemon))
        .all()
    )
    form_ids = {p.pokemon_form_id for e in events for p in e.pokemon if p.pokemon_form_id}
    forms = {
        pf.id: pf
        for pf in db.query(PokemonForm).filter(PokemonForm.id.in_(form_ids)).all()
    } if form_ids else {}

    now = datetime.now(timezone.utc)
    current, upcoming = [], []
    for ev in events:
        if not ev.is_current and is_finished(ev.end, now):
            continue
        item = {
            "id": ev.id,
            "name": ev.name,
            "event_type": ev.event_type,
            "heading": ev.heading,
            "link": ev.link,
            "image": ev.image,
            "start": ev.start,
            "end": ev.end,
            "bonuses": ev.bonuses or [],
            "pokemon": [
                _pokemon_out(p, forms.get(p.pokemon_form_id), names) for p in ev.pokemon
            ],
        }
        (current if ev.is_current else upcoming).append(item)

    current_order = ["current-raids", "current-eggs", "current-research", "current-rocket"]
    current.sort(key=lambda e: current_order.index(e["id"]) if e["id"] in current_order else 99)
    upcoming.sort(key=lambda e: (e["start"] or "", e["end"] or ""))
    return {"current": current, "events": upcoming}
