"""Orders (locator purchase invoices) — admin only.

Read-only proxy over TPL's MyTrakker e-commerce receipt service. Every row the
upstream returns is an already-collected payment, so there is no order-state
handling here: the portal lists invoices, it does not manage them.

Admin-only by design — these receipts carry other customers' names, CNICs and
delivery addresses, so super users and end users have no route to them.
"""

import logging
from typing import Annotated, Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import require_role
from app.models.admin import AdminInDB
from app.services.mytrakker import MyTrakkerError, get_receipts

router = APIRouter(prefix="/api/orders", tags=["orders"])
logger = logging.getLogger(__name__)

MAX_LIMIT = 500

# Fields a free-text search scans.
_SEARCH_FIELDS = (
    "customer_name", "account_title", "phone", "email", "cnic",
    "invoice_no", "payment_id", "transaction_id", "city",
    "product", "product_detail", "company_name", "source",
)

_SORT_FIELDS = {
    "payment_date", "customer_name", "total_amount", "amount_paid",
    "invoice_no", "payment_id", "city", "product", "units",
}


def _matches(order: dict, needle: str) -> bool:
    return any(needle in (order.get(f) or "").lower() for f in _SEARCH_FIELDS)


def _sort_orders(orders: List[dict], field: str, reverse: bool) -> List[dict]:
    """Sort numerics as numbers and everything else as lowercase text.

    Rows missing the field are held out of the comparison and appended last in
    BOTH directions — folding "missing" into the sort key instead would let
    `reverse=True` (the default newest-first view) float every blank invoice
    date to the top of the page.
    """
    numeric = field in ("total_amount", "amount_paid", "units")

    def present(order: dict) -> bool:
        value = order.get(field)
        return value is not None and value != ""

    def key(order: dict):
        value = order.get(field)
        if numeric:
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0
        return str(value).lower()

    ranked = sorted((o for o in orders if present(o)), key=key, reverse=reverse)
    ranked.extend(o for o in orders if not present(o))
    return ranked


def _summarise(orders: List[dict]) -> dict:
    """Totals over the whole matched set, not just the page being returned."""
    amount = 0.0
    units = 0
    for o in orders:
        value = o.get("total_amount")
        if value is None:
            value = o.get("amount_paid")
        if isinstance(value, (int, float)):
            amount += float(value)
        qty = o.get("units")
        if isinstance(qty, (int, float)):
            units += int(qty)
    return {
        "total_orders": len(orders),
        "total_amount": round(amount, 2),
        "total_units": units,
    }


async def _load(phone: str, refresh: bool) -> List[dict]:
    try:
        return await get_receipts(phone, refresh=refresh)
    except MyTrakkerError as exc:
        # 502: this endpoint is healthy, the upstream gateway is not.
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("")
async def list_orders(
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    search: Optional[str] = Query(default=None, description="Free-text match on buyer, invoice, city or product"),
    phone: Optional[str] = Query(default=None, description="Restrict to one buyer's MSISDN; omit for every invoice"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=MAX_LIMIT),
    sort_by: str = Query(default="payment_date"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    refresh: bool = Query(default=False, description="Bypass the short-lived upstream cache"),
):
    """Return a page of locator purchase invoices, newest first by default."""
    if sort_by not in _SORT_FIELDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"sort_by must be one of: {', '.join(sorted(_SORT_FIELDS))}",
        )

    orders = await _load((phone or "all").strip() or "all", refresh)

    needle = (search or "").strip().lower()
    if needle:
        orders = [o for o in orders if _matches(o, needle)]

    orders = _sort_orders(orders, sort_by, reverse=(sort_dir == "desc"))

    summary = _summarise(orders)
    total = len(orders)
    start = (page - 1) * limit

    return {
        "success": True,
        "total": total,
        "page": page,
        "limit": limit,
        "summary": summary,
        "orders": orders[start:start + limit],
    }


@router.get("/{phone}")
async def get_orders_for_phone(
    phone: str,
    current_admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    refresh: bool = Query(default=False, description="Bypass the short-lived upstream cache"),
):
    """Return every invoice raised against a single buyer's phone number."""
    key = (phone or "").strip()
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="phone is required")

    orders = await _load(key, refresh)
    orders = _sort_orders(orders, "payment_date", reverse=True)

    return {
        "success": True,
        "phone": key,
        "total": len(orders),
        "summary": _summarise(orders),
        "orders": orders,
    }
