from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import User, UserFlag, PokemonForm

router = APIRouter(prefix="/api/flags", tags=["flags"])

VALID_FLAGS = {"quiero", "tengo_100", "tengo_shiny"}


def _validate_flag(flag_name: str) -> None:
    if flag_name not in VALID_FLAGS:
        raise HTTPException(
            status_code=400,
            detail=f"Flag no válido. Valores permitidos: {', '.join(sorted(VALID_FLAGS))}",
        )


@router.get("")
def get_all_flags(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Devuelve todos los flags de todos los usuarios.
    Formato: { pokemon_form_id: { username: { flag_name: value } } }
    """
    from app.models import User as UserModel

    flags = db.query(UserFlag).filter(UserFlag.value == True).all()  # noqa: E712
    users = {u.id: u.username for u in db.query(UserModel).all()}

    result: dict[str, dict[str, dict[str, bool]]] = {}
    for f in flags:
        username = users.get(f.user_id, str(f.user_id))
        pf_id = f.pokemon_form_id
        if pf_id not in result:
            result[pf_id] = {}
        if username not in result[pf_id]:
            result[pf_id][username] = {}
        result[pf_id][username][f.flag_name] = f.value

    user_list = [
        {"id": uid, "username": uname} for uid, uname in users.items()
    ]
    return {"flags": result, "users": user_list}


@router.put("/{form_id}/{flag_name}")
def set_flag(
    form_id: str,
    flag_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_flag(flag_name)

    if not db.get(PokemonForm, form_id):
        raise HTTPException(status_code=404, detail="Pokémon no encontrado")

    flag = (
        db.query(UserFlag)
        .filter(
            UserFlag.user_id == current_user.id,
            UserFlag.pokemon_form_id == form_id,
            UserFlag.flag_name == flag_name,
        )
        .first()
    )
    if flag:
        flag.value = True
    else:
        flag = UserFlag(
            user_id=current_user.id,
            pokemon_form_id=form_id,
            flag_name=flag_name,
            value=True,
        )
        db.add(flag)
    db.commit()
    return {"set": True}


@router.delete("/{form_id}/{flag_name}")
def unset_flag(
    form_id: str,
    flag_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_flag(flag_name)

    flag = (
        db.query(UserFlag)
        .filter(
            UserFlag.user_id == current_user.id,
            UserFlag.pokemon_form_id == form_id,
            UserFlag.flag_name == flag_name,
        )
        .first()
    )
    if flag:
        db.delete(flag)
        db.commit()
    return {"set": False}
