# app/services/zone_pipeline.py
"""
Backend zone pipeline (synchronous).

Reverse geocoding is explicitly the frontend's job — backend only:
  1. Fetches points for a device in a date range
  2. Clusters via the existing cluster_gps_points() (untouched)
  3. Assigns zone_id + zone_key onto each point via MongoDB bulkWrite
  4. Persists the zones onto the device document
  5. Returns zones to the caller

Redundancy is prevented through a deterministic zone_key:
    zone_key = f"{sn}_{start_date}_{end_date}"
A point's zone_id is only rewritten if it's missing OR its zone_key is stale.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from pymongo import UpdateOne

from app.services.zone_clustering import MAX_POINTS, cluster_gps_points

logger = logging.getLogger(__name__)

# ── Tuning ────────────────────────────────────────────────────────────────────
MAX_VISIT_POINTS = 500   # cap visit-dot payload per zone


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def build_zone_key(sn: str, start: Optional[datetime], end: Optional[datetime]) -> str:
    """
    Deterministic key for a (device, date-range) pair.
    Uses date-only precision so overlapping-time requests on the same days
    collapse to the same key.
    """
    s = start.date().isoformat() if start else "none"
    e = end.date().isoformat()   if end   else "none"
    return f"{sn}_{s}_{e}"


def _point_in_polygon(lat: float, lng: float, polygon: list[dict]) -> bool:
    """Ray-casting inclusion test. polygon is a list of {lat, lng} dicts."""
    n      = len(polygon)
    inside = False
    j      = n - 1
    for i in range(n):
        xi, yi = polygon[i]["lng"], polygon[i]["lat"]
        xj, yj = polygon[j]["lng"], polygon[j]["lat"]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def _ts_str(ts):
    if ts is None:
        return None
    return ts.isoformat() if hasattr(ts, "isoformat") else str(ts)


# ── DB fetch ──────────────────────────────────────────────────────────────────

async def _fetch_points(locations_col, sn: str, start, end) -> list[dict]:
    """Fetch raw GPS points for a device in the given window (newest-first)."""
    query: dict = {
        "sn":  sn,
        "lat": {"$exists": True},
        "lng": {"$exists": True},
    }
    if start or end:
        ts_filter: dict = {}
        if start: ts_filter["$gte"] = _to_naive_utc(start)
        if end:   ts_filter["$lte"] = _to_naive_utc(end)
        query["timestamp"] = ts_filter

    cursor = locations_col.find(
        query,
        {"_id": 1, "lat": 1, "lng": 1, "timestamp": 1, "zone_id": 1, "zone_key": 1},
        sort=[("timestamp", -1)],
    ).limit(MAX_POINTS)

    raw: list[dict] = []
    async for doc in cursor:
        lat = doc.get("lat")
        lng = doc.get("lng")
        if lat is not None and lng is not None:
            raw.append({
                "_id":       doc["_id"],
                "lat":       float(lat),
                "lng":       float(lng),
                "timestamp": doc.get("timestamp"),
                "zone_id":   doc.get("zone_id"),
                "zone_key":  doc.get("zone_key"),
            })
    return raw


# ── Bulk update points ───────────────────────────────────────────────────────

async def _assign_points_to_zones(
    locations_col,
    points_by_zone: dict[str, list[dict]],
    zone_key: str,
) -> int:
    """
    Bulk-write zone_id + zone_key onto each point — but only for points that
    are missing a zone_id OR whose zone_key differs from the new one.

    Returns number of points modified.
    """
    ops: list[UpdateOne] = []
    for zid, pts in points_by_zone.items():
        for pt in pts:
            if pt.get("zone_id") and pt.get("zone_key") == zone_key:
                continue   # already tagged for this exact range → skip
            ops.append(UpdateOne(
                {"_id": pt["_id"]},
                {"$set": {"zone_id": zid, "zone_key": zone_key}},
            ))

    if not ops:
        return 0

    result = await locations_col.bulk_write(ops, ordered=False)
    logger.info(
        "zone_pipeline bulk_write ops=%d modified=%d",
        len(ops), result.modified_count,
    )
    return result.modified_count


# ── Persist zones on device doc ──────────────────────────────────────────────

async def _save_zones_on_device(devices_col, sn: str, zones: list[dict], zone_key: str) -> None:
    """Store a lightweight summary of the zones on the device document."""
    stored = [
        {
            "zone_id":      z["zone_id"],
            "polygon":      z["polygon"],
            "center":       z["center"],
            "total_points": z["total_points"],
            "zone_key":     zone_key,
        }
        for z in zones
    ]
    await devices_col.update_one(
        {"sn": sn},
        {"$set": {"zones": stored, "zones_updated_at": datetime.utcnow()}},
    )


# ── Public entry point ────────────────────────────────────────────────────────

async def process_zones_for_device(
    *,
    sn:             str,
    start:          Optional[datetime],
    end:            Optional[datetime],
    locations_col,                       # AsyncIOMotorCollection
    devices_col,                         # AsyncIOMotorCollection
) -> list[dict[str, Any]]:
    """
    Full synchronous zone pipeline.

    Returns a list of zone dicts suitable for the API response:
      { zone_id, polygon, center, points, total_points,
        first_seen, last_seen, zone_key }

    The frontend is responsible for naming each zone via TPLMaps reverse
    geocoding — backend never sets zone_name.
    """
    zk = build_zone_key(sn, start, end)
    logger.info("zone_pipeline start sn=%s zone_key=%s", sn, zk)

    # ── 1. Fetch raw points ───────────────────────────────────────────────────
    raw = await _fetch_points(locations_col, sn, start, end)
    logger.info("zone_pipeline fetched sn=%s raw=%d", sn, len(raw))
    if not raw:
        await _save_zones_on_device(devices_col, sn, [], zk)
        return []

    # ── 2. Cluster (existing logic — not modified) ───────────────────────────
    cluster_input = [
        {"lat": r["lat"], "lng": r["lng"], "timestamp": r["timestamp"]}
        for r in raw
    ]
    base_zones = cluster_gps_points(cluster_input)
    logger.info("zone_pipeline clustered sn=%s zones=%d", sn, len(base_zones))
    if not base_zones:
        await _save_zones_on_device(devices_col, sn, [], zk)
        return []

    # ── 3. Assign each raw point to a zone via polygon inclusion ─────────────
    points_by_zone: dict[str, list[dict]] = {z["zone_id"]: [] for z in base_zones}
    for pt in raw:
        for z in base_zones:
            if _point_in_polygon(pt["lat"], pt["lng"], z["polygon"]):
                points_by_zone[z["zone_id"]].append(pt)
                break

    # ── 4. Build API response zones (no names — frontend handles naming) ─────
    enriched: list[dict] = []
    for z in base_zones:
        pts        = points_by_zone.get(z["zone_id"], [])
        valid_ts   = [p["timestamp"] for p in pts if p.get("timestamp") is not None]
        first_seen = min(valid_ts, default=None)
        last_seen  = max(valid_ts, default=None)

        visit_sample = pts[:MAX_VISIT_POINTS]
        visit_points = [
            {
                "lat":       round(p["lat"], 6),
                "lng":       round(p["lng"], 6),
                "timestamp": _ts_str(p.get("timestamp")),
            }
            for p in visit_sample
        ]

        enriched.append({
            "zone_id":      z["zone_id"],
            "polygon":      z["polygon"],
            "center":       z["center"],
            "points":       visit_points,
            "total_points": len(pts) or z.get("total_points", 0),
            "first_seen":   _ts_str(first_seen) or z.get("first_seen"),
            "last_seen":    _ts_str(last_seen)  or z.get("last_seen"),
            "zone_key":     zk,
        })

    # ── 5. Bulk-assign zone_id + zone_key onto points ────────────────────────
    modified = await _assign_points_to_zones(locations_col, points_by_zone, zk)
    logger.info("zone_pipeline points modified=%d sn=%s", modified, sn)

    # ── 6. Persist lightweight zones summary on device doc ───────────────────
    await _save_zones_on_device(devices_col, sn, enriched, zk)

    logger.info("zone_pipeline done sn=%s zones=%d", sn, len(enriched))
    return enriched
