"""Public price endpoint.

GET is unauthenticated — anyone (marketing site, mobile app, etc.) can read the
current price. PUT is admin-only and is how the price gets configured.
"""

from datetime import datetime, timezone
import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.dependencies import get_mongo_service, require_role
from app.models.admin import AdminInDB
from app.services.mongodb import MongoService

router = APIRouter(prefix="/api/price", tags=["price"])
logger = logging.getLogger(__name__)


def _dt_iso(dt) -> Optional[str]:
    """Serialize to ISO 8601 with an explicit UTC offset.

    PyMongo returns naive datetimes even for values stored as UTC-aware, so a
    plain .isoformat() would silently drop the 'Z'/'+00:00' and non-UTC
    clients would misread the timestamp.
    """
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        return str(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class PriceUpdate(BaseModel):
    price: float = Field(..., ge=0, description="Non-negative price value")
    currency: Optional[str] = Field(default=None, description="3-letter currency code, e.g. USD")


def _serialize(doc: dict) -> dict:
    return {
        "price": doc.get("price", 0.0),
        "currency": doc.get("currency", "USD"),
        "updated_at": _dt_iso(doc.get("updated_at")),
        "updated_by": doc.get("updated_by"),
    }


@router.get("")
async def get_price(
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Return the currently configured price. No authentication required."""
    doc = await mongo.get_pricing()
    return {"success": True, **_serialize(doc)}


@router.put("")
async def update_price(
    payload: PriceUpdate,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Configure the price. Admin only."""
    currency = (payload.currency or "USD").strip().upper()
    if len(currency) != 3 or not currency.isalpha():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="currency must be a 3-letter code, e.g. USD",
        )

    doc = await mongo.set_pricing(payload.price, currency, updated_by=str(current_admin.id))
    logger.info(
        "price_updated admin=%s price=%s currency=%s",
        current_admin.email, payload.price, currency,
    )
    return {"success": True, **_serialize(doc)}
