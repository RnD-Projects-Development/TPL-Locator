# How TPL-Locator actually works

_Last updated: 2026-07-16. Written to answer: how is the DB connected to live data, and what
happens when I add a device?_

---

## The one thing to understand first

**Your frontend never talks to the trackers. It never talks to Zoqin. It only ever reads your
own MongoDB.**

The trackers report to *their vendor's* cloud (Zoqin's, CityTag's, TrackSolid's). Your backend
polls those vendor APIs on a loop and copies what it finds into your MongoDB. The frontend then
reads MongoDB and nothing else.

So the devices page is **not live**. It's a mirror of what your last sync managed to pull. If the
sync stops, the page keeps showing the last-known data forever and looks perfectly healthy.

```
  Physical tracker
        │  (reports over cellular/BLE — you have zero visibility into this)
        ▼
  Zoqin's cloud  ◄──────── the only thing that knows "live" truth
        │
        │  your backend POSTs every cycle, asking "any points for these serials?"
        ▼
  YOUR MongoDB  (citytag_development)
        │
        │  GET /api/devices
        ▼
  Frontend devices page
```

Every question of the form *"why isn't X showing?"* is really: **which of those arrows broke?**

---

## The three places data lives

These get conflated constantly. They are different things:

| # | Thing | What it is | Written by | Read by |
|---|---|---|---|---|
| 1 | `backend/app/data/devices.json` | a **file** in the repo | you (by hand), `save_devices()` | the sync loop |
| 2 | `devices` collection | the device **rows** | sync + admin/bind APIs | `GET /api/devices` ← **the page** |
| 3 | `locations` collection | the GPS **points** | sync only | joined in for status/timestamps |

**`devices.json` is just a shopping list.** It says "go ask Zoqin about these 607 serials." That's
its entire job. It is not your device list, it is not in the database, and the frontend has never
read it.

**The `devices` collection is what the page shows.** No row here = invisible, no matter how much
GPS data exists.

**The `locations` collection is the GPS history.** It's joined in *afterwards* to decorate rows
that already exist — it can never create one.

> This is the distinction that cost us an afternoon. `2UXqG9noO` had 80 GPS points and was still
> invisible, because it had no row in #2. See [zoqin-device-sync.md](zoqin-device-sync.md).

---

## The sync loop — where "live" data comes from

`start_auto_sync_tasks(app)` in `main.py` registers a background task at startup.
`scheduler_loop()` in `backend/app/services/auto_sync.py` then runs forever:

```python
await sync_all_users()          # runs once immediately at startup
while True:
    await asyncio.sleep(300)    # SYNC_INTERVAL_SECONDS
    await sync_all_users()
```

Each pass calls `run_vendor_sync_all()` in `backend/app/services/vendor_sync.py`:

```python
devices_list = device_registry.load_devices(...)   # ← re-reads devices.json FROM DISK, every cycle
await _sync_citytag(...)      # → devices + locations
devices_list = device_registry.load_devices(...)   # ← re-read
await _sync_tracksolid(...)   # → devices + locations
devices_list = device_registry.load_devices(...)   # ← re-read
await _sync_zoqin(...)        # → devices + locations
```

That re-read is why **adding a device needs no restart**. The loop picks up your file edit on its
next pass.

### What each vendor sync does

| Vendor | How it finds devices | Time window per cycle |
|---|---|---|
| CityTag | asks CityTag's API for the device list | last 70 min |
| TrackSolid | asks TrackSolid's API for device locations, matches by `imei` | latest position only |
| Zoqin | **reads `devices.json`** — Zoqin has no device-list endpoint | last 70 min |

Zoqin is the odd one out: it has no way to ask "what devices do I have?", so the registry file
*is* the device list. That's why `devices.json` matters so much for Zoqin and barely at all for
the other two.

The 70-minute window (`SYNC_HISTORY_MINUTES`) deliberately overlaps the 5-minute cycle. Re-fetching
the same points is harmless because the upsert is keyed on `uid + sn + timestamp`, so duplicates
collapse.

---

## What the frontend actually asks for

`GET /api/devices` → `_enrich_admin_devices()` in `backend/app/routers/devices.py`:

1. `mongo.devices.find({"admin_id": <your admin>})` — **this is the device list.** For a regular
   user it's `account.devices` instead.
2. One aggregation over `locations` to get the newest timestamp per serial.
3. Glue them together into rows: `status`, `dataRetrievalTime`, `assigned_name`, etc.

Note what's absent: no vendor API call, no `devices.json`. Just two Mongo reads. That's the whole
page.

---

## Adding a new device: the full journey

You add one line:

```json
{ "sn": "2UXqG9xyz", "admin": "tpl@gmail.com", "vendor": "zoqin" }
```

Then, with no restart:

```
[you edit devices.json]
        │
        ▼  ≤ 5 min
run_vendor_sync_all()  →  load_devices()  reads your new line
        │
        ▼
_sync_zoqin()  sees the serial in the zoqin list
        │
        ├─► device row missing?  →  create_device()      →  devices collection   ✅ appears on page
        │
        └─► zoqin_fetch_reports_for_sn()  →  Zoqin API
                    │
                    ▼
             upsert_location_from_citytag() per point  →  locations collection   ✅ status + timestamp
        │
        ▼
GET /api/devices  →  row is there, decorated with its newest point
```

