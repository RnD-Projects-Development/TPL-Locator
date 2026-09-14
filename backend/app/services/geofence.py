# backend/app/services/geofence.py
from __future__ import annotations

import asyncio
import math
from datetime import datetime
from typing import Dict, List, Optional


# ── Ray-casting point-in-polygon & Circle distance ────────────────────────────

def point_in_polygon(lat: float, lng: float, polygon: List[Dict]) -> bool:
    """
    Standard ray-casting algorithm.
    polygon: list of {"lat": float, "lng": float} — open ring (no closing duplicate).
    """
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]["lng"], polygon[i]["lat"]
        xj, yj = polygon[j]["lng"], polygon[j]["lat"]
        if (yi > lat) != (yj > lat):
            if lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                inside = not inside
        j = i
    return inside


def point_in_circle(lat: float, lng: float, center: Dict, radius_m: float) -> bool:
    """Haversine distance <= radius."""
    try:
        c_lat = float(center.get("lat", 0))
        c_lng = float(center.get("lng", 0))
        R = 6371000.0  # Earth radius in meters
        phi1 = math.radians(lat)
        phi2 = math.radians(c_lat)
        delta_phi = math.radians(c_lat - lat)
        delta_lambda = math.radians(c_lng - lng)
        a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return (R * c) <= float(radius_m)
    except Exception:
        return False


def _is_multi_polygon(polygon_data) -> bool:
    """True when polygon_data is a list-of-lists (multi-polygon like uc_216)."""
    return (
        isinstance(polygon_data, list)
        and len(polygon_data) > 0
        and isinstance(polygon_data[0], list)
    )


def point_in_zone(lat: float, lng: float, polygon_data) -> bool:
    """Works for both single polygons and multi-polygons."""
    if _is_multi_polygon(polygon_data):
        return any(point_in_polygon(lat, lng, ring) for ring in polygon_data)
    return point_in_polygon(lat, lng, polygon_data)


def is_point_in_zone_doc(lat: float, lng: float, zone_doc: Dict) -> bool:
    """Evaluates whether (lat, lng) is inside a zone document (polygon, multi-polygon, or circle)."""
    shape = zone_doc.get("shape")
    if shape == "circle":
        center = zone_doc.get("center")
        radius = zone_doc.get("radius")
        if center and radius is not None:
            return point_in_circle(lat, lng, center, radius)
    coords = zone_doc.get("coordinates")
    if coords:
        return point_in_zone(lat, lng, coords)
    return False


# ── Status computation ────────────────────────────────────────────────────────

async def compute_device_zone_status(
    sn: str,
    polygon: List[Dict],
    locations_col,
    point_limit: int = 10_000,
) -> Dict:
    """
    Computes INSIDE / OUTSIDE / OFFLINE for a device relative to a zone polygon.

    OFFLINE means one of:
      - Device has zero GPS history at all
      - Device has GPS history but NO point has ever been inside this zone
        ("Device hasn't entered this zone yet")

    Returns:
      status       : "INSIDE" | "OUTSIDE" | "OFFLINE"
      latest       : {lat, lng, timestamp} or None
      first_seen   : ISO string of earliest point inside zone, or None
      last_seen    : ISO string of latest   point inside zone, or None
    """
    cursor = (
        locations_col
        .find({"sn": sn}, {"lat": 1, "lng": 1, "timestamp": 1, "_id": 0})
        .sort("timestamp", -1)
        .limit(point_limit)
    )
    points = await cursor.to_list(length=point_limit)

    if not points:
        return {"status": "OFFLINE", "latest": None, "first_seen": None, "last_seen": None}

    latest = points[0]

    inside_pts = [p for p in points if point_in_zone(p["lat"], p["lng"], polygon)]

    if not inside_pts:
        return {
            "status": "OFFLINE",
            "latest": {
                "lat":       latest["lat"],
                "lng":       latest["lng"],
                "timestamp": _fmt(latest.get("timestamp")),
            },
            "first_seen": None,
            "last_seen":  None,
        }

    current_inside = point_in_zone(latest["lat"], latest["lng"], polygon)
    inside_sorted  = sorted(inside_pts, key=lambda p: p["timestamp"])

    return {
        "status":     "INSIDE" if current_inside else "OUTSIDE",
        "latest": {
            "lat":       latest["lat"],
            "lng":       latest["lng"],
            "timestamp": _fmt(latest.get("timestamp")),
        },
        "first_seen": _fmt(inside_sorted[0]["timestamp"]),
        "last_seen":  _fmt(inside_sorted[-1]["timestamp"]),
    }


# ── Event log computation ─────────────────────────────────────────────────────

