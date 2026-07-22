"""
cleanup_unbound_device_names.py
-------------------------------
Clear the leftover custom `name` (and optionally `client`) on devices that are
UNBOUND but still carry a previously-bound device name — i.e. devices unbound
*before* the unbind-name-reset fix landed in unassign_device()/delete_user().

A device is treated as STALE (and gets its name cleared) only when ALL hold:
  - it is unbound            (user_id is null / missing), AND
  - it has a non-empty `name`, AND
  - `assigned_name` (the vendor label, e.g. "TPL Locator") is a usable
    fallback: non-empty and not equal to the SN, AND
  - `name` != `assigned_name`   (so we only strip real custom names)

Bound devices (user_id set) are NEVER touched. Devices with no usable vendor
label are reported and SKIPPED, so nothing is left nameless.

Usage (run from backend/):
  python cleanup_unbound_device_names.py                       # DRY RUN, all stale devices
  python cleanup_unbound_device_names.py --apply               # clear name on all stale devices
  python cleanup_unbound_device_names.py --sn 2UXqG9rEy        # DRY RUN, specific SN(s)
  python cleanup_unbound_device_names.py --sn 2UXqG9rEy --apply
  python cleanup_unbound_device_names.py --apply --clear-client  # also clear client
"""
from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

UNBOUND = {"$or": [{"user_id": None}, {"user_id": {"$exists": False}}]}


def stale_filter(sns: list[str] | None) -> dict:
    flt: dict = {
        "$and": [
            UNBOUND,
            {"name": {"$nin": [None, ""]}},
            {"assigned_name": {"$nin": [None, ""]}},
            {"$expr": {"$and": [
                {"$ne": ["$name", "$assigned_name"]},
                {"$ne": ["$assigned_name", "$sn"]},
            ]}},
        ]
    }
    if sns:
        flt["sn"] = {"$in": sns}
    return flt


def risky_filter(sns: list[str] | None) -> dict:
    """Unbound devices with a custom name but NO usable vendor label to fall back to."""
    flt: dict = {
        "$and": [
            UNBOUND,
            {"name": {"$nin": [None, ""]}},
            {"$or": [
                {"assigned_name": {"$in": [None, ""]}},
                {"$expr": {"$eq": ["$assigned_name", "$sn"]}},
            ]},
            {"$expr": {"$ne": ["$name", "$assigned_name"]}},
        ]
    }
    if sns:
        flt["sn"] = {"$in": sns}
    return flt


def main() -> int:
    ap = argparse.ArgumentParser(description="Clear leftover names on unbound devices")
    ap.add_argument("--sn", action="append", help="target specific SN (repeatable)")
    ap.add_argument("--apply", action="store_true", help="perform writes (default: dry run)")
    ap.add_argument("--clear-client", action="store_true", help="also clear the client field")
    args = ap.parse_args()

    uri = os.getenv("MONGO_URI")
    dbname = os.getenv("MONGO_DB_NAME", "citytag_development")
    if not uri:
        print("ERROR: MONGO_URI not set in backend/.env")
        return 1

    db = MongoClient(uri, serverSelectionTimeoutMS=8000)[dbname]
    flt = stale_filter(args.sn)
    proj = {"_id": 0, "sn": 1, "name": 1, "assigned_name": 1, "client": 1}

    targets = list(db.devices.find(flt, proj))
    print(f"DB: {dbname}")
    print(f"Stale unbound devices with a leftover name: {len(targets)}\n")
    for d in targets:
        extra = ""
        if args.clear_client and d.get("client"):
            extra = f"   client={d.get('client')!r} -> cleared"
        print(f"  {d['sn']!r}: name={d.get('name')!r}  ->  falls back to assigned_name={d.get('assigned_name')!r}{extra}")

    risky = list(db.devices.find(risky_filter(args.sn), proj))
    if risky:
        print(f"\n  SKIPPED — {len(risky)} unbound device(s) with a custom name but no usable vendor label:")
        for d in risky:
            print(f"    {d['sn']!r}: name={d.get('name')!r} assigned_name={d.get('assigned_name')!r}")
        print("    (left untouched so they don't end up nameless — handle these manually if needed)")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply to clear these names.")
        return 0

    if not targets:
        print("\nNothing to do.")
        return 0

    unset = {"name": ""}
    if args.clear_client:
        unset["client"] = ""
    res = db.devices.update_many(flt, {"$unset": unset})
    print(f"\nAPPLIED. matched={res.matched_count} modified={res.modified_count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
