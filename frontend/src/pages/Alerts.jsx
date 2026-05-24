import React, { useState, useMemo } from 'react'
import { Bell, CheckCheck, AlertOctagon, AlertTriangle, Shield, Battery, RefreshCw, Wifi } from 'lucide-react'
import { useAlerts } from '../context/AlertsContext.jsx'

// ─── Style constants ──────────────────────────────────────────────────────────

const panel = {
  background:   '#242323',
  border:       '1px solid rgba(255,255,255,0.07)',
  borderRadius: 18,
  boxShadow:    '0 8px 32px rgba(0,0,0,0.45)',
}

const TYPE_CONFIG = {
  GEOFENCE:       { label: 'Geofence Alert',  Icon: Shield,        color: '#FBBF24', bg: 'rgba(251,191,36,0.08)',   border: 'rgba(251,191,36,0.22)' },
  BATTERY_LOW:    { label: 'Low Battery',     Icon: Battery,       color: '#FB923C', bg: 'rgba(251,146,60,0.08)',   border: 'rgba(251,146,60,0.22)' },
  DEVICE_OFFLINE: { label: 'Device Offline',  Icon: AlertOctagon,  color: '#F87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.22)' },
}

const SEV_CONFIG = {
  critical: { color: '#F87171', bg: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)' },
  high:     { color: '#FB923C', bg: 'rgba(251,146,60,0.12)',  border: '1px solid rgba(251,146,60,0.30)' },
  medium:   { color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: '1px solid rgba(251,191,36,0.30)' },
  low:      { color: '#A78BFA', bg: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.25)' },
}

const FILTER_TABS  = ['All', 'Unread', 'Read']
const TYPE_FILTERS = ['All', 'GEOFENCE', 'BATTERY_LOW', 'DEVICE_OFFLINE']

