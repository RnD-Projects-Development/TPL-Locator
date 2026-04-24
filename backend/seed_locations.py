"""
seed_locations.py
-----------------
Populate the MongoDB `locations` collection with realistic test GPS packets
for a device inside the KML beat zones, covering all use-cases:
  • INSIDE / OUTSIDE / OFFLINE status
  • ENTER / EXIT event detection
  • Duration calculation (first_seen → last_seen)
  • Multiple sessions per zone

Usage (run from the backend/ directory):
    python seed_locations.py                   # seed default device in all assigned zones
    python seed_locations.py --sn 2P7s7arfi    # explicit SN
    python seed_locations.py --clear           # remove all seeded docs for the device
    python seed_locations.py --clear --sn X    # remove for a specific SN

Requirements:
    pip install pymongo python-dotenv
"""

import argparse
import os
import random
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

MONGO_URI   = os.getenv("MONGO_URI", "")
DB_NAME     = os.getenv("MONGO_DB_NAME", "citytag_development")
COLLECTION  = "locations"

DEFAULT_SN  = "2P7s7arfi"   # device to seed

# ── KML zone polygons (mirrors backend/app/data/kml_zones.py) ────────────────

KML_POLYGONS = {
    "beat_b_24": [
        {"lat": 31.51682991786555, "lng": 74.32142136843777},
        {"lat": 31.51746642368465, "lng": 74.32038630290015},
        {"lat": 31.51439633385144, "lng": 74.31753068071748},
        {"lat": 31.51386312656814, "lng": 74.31823289068979},
        {"lat": 31.51360382156878, "lng": 74.31857704202531},
        {"lat": 31.51460397175225, "lng": 74.31946961554763},
        {"lat": 31.51467535558248, "lng": 74.31936848845476},
    ],
    "beat_b_45": [
        {"lat": 31.51387323294165, "lng": 74.31231684433692},
        {"lat": 31.51380923177641, "lng": 74.31219243063799},
        {"lat": 31.51342822843321, "lng": 74.31259101773060},
        {"lat": 31.51266305758298, "lng": 74.31339150210982},
        {"lat": 31.51160370360583, "lng": 74.31506275326274},
        {"lat": 31.51294571961313, "lng": 74.31624296592156},
        {"lat": 31.51329074145906, "lng": 74.31661892076039},
        {"lat": 31.51379756665330, "lng": 74.31589080569256},
        {"lat": 31.51403313329291, "lng": 74.31556244007379},
        {"lat": 31.51485404733990, "lng": 74.31523407445502},
        {"lat": 31.51474317022121, "lng": 74.31411384540024},
        {"lat": 31.51441170524288, "lng": 74.31340671815906},
        {"lat": 31.51418404061707, "lng": 74.31292103228174},
    ],
    "beat_b_09": [
        {"lat": 31.51439633385144, "lng": 74.31753068071748},
        {"lat": 31.51512818838290, "lng": 74.31661971228613},
        {"lat": 31.51485404734007, "lng": 74.31523407445519},
        {"lat": 31.51403313329308, "lng": 74.31556244007396},
        {"lat": 31.51379756665347, "lng": 74.31589080569273},
        {"lat": 31.51329074145923, "lng": 74.31661892076056},
        {"lat": 31.51294571961330, "lng": 74.31624296592173},
        {"lat": 31.51250683379476, "lng": 74.31689087468249},
        {"lat": 31.51386312656814, "lng": 74.31823289068979},
    ],
    "beat_b_50": [
        {"lat": 31.51294571961330, "lng": 74.31945047935773},
        {"lat": 31.51386312656814, "lng": 74.31823289068979},
        {"lat": 31.51250683379476, "lng": 74.31689087468249},
        {"lat": 31.51294571961330, "lng": 74.31624296592173},
        {"lat": 31.51160370360600, "lng": 74.31506275326274},
        {"lat": 31.51009036640625, "lng": 74.31692825069143},
    ],
    "beat_b_38": [
        {"lat": 31.51360382156878, "lng": 74.31857704202531},
        {"lat": 31.51294571961330, "lng": 74.31945047935773},
        {"lat": 31.51619341204650, "lng": 74.32245643397522},
        {"lat": 31.51682991786555, "lng": 74.32142136843777},
        {"lat": 31.51467535558248, "lng": 74.31936848845476},
        {"lat": 31.51460397175225, "lng": 74.31946961554763},
    ],
}

# ── Point-in-polygon (ray-casting) ───────────────────────────────────────────

def point_in_polygon(lat, lng, polygon):
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

# ── Geometry helpers ──────────────────────────────────────────────────────────

def bbox(polygon):
    lats = [p["lat"] for p in polygon]
    lngs = [p["lng"] for p in polygon]
    return min(lats), max(lats), min(lngs), max(lngs)


def random_inside(polygon, bb, rng, max_tries=400):
    """Rejection-sample a random point inside the polygon."""
    min_lat, max_lat, min_lng, max_lng = bb
    for _ in range(max_tries):
        lat = rng.uniform(min_lat, max_lat)
        lng = rng.uniform(min_lng, max_lng)
        if point_in_polygon(lat, lng, polygon):
            return lat, lng
    # Fallback: centroid
    return (
        sum(p["lat"] for p in polygon) / len(polygon),
        sum(p["lng"] for p in polygon) / len(polygon),
    )


