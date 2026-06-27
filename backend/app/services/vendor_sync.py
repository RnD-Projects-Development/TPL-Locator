"""Multi-vendor sync: CityTag, TrackSolid, Zoqin — shared by auto_sync and POST /api/sync/all."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from httpx import AsyncClient, HTTPStatusError, ConnectTimeout, RequestError

from app.dependencies import get_settings
from app.services import device_registry
from app.services.citytag import CityTagClient, CityTagError
from app.services.mongodb import MongoService
from app.services.tracksolid import TrackSolidClient, TrackSolidError
from app.services.zoqin_api import (
    DEFAULT_ZOQIN_TIME_ADJUST_HOURS,
    ZOQIN_REQUEST_TIMEOUT_SEC,
    zoqin_fetch_reports_for_sn,
)

logger = logging.getLogger(__name__)

SYNC_HISTORY_MINUTES = 10
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
TRACKSOLID_TOKEN_PATH = DATA_DIR / "tracksolid_token.json"


@dataclass
class SyncStats:
    relogins: int = 0
    citytag_devices: int = 0
    citytag_points: int = 0
    tracksolid_devices: int = 0
    tracksolid_points: int = 0
    zoqin_devices: int = 0
    zoqin_points: int = 0


def _battery_int(val: Any) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, str) and not val.strip():
        return None
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None


def _battery_citytag(item: Dict[str, Any]) -> Optional[int]:
    if "batteryLevel" in item:
        return _battery_int(item.get("batteryLevel"))
    for k in ("battery", "batteryCapacity", "batteryPowerVal", "soc", "electricity", "quantity", "power"):
        b = _battery_int(item.get(k))
        if b is not None:
            return b
    return None


def _battery_tracksolid(row: Dict[str, Any]) -> Optional[float]:
    for k in ("batteryPowerVal", "powerValue", "electQuantity"):
        v = row.get(k)
        if v is None or (isinstance(v, str) and not str(v).strip()):
            continue
        try:
            return round(float(v), 2)
        except (TypeError, ValueError):
            continue
    return None


async def _citytag_get_devices_retry(
    citytag: CityTagClient, uid: str, token: str, email: str
) -> Optional[List[Dict[str, Any]]]:
    max_retries = 3
    base_delay = 2
    for attempt in range(1, max_retries + 1):
        try:
            return await citytag.get_all_devices(uid, token, page_size=50)
        except (CityTagError, HTTPStatusError) as e:
            msg = str(e).lower()
            if any(x in msg for x in ["token", "expired", "invalid", "401", "unauthorized", "400"]):
                logger.warning("vendor_sync citytag token issue email=%s attempt=%s", email, attempt)
                return None
            logger.error("vendor_sync citytag list devices email=%s err=%s", email, e)
        except (ConnectTimeout, RequestError) as e:
            logger.warning("vendor_sync citytag network email=%s err=%s", email, e)
        if attempt < max_retries:
            await asyncio.sleep(base_delay * attempt)
    return []


async def _sync_citytag(
    mongo: MongoService,
    citytag: CityTagClient,
    settings: Dict[str, Any],
    devices_list: List[Dict[str, Any]],
    stats: SyncStats,
) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    by_sn = device_registry.index_by_sn(devices_list)
    ct_email = (settings.get("citytag_sync_email") or "").strip().lower()
    ct_pwd = settings.get("citytag_sync_password") or ""
    ct_uid_cfg = (settings.get("citytag_sync_uid") or "").strip()
    citytag_admin_registry = (settings.get("vendor_admin_citytag_email") or "").strip().lower()

    if not ct_email or not ct_pwd:
        logger.warning("vendor_sync citytag skipped missing email/password")
        return devices_list, by_sn

    admin_doc = await mongo.accounts.find_one({"email": ct_email, "role": "admin"})
    if not admin_doc:
        logger.error("vendor_sync citytag admin not found email=%s", ct_email)
        return devices_list, by_sn

    admin_id = str(admin_doc["_id"])
    uid = str(admin_doc.get("uid") or ct_uid_cfg).strip()
    token = admin_doc.get("citytag_token")

    devices = await _citytag_get_devices_retry(citytag, uid, token, ct_email) if token else None
    if devices is None:
        try:
            body = await citytag.login(ct_email, ct_pwd)
            token = body.get("token") if isinstance(body, dict) else None
            if not token:
                logger.error("vendor_sync citytag login returned no token")
                return devices_list, by_sn
            await mongo.update_admin_token(admin_id, token)
            stats.relogins += 1
        except Exception:
            logger.exception("vendor_sync citytag login failed")
            return devices_list, by_sn
        devices = await _citytag_get_devices_retry(citytag, uid, token, ct_email)
        if devices is None:
            return devices_list, by_sn

    start_time = datetime.utcnow() - timedelta(minutes=SYNC_HISTORY_MINUTES)
    end_time = datetime.utcnow()

    for device in devices or []:
        if not isinstance(device, dict):
            continue
        sn = device.get("sn")
        if not sn:
            continue
        sn = str(sn).strip()
        reg = by_sn.get(sn)
        if reg and reg.get("vendor") in ("zoqin", "tracksolid"):
            continue

        if not reg:
            devices_list = device_registry.append_device(
                devices_list,
                sn=sn,
                admin_email=citytag_admin_registry,
                vendor="citytag",
            )
            by_sn = device_registry.index_by_sn(devices_list)
            reg = by_sn.get(sn)

        await mongo.upsert_device_from_citytag(admin_id=admin_id, citytag_device=device)

        if not reg or reg.get("vendor") != "citytag":
            continue

        try:
            history = await citytag.get_location_history(
                uid=uid,
                token=token,
                sn=sn,
                start_time=start_time,
                end_time=end_time,
            )
        except (CityTagError, HTTPStatusError):
            logger.warning("vendor_sync citytag history failed sn=%s", sn)
            continue

        stats.citytag_devices += 1
        for item in history:
            if not isinstance(item, dict):
                continue
            bat = _battery_citytag(item)
            inserted = await mongo.upsert_location_from_citytag(
                history_item=item,
                uid=uid,
                sn=sn,
                battery_status=bat,
                time_adjust_hours=-3.0,
            )
            if inserted:
                stats.citytag_points += 1
                logger.info(
                    "citytag_point_uploaded | sn=%s lat=%s lng=%s",
                    sn,
                    item.get("latitude"),
                    item.get("longitude"),
                )

    return devices_list, by_sn


async def _sync_tracksolid(
    mongo: MongoService,
    settings: Dict[str, Any],
    devices_list: List[Dict[str, Any]],
    stats: SyncStats,
) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    by_sn = device_registry.index_by_sn(devices_list)
    app_key = (settings.get("tracksolid_app_key") or "").strip()
    app_secret = (settings.get("tracksolid_app_secret") or "").strip()
    account = (settings.get("tracksolid_account") or "").strip()
    pwd_md5 = (settings.get("tracksolid_password_md5") or "").strip()
    base_url = (settings.get("tracksolid_base_url") or "").strip()
    tpl_email = (settings.get("vendor_admin_tpl_email") or "").strip().lower()

    if not all([app_key, app_secret, account, pwd_md5, base_url]):
        logger.info("vendor_sync tracksolid skipped (incomplete env)")
        return devices_list, by_sn

    tpl_doc = await mongo.accounts.find_one({"email": tpl_email, "role": "admin"})
    if not tpl_doc:
        logger.error("vendor_sync tracksolid tpl admin missing email=%s", tpl_email)
        return devices_list, by_sn
    tpl_admin_id = str(tpl_doc["_id"])
    tpl_uid = str(tpl_doc.get("uid") or "tracksolid_tpl")

    client = TrackSolidClient(
        base_url=base_url,
        app_key=app_key,
        app_secret=app_secret,
        account=account,
        password_md5=pwd_md5,
        token_path=TRACKSOLID_TOKEN_PATH,
    )

    try:
        token = await client.get_valid_token()
        rows = await client.list_device_locations(token)
    except TrackSolidError as e:
        logger.warning("vendor_sync tracksolid first attempt failed: %s — refreshing token file", e)
        try:
            if TRACKSOLID_TOKEN_PATH.exists():
                TRACKSOLID_TOKEN_PATH.unlink()
        except OSError:
            pass
        try:
            token = await client.get_valid_token()
            rows = await client.list_device_locations(token)
        except TrackSolidError as e2:
            logger.error("vendor_sync tracksolid failed: %s", e2)
            return devices_list, by_sn

    for row in rows:
        imei = row.get("imei")
        if not imei:
            continue
        sn = str(imei).strip()
        lat = float(row.get("lat") or 0)
        lng = float(row.get("lng") or 0)
        if lat == 0.0 and lng == 0.0:
            continue

        reg = by_sn.get(sn)
        if not reg:
            devices_list = device_registry.append_device(
                devices_list,
                sn=sn,
                admin_email=tpl_email,
                vendor="tracksolid",
            )
            by_sn = device_registry.index_by_sn(devices_list)

        label = row.get("deviceName") or sn
        await mongo.upsert_device_from_citytag(
            admin_id=tpl_admin_id,
            citytag_device={"sn": sn, "assigned_name": label, "deviceName": label},
        )

        ts_raw = row.get("gpsTime") or row.get("hbTime") or row.get("stateTime")
        if not ts_raw:
            ts_raw = datetime.utcnow()

        bat = _battery_tracksolid(row)

        stats.tracksolid_devices += 1
        inserted = await mongo.upsert_location_from_citytag(
            history_item={
                "sn": sn,
                "latitude": lat,
                "longitude": lng,
                "gpstime": ts_raw,
            },
            uid=tpl_uid,
            sn=sn,
            battery_status=bat,
            time_adjust_hours=5.0,
        )
        if inserted:
            stats.tracksolid_points += 1
            logger.info("tracksolid_point_uploaded | sn=%s lat=%s lng=%s", sn, lat, lng)

    return devices_list, by_sn


async def _sync_zoqin(
    mongo: MongoService,
    settings: Dict[str, Any],
    devices_list: List[Dict[str, Any]],
    stats: SyncStats,
) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """
    Zoqin: POST ``/ZQGPS/Device/location/query`` (no login).
    Fetches recent GPS history for registry devices and upserts into ``locations``.
    """
    by_sn = device_registry.index_by_sn(devices_list)
    location_url = (settings.get("zoqin_location_query_url") or "").strip()
    if not location_url:
        logger.info("vendor_sync zoqin skipped (ZOQIN_LOCATION_QUERY_URL not set)")
        return devices_list, by_sn

    zoqin_sns = [
        d["sn"]
        for d in devices_list
        if device_registry.normalize_vendor(d.get("vendor")) == "zoqin" and d.get("sn")
    ]
    if not zoqin_sns:
        logger.info("vendor_sync zoqin skipped (no zoqin devices in registry)")
        return devices_list, by_sn

    tpl_email = (settings.get("vendor_admin_tpl_email") or "tpl@gmail.com").strip().lower()
    tpl_doc = await mongo.accounts.find_one({"email": tpl_email, "role": "admin"})
    if not tpl_doc:
        logger.error("vendor_sync zoqin tpl admin missing email=%s", tpl_email)
        return devices_list, by_sn
    tpl_uid = str(tpl_doc.get("uid") or "zoqin_vendor_tpl")

    time_adjust = float(settings.get("zoqin_time_adjust_hours", DEFAULT_ZOQIN_TIME_ADJUST_HOURS))
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(minutes=SYNC_HISTORY_MINUTES)
    lock = asyncio.Lock()
    sem = asyncio.Semaphore(4)

    async with AsyncClient(timeout=ZOQIN_REQUEST_TIMEOUT_SEC) as http:

        async def _process_sn(sn: str) -> None:
            async with sem:
                try:
                    reports = await zoqin_fetch_reports_for_sn(
                        http,
                        location_url=location_url,
                        sn=sn,
                        start=start_time,
                        end=end_time,
                    )
                    local_points = 0
                    for report in reports:
                        try:
                            lat_f = float(str(report.get("latitude") or "").strip() or 0)
                            lng_f = float(str(report.get("longitude") or "").strip() or 0)
                        except (TypeError, ValueError):
                            continue
                        if lat_f == 0.0 and lng_f == 0.0:
                            continue
                        ts_raw = report.get("timestamp")
                        if not ts_raw:
                            continue
                        inserted = await mongo.upsert_location_from_citytag(
                            history_item={
                                "sn": sn,
                                "latitude": lat_f,
                                "longitude": lng_f,
                                "timestamp": ts_raw,
                            },
                            uid=tpl_uid,
                            sn=sn,
                            time_adjust_hours=time_adjust,
                        )
                        if inserted:
                            local_points += 1
                            logger.info(
                                "zoqin_point_uploaded | sn=%s lat=%s lng=%s",
                                sn,
                                lat_f,
                                lng_f,
                            )
                    async with lock:
                        stats.zoqin_devices += 1
                        stats.zoqin_points += local_points
                except Exception:
                    logger.exception("vendor_sync zoqin failed sn=%s", sn)

        await asyncio.gather(*[_process_sn(sn) for sn in zoqin_sns])

    logger.info(
        "vendor_sync zoqin done devices=%s points=%s",
        stats.zoqin_devices,
        stats.zoqin_points,
    )
    return devices_list, by_sn


async def run_vendor_sync_all(mongo: MongoService, citytag: CityTagClient) -> Dict[str, Any]:
    settings = get_settings()
    tpl = (settings.get("vendor_admin_tpl_email") or "tpl@gmail.com").strip().lower()
    devices_list = device_registry.load_devices(tpl_admin_email=tpl)
    stats = SyncStats()

    logger.info("=== vendor_sync started ===")

    devices_list, _ = await _sync_citytag(mongo, citytag, settings, devices_list, stats)
    devices_list = device_registry.load_devices(tpl_admin_email=tpl)
    devices_list, _ = await _sync_tracksolid(mongo, settings, devices_list, stats)
    devices_list = device_registry.load_devices(tpl_admin_email=tpl)
    devices_list, _ = await _sync_zoqin(mongo, settings, devices_list, stats)

    total_points = stats.citytag_points + stats.tracksolid_points + stats.zoqin_points
    total_devices_touched = stats.citytag_devices + stats.tracksolid_devices + stats.zoqin_devices

    logger.info(
        "=== vendor_sync completed === citytag(dev=%s pts=%s) tracksolid(dev=%s pts=%s) zoqin(dev=%s pts=%s) relogins=%s",
        stats.citytag_devices,
        stats.citytag_points,
        stats.tracksolid_devices,
        stats.tracksolid_points,
        stats.zoqin_devices,
        stats.zoqin_points,
        stats.relogins,
    )

    return {
        "admins_processed": 1,
        "devices_processed": total_devices_touched,
        "points_inserted": total_points,
        "relogins": stats.relogins,
        "sync_window_minutes": SYNC_HISTORY_MINUTES,
        "citytag_devices_processed": stats.citytag_devices,
        "citytag_points_inserted": stats.citytag_points,
        "tracksolid_devices_processed": stats.tracksolid_devices,
        "tracksolid_points_inserted": stats.tracksolid_points,
        "zoqin_devices_processed": stats.zoqin_devices,
        "zoqin_points_inserted": stats.zoqin_points,
    }