**Before 2026-07-16 the `create_device()` branch did not exist for Zoqin.** Adding to
`devices.json` got you points in `locations` and an invisible device, and someone had to add it by
hand through the admin UI. That's the bug we fixed; that box is the fix.

Want it now instead of within 5 minutes? `POST /api/sync/all`.

---

## The clock — read this before trusting any timestamp

This is the most confusing part of the system, and it's deliberate.

Zoqin hands you a proper UTC timestamp:

```json
{ "timestamp": "2026-07-16T12:07:50Z" }
```

The pipeline then does two things (`_parse_citytag_timestamp` → `upsert_location_from_citytag`):

1. **Strips the timezone.** `12:07:50Z` becomes naive `12:07:50`.
2. **Adds a per-vendor offset.** Zoqin `+5`, TrackSolid `+5`, CityTag `−3`.

So `12:07:50Z` is stored as **`17:07:50`, with no timezone marker** — Pakistan wall-clock time
pretending to be a bare number.

**Why?** The docstring explains: the frontend date pickers send wall-clock values, so storing
wall-clock means a picker value of `10:30` matches a stored `10:30` directly, with no conversion
anywhere. It's a deliberate trade — simple pickers, lying timestamps.

**What this means for you:** every timestamp in `locations`, and every `dataRetrievalTime` on the
page, is **PKT wall-clock, not UTC** — despite ISO formatting that implies otherwise. When you
compare against mongosh or Postman (which show real UTC from Zoqin), you will see a 5-hour gap.
That gap is correct and intentional. Don't "fix" it.

### The side effect: online/offline is skewed

`_get_device_status()` compares a **real UTC** clock against those **shifted** timestamps:

```python
if (datetime.utcnow() - latest_timestamp) < timedelta(minutes=ONLINE_THRESHOLD_MINUTES):
    return "online"
```

Measured live on `2UXqG9noO`:

```
datetime.utcnow()        = 2026-07-16 12:50:52
stored timestamp         = 2026-07-16 17:18:30      ← 4.5 h in the "future"
utcnow - stored          = -4:27:37                 ← negative
status                   = online
```

The subtraction is off by exactly the vendor offset, so the real threshold isn't the configured
12 hours:

| Vendor | Offset | `ONLINE_THRESHOLD_MINUTES` | **Actual silence before "offline"** |
|---|---|---|---|
| Zoqin | +5 h | 720 (12 h) | **17 h** |
| TrackSolid | +5 h | 720 (12 h) | **17 h** |
| CityTag | −3 h | 720 (12 h) | **9 h** |

None of them is 12 hours. A Zoqin device can be dead for most of a day and still show green.

(Related: the comment above the online count in `get_devices_summary` says "within 30 minutes".
It's stale — the constant is 720.)

---

## Sharp edges

**`devices.json` is rewritten by the running app.** `save_devices()` rewrites the *whole file*
from an in-memory list, and `append_device()` calls it whenever a vendor reports an unregistered
serial. **Hand-edit while the backend is running and your edit can be erased.** Stop the backend,
edit, restart. Keep it committed so `git diff` catches surprises.

**93% of your fleet has never reported.** 607 Zoqin serials in the registry; **44** have ever
produced a point. A silent device is the *normal* case — start there before suspecting code.

**Zoqin API errors are swallowed.** `zoqin_query_reports` does `block.get("reports") or []`, so a
response of `{"error": "设备不存在或无权访问"}` ("device does not exist or no permission") becomes an
empty list. A typo'd serial is indistinguishable from a quiet device — both log "0 reports".

**The page can look healthy while sync is dead.** Nothing on the frontend surfaces sync failures.
If the loop dies, rows keep rendering with stale `dataRetrievalTime`. Check backend logs for
`vendor_sync zoqin completed`, and watch `zoqin_failed_sns`.

**A full cycle likely takes longer than 5 minutes.** `_sync_zoqin` is serialized
(`Semaphore(1)`) with a 0.5 s pause per device — 607 devices means 5 minutes of *sleeping alone*,
before any network time. The scheduler awaits completion before sleeping 300 s, so it can't
overlap itself, but real cadence is slower than the nominal 5 minutes.

---

## Where to look when something's wrong

| Symptom | First check |
|---|---|
| Device not on page | Does it have a row in `devices`? (not `devices.json` — the **collection**) |
| Device on page, no location | Ask Zoqin directly. Empty `reports` + no `error` = device never reported |
| "Device does not exist or no permission" | Serial is wrong, or not on the Zoqin account |
| Timestamps look 5 h off | Correct and intentional — see the clock section |
| Everything stale | Is the backend up? Is the sync loop alive? Check logs |
| Registry lost entries | `save_devices()` overwrote it — restore with `git checkout` |

**Key files**

| File | Role |
|---|---|
| `backend/app/services/vendor_sync.py` | the sync loop — all three vendors |
| `backend/app/services/auto_sync.py` | the 5-minute scheduler |
| `backend/app/services/zoqin_api.py` | Zoqin HTTP client, retries, bisection |
| `backend/app/services/device_registry.py` | reads/writes `devices.json` |
| `backend/app/routers/devices.py` | `GET /api/devices` — what the page reads |
| `backend/app/services/mongodb.py` | all DB access, timestamp handling |
| `backend/app/data/devices.json` | the shopping list |
