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
    await run_vendor_sync_all(mongo, citytag)


async def sync_historical_data():
    settings = get_settings()
    mongo = MongoService(settings["mongo_uri"])
    await run_historical_sync_all(mongo)


async def scheduler_loop() -> None:
    # Run immediately on first tick, then every SYNC_INTERVAL_SECONDS.
    await sync_all_users()
    while True:
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
        await sync_all_users()


async def historical_scheduler_loop():
    await sync_historical_data()
    while True:
        await asyncio.sleep(HISTORICAL_SYNC_INTERVAL_SECONDS)
        await sync_historical_data()


def start_auto_sync_tasks(app):
    @app.on_event("startup")
    async def start_scheduler() -> None:
        logger.info(
            "auto_sync scheduler starting (interval=%ss)", SYNC_INTERVAL_SECONDS
        )
        asyncio.create_task(scheduler_loop())
        logger.info("historical_sync scheduler starting (interval=%ss)", HISTORICAL_SYNC_INTERVAL_SECONDS)
        asyncio.create_task(historical_scheduler_loop())
