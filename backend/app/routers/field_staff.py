from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId

from app.dependencies import get_mongo_service, require_role
from app.models.admin import AdminInDB
from app.services.mongodb import MongoService

router = APIRouter(prefix="/api/field-staff", tags=["field_staff"])
logger = logging.getLogger(__name__)

ONLINE_THRESHOLD_MINUTES = 30
DEFAULT_LIMIT = 20
MAX_LIMIT = 100


def _is_online(timestamp) -> bool:
    if not timestamp:
        return False
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except Exception:
            return False
    if not isinstance(timestamp, datetime):
        return False
    if timestamp.tzinfo is not None:
        timestamp = timestamp.replace(tzinfo=None)
    return (datetime.utcnow() - timestamp) < timedelta(minutes=ONLINE_THRESHOLD_MINUTES)


def _fmt_dt(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _to_oid(value) -> Optional[ObjectId]:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def _text_regex(term: str) -> dict:
    return {"$regex": re.escape(term.strip()), "$options": "i"}


async def _build_admin_device_query(mongo: MongoService, admin_oid: ObjectId, search: str | None) -> dict:
    query: dict = {"admin_id": admin_oid}
    term = (search or "").strip()
    if not term:
        return query

    regex = _text_regex(term)
    or_clauses: list[dict] = [
        {"sn": regex},
        {"name": regex},
        {"client": regex},
        {"category": regex},
        {"assigned_name": regex},
        {"region": regex},
        {"location": regex},
        {"zone": regex},
    ]

    user_ids: list[ObjectId] = []
    async for user_doc in mongo.accounts.find(
        {"$or": [{"name": regex}, {"email": regex}], "role": "user"}
    ):
        uid = _to_oid(user_doc.get("_id"))
        if uid:
            user_ids.append(uid)
    if user_ids:
        or_clauses.append({"user_id": {"$in": user_ids}})

    return {"$and": [query, {"$or": or_clauses}]}


def _parse_date_start(value: str | None) -> datetime | None:
    if not value or not value.strip():
        return None
    try:
        return datetime.strptime(value.strip()[:10], "%Y-%m-%d")
    except ValueError:
        return None


def _parse_date_end(value: str | None) -> datetime | None:
    parsed = _parse_date_start(value)
    if not parsed:
        return None
    return parsed.replace(hour=23, minute=59, second=59, microsecond=999999)


async def _latest_locations_for_sns(mongo: MongoService, sns: list[str]) -> dict[str, dict]:
    latest_by_sn: dict[str, dict] = {}
    if not sns:
        return latest_by_sn

    pipeline = [
        {"$match": {"sn": {"$in": sns}}},
        {"$sort": {"timestamp": -1}},
        {"$group": {
            "_id": "$sn",
            "timestamp": {"$first": "$timestamp"},
            "lat": {"$first": "$lat"},
            "lng": {"$first": "$lng"},
        }},
    ]
    async for row in mongo.locations.aggregate(pipeline):
        latest_by_sn[str(row["_id"])] = {
            "timestamp": row.get("timestamp"),
            "lat": row.get("lat"),
            "lng": row.get("lng"),
        }
    return latest_by_sn


async def _load_users_map(mongo: MongoService, docs: list[dict]) -> dict[str, dict]:
    user_oid_map: dict[str, ObjectId] = {}
    for doc in docs:
        oid = _to_oid(doc.get("user_id"))
        if oid:
            user_oid_map[str(oid)] = oid

    users_by_id: dict[str, dict] = {}
    if user_oid_map:
        async for user_doc in mongo.accounts.find(
            {"_id": {"$in": list(user_oid_map.values())}, "role": "user"}
        ):
            users_by_id[str(user_doc["_id"])] = user_doc
    return users_by_id


def _row_from_doc(doc: dict, latest_by_sn: dict[str, dict], users_by_id: dict[str, dict]) -> dict | None:
    sn = doc.get("sn")
    if not sn:
        return None

    loc = latest_by_sn.get(str(sn), {})
    user_id = doc.get("user_id")
    user_doc = users_by_id.get(str(user_id)) if user_id else None
    if user_doc:
        raw_name = (user_doc.get("name") or "").strip()
        email = user_doc.get("email", "")
        user_display = raw_name or (email.split("@")[0] if "@" in email else email) or None
    else:
        user_display = None

    return {
        "sn": sn,
        "name": doc.get("name") or doc.get("assigned_name") or sn,
        "assignedUser": user_display,
        "assignedUserId": str(user_id) if user_id else None,
        "region": doc.get("region") or None,
        "location": doc.get("location") or None,
        "zone": doc.get("zone") or None,
        "fence_zone_ids": doc.get("fence_zone_ids") or [],
        "latitude": loc.get("lat"),
        "longitude": loc.get("lng"),
        "lastSeen": _fmt_dt(loc.get("timestamp")),
        "isOnline": _is_online(loc.get("timestamp")),
        "_last_seen_dt": loc.get("timestamp"),
    }


def _apply_last_seen_filter(
    rows: list[dict],
    last_seen_from: datetime | None,
    last_seen_to: datetime | None,
) -> list[dict]:
    if not last_seen_from and not last_seen_to:
        return rows

    filtered: list[dict] = []
    for row in rows:
        ts = row.get("_last_seen_dt")
        if not ts:
            continue
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except Exception:
                continue
        if ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)
        if last_seen_from and ts < last_seen_from:
            continue
        if last_seen_to and ts > last_seen_to:
            continue
        filtered.append(row)
    return filtered


