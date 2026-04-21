"""
Descarga y parseo de traducciones de Pokémon GO.

Fuente: https://github.com/sora10pls/holoholo-text
Estructura: Release/{Language}/{lang}_raw.json

Cada fichero raw.json es un dict de {resourceId: text}.
Los nombres de Pokémon usan claves como "pokemon_name_{POKEMON_ID}"
o similares — se detecta el patrón al procesar el fichero.
"""

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import SourceVersion

log = logging.getLogger(__name__)

HOLOHOLO_API = (
    "https://api.github.com/repos/sora10pls/holoholo-text/commits"
    "?path=Release&per_page=1"
)

# Mapeo nombre de carpeta → código de idioma esperado en filename
LANGUAGE_MAP = {
    "English": "en-us",
    "Spanish": "es-es",
    "Latin American Spanish": "es-la",
    "French": "fr-fr",
    "German": "de-de",
    "Italian": "it-it",
    "Portuguese": "pt-br",
    "Brazilian Portuguese": "pt-br",
    "Russian": "ru-ru",
    "Japanese": "ja-jp",
    "Korean": "ko-kr",
    "Traditional Chinese": "zh-tw",
    "Thai": "th-th",
    "Hindi": "hi-in",
    "Indonesian": "id-id",
    "Turkish": "tr-tr",
}

BASE_RAW = (
    "https://raw.githubusercontent.com/sora10pls/holoholo-text/main/Release"
)

# Patrones conocidos de clave para nombres de Pokémon en holoholo-text
POKEMON_NAME_PATTERNS = [
    re.compile(r"^pokemon_name_(\w+)$", re.IGNORECASE),
    re.compile(r"^(\d{4})_POKEMON_NAME$", re.IGNORECASE),
]


def _extract_pokemon_names(raw: dict) -> dict[str, str]:
    """
    Intenta extraer {pokemon_id: name} del dict de recursos.
    Soporta múltiples patrones de clave conocidos.
    """
    names: dict[str, str] = {}

    for key, value in raw.items():
        if not isinstance(value, str):
            continue
        for pattern in POKEMON_NAME_PATTERNS:
            m = pattern.match(key)
            if m:
                pokemon_key = m.group(1).upper()
                names[pokemon_key] = value
                break

    return names


async def fetch_remote_version() -> str | None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                HOLOHOLO_API,
                headers={"Accept": "application/vnd.github.v3+json"},
            )
            r.raise_for_status()
            commits = r.json()
            if commits:
                return commits[0]["sha"][:8]
    except Exception as e:
        log.warning("No se pudo obtener versión de traducciones: %s", e)
    return None


async def update_translations(db: Session) -> dict:
    updated_langs = []
    errors = []
    trans_dir = Path(settings.data_dir) / "translations"
    trans_dir.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(timeout=30) as client:
        for lang_folder, lang_code in LANGUAGE_MAP.items():
            url = f"{BASE_RAW}/{lang_folder}/{lang_code}_raw.json"
            try:
                r = await client.get(url)
                if r.status_code == 404:
                    # Intentar variante sin guion
                    alt_code = lang_code.replace("-", "_")
                    url = f"{BASE_RAW}/{lang_folder}/{alt_code}_raw.json"
                    r = await client.get(url)
                r.raise_for_status()
                raw = r.json()

                names = _extract_pokemon_names(raw)

                lang_dir = trans_dir / lang_folder
                lang_dir.mkdir(exist_ok=True)
                out = lang_dir / "pokemon_names.json"
                out.write_text(json.dumps(names, ensure_ascii=False, indent=2))

                updated_langs.append(lang_folder)
            except Exception as e:
                log.warning("Error descargando traducción %s: %s", lang_folder, e)
                errors.append({"language": lang_folder, "error": str(e)})

    now = datetime.now(timezone.utc)
    remote_v = await fetch_remote_version()
    sv = db.get(SourceVersion, "translations")
    if sv:
        sv.local_version = remote_v
        sv.remote_version = remote_v
        sv.last_updated_at = now
        sv.last_checked_at = now
        db.commit()

    return {"updated": updated_langs, "errors": errors}


async def check_remote_version(db: Session) -> None:
    remote_v = await fetch_remote_version()
    sv = db.get(SourceVersion, "translations")
    if sv:
        sv.remote_version = remote_v
        sv.last_checked_at = datetime.now(timezone.utc)
        db.commit()


def get_pokemon_names(language: str) -> dict[str, str]:
    """Carga el mapa pokemon_id → nombre para el idioma dado."""
    lang_file = Path(settings.data_dir) / "translations" / language / "pokemon_names.json"
    if not lang_file.exists():
        # Fallback a English
        lang_file = Path(settings.data_dir) / "translations" / "English" / "pokemon_names.json"
    if not lang_file.exists():
        return {}
    return json.loads(lang_file.read_text())


def get_available_languages() -> list[str]:
    trans_dir = Path(settings.data_dir) / "translations"
    if not trans_dir.exists():
        return list(LANGUAGE_MAP.keys())
    return [d.name for d in trans_dir.iterdir() if d.is_dir()]
