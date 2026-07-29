# "6 active today" — how the avatar stack and its timestamps work

_Last updated: 2026-07-23_

The coloured circles in the Users page header, with the green dot and `N ACTIVE TODAY`
label above them. This document explains which users end up in that stack, and how the
`9h ago` style strings are produced.

Everything lives in `frontend/src/pages/UsersPage.jsx` — the `ActiveAvatarStack`
component and the `fmtRelTime` helper — plus `frontend/src/utils/userPresence.js` for
the table below it.

---

## 1. Where the data comes from

```
POST /api/login/portal          ─► writes  last_logged_in   on the account doc
POST /api/logout                ─► writes  last_logged_out  on the account doc
                                              │
                                              ▼
GET /api/admin/users            ─► serialises both via _dt_iso() → "…+00:00"
                                              │
                                              ▼
UserCacheProvider (users state)  ◄── 15-min silent refresh
                                              │
                                              ▼
UsersPage ─┬─► ActiveAvatarStack   (the circles)
           └─► users table          (the "Last active" column)
```

| Step | File | Note |
|---|---|---|
| Login stamp | `backend/app/routers/auth.py` | Written on **user** logins only. The admin branch never writes it. |
| Logout stamp | `backend/app/routers/auth.py`, `/logout` | Written for **any** role. |
| Serialisation | `backend/app/routers/admin_users.py`, `_dt_iso` | Reattaches UTC — see §5. |
| Fetch | `frontend/src/hooks/useCityTag.js`, `adminGetUsers` | `GET /api/admin/users` |
| Cache | `frontend/src/context/Usercachecontext.jsx` | Prefetched once admin is authed |
| Auto-refresh | `UsersPage.jsx` | `setInterval`, 15 minutes, silent (no spinner) |

`GET /api/admin/users` returns **every** account with `role: "user"` — it is deliberately
not scoped to the logged-in admin, because this is a single-company deployment where all
admins share one user pool. Two consequences for the stack:

- Admins never appear in it. The query filters to `role: "user"`.
- Every admin sees the same six faces.

---

## 2. Who counts as "active today"

```js
const active = users.filter(u => {
  const ts = u.last_logged_in || u.last_login
  return ts && Date.now() - new Date(ts).getTime() < 86_400_000
})
```

Three things to read carefully here:

**It is a rolling 24-hour window, not "since midnight."** The label says *today*, but the
maths is `now − login < 24h`. Someone who logged in at 8pm yesterday is still counted at
10am today. Someone who logged in at 00:30 this morning drops off at 00:30 tomorrow, not
at midnight.

**It only looks at login, never logout.** `last_logged_out` is ignored entirely, so the
stack means *"logged in at some point in the last 24h"* — the person may have logged out
hours ago and be long gone.

**`last_login` is a legacy fallback.** Current backend responses only ever send
`last_logged_in`; the `|| u.last_login` branch exists for older stored shapes.

### Not the same as the green "Online" badge

The table underneath uses a different rule — `isUserOnline` in `userPresence.js`:

```js
loginTs > 0 && loginTs > logoutTs
```

| | Rule | Meaning |
|---|---|---|
| Avatar stack | `now − last_logged_in < 24h` | Showed up today |
| **Online** badge | `last_logged_in > last_logged_out` | Session still open right now |

So a user can be in the stack and *not* show Online. That is expected, not a bug — but it
does mean the count in the header and the number of green badges in the table will
routinely disagree.

---

## 3. How the circles are drawn

| Aspect | Rule | Gotcha |
|---|---|---|
| Order | Whatever order the API returned (Mongo natural order) | **Not** sorted by recency — the leftmost avatar is not the most recent login. The table below *is* sorted; the stack is not. |
| Cap | First 7, remainder collapse into a `+N` chip | 6 active → no chip |
| Colour | `AVATAR_COLORS[i % 8]` | Keyed to **position**, not to the user. A user's colour changes whenever list order changes. |
| Initials | First letter of up to 2 words of `u.name` | Falls back to `displayContact(u)` (phone for synthetic emails, else email), then `?` |
| Tooltip | `"{name} · {fmtRelTime(last_logged_in)}"` | This is where `9h ago` is visible on hover |
| Hidden when empty | `if (active.length === 0) return null` | Whole block disappears, including the label |