function fmtTime(ts) {
  if (!ts) return '—'
  const d    = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 60_000   // minutes
  if (diff < 1)    return 'Just now'
  if (diff < 60)   return `${Math.round(diff)}m ago`
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function fmtLastFetched(ts) {
  if (!ts) return null
  const d = new Date(ts)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Alerts() {
  const { alerts, unreadCount, loading, lastFetched, error, markRead, markAllRead, refresh } = useAlerts()

  const [readFilter, setReadFilter]  = useState('All')
  const [typeFilter, setTypeFilter]  = useState('All')

  const filtered = useMemo(() => alerts.filter(a => {
    const readOk = readFilter === 'All'
      || (readFilter === 'Unread' ? !a.isRead : a.isRead)
    const typeOk = typeFilter === 'All' || a.type === typeFilter
    return readOk && typeOk
  }), [alerts, readFilter, typeFilter])

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const readCount     = alerts.filter(a => a.isRead).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
            <Bell style={{ width: 22, height: 22, color: '#A72C32' }} />
            Alerts & Notifications
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 4 }}>
            Live anomaly alerts — battery, offline, and geofence events
            {lastFetched && (
              <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.20)' }}>
                · updated {fmtLastFetched(lastFetched)}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 12, color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.50)'; e.currentTarget.style.color = '#A72C32' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}>
              <CheckCheck style={{ width: 13, height: 13 }} /> Mark all read
            </button>
          )}

          {criticalCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
              background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.30)', borderRadius: 12 }}>
              <AlertOctagon style={{ width: 13, height: 13, color: '#F87171' }} />
              <span style={{ color: '#F87171', fontSize: 12, fontWeight: 700 }}>{criticalCount} Critical</span>
            </div>
          )}

          <button onClick={refresh} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              cursor: loading ? 'not-allowed' : 'pointer', color: loading ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.50)' }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.color = '#FFFFFF' }}
            onMouseLeave={e => { e.currentTarget.style.color = loading ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.50)' }}>
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Stats grid ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Alerts', value: alerts.length,  color: 'rgba(255,255,255,0.75)' },
          { label: 'Unread',       value: unreadCount,    color: '#A72C32' },
          { label: 'Critical',     value: criticalCount,  color: '#F87171' },
          { label: 'Read',         value: readCount,      color: '#34D399' },
        ].map(s => (
          <div key={s.label} style={{ ...panel, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>

        {/* Read/Unread toggle */}
        <div style={{ display: 'flex', gap: 2, padding: 4,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
          {FILTER_TABS.map(f => {
            const active = readFilter === f
            return (
              <button key={f} onClick={() => setReadFilter(f)}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  background: active ? '#A72C32' : 'transparent',
                  color:      active ? '#FFFFFF' : 'rgba(255,255,255,0.40)' }}>
                {f}
                {f === 'Unread' && unreadCount > 0 && (
                  <span style={{ minWidth: 16, height: 16, borderRadius: 8, background: '#F87171',
                    color: '#FFFFFF', fontSize: 9, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                    {unreadCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', gap: 2, padding: 4,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
          {TYPE_FILTERS.map(t => {
            const active = typeFilter === t
            const cfg    = TYPE_CONFIG[t]
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  background: active ? (cfg ? cfg.bg : 'rgba(255,255,255,0.08)') : 'transparent',
                  color:      active ? (cfg ? cfg.color : '#FFFFFF') : 'rgba(255,255,255,0.40)' }}>
                {t === 'All' ? 'All Types' : (cfg?.label ?? t)}
              </button>
            )
          })}
        </div>

        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────── */}
      {error && (
        <div style={{ ...panel, padding: '12px 16px', background: 'rgba(248,113,113,0.06)',
          border: '1px solid rgba(248,113,113,0.20)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle style={{ width: 15, height: 15, color: '#F87171', flexShrink: 0 }} />
          <span style={{ color: 'rgba(248,113,113,0.80)', fontSize: 12 }}>{error}</span>
        </div>
      )}

      {/* ── Alert list ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Loading skeleton */}
        {loading && alerts.length === 0 && (
          [1,2,3].map(i => (
            <div key={i} style={{ ...panel, padding: 20, opacity: 0.5 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ width: '40%', height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }} />
                  <div style={{ width: '70%', height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.04)' }} />
                </div>
              </div>
            </div>
          ))
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ ...panel, padding: '64px 24px', textAlign: 'center' }}>
            <Wifi style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.12)', margin: '0 auto 14px' }} />
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: 600 }}>
              {alerts.length === 0 ? 'No anomalies detected' : 'No alerts match your filters'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.20)', fontSize: 12, marginTop: 6 }}>
              {alerts.length === 0
                ? 'All devices are healthy — battery OK, online, within geofence bounds'
                : 'Try changing the filter above'}
            </p>
          </div>
        )}

        {/* Alert rows */}
        {filtered.map(alert => {
          const cfg   = TYPE_CONFIG[alert.type] || TYPE_CONFIG.DEVICE_OFFLINE
          const sevCfg = SEV_CONFIG[alert.severity] || SEV_CONFIG.medium
          const { Icon } = cfg

          return (
            <div key={alert.id}
              style={{ ...panel, padding: 16,
                background: alert.isRead ? '#1e1e1e' : cfg.bg,
                border: `1px solid ${alert.isRead ? 'rgba(255,255,255,0.05)' : cfg.border}`,
                opacity: alert.isRead ? 0.65 : 1,
                transition: 'opacity 0.2s ease' }}>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>

                {/* Type icon */}
                <div style={{ padding: 10, borderRadius: 12, background: cfg.bg,
                  border: `1px solid ${cfg.border}`, flexShrink: 0 }}>
                  <Icon style={{ width: 16, height: 16, color: cfg.color }} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexWrap: 'wrap', gap: 8, marginBottom: 5 }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 13 }}>
                        {cfg.label}
                      </span>
                      {/* Severity badge */}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: sevCfg.bg, border: sevCfg.border, color: sevCfg.color,
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {alert.severity}
                      </span>
                      {/* Unread dot */}
                      {!alert.isRead && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#A72C32',
                          flexShrink: 0, display: 'inline-block' }} />
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
                        {fmtTime(alert.timestamp)}
                      </span>
                      {!alert.isRead && (
                        <button onClick={() => markRead(alert.id)}
                          style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, cursor: 'pointer',
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                            color: 'rgba(255,255,255,0.40)', fontWeight: 600 }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.50)'; e.currentTarget.style.color = '#A72C32' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.40)' }}>
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message */}
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 1.5 }}>
                    {alert.message}
                  </div>

                  {/* Device ID footer */}
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600,
                      color: /^\d+$/.test(String(alert.deviceId)) ? '#A78BFA' : '#A72C32' }}>
                      {alert.deviceId}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 10 }}>
                      {alert.id}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Spin keyframe injected once */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
