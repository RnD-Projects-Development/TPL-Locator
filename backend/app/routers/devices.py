from datetime import datetime, timedelta
import logging
import re
from typing import Annotated, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.dependencies import get_current_account, get_mongo_service
from app.models.admin import AdminInDB
from app.models.user import UserInDB
from app.services.mongodb import MongoService
from app.services.device_binding import bind_device_service, unbind_device_service
from bson import ObjectId


router = APIRouter(prefix="/api", tags=["devices"])
logger = logging.getLogger(__name__)

# Device is considered online if it has a location update within this many minutes .... 
ONLINE_THRESHOLD_MINUTES = 30


def _fmt_dt(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        return value
    return str(value)


def _get_device_status(latest_timestamp) -> str:
    """Determine if device is online or offline based on latest location timestamp."""
    if not latest_timestamp:
        return "offline"
    if isinstance(latest_timestamp, str):
        try:
            latest_timestamp = datetime.fromisoformat(latest_timestamp.replace("Z", "+00:00"))
        except Exception:
            return "offline"
    if not isinstance(latest_timestamp, datetime):
        return "offline"
    # Strip timezone for naive UTC comparison — stored timestamps are naive UTC
    if latest_timestamp.tzinfo is not None:
        latest_timestamp = latest_timestamp.replace(tzinfo=None)
    if (datetime.utcnow() - latest_timestamp) < timedelta(minutes=ONLINE_THRESHOLD_MINUTES):
        return "online"
    return "offline"


async def _enrich_device(doc: dict, user: UserInDB, mongo: MongoService) -> dict:
    """Build a full device row matching the shape DevicesTable expects."""
    device_sn = doc.get("sn")

    # dataRetrievalTime — latest location timestamp from locations collection
    latest_loc = await mongo.locations.find_one(
        {"sn": device_sn},
        sort=[("timestamp", -1)],
    )
    data_retrieval_time = _fmt_dt(latest_loc.get("timestamp")) if latest_loc else None

    # Online/offline status based on latest location timestamp
    device_status = _get_device_status(latest_loc.get("timestamp")) if latest_loc else "offline"

    # assigned_user_name — use the label entered at bind time (stored as device name),
    # fall back to the user's account name or email
    assigned_user_name = doc.get("name") or user.name or user.email or None

    # assigned_name — label used by the UI when `name` is empty.
    assigned_name = doc.get("assigned_name") or doc.get("name") or device_sn

    # client — stored on the device doc at bind time
    client = doc.get("client") or None

    return {
        "sn":                 device_sn,
        "name":               doc.get("name", ""),
        "assigned_name":     assigned_name,
        "client":             client,
        "category":           doc.get("category") or None,
        "status":             device_status,
        "assigned_user_name": assigned_user_name,
        "assigned_user_id":   str(user.id),
        # Frontend legacy alias (used by dashboard pages).
        "assignedUser":      assigned_user_name,
        "dataRetrievalTime":  data_retrieval_time,
        "bindTime":           _fmt_dt(doc.get("bound_at")),
        "local_id":           str(doc.get("_id")),
    }


def _to_oid(value) -> ObjectId | None:
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return value
    try:
        return ObjectId(str(value))
    except Exception:
        return None


async def _load_latest_location_map(mongo: MongoService, sns: list[str]) -> dict[str, datetime | None]:
    if not sns:
        return {}

    latest_by_sn: dict[str, datetime | None] = {}
    pipeline = [
        {"$match": {"sn": {"$in": sns}}},
        {"$sort": {"timestamp": -1}},
        {"$group": {"_id": "$sn", "timestamp": {"$first": "$timestamp"}}},
    ]
    async for row in mongo.locations.aggregate(pipeline):
        latest_by_sn[str(row["_id"])] = row.get("timestamp")
    return latest_by_sn


def _device_row(
    doc: dict,
    latest_timestamp: datetime | None,
    *,
    assigned_user_id: str | None = None,
    assigned_user_name: str | None = None,
) -> dict:
    device_sn = doc.get("sn")
    device_name = doc.get("name", "") or ""
    assigned_name = (
        doc.get("assigned_name")
        or (device_name if device_name and device_name != device_sn else None)
        or device_sn
    )
    return {
        "sn": device_sn,
        "local_id": str(doc.get("_id")),
        "name": device_name,
        "assigned_name": assigned_name,
        "client": doc.get("client") or None,
        "category": doc.get("category") or None,
        "status": _get_device_status(latest_timestamp) if latest_timestamp else "offline",
        "assigned_user_name": assigned_user_name,
        "assigned_user_id": assigned_user_id,
        "assignedUser": assigned_user_name,
        "dataRetrievalTime": _fmt_dt(latest_timestamp) if latest_timestamp else None,
        "bindTime": _fmt_dt(doc.get("bound_at")),
        "region": doc.get("region") or None,
        "zone": doc.get("zone") or None,
        "fence_zone_ids": doc.get("fence_zone_ids") or [],
        "local_only": bool(doc.get("local_only")) if doc.get("local_only") is not None else None,
        "datapoint_count": doc.get("datapoint_count", 0),
        "last_seen": doc.get("last_seen") or doc.get("lastSeen") or None,
        "first_seen": doc.get("first_seen") or None,
    }


def _paged_response(items: list[dict], page: int, limit: int, total: int) -> dict:
    total_pages = max(1, (total + limit - 1) // limit) if limit > 0 else 1
    return {
        "devices": items,
        "page": page,
        "limit": limit,
        "total": total,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }


async def _load_users_map(mongo: MongoService, user_ids: list[ObjectId]) -> dict[str, dict]:
    users_by_id: dict[str, dict] = {}
    if not user_ids:
        return users_by_id

    async for user_doc in mongo.accounts.find({"_id": {"$in": user_ids}, "role": "user"}):
        users_by_id[str(user_doc["_id"])] = user_doc
    return users_by_id


def _text_regex(term: str) -> dict:
    return {"$regex": re.escape(term.strip()), "$options": "i"}


def _doc_matches_search(doc: dict, term: str, *, extra: str = "") -> bool:
    if not term:
        return True
    haystack = " ".join(
        filter(
            None,
            [
                str(doc.get("sn") or ""),
                str(doc.get("name") or ""),
                str(doc.get("client") or ""),
                str(doc.get("category") or ""),
                str(doc.get("assigned_name") or ""),
                extra,
            ],
        )
    ).lower()
    return term.lower() in haystack


def _doc_matches_sn_name_search(doc: dict, term: str) -> bool:
    """Match device serial number or locator/sticker display name only."""
    if not term:
        return True
    haystack = " ".join(
        filter(
            None,
            [
                str(doc.get("sn") or ""),
                str(doc.get("name") or ""),
                str(doc.get("assigned_name") or ""),
            ],
        )
    ).lower()
    return term.lower() in haystack


async def _build_admin_device_query(
    mongo: MongoService,
    admin_oid: ObjectId,
    search: str | None,
    *,
    sn_name_only: bool = False,
) -> dict:
    query: dict = {"admin_id": admin_oid}
    term = (search or "").strip()
    if not term:
        return query

    regex = _text_regex(term)
    or_clauses: list[dict] = [
        {"sn": regex},
        {"name": regex},
    ]
    if not sn_name_only:
        or_clauses.extend([
            {"client": regex},
            {"category": regex},
            {"assigned_name": regex},
        ])
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


async def _apply_status_filter_to_query(mongo: MongoService, query: dict, status_filter: str) -> dict:
    if status_filter == "assigned":
        return {"$and": [query, {"user_id": {"$ne": None}}]}
    if status_filter == "unassigned":
        return {"$and": [query, {"user_id": None}]}
    if status_filter not in ("online", "offline"):
        return query

    sns: list[str] = []
    async for doc in mongo.devices.find(query, {"sn": 1}):
        sn = doc.get("sn")
        if sn:
            sns.append(str(sn))

    if not sns:
        return {"$and": [query, {"sn": {"$in": []}}]}

    latest_by_sn = await _load_latest_location_map(mongo, sns)
    if status_filter == "online":
        matched = [sn for sn in sns if _get_device_status(latest_by_sn.get(sn)) == "online"]
    else:
        matched = [sn for sn in sns if _get_device_status(latest_by_sn.get(sn)) != "online"]

    return {"$and": [query, {"sn": {"$in": matched}}]}


def _apply_device_type_filter(query: dict, device_type: str | None) -> dict:
    """Inject a sticker/locator SN-pattern filter into an existing query dict."""
    if device_type == "sticker":
        return {"$and": [query, {"sn": {"$regex": r"^\d+$"}}]}
    if device_type == "locator":
        return {"$and": [query, {"sn": {"$not": {"$regex": r"^\d+$"}}}]}
    return query


def _sn_matches_type(sn: str | None, device_type: str | None) -> bool:
    if device_type is None or device_type == "all":
        return True
    if not sn:
        return False
    is_sticker = bool(re.match(r"^\d+$", str(sn)))
    if device_type == "sticker":
        return is_sticker
    if device_type == "locator":
        return not is_sticker
    return True


async def _list_devices_page(
    account: Union[AdminInDB, UserInDB],
    mongo: MongoService,
    page: int,
    limit: int,
    search: str | None = None,
    status_filter: str = "all",
    device_type: str | None = None,
    search_scope: str | None = None,
) -> dict:
    offset = (page - 1) * limit
    term = (search or "").strip()
    sn_name_only = search_scope == "sn_name"
    user_label = ""
    if isinstance(account, UserInDB) and not sn_name_only:
        user_label = " ".join(filter(None, [account.name or "", account.email or ""]))

    if isinstance(account, UserInDB):
        ids = list(account.devices or [])
        if not ids:
            return _paged_response([], page, limit, 0)

        docs = await mongo.devices.find({"_id": {"$in": ids}}).to_list(len(ids))
        docs_by_id = {str(doc["_id"]): doc for doc in docs}
        ordered_docs = [docs_by_id[str(oid)] for oid in ids if str(oid) in docs_by_id]

        if term:
            if sn_name_only:
                ordered_docs = [
                    doc for doc in ordered_docs
                    if _doc_matches_sn_name_search(doc, term)
                ]
            else:
                ordered_docs = [
                    doc for doc in ordered_docs
                    if _doc_matches_search(doc, term, extra=user_label)
                ]

        if device_type in ("sticker", "locator"):
            ordered_docs = [
                doc for doc in ordered_docs
                if _sn_matches_type(str(doc.get("sn") or ""), device_type)
            ]

        if status_filter == "unassigned":
            ordered_docs = []
        elif status_filter in ("online", "offline"):
            sns = [str(doc.get("sn")) for doc in ordered_docs if doc.get("sn")]
            latest_by_sn = await _load_latest_location_map(mongo, sns)
            if status_filter == "online":
                ordered_docs = [
                    doc for doc in ordered_docs
                    if _get_device_status(latest_by_sn.get(str(doc.get("sn")))) == "online"
                ]
            else:
                ordered_docs = [
                    doc for doc in ordered_docs
                    if _get_device_status(latest_by_sn.get(str(doc.get("sn")))) != "online"
                ]

        total = len(ordered_docs)
        page_docs = ordered_docs[offset:offset + limit]
        if not page_docs:
            return _paged_response([], page, limit, total)

        latest_by_sn = await _load_latest_location_map(
            mongo,
            [str(doc.get("sn")) for doc in page_docs if doc.get("sn")],
        )
        user_name = (account.name or account.email) if hasattr(account, "name") else account.email
        items = [
            _device_row(
                doc,
                latest_by_sn.get(str(doc.get("sn"))),
                assigned_user_id=str(account.id),
                assigned_user_name=user_name,
            )
            for doc in page_docs
        ]
        return _paged_response(items, page, limit, total)

    admin_oid = _to_oid(account.id)
    query = await _build_admin_device_query(mongo, admin_oid, term, sn_name_only=sn_name_only)
    query = _apply_device_type_filter(query, device_type)
    query = await _apply_status_filter_to_query(mongo, query, status_filter)
    total = await mongo.devices.count_documents(query)
    docs = await mongo.devices.find(query).sort("sn", 1).skip(offset).limit(limit).to_list(limit)
    if not docs:
        return _paged_response([], page, limit, total)

    latest_by_sn = await _load_latest_location_map(
        mongo,
        [str(doc.get("sn")) for doc in docs if doc.get("sn")],
    )
    user_oids = []
    seen_user_ids: set[str] = set()
    for doc in docs:
        oid = _to_oid(doc.get("user_id"))
        if not oid:
            continue
        key = str(oid)
        if key in seen_user_ids:
            continue
        seen_user_ids.add(key)
        user_oids.append(oid)

    users_by_id = await _load_users_map(mongo, user_oids)
    items = []
    for doc in docs:
        user_doc = None
        user_oid = _to_oid(doc.get("user_id"))
        if user_oid:
            user_doc = users_by_id.get(str(user_oid))
        if user_doc:
            raw_name = (user_doc.get("name") or "").strip()
            email = user_doc.get("email") or ""
            assigned_user_name = raw_name or (email.split("@")[0] if "@" in email else email) or None
            assigned_user_id = str(user_oid) if user_oid else None
        else:
            assigned_user_name = None
            assigned_user_id = None

        items.append(
            _device_row(
                doc,
                latest_by_sn.get(str(doc.get("sn"))),
                assigned_user_id=assigned_user_id,
                assigned_user_name=assigned_user_name,
            )
        )

    return _paged_response(items, page, limit, total)


async def _enrich_admin_devices(admin: AdminInDB, mongo: MongoService) -> List[dict]:
    """
    Build an admin-facing device list purely from Mongo.

    This keeps GET /api/devices stable even if CityTag is down, because it only relies on:
    - mongo.devices (binding/name/client/region/user assignment)
    - mongo.locations (latest timestamp -> status + dataRetrievalTime)
    - mongo.accounts (assigned user display name, filtered by role="user")
    """
    logger.info("enrich_admin_devices started admin=%s", admin.email)

    docs = await mongo.devices.find({"admin_id": admin.id}).to_list(None)
    if not docs:
        return []

    sns = [str(d.get("sn")) for d in docs if d.get("sn")]
    sns_set = set(sns)

    # Latest location per SN via aggregation to avoid N+1 queries
    latest_by_sn: dict[str, dict] = {}
    if sns_set:
        pipeline = [
            {"$match": {"sn": {"$in": list(sns_set)}}},
            {"$sort": {"timestamp": -1}},
            {"$group": {"_id": "$sn", "timestamp": {"$first": "$timestamp"}}},
        ]
        async for row in mongo.locations.aggregate(pipeline):
            latest_by_sn[str(row["_id"])] = {"timestamp": row.get("timestamp")}

    # Prefetch users referenced by device.user_id
    user_oids: list[ObjectId] = []
    for d in docs:
        oid = _to_oid(d.get("user_id"))
        if oid:
            user_oids.append(oid)
    user_oids = list({str(o): o for o in user_oids}.values())  # de-dupe preserving values

    users_by_id: dict[str, dict] = {}
    if user_oids:
        async for user_doc in mongo.accounts.find({"_id": {"$in": user_oids}, "role": "user"}):
            users_by_id[str(user_doc["_id"])] = user_doc

    def resolve_user_display(user_oid) -> tuple[str | None, str | None]:
        oid = _to_oid(user_oid)
        if not oid:
            return None, None
        user_doc = users_by_id.get(str(oid))
        if not user_doc:
            return str(oid), None
        name = (user_doc.get("name") or "").strip()
        email = user_doc.get("email") or ""
        display = name or (email.split("@")[0] if "@" in email else email) or None
        return str(oid), display

    result: list[dict] = []
    for doc in docs:
        device_sn = doc.get("sn")
        if not device_sn:
            continue

        latest_ts = latest_by_sn.get(str(device_sn), {}).get("timestamp") if latest_by_sn else None
        data_retrieval_time = _fmt_dt(latest_ts) if latest_ts else None
        device_status = _get_device_status(latest_ts) if latest_ts else "offline"

        assigned_user_id, assigned_user_name = resolve_user_display(doc.get("user_id"))

        # DevicesTable expects these keys for sorting/filtering/rendering.
        # Keep `name` faithful to Mongo (it can legitimately be empty), so `assigned_name`
        # can still be displayed by the frontend when `name` is stale/blank.
        device_name = doc.get("name", "") or ""
        assigned_name = (
            doc.get("assigned_name")
            or (device_name if device_name and device_name != device_sn else None)
            or device_sn
        )

        result.append({
            "sn": device_sn,
            "local_id": str(doc.get("_id")),
            "name": device_name,
            "assigned_name": assigned_name,
            "client": doc.get("client") or None,
            "category": doc.get("category") or None,
            "status": device_status,
            "assigned_user_name": assigned_user_name,
            "assigned_user_id": assigned_user_id,
            # Frontend legacy alias (used by dashboard pages).
            "assignedUser": assigned_user_name,
            "dataRetrievalTime": data_retrieval_time,
            "bindTime": _fmt_dt(doc.get("bound_at")),
            "region": doc.get("region") or None,
            "zone":   doc.get("zone")   or None,
            "fence_zone_ids": doc.get("fence_zone_ids") or [],

            # Optional legacy fields that old admin enrichment included.
            "local_only": bool(doc.get("local_only")) if doc.get("local_only") is not None else None,
            "datapoint_count": doc.get("datapoint_count", 0),
            "last_seen": doc.get("last_seen") or doc.get("lastSeen") or None,
            "first_seen": doc.get("first_seen") or None,
        })

    logger.info("enrich_admin_devices completed admin=%s result_count=%s", admin.email, len(result))
    return result


@router.get("/devices")
async def list_user_devices(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
    page: Optional[int] = Query(default=None, ge=1),
    limit: Optional[int] = Query(default=None, ge=1, le=500),
    search: Optional[str] = Query(default=None, max_length=200),
    status: Optional[str] = Query(default="all", pattern="^(all|online|offline|assigned|unassigned)$"),
    device_type: Optional[str] = Query(default=None, pattern="^(locator|sticker)$"),
    search_scope: Optional[str] = Query(default=None, pattern="^(sn_name)$"),
) -> List[dict] | dict:
    """
    Return devices for the logged-in account.
    - User: only their assigned devices, fully enriched for DevicesTable.
    - Admin: enriched list for DevicesTable (Mongo-backed; no CityTag calls).
    Supports optional ?device_type=locator|sticker to filter by SN pattern.
    """
    logger.info("list_user_devices started account_email=%s", account.email)

    if page is not None and limit is not None:
        try:
            return await _list_devices_page(
                account,
                mongo,
                page,
                limit,
                search=search,
                status_filter=status or "all",
                device_type=device_type,
                search_scope=search_scope,
            )
        except Exception as err:
            logger.exception("list_user_devices paged failed account_email=%s page=%s limit=%s", account.email, page, limit)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to load devices: {str(err)}")

    if isinstance(account, UserInDB):
        ids = account.devices
        if not ids:
            return []
        docs = await mongo.devices.find({"_id": {"$in": ids}}).to_list(None)
        result = []
        for doc in docs:
            enriched = await _enrich_device(doc, account, mongo)
            result.append(enriched)
        logger.info("list_user_devices completed account_email=%s count=%s", account.email, len(result))
        return result

    # Admin path — enriched list for the admin's devices
    result = await _enrich_admin_devices(account, mongo)
    logger.info("list_user_devices completed admin_email=%s count=%s", account.email, len(result))
    return result


class BindDeviceRequest(BaseModel):
    sn: str
    identifier: Optional[str] = None  # optional; JWT current_account can be used when not targeting another user
    name: Optional[str] = None       # label shown in table; stamped on device doc at bind time
    client: Optional[str] = None     # optional client/company name
    user_id: Optional[str] = None    # admin-only: assign to a specific user
    category: Optional[str] = None   # device category e.g. "car", "wallet", "bag"


class UpdateOwnDeviceRequest(BaseModel):
    name: Optional[str] = None
    client: Optional[str] = None
    category: Optional[str] = None


class UpdateDeviceRequest(BaseModel):
    name: Optional[str] = None
    client: Optional[str] = None
    region: Optional[str] = None
    category: Optional[str] = None
    zone: Optional[str] = None
    add_zone: Optional[str] = None
    remove_zone: Optional[str] = None


@router.post("/devices")
async def bind_device(
    payload: BindDeviceRequest,
    current_account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """
    Bind a device to a user.

    Regular user path: device must exist and be unassigned (or already theirs).
      - name and client from the request are stamped on the device doc.
      - user is auto-linked to the device's admin if not already linked.

    Admin-initiated path: pass user_id to assign an unbound device to a
      specific user under the same admin. name/client are optional stamps.
    """
    try:
        logger.info(
            "bind_device route started actor=%s sn=%s target_identifier=%s target_user_id=%s",
            current_account.email,
            payload.sn,
            payload.identifier,
            payload.user_id,
        )
        response = await bind_device_service(
            current_account=current_account,
            sn=payload.sn,
            identifier=payload.identifier,
            user_id=payload.user_id,
            name=payload.name,
            client=payload.client,
            category=payload.category,
            mongo=mongo,
        )
        logger.info("bind_device route completed actor=%s sn=%s", current_account.email, payload.sn)
        return response

    except HTTPException:
        raise
    except Exception as err:
        logger.exception("bind_device route failed actor=%s sn=%s", current_account.email, payload.sn)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(err)}",
        )


@router.get("/devices/available")
async def list_available_devices(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
) -> List[dict]:
    """
    Return unbound devices that the current account can bind.

    - Admin: only their own unbound devices.
    - User with admin_id: unbound devices under their admin.
    - User without admin_id (new user): all unbound devices in the system —
      the binding service auto-links the user to the device's admin on first bind,
      so no admin restriction is needed at discovery time.
    """
    if isinstance(account, AdminInDB):
        # Admin sees only their own unbound devices
        query = {"admin_id": account.id, "user_id": None}
    elif account.admin_id:
        # User already linked to an admin — show that admin's unbound devices
        query = {"admin_id": account.admin_id, "user_id": None}
    else:
        # New user not yet linked to any admin — show all unbound devices
        query = {"user_id": None}

    docs = await mongo.devices.find(query).to_list(None)

    return [
        {
            "sn":     d.get("sn"),
            "name":   d.get("name") or "",
            "client": d.get("client") or "",
        }
        for d in docs
        if d.get("sn")
    ]


@router.get("/devices/summary")
async def get_devices_summary(
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
) -> dict:
    """
    Return lightweight count stats for the account — no device documents returned.
    Used by Dashboard cards to avoid loading all devices into the frontend.
    """
    if isinstance(account, UserInDB):
        ids = list(account.devices or [])
        if not ids:
            return {
                "total": 0, "assigned": 0, "locators": 0, "stickers": 0,
                "online": 0, "offline": 0, "weekly_new_locators": 0, "weekly_new_stickers": 0,
            }
        docs = await mongo.devices.find(
            {"_id": {"$in": ids}}, {"sn": 1, "bound_at": 1, "user_id": 1},
        ).to_list(len(ids))
    else:
        admin_oid = _to_oid(account.id)
        docs = await mongo.devices.find(
            {"admin_id": admin_oid}, {"sn": 1, "bound_at": 1, "user_id": 1},
        ).to_list(None)

    sns = [str(d.get("sn")) for d in docs if d.get("sn")]
    sticker_re = re.compile(r"^\d+$")
    locator_sns = [s for s in sns if not sticker_re.match(s)]
    sticker_sns = [s for s in sns if sticker_re.match(s)]

    # Online count — latest location within 30 minutes
    online = 0
    if sns:
        pipeline = [
            {"$match": {"sn": {"$in": sns}}},
            {"$sort": {"timestamp": -1}},
            {"$group": {"_id": "$sn", "ts": {"$first": "$timestamp"}}},
        ]
        threshold = datetime.utcnow() - timedelta(minutes=ONLINE_THRESHOLD_MINUTES)
        async for row in mongo.locations.aggregate(pipeline):
            ts = row.get("ts")
            if ts and isinstance(ts, datetime):
                if ts.tzinfo is not None:
                    ts = ts.replace(tzinfo=None)
                if ts >= threshold:
                    online += 1

    # Weekly new binds
    week_ago = datetime.utcnow() - timedelta(days=7)
    weekly_new_locators = sum(
        1 for d in docs
        if str(d.get("sn") or "") in set(locator_sns)
        and d.get("bound_at") and isinstance(d["bound_at"], datetime)
        and d["bound_at"] >= week_ago
    )
    weekly_new_stickers = sum(
        1 for d in docs
        if str(d.get("sn") or "") in set(sticker_sns)
        and d.get("bound_at") and isinstance(d["bound_at"], datetime)
        and d["bound_at"] >= week_ago
    )

    total = len(sns)
    if isinstance(account, UserInDB):
        assigned = total
    else:
        assigned = sum(1 for d in docs if d.get("user_id") is not None)

    return {
        "total": total,
        "assigned": assigned,
        "locators": len(locator_sns),
        "stickers": len(sticker_sns),
        "online": online,
        "offline": total - online,
        "weekly_new_locators": weekly_new_locators,
        "weekly_new_stickers": weekly_new_stickers,
    }


@router.get("/devices/{sn}")
async def get_device_by_sn(
    sn: str,
    account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
) -> dict:
    """Return a single device row by SN, enriched the same way as the list endpoint."""
    doc = await mongo.devices.find_one({"sn": sn})
    if not doc:
        raise HTTPException(status_code=404, detail="Device not found")

    # Access check
    if isinstance(account, UserInDB):
        if _to_oid(doc.get("_id")) not in (account.devices or []):
            raise HTTPException(status_code=403, detail="Device not assigned to you")
    else:
        if str(doc.get("admin_id")) != str(account.id):
            raise HTTPException(status_code=403, detail="Device not owned by this admin")

    latest_ts_map = await _load_latest_location_map(mongo, [sn])
    latest_ts = latest_ts_map.get(sn)

    assigned_user_name = None
    assigned_user_id = None
    user_oid = _to_oid(doc.get("user_id"))
    if user_oid:
        user_doc = await mongo.accounts.find_one({"_id": user_oid, "role": "user"})
        if user_doc:
            raw_name = (user_doc.get("name") or "").strip()
            email = user_doc.get("email") or ""
            assigned_user_name = raw_name or (email.split("@")[0] if "@" in email else email) or None
            assigned_user_id = str(user_oid)

    return _device_row(
        doc,
        latest_ts,
        assigned_user_id=assigned_user_id,
        assigned_user_name=assigned_user_name,
    )


@router.delete("/devices/{sn}")
async def unbind_device(
    sn: str,
    current_account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Unassign a device from the current user."""
    try:
        logger.info("unbind_device route started actor=%s sn=%s", current_account.email, sn)
        response = await unbind_device_service(
            current_account=current_account,
            sn=sn,
            mongo=mongo,
        )
        logger.info("unbind_device route completed actor=%s sn=%s", current_account.email, sn)
        return response

    except HTTPException:
        raise
    except Exception as err:
        logger.exception("unbind_device route failed actor=%s sn=%s", current_account.email, sn)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(err),
        )


async def _update_device_for_account(
    current_account: Union[AdminInDB, UserInDB],
    sn: str,
    payload: UpdateDeviceRequest,
    mongo: MongoService,
):
    is_admin = isinstance(current_account, AdminInDB)

    if not is_admin and any([
        payload.region is not None,
        payload.zone is not None,
        payload.add_zone is not None,
        payload.remove_zone is not None,
    ]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins only may update region or fence zone fields",
        )

    device = await mongo.get_device_by_sn(sn)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    if is_admin:
        if str(device.admin_id) != str(current_account.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device not owned by this admin")
    else:
        if not device.user_id or str(device.user_id) != str(current_account.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This device is not assigned to you")

    updated = await mongo.update_device(
        sn,
        name=payload.name.strip() if payload.name is not None else None,
        client=payload.client.strip() if payload.client is not None else None,
        region=payload.region.strip() if payload.region is not None and is_admin else None,
        category=payload.category.strip() if payload.category is not None else None,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update device")

    if is_admin:
        if payload.zone is not None:
            zone_val = payload.zone.strip() or None
            await mongo.devices.update_one({"sn": sn}, {"$set": {"zone": zone_val}})

        if payload.add_zone:
            zone_val = payload.add_zone.strip()
            if zone_val:
                await mongo.devices.update_one({"sn": sn}, {"$addToSet": {"fence_zone_ids": zone_val}})

        if payload.remove_zone:
            zone_val = payload.remove_zone.strip()
            if zone_val:
                await mongo.devices.update_one({"sn": sn}, {"$pull": {"fence_zone_ids": zone_val}})

    refreshed = await mongo.get_device_by_sn(sn)
    return {
        "status": "ok",
        "device": {
            "id": str((refreshed or updated).id),
            "sn": (refreshed or updated).sn,
            "name": (refreshed or updated).name,
            "client": (refreshed or updated).client,
            "region": (refreshed or updated).region,
            "category": (refreshed or updated).category,
            "zone": (refreshed or updated).zone,
        },
    }


@router.put("/devices/{sn}")
async def update_device(
    sn: str,
    payload: UpdateDeviceRequest,
    current_account: Annotated[Union[AdminInDB, UserInDB], Depends(get_current_account)],
    mongo: Annotated[MongoService, Depends(get_mongo_service)],
):
    """Update a device for both admins and users by checking the account role."""
    return await _update_device_for_account(current_account, sn, payload, mongo)