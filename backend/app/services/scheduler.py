"""
Actualizaciones automáticas de las fuentes de datos.

Un único bucle en segundo plano que cada hora mira si toca alguna tarea, por
orden (así en una instalación nueva los eventos ya encuentran las formas):

  1. Game Master y assets, cada DATA_REFRESH_HOURS (168 h = semanal).
     Solo se descargan si la versión remota cambió. Si cambia el Game Master
     también se vuelven a comprobar los shinies, porque dependen de las formas.
  2. Eventos, cada EVENTS_REFRESH_HOURS (24 h).

Un valor de 0 desactiva la tarea. Como el "cuándo toca" se calcula con las
fechas guardadas en source_versions, reiniciar el backend no retrasa nada.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db import SessionLocal
from app.models import SourceVersion
from app.services import assets as as_service
from app.services import events as ev_service
from app.services import game_master as gm_service

log = logging.getLogger(__name__)

STARTUP_DELAY_SECONDS = 30
CHECK_EVERY_SECONDS = 3600


def _older_than(moment: datetime | None, interval: timedelta) -> bool:
    return moment is None or datetime.now(timezone.utc) - moment >= interval


def _needs_update(sv: SourceVersion | None) -> bool:
    """Hay versión remota conocida y no coincide con la local."""
    return bool(sv and sv.remote_version and sv.remote_version != sv.local_version)


async def _data_task(interval: timedelta) -> None:
    """Game Master + assets: comprobar versión y actualizar solo si cambió."""
    with SessionLocal() as db:
        gm_sv = db.get(SourceVersion, "game_master")
        as_sv = db.get(SourceVersion, "assets")
        # Toca si pasó el intervalo desde la última comprobación, o si una
        # comprobación (p. ej. manual desde el panel) detectó versión nueva
        due = any(_older_than(sv.last_checked_at if sv else None, interval) for sv in (gm_sv, as_sv))
        if not due and not _needs_update(gm_sv) and not _needs_update(as_sv):
            return

        log.info("Comprobando versiones de Game Master y assets...")
        await gm_service.check_remote_version(db)
        await as_service.check_remote_version(db)
        db.refresh(gm_sv)
        db.refresh(as_sv)

        gm_updated = False
        if _needs_update(gm_sv):
            log.info("Game Master nuevo (%s → %s): actualizando", gm_sv.local_version, gm_sv.remote_version)
            result = await gm_service.update_game_master(db)
            log.info("Game Master actualizado: %s", result)
            gm_updated = True

        db.refresh(as_sv)
        if gm_updated or _needs_update(as_sv):
            log.info("Actualizando assets (shinies)...")
            result = await as_service.update_assets(db)
            log.info("Assets actualizados: %s", result)

        if not gm_updated and not _needs_update(as_sv):
            log.info("Game Master y assets al día")


async def _events_task(interval: timedelta) -> None:
    with SessionLocal() as db:
        sv = db.get(SourceVersion, "events")
        if _older_than(sv.last_updated_at if sv else None, interval):
            await ev_service.update_events(db)


async def scheduler_loop() -> None:
    tasks = []
    if settings.data_refresh_hours > 0:
        tasks.append(("Game Master y assets", _data_task, timedelta(hours=settings.data_refresh_hours)))
    if settings.events_refresh_hours > 0:
        tasks.append(("eventos", _events_task, timedelta(hours=settings.events_refresh_hours)))

    for name, _, interval in tasks:
        log.info("Actualización automática de %s cada %d h", name, interval.total_seconds() // 3600)
    if not tasks:
        log.info("Actualizaciones automáticas desactivadas")
        return

    await asyncio.sleep(STARTUP_DELAY_SECONDS)  # dejar arrancar la app
    while True:
        for name, task, interval in tasks:
            try:
                await task(interval)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Error en la actualización automática de %s", name)
        await asyncio.sleep(CHECK_EVERY_SECONDS)
