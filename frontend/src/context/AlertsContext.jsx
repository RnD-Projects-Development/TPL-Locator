/**
 * AlertsContext — single source of truth for all anomaly alerts.
 *
 * Pulls from 3 existing APIs every POLL_INTERVAL_MS and derives alerts client-side:
 *   1. GET /api/devices          → BATTERY_LOW (battery < 25%) + DEVICE_OFFLINE (> 24 h)
 *   2. GET /api/geofence/status  → zone_ids that have assigned devices
 *   3. GET /api/geofence/report/{zone_id}  → GEOFENCE ENTER/EXIT events (last 24 h)
 *
 * Alert IDs are stable so localStorage read-state survives refreshes:
 *   BATT-{sn}               one per device, disappears when battery recovers
 *   OFFLINE-{sn}            one per device, disappears when device comes back online
 *   GEO-{sn}-{ts_compact}   one per unique event, permanent once created
 */

import React, {
  createContext, useContext,
  useState, useEffect, useCallback, useRef,
} from 'react'
import { useAuth } from './AuthContext.jsx'
import { registerCacheResetListener } from '../utils/clearAppCaches.js'
import { absenceAlert, ALERT_KIND } from '../utils/zoneAlerts.js'

// ─── Constants ────────────────────────────────────────────────────────────────

const BATTERY_THRESHOLD = 25               // percent
const OFFLINE_HOURS = 24              // hours
const GEO_WINDOW_MS = 24 * 60 * 60 * 1000  // only show geofence events from last 24 h
const LS_KEY = 'tpl_alert_read_ids'

// Notifications fire on every reload, so "is this still worth interrupting for"
// has to be decided per alert:
//
//   state alerts (battery, offline, missing, no-show) describe a condition that
//     is true right now — re-derived each fetch, so they're never stale.
//   event alerts (geofence crossings) are a point in time. The list keeps 24h of
//     them for the Alerts page, but only the recent ones are worth a popup —
//     otherwise every refresh replays a whole day of crossings.
const EVENT_ALERT_TYPES = new Set(['GEOFENCE'])
const FRESH_EVENT_MS = 2 * 60 * 60 * 1000

function isWorthNotifying(alert) {
  if (!EVENT_ALERT_TYPES.has(alert.type)) return true
  const t = new Date(alert.timestamp).getTime()
  return Number.isFinite(t) && Date.now() - t <= FRESH_EVENT_MS
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')) }
  catch { return new Set() }
}

function persistReadIds(set) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])) }
  catch { }
}

// ─── Alert builders ───────────────────────────────────────────────────────────

function deviceName(d) {
  return d.name || d.assigned_name || d.assigned_user_name || d.sn || '—'
}

function buildBatteryAlert(device, readIds) {
  const battery = typeof device.battery === 'number' ? device.battery : -1
  if (battery <= 0 || battery >= BATTERY_THRESHOLD) return null

  const id = `BATT-${device.sn}`
  const name = deviceName(device)
  const severity = battery < 10 ? 'critical' : 'high'

  return {
    id,
    type: 'BATTERY_LOW',
    severity,
    deviceId: device.sn,
    deviceName: name,
    message: `Battery low for ${name} (${battery}%)`,
    timestamp: device.dataRetrievalTime || new Date().toISOString(),
    isRead: readIds.has(id),
  }
}

function buildOfflineAlert(device, readIds) {
  const ts = device.dataRetrievalTime
  const hoursAgo = ts
    ? (Date.now() - new Date(ts).getTime()) / 3_600_000
    : Infinity

  if (hoursAgo < OFFLINE_HOURS) return null

  const id = `OFFLINE-${device.sn}`
  const name = deviceName(device)
  const hLabel = hoursAgo === Infinity ? 'an unknown duration' : `${Math.round(hoursAgo)} hours`
  const severity = hoursAgo > 48 ? 'critical' : 'high'

  return {
    id,
    type: 'DEVICE_OFFLINE',
    severity,
    deviceId: device.sn,
    deviceName: name,
    message: `${name} has been inactive for more than ${hLabel}`,
    timestamp: ts || new Date(0).toISOString(),
    isRead: readIds.has(id),
  }
}