---

## 4. How `9h ago` is calculated

`fmtRelTime(ts)` in `UsersPage.jsx`:

```js
const t = typeof ts === 'string' && !ts.includes('+') && !ts.endsWith('Z') ? ts + 'Z' : ts
const diff = Date.now() - new Date(t).getTime()
```

Then bucketed:

| Elapsed | Output |
|---|---|
| invalid / negative | `—` |
| < 1 minute | `Just now` |
| < 1 hour | `{m}m ago` |
| < 24 hours | `{h}h ago` ← the one you asked about |
| < 7 days | `{d}d ago` |
| ≥ 7 days | `Mar 3, 2026` (absolute) |

Details that matter in practice:

- **`Math.floor`, not rounding.** 9h 59m still renders `9h ago`. It only flips to `10h ago`
  at the full hour.
- **Negative diffs render `—`.** If a server clock runs ahead of the browser, the timestamp
  is in the future and the string blanks out rather than showing a nonsense value.
- **Computed at render, not on a timer.** Nothing ticks these strings forward. `9h ago`
  stays frozen until something re-renders the page — a refresh, typing in search, changing
  page. The 15-minute auto-refresh corrects it, but a tab left open shows a stale value in
  between.

### Which timestamp feeds which string

This is the easiest thing to misread, because the same user shows two different numbers:

| Location | Timestamp used | Reads as |
|---|---|---|
| Avatar tooltip | `last_logged_in` (always) | time since they **logged in** |
| Table "Last active" | `lastActiveStamp(u)` → `last_logged_out` first, falling back to `last_logged_in` | time since they **logged out** |
| Header "Updated …" | `lastFetched` (client-side `Date.now()` at fetch) | age of the data on screen |

So a tooltip saying `9h ago` next to a row saying `2h ago` is consistent: they logged in
9 hours ago and logged out 2 hours ago.

---

## 5. The timezone handling, and why it exists

PyMongo strips `tzinfo` when reading datetimes back out of Mongo, turning aware UTC values
into naive ones. `naive.isoformat()` produces a string with no `Z` and no `+00:00`, and
JavaScript then parses that as **local** time. In PKT (UTC+5) that makes every timestamp
look 5 hours older than it is.

Two defences are in place:

1. **Backend** — `_dt_iso` in `admin_users.py` reattaches `timezone.utc` before
   serialising, so the wire format is always `2026-07-23T09:14:03+00:00`.
2. **Frontend** — `fmtRelTime` and `parseTs` both append `Z` when the string carries no
   offset, as a second line of defence.

### Known gap

`ActiveAvatarStack`'s filter does **not** apply defence #2:

```js
Date.now() - new Date(ts).getTime() < 86_400_000   // raw parse, no 'Z' guard
```

compared with `fmtRelTime` and `userPresence.parseTs`, which both normalise first. Today
this is harmless because `_dt_iso` always emits an offset. It becomes a real bug the moment
a naive timestamp reaches this filter — a different endpoint, or the legacy `last_login`
field — at which point the 24-hour window shifts by the local UTC offset: users up to 5h
past the cutoff would be counted, and genuinely recent ones near the boundary dropped.

Fix is one line — reuse the shared helper:

```js
import { parseTs } from '../utils/userPresence.js'   // needs exporting
const active = users.filter(u => {
  const ts = parseTs(u.last_logged_in || u.last_login)
  return ts > 0 && Date.now() - ts < 86_400_000
})
```

---

## 6. Quick reference

| Question | Answer |
|---|---|
| Why is an active-looking user missing? | They have no `last_logged_in` — never logged in since the field was introduced, or they're an admin. |
| Why does the count differ from the green badges? | Different rules: 24h-since-login vs. session-still-open. |
| Why did a user's colour change? | Colour is positional (`i % 8`), and list order comes from Mongo. |
| Why is the tooltip time different from the row? | Tooltip = since login; row = since logout. |
| Why is the time not updating? | Nothing re-renders on a timer; the page refreshes every 15 minutes. |
| Why `9h ago` when it's been 9h 50m? | `Math.floor` on the hour bucket. |
