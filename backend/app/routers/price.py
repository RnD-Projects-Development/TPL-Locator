"""Pricing endpoints.

GET is unauthenticated for the baseline price.
POST / PUT are admin-only for creating / updating pricing for:
- all devices in bulk (apply_to_all=True)
- any specific device (device_sn or path param)
- baseline deployment price
"""

from datetime import datetime, timezone
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.dependencies import get_mongo_service, require_role, get_current_account
from app.models.admin import AdminInDB
from app.services.mongodb import MongoService

router = APIRouter(tags=["price"])
logger = logging.getLogger(__name__)


def _dt_iso(dt) -> Optional[str]:
    """Serialize to ISO 8601 with an explicit UTC offset."""
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return str(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class PricePayload(BaseModel):
    price: float = Field(..., ge=0, description="Non-negative price value")
    currency: Optional[str] = Field(default="PKR", description="3-letter currency code, e.g. PKR, USD")
    device_sn: Optional[str] = Field(default=None, description="Optional device serial number")
    apply_to_all: Optional[bool] = Field(default=False, description="Set True to apply pricing to all devices in the database")


def _serialize(doc: dict) -> dict:
    return {
        "price": doc.get("price", 0.0),
        "currency": doc.get("currency", "PKR"),
        "updated_at": _dt_iso(doc.get("updated_at")),
        "updated_by": doc.get("updated_by"),
    }


def _validate_currency(currency_raw: Optional[str]) -> str:
    currency = (currency_raw or "PKR").strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="currency must be a 3-letter code, e.g. PKR, USD",
        )
    return currency


@router.get("")
async def get_price(
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Return the currently configured baseline price. No authentication required."""
    doc = await mongo.get_pricing()
    return {"success": True, **_serialize(doc)}


@router.get("/devices")
async def get_devices_pricing(
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
    search: Optional[str] = Query(default=None, description="Search by SN, device name, or client"),
):
    """Return list of devices with their current price and currency. Admin only."""
    baseline = await mongo.get_pricing()
    devices = await mongo.get_devices_pricing(search=search)
    return {
        "success": True,
        "baseline_price": baseline.get("price", 0.0),
        "baseline_currency": baseline.get("currency", "PKR"),
        "total": len(devices),
        "devices": devices,
    }


@router.get("/devices/{sn}")
async def get_device_pricing(
    sn: str,
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Return pricing for a specific device."""
    doc = await mongo.devices.find_one({"sn": sn})
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    baseline = await mongo.get_pricing()
    return {
        "success": True,
        "sn": sn,
        "name": doc.get("name") or doc.get("assigned_name") or sn,
        "price": doc.get("price", baseline.get("price", 0.0)),
        "currency": doc.get("currency") or baseline.get("currency", "PKR"),
        "has_custom_price": doc.get("price") is not None,
    }


@router.post("")
async def create_price(
    payload: PricePayload,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Create / set pricing. Supports bulk update for all devices, or single device, or baseline. Admin only."""
    currency = _validate_currency(payload.currency)

    # 1. Bulk update all devices in DB
    if payload.apply_to_all:
        res = await mongo.set_all_devices_pricing(payload.price, currency, updated_by=str(current_admin.id))
        logger.info("bulk_price_created admin=%s price=%s currency=%s modified=%s", current_admin.email, payload.price, currency, res.get("modified_count"))
        return {
            "success": True,
            "message": f"Successfully updated pricing for all {res.get('modified_count', 0)} devices to {payload.price} {currency}.",
            "price": payload.price,
            "currency": currency,
            "modified_count": res.get("modified_count"),
        }

    # 2. Update specific device
    if payload.device_sn:
        dev = await mongo.set_device_pricing(payload.device_sn, payload.price, currency, updated_by=str(current_admin.id))
        if not dev:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Device with SN {payload.device_sn} not found")
        logger.info("device_price_created admin=%s sn=%s price=%s currency=%s", current_admin.email, payload.device_sn, payload.price, currency)
        return {
            "success": True,
            "message": f"Successfully set pricing for device {payload.device_sn} to {payload.price} {currency}.",
            "device": dev,
        }

    # 3. Baseline price document
    doc = await mongo.set_pricing(payload.price, currency, updated_by=str(current_admin.id))
    logger.info("baseline_price_created admin=%s price=%s currency=%s", current_admin.email, payload.price, currency)
    return {"success": True, **_serialize(doc)}


@router.put("")
async def update_price(
    payload: PricePayload,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Update pricing. Supports bulk update for all devices, or single device, or baseline. Admin only."""
    currency = _validate_currency(payload.currency)

    # 1. Bulk update all devices in DB
    if payload.apply_to_all:
        res = await mongo.set_all_devices_pricing(payload.price, currency, updated_by=str(current_admin.id))
        logger.info("bulk_price_updated admin=%s price=%s currency=%s modified=%s", current_admin.email, payload.price, currency, res.get("modified_count"))
        return {
            "success": True,
            "message": f"Successfully updated pricing for all {res.get('modified_count', 0)} devices to {payload.price} {currency}.",
            "price": payload.price,
            "currency": currency,
            "modified_count": res.get("modified_count"),
        }

    # 2. Update specific device
    if payload.device_sn:
        dev = await mongo.set_device_pricing(payload.device_sn, payload.price, currency, updated_by=str(current_admin.id))
        if not dev:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Device with SN {payload.device_sn} not found")
        logger.info("device_price_updated admin=%s sn=%s price=%s currency=%s", current_admin.email, payload.device_sn, payload.price, currency)
        return {
            "success": True,
            "message": f"Successfully updated pricing for device {payload.device_sn} to {payload.price} {currency}.",
            "device": dev,
        }

    # 3. Baseline price document
    doc = await mongo.set_pricing(payload.price, currency, updated_by=str(current_admin.id))
    logger.info("baseline_price_updated admin=%s price=%s currency=%s", current_admin.email, payload.price, currency)
    return {"success": True, **_serialize(doc)}


@router.put("/devices/{sn}")
async def update_single_device_price(
    sn: str,
    payload: PricePayload,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Update price for a specific device via REST path. Admin only."""
    currency = _validate_currency(payload.currency)
    dev = await mongo.set_device_pricing(sn, payload.price, currency, updated_by=str(current_admin.id))
    if not dev:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Device with SN {sn} not found")
    logger.info("device_price_updated_by_path admin=%s sn=%s price=%s currency=%s", current_admin.email, sn, payload.price, currency)
    return {
        "success": True,
        "message": f"Successfully updated pricing for device {sn} to {payload.price} {currency}.",
        "device": dev,
    }
