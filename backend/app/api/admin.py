from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.auth import require_admin, get_current_user
from app.config import settings
from app.db import get_db
from app.models import User, Invite, SourceVersion
from app.schemas import UserOut, InviteOut, SourceStatusOut
from app.services import game_master as gm_service
from app.services import translations as tr_service
from app.services import assets as as_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Usuarios ──────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).order_by(User.created_at).all()


@router.patch("/users/{user_id}/role")
def change_role(
    user_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes cambiar tu propio rol")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    role = body.get("role", "")
    if role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Rol no válido (admin | user)")
    user.role = role
    db.commit()
    return {"id": user_id, "role": role}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db.delete(user)
    db.commit()
    return {"deleted": True}


# ── Invitaciones ──────────────────────────────────────────────────────────────

@router.get("/invites", response_model=list[InviteOut])
def list_invites(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(Invite).order_by(Invite.created_at.desc()).all()


@router.post("/invites", response_model=InviteOut)
def create_invite(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    expires = datetime.now(timezone.utc) + timedelta(days=settings.invite_expire_days)
    invite = Invite(created_by=current_user.id, expires_at=expires)
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.delete("/invites/{invite_id}")
def delete_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    invite = db.get(Invite, invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invitación no encontrada")
    db.delete(invite)
    db.commit()
    return {"deleted": True}


# ── Fuentes de datos ──────────────────────────────────────────────────────────

@router.get("/sources/status", response_model=list[SourceStatusOut])
def sources_status(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    sources = db.query(SourceVersion).all()
    result = []
    for sv in sources:
        update_available = bool(
            (sv.remote_version and sv.local_version and sv.remote_version != sv.local_version)
            or (sv.remote_version and not sv.local_version)
        )
        result.append(
            SourceStatusOut(
                source_name=sv.source_name,
                remote_version=sv.remote_version,
                local_version=sv.local_version,
                update_available=update_available,
                last_checked_at=sv.last_checked_at,
                last_updated_at=sv.last_updated_at,
            )
        )
    return result


@router.post("/sources/check")
async def check_all_versions(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    await gm_service.check_remote_version(db)
    await tr_service.check_remote_version(db)
    await as_service.check_remote_version(db)
    return {"checked": True}


@router.post("/sources/update/game_master")
async def update_game_master(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await gm_service.update_game_master(db)
    return result


@router.post("/sources/update/translations")
async def update_translations(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await tr_service.update_translations(db)
    return result


@router.post("/sources/update/assets")
async def update_assets(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await as_service.update_assets(db)
    return result
