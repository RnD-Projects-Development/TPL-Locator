"""
Rename devices from their old registration numbers (CSK...) to the new bike
registration numbers (AAX - ....).

Only the `name` field is touched, and only on the exact devices listed in
MAPPING below. Nothing else on the document is read-modify-written, so binding,
client, admin_id, assigned_name and location history are all left alone.

Why `name` and not `assigned_name`:
    The devices table renders `device.name` first
    (frontend/src/components/DevicesTable.jsx:186). On these 11 rows
    `assigned_name` is the vendor label 'TPL Locator' and is what feeds the
    *client* column fallback — rewriting it would change a different column.

Usage:
    cd backend
    venv/Scripts/python.exe rename_bike_registrations.py            # dry run
    venv/Scripts/python.exe rename_bike_registrations.py --apply    # write
    venv/Scripts/python.exe rename_bike_registrations.py --rollback backup_xxx.json
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime

import certifi
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# serial number -> desired name. Keyed by SN, not by the old CSK name, on
# purpose: SNs are stable, whereas the old names are being edited by hand and a
# half-finished edit ('5394') would make an old-name lookup silently miss.
# That also makes this idempotent — re-running just re-asserts the same value.
#
# Format is "AAX-5405", no spaces around the hyphen, matching how 2UXqG9vVp was
# renamed by hand. The source table renders these with spaces; that is table
# formatting, not part of the name.
#
# The SN for each row was resolved from its CSK number before the manual edits
# started, so this mapping preserves the original pairing.
MAPPING = {
    "2UXqG9vVp": "AAX-5405",  # was CSK270626003
    "2UXqG9uQO": "AAX-5389",  # was CSK270626004
    "2UXqG9osJ": "AAX-5390",  # was CSK270626005
    "2UXqG9uR9": "AAX-5394",  # was CSK270626006
    "2UXqG9mkE": "AAX-5395",  # was CSK270626007
    "2UXqG9qAO": "AAX-5399",  # was CSK270626008
    "2UXqG9lgM": "AAX-5401",  # was CSK270626009
    "2UXqG9pwC": "AAX-5403",  # was CSK270626010
    "2UXqG9kcD": "AAX-5367",  # was CSK270626011
    "2UXqG9tNd": "AAX-5407",  # was CSK270626012
    "2UXqG9uR7": "AAN-2379",  # was CSK270626013
}


def _db(client):
    return client[os.getenv("MONGO_DB_NAME", "citytag_development")]


async def resolve(devices):
    """Look each SN up and decide what needs changing. Returns (plan, skips, problems)."""
    plan, skips, problems = [], [], []

    for sn, new in MAPPING.items():
        doc = await devices.find_one(
            {"sn": sn}, {"_id": 1, "sn": 1, "name": 1, "assigned_name": 1, "client": 1}
        )

        if doc is None:
            problems.append(f"{sn}: no device with this serial — skipped")
            continue

        current = doc.get("name") or ""
        if current == new:
            skips.append(f"{sn}: already named {new!r}")
            continue

        # Refuse to collide with a name already in use by some other device.
        clash = await devices.find_one({"name": new, "_id": {"$ne": doc["_id"]}}, {"sn": 1})
        if clash:
            problems.append(f"{sn} -> {new}: name already used by sn={clash.get('sn')} — skipped")
            continue

        plan.append({"sn": sn, "old": current, "new": new, "doc": doc})

    return plan, skips, problems


async def _final_state(devices):
    """Re-read every mapped device straight from Mongo, for the post-write check."""
    for sn in MAPPING:
        yield sn, await devices.find_one({"sn": sn}, {"sn": 1, "name": 1})


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="perform the writes")
    ap.add_argument("--rollback", metavar="BACKUP.json", help="restore names from a backup file")
    args = ap.parse_args()

    uri = os.getenv("MONGO_URI")
    if not uri:
        sys.exit("MONGO_URI not set (expected in backend/.env)")

    client = AsyncIOMotorClient(uri, tls=True, tlsCAFile=certifi.where())
    devices = _db(client)["devices"]

    try:
        if args.rollback:
            with open(args.rollback) as fh:
                backup = json.load(fh)
            from bson import ObjectId

            for row in backup:
                res = await devices.update_one(
                    {"_id": ObjectId(row["_id"])}, {"$set": {"name": row["name_before"]}}
                )
                print(f"  restored {row['sn']} -> {row['name_before']} (matched {res.matched_count})")
            print(f"\nRolled back {len(backup)} device(s).")
            return

        plan, skips, problems = await resolve(devices)

        print(f"database : {_db(client).name}")
        print(f"to change: {len(plan)} of {len(MAPPING)} device(s)\n")
        for p in plan:
            print(f"  sn={p['sn']:<12} {p['old'] or '(empty)':<14} ->  {p['new']}")
        if skips:
            print("\nAlready correct, leaving alone:")
            for msg in skips:
                print(f"  = {msg}")
        if problems:
            print("\nNOT changing:")
            for msg in problems:
                print(f"  ! {msg}")

        if not args.apply:
            print("\nDRY RUN — nothing written. Re-run with --apply to commit.")
            return

        # Snapshot before-state so the change is reversible.
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(os.path.dirname(__file__), f"rename_backup_{stamp}.json")
        with open(backup_path, "w") as fh:
            json.dump(
                [
                    {"_id": str(p["doc"]["_id"]), "sn": p["sn"], "name_before": p["old"]}
                    for p in plan
                ],
                fh,
                indent=2,
            )
        print(f"\nbackup written: {backup_path}")

        changed = 0
        for p in plan:
            res = await devices.update_one(
                # _id pins the document; matching `name` too means a rename that
                # landed since the dry run makes this a no-op instead of clobbering it.
                {"_id": p["doc"]["_id"], "name": p["doc"].get("name")},
                {"$set": {"name": p["new"]}},
            )
            changed += res.modified_count
            flag = "ok" if res.modified_count else "NO-OP (edited since dry run)"
            print(f"  {p['sn']:<12} {p['old'] or '(empty)':<14} -> {p['new']}  [{flag}]")

        print(f"\n{changed} device(s) renamed.")

        wrong = [
            f"{sn}={d.get('name')!r}"
            async for sn, d in _final_state(devices)
            if d and d.get("name") != MAPPING[sn]
        ]
        print(f"verify: {len(wrong)} device(s) not at their target name (expect 0)")
        for w in wrong:
            print(f"  ! {w}")

    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
