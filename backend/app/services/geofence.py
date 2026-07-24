# backend/app/services/geofence.py
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional


# ── Ray-casting point-in-polygon ──────────────────────────────────────────────

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
