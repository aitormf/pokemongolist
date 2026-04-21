"""
Parseo y actualización del Game Master de Pokémon GO.

Fuente: https://github.com/alexelgt/game_masters
Versión: timestamp.json
"""

import re
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import PokemonForm, SourceVersion

log = logging.getLogger(__name__)

GAME_MASTER_URL = (
    "https://raw.githubusercontent.com/alexelgt/game_masters/master/GAME_MASTER.json"
)
TIMESTAMP_URL = (
    "https://raw.githubusercontent.com/alexelgt/game_masters/master/timestamp.json"
)
ENTRY_PATTERN = re.compile(r"^V(\d{4})_POKEMON_(.+)$")

# Tipos que no son formas jugables (mega, shadow, purified se filtran aparte)
SKIP_SUFFIXES = {"_REVERSION", "_NORMAL"}


def _clean_type(raw: str | None) -> str | None:
    if not raw:
        return None
    return raw.replace("POKEMON_TYPE_", "")


def _parse_entry(entry: dict) -> dict | None:
    template_id = entry.get("templateId", "")
    m = ENTRY_PATTERN.match(template_id)
    if not m:
        return None

    pokedex_number = int(m.group(1))
    settings_raw = entry.get("data", {}).get("pokemonSettings", {})
    if not settings_raw:
        return None

    pokemon_id = str(settings_raw.get("pokemonId") or "")
    form = settings_raw.get("form")
    # Asegurar que form es string o None (el game_master puede tener valores numéricos)
    if form is not None:
        form = str(form)

    if not pokemon_id:
        return None

    # La id de la forma: si hay form explícito usarlo, si no usar pokemonId
    form_id = form if form else pokemon_id

    # Excluir formas técnicas sin contenido real
    for suffix in SKIP_SUFFIXES:
        if form_id.endswith(suffix):
            return None

    return {
        "id": form_id,
        "pokedex_number": pokedex_number,
        "pokemon_id": pokemon_id,
        "form": form,
        "type1": _clean_type(settings_raw.get("type")),
        "type2": _clean_type(settings_raw.get("type2")),
        "family_id": settings_raw.get("familyId"),
        "parent_pokemon_id": settings_raw.get("parentPokemonId"),
        "is_tradable": bool(settings_raw.get("isTradable", False)),
        "stats": settings_raw.get("stats"),
        "quick_moves": settings_raw.get("quickMoves"),
        "cinematic_moves": settings_raw.get("cinematicMoves"),
        "elite_cinematic_move": settings_raw.get("eliteCinematicMove"),
    }


async def fetch_remote_version() -> str | None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(TIMESTAMP_URL)
            r.raise_for_status()
            data = r.json()
            return str(data.get("timestamp", ""))
    except Exception as e:
        log.warning("No se pudo obtener versión remota de game_master: %s", e)
        return None


async def update_game_master(db: Session) -> dict:
    log.info("Descargando Game Master...")
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.get(GAME_MASTER_URL)
        r.raise_for_status()
        raw = r.json()

    entries = raw if isinstance(raw, list) else raw.get("template", [])
    parsed = [p for e in entries if (p := _parse_entry(e)) is not None]

    log.info("Parseadas %d formas de Pokémon", len(parsed))

    now = datetime.now(timezone.utc)
    existing_ids = {row.id for row in db.query(PokemonForm.id).all()}

    upserted = 0
    for p in parsed:
        form = db.get(PokemonForm, p["id"])
        if form:
            for k, v in p.items():
                setattr(form, k, v)
            form.data_updated_at = now
        else:
            form = PokemonForm(**p, data_updated_at=now)
            db.add(form)
        upserted += 1

    # Guardar JSON procesado en disco (para referencia rápida sin DB)
    data_path = Path(settings.data_dir) / "pokemon_forms.json"
    data_path.parent.mkdir(parents=True, exist_ok=True)
    data_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2))

    # Actualizar versión
    remote_v = await fetch_remote_version()
    sv = db.get(SourceVersion, "game_master")
    if sv:
        sv.local_version = remote_v
        sv.remote_version = remote_v
        sv.last_updated_at = now
        sv.last_checked_at = now

    db.commit()
    return {"upserted": upserted}


async def check_remote_version(db: Session) -> None:
    remote_v = await fetch_remote_version()
    sv = db.get(SourceVersion, "game_master")
    if sv:
        sv.remote_version = remote_v
        sv.last_checked_at = datetime.now(timezone.utc)
        db.commit()
