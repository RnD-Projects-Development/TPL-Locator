import asyncio
import logging

from app.dependencies import get_settings
from app.services.citytag import CityTagClient
from app.services.mongodb import MongoService
from app.services.vendor_sync import run_vendor_sync_all

SYNC_INTERVAL_SECONDS = 300

logger = logging.getLogger(__name__)


async def sync_all_users():
    settings = get_settings()
    mongo = MongoService(settings["mongo_uri"])
    citytag = CityTagClient(settings["citytag_base_url"])
    await run_vendor_sync_all(mongo, citytag)


async def scheduler_loop():
    await sync_all_users()
    while True:
        await asyncio.sleep(SYNC_INTERVAL_SECONDS)
        await sync_all_users()


def start_auto_sync_tasks(app):
    @app.on_event("startup")
    async def start_scheduler():
        logger.info("auto_sync scheduler starting (interval=%ss)", SYNC_INTERVAL_SECONDS)
        asyncio.create_task(scheduler_loop())
