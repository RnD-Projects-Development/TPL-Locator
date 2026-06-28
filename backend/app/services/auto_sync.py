import asyncio
import logging

from app.dependencies import get_settings
from app.services.citytag import CityTagClient
from app.services.mongodb import MongoService
from app.services.vendor_sync import run_vendor_sync_all

SYNC_INTERVAL_SECONDS = 300

logger = logging.getLogger(__name__)

# ── Module-level singletons ────────────────────────────────────────────────────
# MongoService and CityTagClient are created ONCE at startup and reused across
# every sync cycle.  Creating a new AsyncIOMotorClient every 5 minutes exhausts
# Windows socket buffers (WinError 10055) because each client opens its own
# connection pool and the old ones are never properly closed.
_mongo: MongoService | None = None
_citytag: CityTagClient | None = None


def _get_singletons() -> tuple[MongoService, CityTagClient]:
    global _mongo, _citytag
    if _mongo is None or _citytag is None:
        settings = get_settings()
        _mongo = MongoService(settings["mongo_uri"])
        _citytag = CityTagClient(settings["citytag_base_url"])
        logger.info("auto_sync singletons initialised (MongoService + CityTagClient)")
    return _mongo, _citytag


async def sync_all_users() -> None:
    mongo, citytag = _get_singletons()
    try:
        await run_vendor_sync_all(mongo, citytag)
    except Exception:
        # Log but do NOT let an exception kill the scheduler task.
        logger.exception("auto_sync sync_all_users unhandled exception")


async def scheduler_loop() -> None:
    # Run immediately on first tick, then every SYNC_INTERVAL_SECONDS.
    await sync_all_users()
    while True:
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
        await sync_all_users()


def start_auto_sync_tasks(app) -> None:
    @app.on_event("startup")
    async def start_scheduler() -> None:
        logger.info(
            "auto_sync scheduler starting (interval=%ss)", SYNC_INTERVAL_SECONDS
        )
        asyncio.create_task(scheduler_loop())