async def compute_zone_events(
    sn: str,
    polygon: List[Dict],
    locations_col,
    point_limit: int = 10_000,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> List[Dict]:
    """
    Walks location history oldest-first and emits ENTER / EXIT events.
    Returns list of {type, sn, timestamp, lat, lng}.

    Pass start/end to scope the walk to a time window — callers that only care
    about recent crossings (live monitoring, alert polling) should always do so,
    otherwise every call re-reads the device's whole history.
    """
    query: Dict = {"sn": sn}
    if start is not None or end is not None:
        window: Dict = {}
        if start is not None:
            window["$gte"] = start
        if end is not None:
            window["$lte"] = end
        query["timestamp"] = window

    cursor = (
        locations_col
        .find(query, {"lat": 1, "lng": 1, "timestamp": 1, "_id": 0})
        .sort("timestamp", 1)
        .limit(point_limit)
    )
    points = await cursor.to_list(length=point_limit)
    if not points:
        return []

    events: List[Dict] = []
    was_inside: Optional[bool] = None

    for pt in points:
        now_inside = point_in_zone(pt["lat"], pt["lng"], polygon)
        if was_inside is None:
            was_inside = now_inside
            continue
        if not was_inside and now_inside:
            events.append({"type": "ENTER", "sn": sn, "timestamp": _fmt(pt["timestamp"]), "lat": pt["lat"], "lng": pt["lng"]})
        elif was_inside and not now_inside:
            events.append({"type": "EXIT",  "sn": sn, "timestamp": _fmt(pt["timestamp"]), "lat": pt["lat"], "lng": pt["lng"]})
        was_inside = now_inside

    return events


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(ts) -> Optional[str]:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts.isoformat()
    return str(ts)


# ── Multi-device, Multi-zone Activity Detector ────────────────────────────────

async def detect_admin_zone_events(
    mongo,
    admin_oid,
    since: datetime,
    end: Optional[datetime] = None,
    limit: int = 100,
) -> List[Dict]:
    """
    Detects ENTER / EXIT boundary crossings across ALL devices and ALL zones
    belonging to the given admin within [since, end].
    Even if a device is not explicitly assigned to a zone, crossings will trigger.
    """
    if since is not None and getattr(since, "tzinfo", None) is not None:
        since = since.replace(tzinfo=None)
    if end is not None and getattr(end, "tzinfo", None) is not None:
        end = end.replace(tzinfo=None)

    # 1. Fetch all zones owned by this admin
    zones: List[Dict] = []
    async for z in mongo.zones.find({"admin_id": admin_oid}):
        if z.get("coordinates") or (z.get("shape") == "circle" and z.get("center") and z.get("radius")):
            zones.append({
                "id": str(z["_id"]),
                "name": z.get("name") or str(z["_id"]),
                "doc": z,
            })

    if not zones:
        return []

    # 2. Query location points in the time window
    query: Dict = {"timestamp": {"$gte": since}}
    if end is not None:
        query["timestamp"]["$lte"] = end

    cursor = (
        mongo.locations
        .find(query, {"sn": 1, "lat": 1, "lng": 1, "timestamp": 1, "_id": 0})
        .sort([("sn", 1), ("timestamp", 1)])
        .limit(5000)
    )
    points_in_window = await cursor.to_list(length=5000)
    if not points_in_window:
        return []

    # Group points by sn
    from collections import defaultdict
    pts_by_sn = defaultdict(list)
    for p in points_in_window:
        sn = p.get("sn")
        if sn and p.get("lat") is not None and p.get("lng") is not None and p.get("timestamp"):
            pts_by_sn[sn].append(p)

    if not pts_by_sn:
        return []

    all_sns = list(pts_by_sn.keys())

    # Fetch friendly names from devices collection
    dev_cursor = mongo.devices.find(
        {"sn": {"$in": all_sns}},
        {"sn": 1, "name": 1, "assigned_name": 1, "assigned_user_name": 1}
    )
    name_by_sn = {}
    async for d in dev_cursor:
        name_by_sn[d["sn"]] = d.get("name") or d.get("assigned_name") or d.get("assigned_user_name") or d["sn"]

    # For each sn, find the immediate prior point before `since`
    prior_point_tasks = [
        mongo.locations.find_one(
            {"sn": sn, "timestamp": {"$lt": since}},
            {"lat": 1, "lng": 1, "timestamp": 1, "_id": 0},
            sort=[("timestamp", -1)]
        )
        for sn in all_sns
    ]
    prior_results = await asyncio.gather(*prior_point_tasks, return_exceptions=True)
    prior_by_sn = {
        sn: pt for sn, pt in zip(all_sns, prior_results)
        if isinstance(pt, dict) and pt.get("lat") is not None
    }

    events: List[Dict] = []

    for sn, pts in pts_by_sn.items():
        dev_name = name_by_sn.get(sn, sn)
        prior_pt = prior_by_sn.get(sn)

        for z in zones:
            z_id = z["id"]
            z_name = z["name"]
            z_doc = z["doc"]

            was_inside = None
            if prior_pt:
                was_inside = is_point_in_zone_doc(prior_pt["lat"], prior_pt["lng"], z_doc)

            for pt in pts:
                now_inside = is_point_in_zone_doc(pt["lat"], pt["lng"], z_doc)
                if was_inside is None:
                    was_inside = now_inside
                    continue

                if not was_inside and now_inside:
                    ts_str = _fmt(pt["timestamp"])
                    ts_compact = (ts_str or "").replace("-", "").replace(":", "").replace("T", "").replace(".", "")[:14]
                    events.append({
                        "id": f"GEO-{sn}-{z_id}-ENTER-{ts_compact}",
                        "type": "ENTER",
                        "sn": sn,
                        "deviceName": dev_name,
                        "zoneId": z_id,
                        "zoneName": z_name,
                        "timestamp": ts_str,
                        "lat": pt["lat"],
                        "lng": pt["lng"],
                    })
                elif was_inside and not now_inside:
                    ts_str = _fmt(pt["timestamp"])
                    ts_compact = (ts_str or "").replace("-", "").replace(":", "").replace("T", "").replace(".", "")[:14]
                    events.append({
                        "id": f"GEO-{sn}-{z_id}-EXIT-{ts_compact}",
                        "type": "EXIT",
                        "sn": sn,
                        "deviceName": dev_name,
                        "zoneId": z_id,
                        "zoneName": z_name,
                        "timestamp": ts_str,
                        "lat": pt["lat"],
                        "lng": pt["lng"],
                    })
                was_inside = now_inside

    events.sort(key=lambda e: e["timestamp"] or "", reverse=True)
    return events[:limit]