function buildGeofenceAlerts(zoneId, events, nameBySn, readIds, zoneLabel) {
  const cutoff = Date.now() - GEO_WINDOW_MS
  const alerts = []
  const label = zoneLabel || zoneId.replace(/_/g, ' ').toUpperCase()

  for (const e of events) {
    if (!e.timestamp) continue
    if (new Date(e.timestamp).getTime() < cutoff) continue

    // Compact timestamp for stable ID: strip non-alphanumeric chars
    const tsCompact = e.timestamp.replace(/\D/g, '')
    const id = `GEO-${e.sn}-${tsCompact}`
    const name = nameBySn[e.sn] || e.sn
    const entered = e.type === 'ENTER'

    alerts.push({
      id,
      type: 'GEOFENCE',
      severity: entered ? 'medium' : 'high',
      deviceId: e.sn,
      deviceName: name,
      message: `${name} ${entered ? 'entered' : 'exited'} zone ${label}`,
      timestamp: e.timestamp,
      isRead: readIds.has(id),
    })
  }

  return alerts
}

/**
 * Zone-scoped absence alerts, derived from /api/geofence/status.
 *
 * Distinct from buildOfflineAlert above: that one asks "is this device
 * reporting at all", this one asks "is it reporting *inside its zone*". A
 * device can be happily online across town and still be missing from its post.
 * Shares its rules with the field staff dashboard via utils/zoneAlerts.js.
 */
