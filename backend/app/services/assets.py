"""
Detección de disponibilidad de shiny en Pokémon GO.

Fuente: https://github.com/PokeMiners/pogo_assets
        (carpeta "Images/Pokemon - 256x256/Addressable Assets")
Convención de nombres: pm{N}.f{FORM}.s.icon.png  (shiny con forma)
                       pm{N}.s.icon.png            (shiny sin forma / base)

Nota: que exista la imagen shiny no garantiza que el shiny esté liberado en el
juego (los assets son datamineados y pueden adelantarse a su lanzamiento).

En lugar de descargar la lista completa de ficheros del repo, hacemos una
petición HEAD por cada forma de Pokémon. Si devuelve 200 → has_shiny = True.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from urllib.parse import quote

import httpx
from sqlalchemy.orm import Session

from app.models import PokemonForm, SourceVersion

log = logging.getLogger(__name__)

ASSETS_REPO = "PokeMiners/pogo_assets"
ASSETS_BRANCH = "master"
ASSETS_PATH = "Images/Pokemon - 256x256/Addressable Assets"
ASSETS_RAW_BASE = (
    f"https://raw.githubusercontent.com/{ASSETS_REPO}/{ASSETS_BRANCH}/"
    f"{quote(ASSETS_PATH)}/"
)
CONCURRENCY = 20  # peticiones HEAD paralelas


def _gh_headers() -> dict:
    headers = {"Accept": "application/vnd.github.v3+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _asset_form(pokemon_id: str, form: str) -> str:
    """
    Convierte la forma del game_master al sufijo usado en los assets.

    "NINETALES_ALOLA" (pokemon_id "NINETALES") → "ALOLA"
    "MR_MIME_GALARIAN" (pokemon_id "MR_MIME")  → "GALARIAN"
    Si la forma no empieza por el pokemon_id, se usa completa.
    """
    prefix = f"{pokemon_id}_"
    return form[len(prefix):] if form.startswith(prefix) else form


def pokemon_image_url(
    pokedex_number: int, pokemon_id: str, form: str | None, shiny: bool = False
) -> str:
    """Construye la URL de imagen para un Pokémon/forma dado."""
    shiny_part = ".s" if shiny else ""
    if form:
        asset_form = _asset_form(pokemon_id, form)
        filename = f"pm{pokedex_number}.f{asset_form}{shiny_part}.icon.png"
    else:
        filename = f"pm{pokedex_number}{shiny_part}.icon.png"
    return ASSETS_RAW_BASE + filename


async def fetch_remote_version() -> str | None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://api.github.com/repos/{ASSETS_REPO}/commits",
                params={"sha": ASSETS_BRANCH, "path": ASSETS_PATH, "per_page": 1},
                headers=_gh_headers(),
            )
            r.raise_for_status()
            commits = r.json()
            if commits:
                return commits[0]["sha"][:8]
    except Exception as e:
        log.warning("No se pudo obtener versión de assets: %s", e)
    return None


async def _has_shiny(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    url: str,
) -> bool:
    async with sem:
        try:
            r = await client.head(url, follow_redirects=True)
            return r.status_code == 200
        except Exception:
            return False


async def update_assets(db: Session) -> dict:
    log.info("Comprobando shinies disponibles mediante HEAD requests...")

    all_forms: list[PokemonForm] = db.query(PokemonForm).all()
    log.info("Formas a comprobar: %d", len(all_forms))

    sem = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(timeout=15) as client:
        tasks = [
            _has_shiny(
                client,
                sem,
                pokemon_image_url(
                    pf.pokedex_number, pf.pokemon_id, pf.form, shiny=True
                ),
            )
            for pf in all_forms
        ]
        results = await asyncio.gather(*tasks)

    updated = 0
    shiny_count = 0
    for pf, has in zip(all_forms, results):
        if has:
            shiny_count += 1
        if pf.has_shiny != has:
            pf.has_shiny = has
            updated += 1

    log.info("Shinies detectados: %d / %d formas", shiny_count, len(all_forms))

    now = datetime.now(timezone.utc)
    remote_v = await fetch_remote_version()
    sv = db.get(SourceVersion, "assets")
    if sv:
        sv.local_version = remote_v
        sv.remote_version = remote_v
        sv.last_updated_at = now
        sv.last_checked_at = now

    db.commit()
    return {"forms_updated": updated, "shiny_count": shiny_count, "forms_checked": len(all_forms)}


async def check_remote_version(db: Session) -> None:
    remote_v = await fetch_remote_version()
    sv = db.get(SourceVersion, "assets")
    if sv:
        sv.remote_version = remote_v
        sv.last_checked_at = datetime.now(timezone.utc)
        db.commit()
