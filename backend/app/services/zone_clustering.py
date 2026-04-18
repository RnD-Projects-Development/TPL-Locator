# app/services/zone_clustering.py
"""
Pure-Python GPS zone clustering.

No external dependencies beyond stdlib — works with the existing requirements.txt.

Algorithm:
  1. Round every (lat, lng) to CELL_DEG (~110 m) grid cells and count
     how many times the device visited each cell.
  2. Discard cells with fewer than MIN_CELL_HITS visits (transient points).
  3. Union-Find: merge adjacent cells whose centres are ≤ MERGE_RADIUS_M apart
     into the same cluster.
  4. For each cluster, compute a convex hull of all raw points, then inflate
     the hull outward by HULL_PADDING_M so the polygon has visible area.
  5. Return clusters sorted by point count (most-visited first).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from math import asin, cos, degrees, radians, sin, sqrt
from typing import Any

logger = logging.getLogger(__name__)

# ── Tuning constants ─────────────────────────────────────────────────────────
CELL_DEG       = 0.001    # ~111 m per degree — cell grid resolution
MIN_CELL_HITS  = 5        # a cell must have ≥ this many visits to be kept
MERGE_RADIUS_M = 200      # cells within this distance are merged into one zone
HULL_PADDING_M = 80       # inflate the convex hull outward by this many metres
MAX_POINTS     = 20_000   # cap fetched from DB to keep clustering fast


# ── Geometry helpers ─────────────────────────────────────────────────────────

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in metres between two GPS coordinates."""
    R = 6_371_000.0
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lng2 - lng1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * R * asin(sqrt(max(0.0, min(1.0, a))))


def _cross(o: tuple, a: tuple, b: tuple) -> float:
    """2-D cross product of vectors OA and OB."""
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """
    Andrew's monotone-chain convex hull.
    Input:  list of (lat, lng) pairs
    Output: hull vertices in counter-clockwise order
    """
    pts = sorted(set(points))
    n = len(pts)
    if n <= 2:
        return pts
    if n == 3:
        return pts

    lower: list = []
    for p in pts:
        while len(lower) >= 2 and _cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)

    upper: list = []
    for p in reversed(pts):
        while len(upper) >= 2 and _cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)

    return lower[:-1] + upper[:-1]


def _inflate_hull(
    hull: list[tuple[float, float]],
    padding_m: float,
) -> list[dict[str, float]]:
    """
    Push each hull vertex outward from the centroid by `padding_m` metres.
    Returns a list of {"lat": ..., "lng": ...} dicts ready for the API response.
    """
    if not hull:
        return []

    cx = sum(p[0] for p in hull) / len(hull)
    cy = sum(p[1] for p in hull) / len(hull)

    # Approximate degree-to-metre conversion at centroid latitude
    lat_m = 111_000.0
    lng_m = 111_000.0 * cos(radians(cx))

    result = []
    for lat, lng in hull:
        dlat_m = (lat - cx) * lat_m
        dlng_m = (lng - cy) * lng_m
        dist = sqrt(dlat_m ** 2 + dlng_m ** 2)

        if dist < 1.0:
            # Point is essentially at the centroid — push it out a fixed amount
            scale = padding_m / max(lat_m, 1.0)
            result.append({"lat": lat + scale, "lng": lng})
        else:
            scale = (dist + padding_m) / dist
            result.append({
                "lat": round(cx + (lat - cx) * scale, 7),
                "lng": round(cy + (lng - cy) * scale, 7),
            })

    # Close the polygon
    if result and result[0] != result[-1]:
        result.append(result[0])

    return result


def _small_circle(lat: float, lng: float, radius_m: float = 120.0, n: int = 16) -> list[dict]:
    """Fallback: produce an approximate circle polygon for single-point clusters."""
    from math import pi, cos as mcos, sin as msin
    lat_m = 111_000.0
    lng_m = 111_000.0 * mcos(radians(lat))
    pts = []
    for i in range(n + 1):
        angle = 2 * pi * i / n
        pts.append({
            "lat": round(lat + (radius_m / lat_m) * msin(angle), 7),
            "lng": round(lng + (radius_m / lng_m) * mcos(angle), 7),
        })
    return pts


# ── Union-Find ────────────────────────────────────────────────────────────────

class _UF:
    def __init__(self, n: int):
        self.p = list(range(n))

    def find(self, x: int) -> int:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, x: int, y: int) -> None:
        px, py = self.find(x), self.find(y)
        if px != py:
            self.p[px] = py


# ── Public API ────────────────────────────────────────────────────────────────

