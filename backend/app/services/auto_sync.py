import asyncio
import logging

from app.dependencies import get_settings
from app.services.citytag import CityTagClient
from app.services.historical_sync import run_historical_sync_all
from app.services.mongodb import MongoService
from app.services.vendor_sync import run_vendor_sync_all

SYNC_INTERVAL_SECONDS = 300
HISTORICAL_SYNC_INTERVAL_SECONDS = 900

logger = logging.getLogger(__name__)


async def sync_all_users():
    settings = get_settings()
    mongo = MongoService(settings["mongo_uri"])
    citytag = CityTagClient(settings["citytag_base_url"])
    try:
        await run_vendor_sync_all(mongo, citytag)
    except Exception:
        logger.exception("auto_sync vendor sync cycle failed")


async def sync_historical_data():
    settings = get_settings()
    mongo = MongoService(settings["mongo_uri"])
    try:
        await run_historical_sync_all(mongo)
    except Exception:
        logger.exception("auto_sync historical sync cycle failed")


async def scheduler_loop():
    while True:
        try:
            await sync_all_users()
        except Exception:
            logger.exception("auto_sync scheduler loop iteration failed")
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)


async def historical_scheduler_loop():
    while True:
        try:
            await sync_historical_data()
        except Exception:
            logger.exception("auto_sync historical scheduler loop iteration failed")
        await asyncio.sleep(HISTORICAL_SYNC_INTERVAL_SECONDS)


def start_auto_sync_tasks(app):
    @app.on_event("startup")
    async def start_scheduler() -> None:
        logger.info(
            "auto_sync scheduler starting (interval=%ss)", SYNC_INTERVAL_SECONDS
        )
        asyncio.create_task(scheduler_loop())
        logger.info("historical_sync scheduler starting (interval=%ss)", HISTORICAL_SYNC_INTERVAL_SECONDS)
        asyncio.create_task(historical_scheduler_loop())
