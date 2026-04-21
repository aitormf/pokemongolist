import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db import engine, SessionLocal
from app.models import User  # noqa: F401
from app.auth import hash_password
import app.models  # noqa: F401 – ensure all models are imported

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _create_admin_if_needed() -> None:
    """
    Gestiona el usuario admin inicial:
    - Si no existe ningún admin, lo crea.
    - Si ya existe con ese username, sincroniza su contraseña con ADMIN_PASSWORD.
    Requiere ADMIN_PASSWORD definida para actuar.
    """
    username = os.getenv("ADMIN_USERNAME", "admin")
    password = os.getenv("ADMIN_PASSWORD", "")
    if not password:
        log.warning(
            "ADMIN_PASSWORD no definida — el admin inicial no será creado ni actualizado"
        )
        return

    with SessionLocal() as db:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            # Sincronizar contraseña por si cambió en .env
            existing.password_hash = hash_password(password)
            existing.role = "admin"
            db.commit()
            log.info("Contraseña del admin '%s' sincronizada.", username)
            return
        admin = User(
            username=username,
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(admin)
        db.commit()
        log.info("Usuario admin '%s' creado.", username)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Esperar a que la DB esté disponible (Docker Compose puede arrancar antes)
    from sqlalchemy.exc import OperationalError
    import time

    for attempt in range(10):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            break
        except OperationalError:
            log.info("Esperando base de datos... intento %d/10", attempt + 1)
            time.sleep(2)

    _create_admin_if_needed()
    yield


app = FastAPI(title="Pokémon GO Wishlist", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import auth, pokemon, flags, admin  # noqa: E402

app.include_router(auth.router)
app.include_router(pokemon.router)
app.include_router(flags.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
