"""
seed_zoqin_locations.py
-----------------------
Fetch Zoqin GPS history using UTC and insert with +5 hours (PKT) offset.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

from app.dependencies import get_settings
from app.services.device_registry import load_devices, normalize_vendor
from app.services.mongodb import MongoService
from app.services.zoqin_api import (
    DEFAULT_ZOQIN_TIME_ADJUST_HOURS,
    zoqin_fetch_reports_for_sn,
)

load_dotenv()

logger = logging.getLogger(__name__)


def _parse_day(value: Optional[str]) -> datetime:
    """Return UTC midnight for the given date or today."""
    if value:
        dt = datetime.strptime(value, "%Y-%m-%d")
        return dt.replace(tzinfo=timezone.utc)
    # Today in UTC
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def _day_bounds(day: datetime) -> Tuple[str, str]:
    """Return start and end in UTC format for Zoqin API."""
    start = day.replace(hour=0, minute=0, second=0, microsecond=0)
    end = day.replace(hour=23, minute=59, second=59, microsecond=0)
    
    return (
        start.strftime("%Y-%m-%dT%H:%M:%S"),
        end.strftime("%Y-%m-%dT%H:%M:%S")
    )


async def upsert_reports(
    mongo: MongoService,
    *,
    uid: str,
    sn: str,
    reports: List[Dict[str, Any]],
    dry_run: bool,
    geocode: bool,
    time_adjust_hours: float,
) -> int:
    inserted = 0
    for report in reports:
        lat = float(report.get("latitude") or 0)
        lng = float(report.get("longitude") or 0)
        if lat == 0.0 and lng == 0.0:
            continue

        if dry_run:
            inserted += 1
            continue

        if geocode:
            ok = await mongo.upsert_location_from_citytag(
                history_item={
                    "sn": sn,
                    "latitude": lat,
                    "longitude": lng,
                    "gpstime": report.get("timestamp"),
                },
                uid=uid,
                sn=sn,
                time_adjust_hours=time_adjust_hours,
            )
        else:
            ok = await _upsert_location_fast(
                mongo,
                uid=uid,
                sn=sn,
                lat=lat,
                lng=lng,
                ts_raw=report.get("timestamp"),
                time_adjust_hours=time_adjust_hours,
            )
        if ok:
            inserted += 1
    return inserted


async def _upsert_location_fast(
    mongo: MongoService,
    *,
    uid: str,
    sn: str,
    lat: float,
    lng: float,
    ts_raw: Any,
    time_adjust_hours: float,
) -> bool:
    """Upsert without reverse-geocoding."""
    timestamp = mongo._parse_citytag_timestamp(ts_raw)
    if timestamp is not None:
        timestamp = timestamp + timedelta(hours=time_adjust_hours)

    doc = {
        "uid": uid,
        "sn": sn,
        "timestamp": timestamp,
        "lat": lat,
        "lng": lng,
    }
    if not doc["sn"]:
        return False

    result = await mongo.locations.update_one(
        {"uid": doc["uid"], "sn": doc["sn"], "timestamp": doc["timestamp"]},
        {"$set": doc},
        upsert=True,
    )
    return bool(result.upserted_id or result.modified_count > 0)


async def _resolve_tpl_uid(mongo: MongoService, tpl_email: str) -> str:
    doc = await mongo.accounts.find_one({"email": tpl_email.strip().lower(), "role": "admin"})
    if not doc:
        raise RuntimeError(f"TPL admin account not found for email={tpl_email!r}")
    return str(doc.get("uid") or "zoqin_vendor_tpl")


async def run(args: argparse.Namespace) -> int:
    settings = get_settings()
    mongo_uri = settings.get("mongo_uri") or os.getenv("MONGO_URI", "")
    if not mongo_uri:
        print("ERROR: MONGO_URI not set in backend/.env")
        return 1

    location_url = (settings.get("zoqin_location_query_url") or "").strip()
    if not location_url:
        print("ERROR: ZOQIN_LOCATION_QUERY_URL not set in backend/.env")
        return 1

    time_adjust_hours = 5.0  # Fixed +5 hours (PKT) as requested
    tpl_email = (settings.get("vendor_admin_tpl_email") or "tpl@gmail.com").strip().lower()

    start_time = "2026-07-02T00:00:00"
    end_time = "2026-07-08T23:59:59"

    if start_time and end_time:
        day_start = datetime.strptime(
            start_time, "%Y-%m-%dT%H:%M:%S"
        ).replace(tzinfo=timezone.utc)

        day_end = datetime.strptime(
            end_time, "%Y-%m-%dT%H:%M:%S"
        ).replace(tzinfo=timezone.utc)

    else:
        day = _parse_day(args.date)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day.replace(hour=23, minute=59, second=59, microsecond=0)

    start_s = day_start.strftime("%Y-%m-%dT%H:%M:%S")
    end_s = day_end.strftime("%Y-%m-%dT%H:%M:%S")

    if args.sn:
        sns = [args.sn.strip()]
    else:
        devices = load_devices(tpl_admin_email=tpl_email)
        sns = sorted({
            d["sn"] for d in devices
            if d.get("sn") and normalize_vendor(d.get("vendor")) == "zoqin"
        })

    if not sns:
        print("No Zoqin serial numbers found.")
        return 1

    mongo = MongoService(mongo_uri)
    uid = await _resolve_tpl_uid(mongo, tpl_email)
    sem = asyncio.Semaphore(max(1, args.concurrency))

    total_reports = 0
    total_upserted = 0
    failed_sns = 0

    print(f"Start    : {start_s} UTC")
    print(f"End      : {end_s} UTC")
    print(f"Devices  : {len(sns)}")
    print(f"UID      : {uid}")
    print(f"Time Offset (DB): +{time_adjust_hours} hours (PKT)")
    print(f"Dry run  : {args.dry_run}")
    print(f"Geocode  : {args.geocode}")
    print()

    async with httpx.AsyncClient(timeout=90.0) as client:   # Increased timeout

        async def _process_sn(sn: str) -> Tuple[int, int, bool]:
            async with sem:
                try:
                    reports = await zoqin_fetch_reports_for_sn(
                        client,
                        location_url=location_url,
                        sn=sn,
                        start=day_start,
                        end=day_end,
                    )
                    upserted = await upsert_reports(
                        mongo,
                        uid=uid,
                        sn=sn,
                        reports=reports,
                        dry_run=args.dry_run,
                        geocode=args.geocode,
                        time_adjust_hours=time_adjust_hours,
                    )
                    print(f"  {sn}: fetched={len(reports)} upserted={upserted}")
                    return len(reports), upserted, False
                except Exception as exc:
                    print(f"  {sn}: ERROR {exc}")
                    return 0, 0, True

        results = await asyncio.gather(*[_process_sn(sn) for sn in sns])
        for fetched, upserted, failed in results:
            total_reports += fetched
            total_upserted += upserted
            if failed:
                failed_sns += 1

    print()
    print(
        f"Done. devices={len(sns)} | fetched={total_reports} | "
        f"upserted={total_upserted} | failed={failed_sns}"
    )
    return 0 if failed_sns == 0 else 2


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Zoqin locations into MongoDB (UTC fetch + PKT insert)")
    parser.add_argument("--sn", help="Single device serial")
    parser.add_argument("--date", help="Day to import (YYYY-MM-DD)")
    parser.add_argument("--concurrency", type=int, default=6, help="Parallel fetches (default: 6)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--geocode", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    try:
        code = asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\nInterrupted.")
        code = 130
    sys.exit(code)


if __name__ == "__main__":
    main()