def _strip_internal(rows: list[dict]) -> list[dict]:
    return [{k: v for k, v in row.items() if k != "_last_seen_dt"} for row in rows]


def _paged_payload(items: list[dict], page: int, limit: int, total: int, online_count: int) -> dict:
    total_pages = max(1, (total + limit - 1) // limit) if limit > 0 else 1
    return {
        "devices": items,
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": total_pages,
        "online_count": online_count,
    }


@router.get("/live-devices")
async def get_live_devices(
    admin: Annotated[AdminInDB, Depends(require_role("admin"))],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    search: Optional[str] = Query(default=None, max_length=200),
    zone_id: Optional[str] = Query(default=None, max_length=200),
    last_seen_from: Optional[str] = Query(default=None),
    last_seen_to: Optional[str] = Query(default=None),
) -> dict:
    """
    Paginated field-staff device list with latest GPS per device.
    Use search to find devices beyond the first page; optional last_seen date filters.
    """
    logger.info(
        "get_live_devices started admin=%s page=%s limit=%s search=%s",
        admin.email, page, limit, bool(search),
    )

    admin_oid = _to_oid(admin.id)
    query = await _build_admin_device_query(mongo, admin_oid, search)
    if zone_id and zone_id.strip():
        zid = zone_id.strip()
        query = {
            "$and": [
                query,
                {"$or": [{"zone": zid}, {"fence_zone_ids": zid}]},
            ]
        }
    seen_from = _parse_date_start(last_seen_from)
    seen_to = _parse_date_end(last_seen_to)
    has_date_filter = seen_from is not None or seen_to is not None

    if has_date_filter:
        docs = await mongo.devices.find(query).sort("sn", 1).to_list(None)
        if not docs:
            return _paged_payload([], page, limit, 0, 0)

        sns = [str(d["sn"]) for d in docs if d.get("sn")]
        latest_by_sn = await _latest_locations_for_sns(mongo, sns)
        users_by_id = await _load_users_map(mongo, docs)

        rows = []
        for doc in docs:
            row = _row_from_doc(doc, latest_by_sn, users_by_id)
            if row:
                rows.append(row)

        rows = _apply_last_seen_filter(rows, seen_from, seen_to)
        total = len(rows)
        online_count = sum(1 for r in rows if r.get("isOnline"))
        offset = (page - 1) * limit
        page_rows = rows[offset:offset + limit]
        return _paged_payload(_strip_internal(page_rows), page, limit, total, online_count)

    total = await mongo.devices.count_documents(query)
    offset = (page - 1) * limit
    docs = await mongo.devices.find(query).sort("sn", 1).skip(offset).limit(limit).to_list(limit)

    sns = [str(d["sn"]) for d in docs if d.get("sn")]
    latest_by_sn = await _latest_locations_for_sns(mongo, sns)
    users_by_id = await _load_users_map(mongo, docs)

    page_rows = []
    for doc in docs:
        row = _row_from_doc(doc, latest_by_sn, users_by_id)
        if row:
            page_rows.append(row)

    all_sns: list[str] = []
    async for doc in mongo.devices.find(query, {"sn": 1}):
        if doc.get("sn"):
            all_sns.append(str(doc["sn"]))
    fleet_latest = await _latest_locations_for_sns(mongo, all_sns)
    online_count = sum(1 for sn in all_sns if _is_online(fleet_latest.get(sn, {}).get("timestamp")))

    logger.info(
        "get_live_devices completed admin=%s page=%s returned=%s total=%s",
        admin.email, page, len(page_rows), total,
    )
    return _paged_payload(_strip_internal(page_rows), page, limit, total, online_count)
