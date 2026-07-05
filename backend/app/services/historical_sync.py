import logging
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.dependencies import get_settings
from app.services.citytag import CityTagClient, CityTagError
from app.services.device_registry import load_devices, normalize_vendor
from app.services.mongodb import MongoService
from app.services.tracksolid import TrackSolidClient, TrackSolidError

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.zoqin_history import fetch_zoqin_history_points

logger = logging.getLogger(__name__)


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def build_history_window(*, now: Optional[datetime] = None, lookback_minutes: int = 30) -> Tuple[datetime, datetime]:
    current = now or datetime.utcnow()
    current = _to_naive_utc(current)
    end_time = current
    start_time = current - timedelta(minutes=lookback_minutes)
    return start_time, end_time


async def _upsert_history_points(
    mongo: MongoService,
    *,
    uid: str,
    sn: str,
    vendor: str,
    points: List[Dict[str, Any]],
    time_adjust_hours: float,
) -> int:
    inserted = 0
    for point in points:
        if not isinstance(point, dict):
            continue
        lat = point.get("lat")
        lng = point.get("lng")
        if lat is None or lng is None:
            lat = point.get("latitude")
            lng = point.get("longitude")
        if lat is None or lng is None:
            lat = point.get("lon")
            lng = point.get("long")
        if lat is None or lng is None:
            continue
        try:
            lat_f = float(lat)
            lng_f = float(lng)
        except (TypeError, ValueError):
            continue
        if lat_f == 0.0 and lng_f == 0.0:
            continue

        ts_raw = (
            point.get("timestamp")
            or point.get("datePublished")
            or point.get("gpstime")
            or point.get("time")
            or point.get("locTime")
            or point.get("gpsTime")
            or point.get("reportTime")
            or point.get("created_at")
            or point.get("createdAt")
        )
        if not ts_raw:
            continue
        ok = await mongo.upsert_location_from_citytag(
            history_item={
                "sn": sn,
                "lat": lat_f,
                "lng": lng_f,
                "timestamp": ts_raw,
                "latitude": lat_f,
                "longitude": lng_f,
            },
            uid=uid,
            sn=sn,
            time_adjust_hours=time_adjust_hours,
        )
        if ok:
            inserted += 1
            logger.info("historical_sync inserted vendor=%s sn=%s timestamp=%s", vendor, sn, ts_raw)
    return inserted


async def _sync_citytag_history(
    mongo: MongoService,
    settings: Dict[str, Any],
    sns: List[str],
    start_time: datetime,
    end_time: datetime,
) -> int:
    citytag_url = (settings.get("citytag_base_url") or "").strip()
    email = (settings.get("citytag_sync_email") or "").strip().lower()
    password = settings.get("citytag_sync_password") or ""
    uid = str(settings.get("citytag_sync_uid") or "").strip()
    if not citytag_url or not email or not password or not uid:
        logger.warning("historical_sync citytag skipped (missing credentials)")
        return 0

    client = CityTagClient(citytag_url)
    try:
        login_data = await client.login(email, password)
    except (CityTagError, Exception) as exc:
        logger.warning("historical_sync citytag login failed: %s", exc)
        return 0

    token = login_data.get("token") if isinstance(login_data, dict) else None
    if not token:
        logger.warning("historical_sync citytag token missing")
        return 0

    total = 0
    for sn in sns:
        try:
            points = await client.get_location_history(
                uid=uid,
                token=token,
                sn=sn,
                start_time=start_time,
                end_time=end_time,
                page_no=1,
                page_size=500,
            )
        except (CityTagError, Exception) as exc:
            logger.warning("historical_sync citytag history failed sn=%s err=%s", sn, exc)
            continue
        if not isinstance(points, list):
            continue
        total += await _upsert_history_points(
            mongo,
            uid=uid,
            sn=sn,
            vendor="citytag",
            points=points,
            time_adjust_hours=-3.0,
        )
    return total


async def _sync_tracksolid_history(
    mongo: MongoService,
    settings: Dict[str, Any],
    sns: List[str],
    start_time: datetime,
    end_time: datetime,
) -> int:
    app_key = (settings.get("tracksolid_app_key") or "").strip()
    app_secret = (settings.get("tracksolid_app_secret") or "").strip()
    account = (settings.get("tracksolid_account") or "").strip()
    password_md5 = (settings.get("tracksolid_password_md5") or "").strip()
    base_url = (settings.get("tracksolid_base_url") or "").strip()
    if not all([app_key, app_secret, account, password_md5, base_url]):
        logger.warning("historical_sync tracksolid skipped (missing credentials)")
        return 0

    client = TrackSolidClient(
        base_url=base_url,
        app_key=app_key,
        app_secret=app_secret,
        account=account,
        password_md5=password_md5,
        token_path=Path(__file__).resolve().parents[1] / "data" / "tracksolid_token.json",
    )
    try:
        token = await client.get_valid_token()
    except (TrackSolidError, Exception) as exc:
        logger.warning("historical_sync tracksolid token failed: %s", exc)
        return 0

    total = 0
    for sn in sns:
        try:
            points = await client.list_device_track_history(
                token,
                imei=sn,
                start_time=start_time,
                end_time=end_time,
            )
        except (TrackSolidError, Exception) as exc:
            logger.warning("historical_sync tracksolid history failed sn=%s err=%s", sn, exc)
            continue
        if not isinstance(points, list):
            continue
        normalized = []
        for row in points:
            if not isinstance(row, dict):
                continue
            lat = row.get("lat") or row.get("latitude") or row.get("gpsLat") or row.get("wgLat")
            lng = row.get("lng") or row.get("longitude") or row.get("gpsLng") or row.get("wgLng")
            if lat is None or lng is None:
                continue
            normalized.append({
                "lat": lat,
                "lng": lng,
                "timestamp": row.get("timestamp") or row.get("time") or row.get("gpsTime") or row.get("locTime") or row.get("reportTime") or row.get("createdAt") or row.get("created_at"),
            })
        total += await _upsert_history_points(
            mongo,
            uid=account,
            sn=sn,
            vendor="tracksolid",
            points=normalized,
            time_adjust_hours=5.0,
        )
    return total


