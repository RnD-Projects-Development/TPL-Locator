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

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS  = 5 * 60 * 1000   // 5 minutes
const BATTERY_THRESHOLD = 25               // percent
const OFFLINE_HOURS     = 24              // hours
const GEO_WINDOW_MS     = 24 * 60 * 60 * 1000  // only show geofence events from last 24 h
const LS_KEY            = 'tpl_alert_read_ids'

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadReadIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')) }
  catch { return new Set() }
}

function persistReadIds(set) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])) }
  catch {}
}

// ─── Alert builders ───────────────────────────────────────────────────────────

function deviceName(d) {
  return d.name || d.assigned_name || d.assigned_user_name || d.sn || '—'
}

function buildBatteryAlert(device, readIds) {
  const battery = typeof device.battery === 'number' ? device.battery : -1
  if (battery <= 0 || battery >= BATTERY_THRESHOLD) return null

  const id       = `BATT-${device.sn}`
  const name     = deviceName(device)
  const severity = battery < 10 ? 'critical' : 'high'

  return {
    id,
    type:       'BATTERY_LOW',
    severity,
    deviceId:   device.sn,
    deviceName: name,
    message:    `Battery low for ${name} (${battery}%)`,
    timestamp:  device.dataRetrievalTime || new Date().toISOString(),
    isRead:     readIds.has(id),
  }
}

function buildOfflineAlert(device, readIds) {
  const ts      = device.dataRetrievalTime
  const hoursAgo = ts
    ? (Date.now() - new Date(ts).getTime()) / 3_600_000
    : Infinity

  if (hoursAgo < OFFLINE_HOURS) return null

  const id       = `OFFLINE-${device.sn}`
  const name     = deviceName(device)
  const hLabel   = hoursAgo === Infinity ? 'an unknown duration' : `${Math.round(hoursAgo)} hours`
  const severity = hoursAgo > 48 ? 'critical' : 'high'

  return {
    id,
    type:       'DEVICE_OFFLINE',
    severity,
    deviceId:   device.sn,
    deviceName: name,
    message:    `${name} has been inactive for more than ${hLabel}`,
    timestamp:  ts || new Date(0).toISOString(),
    isRead:     readIds.has(id),
  }
}

function buildGeofenceAlerts(zoneId, events, nameBySn, readIds) {
  const cutoff = Date.now() - GEO_WINDOW_MS
  const alerts = []

  for (const e of events) {
    if (!e.timestamp) continue
    if (new Date(e.timestamp).getTime() < cutoff) continue

    // Compact timestamp for stable ID: strip non-alphanumeric chars
    const tsCompact = e.timestamp.replace(/\D/g, '')
    const id        = `GEO-${e.sn}-${tsCompact}`
    const name      = nameBySn[e.sn] || e.sn
    const entered   = e.type === 'ENTER'
    const zoneLabel = zoneId.replace(/_/g, ' ').toUpperCase()

    alerts.push({
      id,
      type:       'GEOFENCE',
      severity:   entered ? 'medium' : 'high',
      deviceId:   e.sn,
      deviceName: name,
      message:    `${name} ${entered ? 'entered' : 'exited'} zone ${zoneLabel}`,
      timestamp:  e.timestamp,
      isRead:     readIds.has(id),
    })
  }

  return alerts
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AlertsCtx = createContext(null)

export function AlertsProvider({ children }) {
  const { accessToken } = useAuth()

  const [alerts,      setAlerts]      = useState([])
  const [loading,     setLoading]     = useState(false)
  const [lastFetched, setLastFetched] = useState(null)
  const [error,       setError]       = useState(null)

  const readIdsRef  = useRef(loadReadIds())
  const intervalRef = useRef(null)

  // ── Core fetch ─────────────────────────────────────────────────────────────

  const fetchAlerts = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)

    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    const readIds = readIdsRef.current
    const all     = []

    try {
      // ── 1. Device anomalies (battery + offline) — first 200 devices only ──────
      let nameBySn = {}
      try {
        const res  = await fetch('/api/devices?page=1&limit=200', { headers })
        if (res.ok) {
          const raw     = await res.json()
          const devices = Array.isArray(raw) ? raw : (raw?.devices ?? [])

          for (const d of devices) {
            if (d.sn) nameBySn[d.sn] = deviceName(d)

            const battAlert    = buildBatteryAlert(d, readIds)
            const offlineAlert = buildOfflineAlert(d, readIds)
            if (battAlert)    all.push(battAlert)
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
          const zoneIds    = Object.keys(statusData?.zones ?? {})

          // Fetch report for every zone in parallel (capped at 10 zones)
          const batch = zoneIds.slice(0, 10)
          const reportResults = await Promise.allSettled(
            batch.map(zid =>
              fetch(`/api/geofence/report/${encodeURIComponent(zid)}`, { headers })
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
      const activeIds   = new Set(all.map(a => a.id))
      const cleanedIds  = new Set([...readIds].filter(id => activeIds.has(id)))
      readIdsRef.current = cleanedIds
      persistReadIds(cleanedIds)

      // ── 5. Apply current read state ───────────────────────────────────────
      setAlerts(all.map(a => ({ ...a, isRead: cleanedIds.has(a.id) })))
      setLastFetched(Date.now())
    } catch (err) {
      setError(err.message || 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  // ── Polling ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!accessToken) {
      setAlerts([])
      setLastFetched(null)
      clearInterval(intervalRef.current)
      return
    }
    fetchAlerts()
    intervalRef.current = setInterval(fetchAlerts, POLL_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [accessToken, fetchAlerts])

  // ── Actions ────────────────────────────────────────────────────────────────

  const markRead = useCallback((id) => {
    readIdsRef.current = new Set([...readIdsRef.current, id])
    persistReadIds(readIdsRef.current)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a))
  }, [])

  const markAllRead = useCallback(() => {
    setAlerts(prev => {
      const newIds = new Set([...readIdsRef.current, ...prev.map(a => a.id)])
      readIdsRef.current = newIds
      persistReadIds(newIds)
      return prev.map(a => ({ ...a, isRead: true }))
    })
  }, [])

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
