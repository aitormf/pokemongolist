from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.auth import get_current_user
from app.db import get_db
from app.models import User, PokemonForm, UserFlag
from app.services.translations import get_pokemon_names
from app.services.assets import pokemon_image_url

router = APIRouter(prefix="/api/pokemon", tags=["pokemon"])


def _enrich(pf: PokemonForm, names: dict[str, str]) -> dict:
    """Añade nombre localizado y URL de imagen a una forma de Pokémon."""
    # Intentar nombre por form_id, luego por pokemon_id
    name = names.get(pf.id) or names.get(pf.pokemon_id) or _humanize(pf.id)
    return {
        "id": pf.id,
        "pokedex_number": pf.pokedex_number,
        "pokemon_id": pf.pokemon_id,
        "form": pf.form,
        "name": name,
        "type1": pf.type1,
        "type2": pf.type2,
        "family_id": pf.family_id,
        "parent_pokemon_id": pf.parent_pokemon_id,
        "is_tradable": pf.is_tradable,
        "has_shiny": pf.has_shiny,
        "stats": pf.stats,
        "quick_moves": pf.quick_moves,
        "cinematic_moves": pf.cinematic_moves,
        "elite_cinematic_move": pf.elite_cinematic_move,
        "image_url": pokemon_image_url(pf.pokedex_number, pf.form, shiny=False),
        "image_shiny_url": (
            pokemon_image_url(pf.pokedex_number, pf.form, shiny=True)
            if pf.has_shiny
            else None
        ),
    }


def _humanize(form_id: str) -> str:
    """Fallback: convierte NINETALES_ALOLA → Ninetales (Alola)."""
    parts = form_id.split("_", 1)
    if len(parts) == 1:
        return parts[0].capitalize()
    name = parts[0].capitalize()
    variant = parts[1].replace("_", " ").title()
    return f"{name} ({variant})"


@router.get("")
def list_pokemon(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    flag_filter: list[str] = Query(default=[]),
    users: list[int] = Query(default=[]),
):
    """
    Devuelve todas las formas de Pokémon, enriquecidas con nombre localizado.
    Soporta filtro por flag y por usuarios (intersección).
    """
    names = get_pokemon_names(current_user.language)

    query = db.query(PokemonForm)

    if flag_filter and users:
        # Filtrar Pokémon donde TODOS los usuarios indicados tienen los flags indicados
        for uid in users:
            for flag in flag_filter:
                subq = (
                    db.query(UserFlag.pokemon_form_id)
                    .filter(
                        UserFlag.user_id == uid,
                        UserFlag.flag_name == flag,
                        UserFlag.value == True,  # noqa: E712
                    )
                    .subquery()
                )
                query = query.filter(PokemonForm.id.in_(subq))
    elif flag_filter:
        for flag in flag_filter:
            subq = (
                db.query(UserFlag.pokemon_form_id)
                .filter(
                    UserFlag.flag_name == flag,
                    UserFlag.value == True,  # noqa: E712
                )
                .subquery()
            )
            query = query.filter(PokemonForm.id.in_(subq))

    forms = query.order_by(PokemonForm.pokedex_number).all()
    return [_enrich(pf, names) for pf in forms]


@router.get("/{form_id}")
def get_pokemon(
    form_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pf = db.get(PokemonForm, form_id)
    if not pf:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Pokémon no encontrado")
    names = get_pokemon_names(current_user.language)
    return _enrich(pf, names)
