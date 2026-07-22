# Zoqin device sync — why devices with GPS data were invisible

_Last updated: 2026-07-16_

## The symptom

Device `2UXqG9noO` had location reports confirmed in both mongosh and Postman, but never
appeared on the frontend devices page.

## The cause

Three things are easy to conflate. They are **not** the same:

| Thing | What it actually is | Who reads it |
|---|---|---|
| `backend/app/data/devices.json` | A registry **file**. Lists which serials to poll, per vendor. | `vendor_sync` |
| `devices` collection | The device **rows** the UI lists | `GET /api/devices` |
| `locations` collection | The GPS **points** | joined in afterwards |

`GET /api/devices` reads **only** the `devices` collection — filtered by `admin_id` for admins
(`backend/app/routers/devices.py`, `_enrich_admin_devices`) or by `account.devices` for users.
The `locations` collection is consulted *afterwards*, purely to fill in `status` and
`dataRetrievalTime` on rows that already exist.

**A device with no row in `devices` is invisible, no matter how much GPS data sits behind it.**

The bug: of the three vendor syncs in `backend/app/services/vendor_sync.py`, only two created
device rows.

| Vendor | Writes device row | Writes locations |
|---|---|---|
| CityTag (`_sync_citytag`) | yes — calls `upsert_device_from_citytag` | yes |
| TrackSolid (`_sync_tracksolid`) | yes — calls `upsert_device_from_citytag` | yes |
| Zoqin (`_sync_zoqin`) | **no** | yes |

So adding a serial to `devices.json` got you location points and nothing else. The data landed
one collection away from where the UI was looking:

```
devices.json ──► vendor_sync ──► locations collection    ✅ points arrived
                     │
                     └────────► devices collection       ❌ zoqin wrote nothing here
                                       │
                                       ▼
                            frontend devices page
```

Nothing else filled the gap either — `bind_device_service` refuses to bootstrap a missing
device (`"Device does not exist. Please ask your admin to add it first."`), so the only way a
Zoqin device ever appeared was an admin adding it by hand via `POST /api/admin/devices`.

## The change

**File: `backend/app/services/vendor_sync.py`, function `_sync_zoqin`.**

Two edits:

1. Capture the admin's ObjectId, which the function already looked up but only used for `uid`:

   ```python
   tpl_admin_id = str(tpl_doc["_id"])
   ```

2. Inside `_process_sn`, before fetching reports, create the device row if it's missing:

   ```python
   if not await mongo.devices.find_one({"sn": sn}, {"_id": 1}):
       await mongo.create_device(sn, tpl_admin_id, name=sn)
       logger.info("zoqin device registered sn=%s admin_id=%s", sn, tpl_admin_id)
   ```

That's the whole fix. It adds the missing arrow: registry entry → device row.

### Why create-only, and not `upsert_device_from_citytag` like the other vendors

This matters, and it's the reason the obvious symmetric fix was wrong.

`upsert_device_from_citytag` writes `assigned_name` **unconditionally**, from
`label = assigned_name or name or deviceName or sn`. Zoqin's `location/query` response carries
**no device name** — only `device_sn`, `latitude`, `longitude`, `horizontal_accuracy`,
`confidence`, `timestamp`. So the label could only ever be the raw serial.

Checked against live data before shipping: **591 of 607** Zoqin devices have an `assigned_name`
that isn't their serial (`'TPL Locator'`, `'ZQCard'`, …). Using the upsert would have flattened
every one of them to its raw SN — **on every sync cycle, every 5 minutes**.

The create-only guard cannot do this. If the row exists, the branch doesn't execute and no write
happens at all. `create_device` is a plain `insert_one` with no update path. Existing rows are
never touched.

> **Rule for this codebase:** additive only. Never read-modify-write an existing device row from
> a sync path.

## Adding a device in future — already automated

**Add the serial to `backend/app/data/devices.json` and you're done.**

```json
{ "sn": "YOUR_SN_HERE", "admin": "tpl@gmail.com", "vendor": "zoqin" }
```