def random_outside(bb, rng, margin=0.0015):
    """Generate a point clearly outside the bounding box."""
    min_lat, max_lat, min_lng, max_lng = bb
    offset = rng.uniform(margin * 0.5, margin)
    side = rng.randint(0, 3)
    if side == 0:   return max_lat + offset,  rng.uniform(min_lng, max_lng)
    elif side == 1: return min_lat - offset,  rng.uniform(min_lng, max_lng)
    elif side == 2: return rng.uniform(min_lat, max_lat), max_lng + offset
    else:           return rng.uniform(min_lat, max_lat), min_lng - offset

# ── Packet generation ─────────────────────────────────────────────────────────

def generate_packets(sn, zone_id, polygon, n_sessions=6, days_back=7):
    """
    Build a list of location documents with realistic ENTER/EXIT patterns.

    Pattern per session
    -------------------
    1. 4-6 outside points  (approach)   — ~15-25 min apart
    2. 8-14 inside points  (on patrol)  — ~8-15 min apart, 1-2 h total
    3. 3-5 outside points  (departure)  — ~15-25 min apart
    4. 3-7 h gap before next session

    Last session deliberately ends INSIDE so INSIDE status is verifiable.

    Schema
    ------
    Only the fields the geofence service actually reads:
        sn, lat, lng, timestamp
    Plus _test_seed=True for easy cleanup.
    """
    rng = random.Random(hash(sn + zone_id))
    bb  = bbox(polygon)
    now = datetime.now(tz=timezone.utc)
    cur = now - timedelta(days=days_back)
    docs = []

    def mk(lat, lng):
        return {
            "sn":         sn,
            "lat":        round(lat, 7),
            "lng":        round(lng, 7),
            "timestamp":  cur,
            "_test_seed": True,
        }

    for session_idx in range(n_sessions):
        # ── Approach: outside points ──
        for _ in range(rng.randint(4, 6)):
            lat, lng = random_outside(bb, rng)
            docs.append(mk(lat, lng))
            cur += timedelta(minutes=rng.randint(15, 25))

        # ── Patrol: inside points ──
        total_patrol_mins = rng.randint(60, 120)
        n_inside = rng.randint(8, 14)
        step = total_patrol_mins / n_inside

        # Last session ends inside so the device shows INSIDE status
        force_end_inside = (session_idx == n_sessions - 1)

        for k in range(n_inside):
            lat, lng = random_inside(polygon, bb, rng)
            docs.append(mk(lat, lng))
            cur += timedelta(minutes=step)

        # ── Departure: outside points (skip for final session) ──
        if not force_end_inside:
            for _ in range(rng.randint(3, 5)):
                lat, lng = random_outside(bb, rng)
                docs.append(mk(lat, lng))
                cur += timedelta(minutes=rng.randint(15, 25))

        # ── Gap between sessions ──
        if session_idx < n_sessions - 1:
            cur += timedelta(hours=rng.randint(3, 7))

    return docs

# ── DB helpers ────────────────────────────────────────────────────────────────

def get_device_zone(col_devices, sn):
    """Return the zone_id assigned to the device, or None."""
    doc = col_devices.find_one({"sn": sn}, {"zone": 1})
    if doc and doc.get("zone") in KML_POLYGONS:
        return doc["zone"]
    return None


def seed(col_locations, col_devices, sn, zone_id=None):
    # Resolve zone from DB if not given
    if zone_id is None:
        zone_id = get_device_zone(col_devices, sn)
    if zone_id is None or zone_id not in KML_POLYGONS:
        print(f"  [!] Device {sn!r} has no valid KML zone assigned — skipping.")
        print(f"      Valid zones: {list(KML_POLYGONS.keys())}")
        return 0

    polygon = KML_POLYGONS[zone_id]
    docs    = generate_packets(sn, zone_id, polygon)

    # Sort oldest-first before inserting (matches how the service reads them)
    docs.sort(key=lambda d: d["timestamp"])

    col_locations.insert_many(docs)
    print(f"  [+] Inserted {len(docs)} packets for sn={sn!r} in zone={zone_id!r}")
    print(f"      Timestamps: {docs[0]['timestamp'].isoformat()} → {docs[-1]['timestamp'].isoformat()}")
    return len(docs)


def clear(col_locations, sn):
    result = col_locations.delete_many({"sn": sn, "_test_seed": True})
    print(f"  [-] Deleted {result.deleted_count} seeded packets for sn={sn!r}")
    return result.deleted_count

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Seed / clear test location packets")
    parser.add_argument("--sn",    default=DEFAULT_SN, help="Device serial number")
    parser.add_argument("--zone",  default=None,       help="Override zone_id (auto-detected from DB if omitted)")
    parser.add_argument("--clear", action="store_true", help="Delete seeded packets instead of inserting")
    parser.add_argument("--db",    default=DB_NAME,    help="MongoDB database name")
    args = parser.parse_args()

    if not MONGO_URI:
        print("ERROR: MONGO_URI not set. Add it to backend/.env")
        sys.exit(1)

    client = MongoClient(MONGO_URI)
    db     = client[args.db]

    col_locations = db[COLLECTION]
    col_devices   = db["devices"]

    print(f"\nDatabase : {args.db}")
    print(f"Device   : {args.sn}")

    if args.clear:
        print("\nClearing seeded packets…")
        clear(col_locations, args.sn)
    else:
        print("\nSeeding location packets…")
        seed(col_locations, col_devices, args.sn, zone_id=args.zone)

    print("\nDone.")
    client.close()


if __name__ == "__main__":
    main()
