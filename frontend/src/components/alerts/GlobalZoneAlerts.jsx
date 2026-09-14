import React, { useState, useEffect, useRef, useCallback } from 'react'
import { LogIn, LogOut, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'
import { playBellNotification } from '../../utils/bellNotification.js'
import './GlobalZoneAlerts.css'

const TOAST_EXIT_MS = 200
const POLL_INTERVAL_MS = 12_000

export default function GlobalZoneAlerts() {
  const { accessToken, isAdmin } = useAuth()
  const alertsCtx = useAlerts()

  const [queue, setQueue] = useState([])
  const [leavingId, setLeavingId] = useState(null)

  const seenIdsRef = useRef(new Set())
  const lastServerTimeRef = useRef(null)
  const timerRef = useRef(null)

  // Poll for real-time zone activity across ALL devices and ALL zones
  const pollActivity = useCallback(async () => {
    if (!accessToken || !isAdmin) return

    try {
      let url = '/api/geofence/activity'
      if (lastServerTimeRef.current) {
        url += `?since=${encodeURIComponent(lastServerTimeRef.current)}`
      } else {
        // First load: only check crossings in the last 5 minutes to avoid stale notifications
        const initialSince = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        url += `?since=${encodeURIComponent(initialSince)}`
      }

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) return
      const data = await res.json()
      if (data.server_time) {
        lastServerTimeRef.current = data.server_time
      }

      const events = Array.isArray(data.events) ? data.events : []
      const freshEvents = []

      for (const ev of events) {
        if (!ev || !ev.id) continue
        if (seenIdsRef.current.has(ev.id)) continue
        seenIdsRef.current.add(ev.id)
        freshEvents.push(ev)
      }

      if (freshEvents.length > 0) {
        // Play bell notification tone
        playBellNotification()

        // Append to toast queue
        setQueue(prev => [...prev, ...freshEvents])

        // Trigger background refresh of general alerts badge in header
        alertsCtx?.refresh?.()
      }
    } catch (err) {
      // Background poll failure is non-fatal
    }
  }, [accessToken, isAdmin, alertsCtx])

  useEffect(() => {
    if (!accessToken || !isAdmin) return

    // Initial poll
    pollActivity()

    const interval = setInterval(pollActivity, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [accessToken, isAdmin, pollActivity])

  // Dismiss current alert
  const handleDismiss = useCallback((target) => {
    if (!target || leavingId) return
    setLeavingId(target.id)
    clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      setQueue(prev => prev.filter(item => item.id !== target.id))
      setLeavingId(null)
    }, TOAST_EXIT_MS)
  }, [leavingId])

  // Dismiss all queued alerts
  const handleDismissAll = useCallback(() => {
    clearTimeout(timerRef.current)
    setLeavingId(null)
    setQueue([])
  }, [])

  if (!isAdmin || queue.length === 0) return null

  const current = queue[0]
  if (!current) return null

  const isEnter = current.type === 'ENTER'
  const Icon = isEnter ? LogIn : LogOut
  const queuedCount = queue.length - 1

  return (
    <div className="global-zone-toast-layer" aria-live="polite" aria-label="Global zone alerts">
      <div
        key={current.id}
        role="alert"
        className={`global-zone-toast ${isEnter ? 'enter' : 'exit'}${leavingId === current.id ? ' leaving' : ''}`}
      >
        <Icon className="global-zone-toast-icon" />

        <div className="global-zone-toast-body">
          <div className="global-zone-toast-header">
            <span className="global-zone-toast-badge">
              {isEnter ? 'Zone Entry' : 'Zone Exit'}
            </span>
            <div className="global-zone-toast-title">
              {current.deviceName || current.sn}
            </div>
          </div>

          <div className="global-zone-toast-desc">
            {isEnter
              ? `Entered zone "${current.zoneName}"`
              : `Exited zone "${current.zoneName}"`}
          </div>

          <div className="global-zone-toast-meta">
            SN: {current.sn} · {current.timestamp ? new Date(current.timestamp).toLocaleTimeString() : 'Just now'}
          </div>
        </div>

        <div className="global-zone-toast-actions">
          {queuedCount > 0 && (
            <button
              className="global-zone-toast-all"
              onClick={handleDismissAll}
              title={`Dismiss all ${queue.length} alerts`}
            >
              Dismiss all ({queue.length})
            </button>
          )}
          <button
            className="global-zone-toast-x"
            onClick={() => handleDismiss(current)}
            title="Dismiss alert"
            aria-label="Dismiss alert"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>
    </div>
  )
}