Within 5 minutes the next sync cycle will create the device row, start pulling reports, and the
device appears on the page. No restart, no manual admin add.

No restart is needed because `run_vendor_sync_all` calls `device_registry.load_devices()` fresh
at the start of **every** cycle — it re-reads the file from disk each time. The scheduler runs
every `SYNC_INTERVAL_SECONDS = 300` (`backend/app/services/auto_sync.py`) and also fires once
immediately on startup.

To trigger it now instead of waiting: `POST /api/sync/all`.

Before this change, that same edit gave you location points but no visible device — the manual
admin add was mandatory. Now the file is the only input.

### Caveat: `devices.json` is rewritten by the app

`device_registry.save_devices()` rewrites the **whole file** from an in-memory list, and
`append_device()` calls it during sync whenever a vendor reports an unregistered serial. Hand-edit
the file while the backend is running and your edit can be overwritten. Safest: stop the backend,
edit, start it. Keep it committed so `git diff` shows any surprise rewrites.

## Troubleshooting: a device that reports nothing

Worked example — `2UXqG9qB1`, which returns no reports.

Checks, in order:

1. **Is it in `devices.json` with `vendor: "zoqin"`?** If not, it's never polled. → It was.
2. **Does it have a row in `devices`?** → It did.
3. **Does it have points in `locations`?** → Zero.
4. **Ask the Zoqin API directly.** This is the decisive step.

Zoqin distinguishes an unknown serial from a known-but-silent one, and the difference is visible
in the raw payload:

| Serial | Response |
|---|---|
| `2UXqG9noO` (healthy) | `{"results":[{"reports":[{...}, ...],"sn":"2UXqG9noO"}]}` |
| `2UXqG9qB1` (silent) | `{"results":[{"reports":[],"sn":"2UXqG9qB1"}]}` |
| `ZZZZnotarealsn99` (fake) | `{"results":[{"error":"设备不存在或无权访问","sn":"ZZZZnotarealsn99"}]}` |

`设备不存在或无权访问` = *"device does not exist or no permission to access"*.

`2UXqG9qB1` gets **no error** — Zoqin recognizes the serial and grants access. It returns an empty
`reports` array across 24h, 7d, 30d, and 90d windows. So the device is real and reachable, and
Zoqin simply has no location history for it. Nothing is wrong with our code, the registry, the
serial, or permissions. The device has never reported to Zoqin.

That points at the device itself, not the platform: never activated / never powered on / dead
battery / no GPS fix ever acquired.

### This is the norm, not the exception

| | count |
|---|---|
| Zoqin serials in registry | 607 |
| ...that have **ever** reported | 44 |
| ...that have **never** reported | **563** |

93% of the registry has never produced a single point. `2UXqG9qB1` isn't a broken device — it's a
typical one. Any investigation into "why is this device silent" should start from the assumption
that most of the fleet is dormant, and treat the 44 reporters as the special case.

### Known gap: API errors are swallowed

`zoqin_query_reports` (`backend/app/services/zoqin_api.py`) does:

```python
reports = block.get("reports") or []
if sn and isinstance(reports, list):
    out[sn] = [r for r in reports if isinstance(r, dict)]
```

A block containing `{"error": "设备不存在或无权访问", "sn": ...}` has no `reports` key, so it
becomes `[]` and the **error is discarded silently**. A typo'd serial that Zoqin outright rejects
is therefore indistinguishable from a real device that's simply quiet — both look like "0 reports"
in the logs.

Logging `block.get("error")` when present would make bad registry entries self-diagnosing. Not
done yet; worth doing if serials get added by hand often.

## Verifying, safely

Diagnostics against this database should be **read-only** — `find_one`, `count_documents`,
`distinct`. Note that running a sync writes (both device rows and location points), so it isn't a
neutral observation.

To confirm the fix end-to-end, check that the count of Zoqin serials with location data but no
device row is **zero**. That count was `1` before this change (`2UXqG9noO`) and is `0` after.