async def _sync_zoqin_history(
    mongo: MongoService,
    settings: Dict[str, Any],
    sns: List[str],
    start_time: datetime,
    end_time: datetime,
) -> int:
    location_url = (settings.get("zoqin_location_url") or "").strip()
    if not location_url:
        logger.warning("historical_sync zoqin skipped (missing endpoint)")
        return 0

    tpl_email = (settings.get("vendor_admin_tpl_email") or "tpl@gmail.com").strip().lower()
    admin_doc = await mongo.accounts.find_one({"email": tpl_email, "role": "admin"})
    if not admin_doc:
        logger.warning("historical_sync zoqin admin not found email=%s", tpl_email)
        return 0

    uid = str(admin_doc.get("uid") or "zoqin_vendor_tpl")
    total = 0
    async with httpx.AsyncClient(timeout=90.0) as client:
        for sn in sns:
            try:
                points = await fetch_zoqin_history_points(
                    client=client,
                    location_url=location_url,
                    sn=sn,
                    start=start_time,
                    end=end_time,
                    limit=20,
                )
            except Exception as exc:
                logger.warning("historical_sync zoqin history failed sn=%s err=%s", sn, exc)
                continue
            if not isinstance(points, list):
                continue
            normalized = []
            for row in points:
                if not isinstance(row, dict):
                    continue
                lat = row.get("latitude") or row.get("lat")
                lng = row.get("longitude") or row.get("lng")
                if lat is None or lng is None:
                    continue
                normalized.append({
                    "lat": lat,
                    "lng": lng,
                    "timestamp": row.get("timestamp"),
                })
            total += await _upsert_history_points(
                mongo,
                uid=uid,
                sn=sn,
                vendor="zoqin",
                points=normalized,
                time_adjust_hours=5.0,
            )
    return total


async def run_historical_sync_all(mongo: MongoService) -> Dict[str, Any]:
    settings = get_settings()
    tpl_email = (settings.get("vendor_admin_tpl_email") or "tpl@gmail.com").strip().lower()
    start_time, end_time = build_history_window(lookback_minutes=30)

    latest_docs = []
    cutoff = datetime.utcnow() - timedelta(hours=24)
    async for doc in mongo.db["latestLocation"].find({}, {"sn": 1, "vendor": 1, "timestamps": 1, "_id": 0}).sort("timestamps", -1):
        if not doc.get("sn"):
            continue
        ts = doc.get("timestamps")
        if isinstance(ts, datetime) and ts < cutoff:
            continue
        latest_docs.append(doc)

    by_vendor: Dict[str, List[str]] = {"citytag": [], "tracksolid": [], "zoqin": []}
    for doc in latest_docs:
        vendor = normalize_vendor(doc.get("vendor"))
        sn = str(doc.get("sn") or "").strip()
        if vendor in by_vendor and sn:
            by_vendor[vendor].append(sn)

    stats = {
        "window_start": start_time,
        "window_end": end_time,
        "citytag_points": 0,
        "tracksolid_points": 0,
        "zoqin_points": 0,
    }

    logger.info(
        "historical_sync started at=%s window_start=%s window_end=%s citytag_devices=%s tracksolid_devices=%s zoqin_devices=%s",
        datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        start_time.strftime("%Y-%m-%d %H:%M:%S"),
        end_time.strftime("%Y-%m-%d %H:%M:%S"),
        len(by_vendor["citytag"]),
        len(by_vendor["tracksolid"]),
        len(by_vendor["zoqin"]),
    )
    stats["citytag_points"] = await _sync_citytag_history(mongo, settings, by_vendor["citytag"], start_time, end_time)
    stats["tracksolid_points"] = await _sync_tracksolid_history(mongo, settings, by_vendor["tracksolid"], start_time, end_time)
    stats["zoqin_points"] = await _sync_zoqin_history(mongo, settings, by_vendor["zoqin"], start_time, end_time)
    logger.info(
        "historical_sync completed at=%s citytag=%s tracksolid=%s zoqin=%s",
        datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        stats["citytag_points"],
        stats["tracksolid_points"],
        stats["zoqin_points"],
    )
    return stats
