import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from app.dependencies import get_citytag_client, get_mongo_service
from app.services.citytag import CityTagClient
from app.services.mongodb import MongoService
from app.services.vendor_sync import run_vendor_sync_all

router = APIRouter(prefix="/api", tags=["sync"])
logger = logging.getLogger(__name__)


@router.post("/sync/all")
async def sync_all_admin_locations(
    citytag: Annotated[CityTagClient, Depends(get_citytag_client)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    logger.info("sync_all_admin_locations started")
    result = await run_vendor_sync_all(mongo, citytag)
    logger.info("sync_all_admin_locations completed %s", result)
    return result
