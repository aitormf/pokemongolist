from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from app.db import get_db
from app.models import User, Invite, PasswordResetToken
from app.schemas import RegisterRequest, LoginRequest, TokenResponse, UserOut, ResetPasswordRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    invite = db.query(Invite).filter(Invite.token == body.token).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invitación no válida")
    if invite.used_at is not None:
        raise HTTPException(status_code=400, detail="Esta invitación ya fue usada")
    now = datetime.now(timezone.utc)
    if invite.expires_at and invite.expires_at < now:
        raise HTTPException(status_code=400, detail="Esta invitación ha expirado")

    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        role="user",
    )
    db.add(user)
    db.flush()

    invite.used_by = user.id
    invite.used_at = now
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.username, user.role)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = create_access_token(user.id, user.username, user.role)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == body.token
    ).first()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Enlace no válido")
    if reset_token.used_at is not None:
        raise HTTPException(status_code=400, detail="Este enlace ya fue usado")
    now = datetime.now(timezone.utc)
    if reset_token.expires_at < now:
        raise HTTPException(status_code=400, detail="Este enlace ha expirado")
    user = db.get(User, reset_token.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Usuario no encontrado")
    user.password_hash = hash_password(body.new_password)
    reset_token.used_at = now
    db.commit()
    return {"ok": True}


@router.patch("/me/language")
def update_language(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    language = body.get("language", "").strip()
    if not language:
        raise HTTPException(status_code=400, detail="Idioma requerido")
    current_user.language = language
    db.commit()
    return {"language": language}