def cluster_gps_points(
    raw: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Cluster raw GPS point dicts and return zone objects.

    Each input dict must have: {"lat": float, "lng": float, "timestamp": datetime|None}

    Returns a list of dicts:
    {
        "zone_id":     str,
        "name":        str,   # "Zone 1" … "Zone N" — frontend geocodes to real name
        "polygon":     [{"lat": float, "lng": float}, ...],
        "center":      {"lat": float, "lng": float},
        "total_points": int,
        "last_seen":   str | None,
    }
    """
    if not raw:
        return []

    logger.info("zone_clustering: input points=%d", len(raw))

    # ── Step 1: grid cells ────────────────────────────────────────────────────
    # cells: {(cell_lat, cell_lng) → {"count": int, "timestamps": [], "raw": []}}
    cells: dict[tuple, dict] = {}
    for doc in raw:
        lat = doc.get("lat")
        lng = doc.get("lng")
        if lat is None or lng is None:
            continue
        clat = round(round(lat / CELL_DEG) * CELL_DEG, 6)
        clng = round(round(lng / CELL_DEG) * CELL_DEG, 6)
        key = (clat, clng)
        if key not in cells:
            cells[key] = {"count": 0, "timestamps": [], "raw": []}
        cells[key]["count"] += 1
        cells[key]["timestamps"].append(doc.get("timestamp"))
        cells[key]["raw"].append((lat, lng))

    # ── Step 2: filter low-hit cells ──────────────────────────────────────────
    sig = {k: v for k, v in cells.items() if v["count"] >= MIN_CELL_HITS}
    if not sig:
        logger.info("zone_clustering: no significant cells (all below min_hits=%d)", MIN_CELL_HITS)
        return []

    keys = list(sig.keys())
    logger.info("zone_clustering: significant cells=%d", len(keys))

    # ── Step 3: union-find merge ──────────────────────────────────────────────
    uf = _UF(len(keys))
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            if _haversine(keys[i][0], keys[i][1], keys[j][0], keys[j][1]) <= MERGE_RADIUS_M:
                uf.union(i, j)

    clusters: dict[int, list[int]] = defaultdict(list)
    for idx in range(len(keys)):
        clusters[uf.find(idx)].append(idx)

    # ── Step 4: build zone objects ────────────────────────────────────────────
    # Cap per-zone visit points to avoid huge payloads.
    # Because the DB fetch used sort=("timestamp", -1) the raw list is
    # newest-first, so slicing [:MAX_ZONE_POINTS] gives the most recent visits.
    MAX_ZONE_POINTS = 500

    zones = []
    for cluster_indices in clusters.values():
        all_raw: list[tuple] = []
        all_ts = []
        for idx in cluster_indices:
            cell = sig[keys[idx]]
            all_raw.extend(cell["raw"])
            all_ts.extend(cell["timestamps"])

        center_lat = sum(p[0] for p in all_raw) / len(all_raw)
        center_lng = sum(p[1] for p in all_raw) / len(all_raw)

        valid_ts  = [ts for ts in all_ts if ts is not None]
        last_seen  = max(valid_ts, default=None)
        first_seen = min(valid_ts, default=None)

        def _ts_str(ts):
            if ts is None:
                return None
            return ts.isoformat() if hasattr(ts, "isoformat") else str(ts)

        last_seen_str  = _ts_str(last_seen)
        first_seen_str = _ts_str(first_seen)

        hull = _convex_hull(all_raw)
        if len(hull) < 3:
            polygon = _small_circle(center_lat, center_lng)
        else:
            polygon = _inflate_hull(hull, HULL_PADDING_M)

        if not polygon:
            continue

        # Build visit-point list (capped, newest-first)
        paired = list(zip(all_raw, all_ts))[:MAX_ZONE_POINTS]
        visit_points = [
            {
                "lat": round(pt[0], 6),
                "lng": round(pt[1], 6),
                "timestamp": (
                    ts.isoformat() if hasattr(ts, "isoformat")
                    else (str(ts) if ts is not None else None)
                ),
            }
            for pt, ts in paired
        ]

        zones.append({
            "_raw_count":   len(all_raw),
            "center":       {"lat": round(center_lat, 6), "lng": round(center_lng, 6)},
            "polygon":      polygon,
            "points":       visit_points,
            "total_points": len(all_raw),
            "first_seen":   first_seen_str,
            "last_seen":    last_seen_str,
        })

    # Sort by total_points descending
    zones.sort(key=lambda z: z["_raw_count"], reverse=True)

    # Assign stable zone IDs and default names
    result = []
    for i, zone in enumerate(zones):
        zone.pop("_raw_count", None)
        zone["zone_id"] = f"zone_{i + 1}"
        zone["name"]    = f"Zone {i + 1}"
        result.append(zone)

    logger.info("zone_clustering: produced %d zones", len(result))
    return result