function buildZoneAbsenceAlerts(zoneId, zoneLabel, rows, nameBySn, readIds) {
  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  // Local date, not toISOString(): east of UTC, local midnight serialises to
  // *yesterday* in UTC, which gave NO_SHOW a different id here than on the
  // field staff page — so marking one read never silenced the other.
  const dayKey = `${startOfToday.getFullYear()}-` +
    `${String(startOfToday.getMonth() + 1).padStart(2, '0')}-` +
    `${String(startOfToday.getDate()).padStart(2, '0')}`

  const out = []
  for (const row of rows) {
    const alert = absenceAlert({
      sn: row.sn,
      staffName: nameBySn[row.sn] || row.sn,
      zoneId,
      zoneName: zoneLabel,
      lastInZoneAt: row.last_seen,
      dayKey,
      dayStartMs: startOfToday.getTime(),
      nowMs: now,
    })
    if (!alert) continue

    out.push({
      id: alert.id,
      type: alert.kind === ALERT_KIND.MISSING ? 'ZONE_MISSING' : 'ZONE_NO_SHOW',
      severity: alert.severity,
      deviceId: alert.sn,
      deviceName: alert.staffName,
      message: `${alert.title} — ${alert.description}`,
      timestamp: alert.timestamp,
      isRead: readIds.has(alert.id),
    })
  }
  return out
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AlertsCtx = createContext(null)

export function AlertsProvider({ children }) {
  const { accessToken } = useAuth()

  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState(null)
  const [error, setError] = useState(null)

  // Persisted read state. A ref, not state: nothing renders off it directly —
  // the Alerts page reads the `isRead` flag carried on each alert instead.
  const readIdsRef = useRef(loadReadIds())

  // Everything marked read *this session*. Kept separately from the persisted
  // set for two reasons: the stale-id prune below must never resurrect an alert
  // the user already dismissed, and the field staff banners suppress on THIS
  // set only — persisted read state would silence them forever, when what's
  // wanted is "quiet for this session, back on the next reload if still true".
  // Mirrored into state so consumers re-render when it changes.
  const sessionReadRef = useRef(new Set())
  const [sessionReadIds, setSessionReadIds] = useState(() => new Set())

  const addSessionRead = useCallback((ids) => {
    const next = new Set(sessionReadRef.current)
    let changed = false
    for (const id of ids) if (id && !next.has(id)) { next.add(id); changed = true }
    if (!changed) return
    sessionReadRef.current = next
    setSessionReadIds(next)
  }, [])

  const seenAlertIdsRef = useRef(new Set()) // already notified this session

  const applyReadIds = useCallback((next) => {
    readIdsRef.current = next
    persistReadIds(next)
  }, [])

  const resetAlertsCache = useCallback(() => {
    setAlerts([]);
    setLoading(false);
    setLastFetched(null);
    setError(null);
    readIdsRef.current = new Set();
    persistReadIds(readIdsRef.current);
    sessionReadRef.current = new Set();
    setSessionReadIds(new Set());
    seenAlertIdsRef.current = new Set();
  }, []);

  useEffect(() => registerCacheResetListener(resetAlertsCache), [resetAlertsCache]);

  // Ask for web-notification permission once the user is authenticated
  useEffect(() => {
    if (accessToken && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => { })
    }
  }, [accessToken])

  // ── Core fetch ─────────────────────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)

    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    const readIds = readIdsRef.current
    const all = []

    try {
      // ── 1. Device anomalies (battery + offline) — first 200 devices only ──────
      let nameBySn = {}
      try {
        const res = await fetch('/api/devices?page=1&limit=200', { headers })
        if (res.ok) {
          const raw = await res.json()
          const devices = Array.isArray(raw) ? raw : (raw?.devices ?? [])

          for (const d of devices) {
            if (d.sn) nameBySn[d.sn] = deviceName(d)

            const battAlert = buildBatteryAlert(d, readIds)
            const offlineAlert = buildOfflineAlert(d, readIds)
            if (battAlert) all.push(battAlert)
            if (offlineAlert) all.push(offlineAlert)
          }
        }
      } catch {
        // device fetch failure is non-fatal — geofence can still work
      }

      // ── 2. Geofence events ────────────────────────────────────────────────
      try {
        const statusRes = await fetch('/api/geofence/status', { headers })
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          const zones = statusData?.zones ?? {}
          const zoneNames = statusData?.zone_names ?? {}
          const zoneIds = Object.keys(zones)

          // Zone-scoped MISSING / NO_SHOW come straight off the status payload —
          // no extra request needed.
          for (const zid of zoneIds) {
            all.push(...buildZoneAbsenceAlerts(
              zid, zoneNames[zid] || zid, zones[zid] || [], nameBySn, readIds,
            ))
          }

          // Crossings need the event log. Windowed to the last 24h so the
          // backend doesn't re-walk each device's whole history every poll.
          const since = new Date(Date.now() - GEO_WINDOW_MS)
          const sinceParam = encodeURIComponent(
            `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-` +
            `${String(since.getDate()).padStart(2, '0')}T` +
            `${String(since.getHours()).padStart(2, '0')}:${String(since.getMinutes()).padStart(2, '0')}:00`
          )

          const batch = zoneIds.slice(0, 10)
          const reportResults = await Promise.allSettled(
            batch.map(zid =>
              fetch(`/api/geofence/report/${encodeURIComponent(zid)}?start=${sinceParam}`, { headers })
                .then(r => r.ok ? r.json() : null)
            )
          )

          for (let i = 0; i < batch.length; i++) {
            const result = reportResults[i]
            if (result.status !== 'fulfilled' || !result.value?.events?.length) continue
            const zoneAlerts = buildGeofenceAlerts(
              batch[i],
              result.value.events,
              nameBySn,
              readIds,
              result.value.zone_name || zoneNames[batch[i]],
            )
            all.push(...zoneAlerts)
          }
        }
      } catch {
        // geofence failure is non-fatal
      }

      // ── 3. Sort newest first ──────────────────────────────────────────────
      all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      // ── 4. Prune stale read IDs (alerts that no longer exist) ─────────────
      // Anything marked read this session is exempt: the field staff page marks
      // its own zone alerts read through here, and those ids aren't always in
      // this payload — pruning them would let the same banner fire again.
      const activeIds = new Set(all.map(a => a.id))
      const cleanedIds = new Set(
        [...readIds].filter(id => activeIds.has(id) || sessionReadRef.current.has(id)),
      )
      if (cleanedIds.size !== readIds.size) applyReadIds(cleanedIds)

      // ── 5. Fire web notifications for unread, still-current alerts ────────
      // The first fetch after a reload notifies too — the user asked for fresh
      // alerts on every load — but `isWorthNotifying` keeps a refresh from
      // replaying a day's worth of old crossings.
      try {
        const canNotify = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
        // Gated on session read state, not the persisted set: a still-valid
        // alert should announce itself again after a reload.
        const fresh = all.filter(a =>
          !seenAlertIdsRef.current.has(a.id) &&
          !sessionReadRef.current.has(a.id) &&
          isWorthNotifying(a)
        )
        all.forEach(a => seenAlertIdsRef.current.add(a.id))

        if (canNotify && fresh.length) {
          fresh.slice(0, 4).forEach(a => {
            try { new Notification('TPL Trakker — New Alert', { body: a.message, tag: a.id }) } catch { }
          })
          if (fresh.length > 4) {
            try { new Notification('TPL Trakker', { body: `${fresh.length} new alerts need attention` }) } catch { }
          }
        }
      } catch { /* notifications are best-effort */ }

      // ── 6. Apply current read state ───────────────────────────────────────
      setAlerts(all.map(a => ({ ...a, isRead: cleanedIds.has(a.id) })))
      setLastFetched(Date.now())
    } catch (err) {
      setError(err.message || 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [accessToken, applyReadIds])

  // ── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!accessToken) {
      resetAlertsCache();
      return;
    }
    fetchAlerts()
  }, [accessToken, fetchAlerts, resetAlertsCache])

  // ── Actions ────────────────────────────────────────────────────────────────

  const markRead = useCallback((id) => {
    if (!id) return
    addSessionRead([id])
    if (!readIdsRef.current.has(id)) {
      applyReadIds(new Set([...readIdsRef.current, id]))
    }
    // Callers outside this context pass ids that may not be in `alerts` — keep
    // the same array when there's nothing to flip.
    setAlerts(prev => (
      prev.some(a => a.id === id && !a.isRead)
        ? prev.map(a => (a.id === id ? { ...a, isRead: true } : a))
        : prev
    ))
  }, [applyReadIds, addSessionRead])

  const markAllRead = useCallback(() => {
    const ids = alerts.map(a => a.id)
    addSessionRead(ids)
    applyReadIds(new Set([...readIdsRef.current, ...ids]))
    setAlerts(prev => prev.map(a => ({ ...a, isRead: true })))
  }, [alerts, applyReadIds, addSessionRead])

  /**
   * Dismissal that lasts for this browser session only.
   *
   * Used by the field staff banners. Deliberately does NOT write to the
   * persisted read set: those ids (MISSING-{zone}-{sn}) are stable and shared
   * with the bell, so persisting them means the banner for a still-missing
   * staff member never appears again — not even after a reload.
   */
  const markReadThisSession = useCallback((id) => {
    if (id) addSessionRead([id])
  }, [addSessionRead])

  /** Read/dismissed at some point in THIS session. Clears on reload. */
  const isAlertReadThisSession = useCallback(
    (id) => sessionReadIds.has(id),
    [sessionReadIds],
  )

  const unreadCount = alerts.filter(a => !a.isRead).length

  return (
    <AlertsCtx.Provider value={{
      alerts,
      unreadCount,
      loading,
      lastFetched,
      error,
      markRead,
      markAllRead,
      markReadThisSession,
      isAlertReadThisSession,
      refresh: fetchAlerts,
    }}>
      {children}
    </AlertsCtx.Provider>
  )
}

export function useAlerts() {
  const ctx = useContext(AlertsCtx)
  if (!ctx) throw new Error('useAlerts must be used inside AlertsProvider')
  return ctx
}
