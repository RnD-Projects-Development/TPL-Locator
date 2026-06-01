import React, { useState, useMemo } from 'react'
import { Bell, CheckCheck, AlertOctagon, AlertTriangle, Shield, Battery, RefreshCw, Wifi } from 'lucide-react'
import { useAlerts } from '../context/AlertsContext.jsx'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'

// ─── Dark theme configs (original) ────────────────────────────────────────────

const TYPE_CONFIG_DARK = {
  GEOFENCE:       { label: 'Geofence Alert',  Icon: Shield,       color: '#FBBF24', bg: 'rgba(251,191,36,0.08)',   border: 'rgba(251,191,36,0.22)' },
  BATTERY_LOW:    { label: 'Low Battery',     Icon: Battery,      color: '#FB923C', bg: 'rgba(251,146,60,0.08)',   border: 'rgba(251,146,60,0.22)' },
  DEVICE_OFFLINE: { label: 'Device Offline',  Icon: AlertOctagon, color: '#F87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.22)' },
}

const SEV_CONFIG_DARK = {
  critical: { color: '#F87171', bg: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.35)' },
  high:     { color: '#FB923C', bg: 'rgba(251,146,60,0.12)',  border: '1px solid rgba(251,146,60,0.30)' },
  medium:   { color: '#FBBF24', bg: 'rgba(251,191,36,0.12)',  border: '1px solid rgba(251,191,36,0.30)' },
  low:      { color: '#A78BFA', bg: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.25)' },
}

// ─── Light theme configs (enterprise) ─────────────────────────────────────────

const TYPE_CONFIG_LIGHT = {
  GEOFENCE:       { label: 'Geofence Alert',  Icon: Shield,       color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  BATTERY_LOW:    { label: 'Low Battery',     Icon: Battery,      color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  DEVICE_OFFLINE: { label: 'Device Offline',  Icon: AlertOctagon, color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
}

const SEV_CONFIG_LIGHT = {
  critical: { color: '#DC2626', bg: '#FEF2F2', border: '1px solid #FECACA' },
  high:     { color: '#EA580C', bg: '#FFF7ED', border: '1px solid #FED7AA' },
  medium:   { color: '#D97706', bg: '#FFFBEB', border: '1px solid #FDE68A' },
  low:      { color: '#2563EB', bg: '#EFF6FF', border: '1px solid #BFDBFE' },
}

const FILTER_TABS  = ['All', 'Unread', 'Read']
const TYPE_FILTERS = ['All', 'GEOFENCE', 'BATTERY_LOW', 'DEVICE_OFFLINE']

function fmtTime(ts) {
  if (!ts) return '—'
  const d    = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 60_000
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
  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  // Brand auburn — solid accent border on primary light-mode cards.
  const auburn = '#A72C32'
  const cardAccent = isLight ? { borderLeft: `3px solid ${auburn}` } : null

  const [readFilter, setReadFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')

  const TYPE_CONFIG = isLight ? TYPE_CONFIG_LIGHT : TYPE_CONFIG_DARK
  const SEV_CONFIG  = isLight ? SEV_CONFIG_LIGHT  : SEV_CONFIG_DARK

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const panel = isLight
    ? { background: 'linear-gradient(145deg, #FFFFFF 0%, #F0F0F0 50%, #DCDCDC 100%)', border: '1px solid #C9C9C9', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: '#242323', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }

  const T = {
    txt1:      isLight ? '#000000' : '#FFFFFF',
    txt2:      isLight ? '#333333' : 'rgba(255,255,255,0.35)',
    txt3:      isLight ? '#333333' : 'rgba(255,255,255,0.25)',
    accent:    isLight ? '#DC2626' : '#A72C32',
    divider:   isLight ? '#CFCFCF' : 'rgba(255,255,255,0.05)',
    tabBg:     isLight ? '#DCDCDC' : 'rgba(255,255,255,0.04)',
    tabBdr:    isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    tabTxt:    isLight ? '#333333' : 'rgba(255,255,255,0.40)',
    btnGhostBg: isLight ? '#A72C32' : 'rgba(255,255,255,0.04)',
    btnGhostBdr: isLight ? '#8B2328' : 'rgba(255,255,255,0.10)',
    btnGhostTxt: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
    criticalBg:  isLight ? '#FEF2F2' : 'rgba(248,113,113,0.10)',
    criticalBdr: isLight ? '#FECACA' : 'rgba(248,113,113,0.30)',
    criticalTxt: isLight ? '#DC2626' : '#F87171',
    readCardBg:  isLight ? '#DCDCDC' : '#1e1e1e',
    readCardBdr: isLight ? '#CFCFCF' : 'rgba(255,255,255,0.05)',
    skeletonBg:  isLight ? '#D2D2D2' : 'rgba(255,255,255,0.06)',
    monoAccent:  isLight ? '#DC2626' : '#A72C32',
    monoViolet:  isLight ? '#7C3AED' : '#A78BFA',
    unreadDot:   isLight ? '#DC2626' : '#A72C32',
    btnMarkBg:   isLight ? '#A72C32' : 'transparent',
    btnMarkBdr:  isLight ? '#8B2328' : 'rgba(255,255,255,0.12)',
    btnMarkTxt:  isLight ? '#FFFFFF' : 'rgba(255,255,255,0.40)',
    countChipBg: isLight ? '#FEF2F2' : 'rgba(248,113,113,0.10)',
    countChipBdr: isLight ? '#FECACA' : 'rgba(248,113,113,0.30)',
  }

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

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: isLight ? 26 : 22, fontWeight: 800, color: T.txt1, letterSpacing: isLight ? '-0.02em' : '-0.03em', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: isLight ? '#A72C32' : 'rgba(167,44,50,0.14)',
              border: `1px solid ${isLight ? '#8B2328' : 'rgba(167,44,50,0.24)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bell style={{ width: 22, height: 22, color: isLight ? '#FFFFFF' : '#C86068', fill: isLight ? 'rgba(255,255,255,0.18)' : 'rgba(200,96,104,0.18)', strokeWidth: 2.4 }} />
            </div>
            Alerts & Notifications
          </h1>
          {lastFetched && (
            <p style={{ color: isLight ? '#000000' : T.txt2, fontSize: 15, marginTop: 8, marginBottom: 0, paddingLeft: 56 }}>
              updated {fmtLastFetched(lastFetched)}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
                background: T.btnGhostBg, border: `1px solid ${T.btnGhostBdr}`,
                borderRadius: 12, color: T.btnGhostTxt, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => { if (isLight) { e.currentTarget.style.background = '#8B2328' } else { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.50)'; e.currentTarget.style.color = T.accent } }}
              onMouseLeave={e => { if (isLight) { e.currentTarget.style.background = T.btnGhostBg } else { e.currentTarget.style.borderColor = T.btnGhostBdr; e.currentTarget.style.color = T.btnGhostTxt } }}>
              <CheckCheck style={{ width: 13, height: 13 }} /> Mark all read
            </button>
          )}

          {criticalCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
              background: T.criticalBg, border: `1px solid ${T.criticalBdr}`, borderRadius: 12 }}>
              <AlertOctagon style={{ width: 13, height: 13, color: T.criticalTxt }} />
              <span style={{ color: T.criticalTxt, fontSize: 12, fontWeight: 700 }}>{criticalCount} Critical</span>
            </div>
          )}

          <button onClick={refresh} disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 10,
              background: T.btnGhostBg, border: `1px solid ${T.btnGhostBdr}`,
              cursor: loading ? 'not-allowed' : 'pointer', color: loading ? T.txt3 : T.btnGhostTxt }}
            onMouseEnter={e => { if (!loading) { if (isLight) e.currentTarget.style.background = '#8B2328'; else e.currentTarget.style.color = T.txt1 } }}
            onMouseLeave={e => { if (isLight) e.currentTarget.style.background = T.btnGhostBg; else e.currentTarget.style.color = loading ? T.txt3 : T.btnGhostTxt }}>
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Stats grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total Alerts', value: alerts.length,  color: T.txt1 },
          { label: 'Unread',       value: unreadCount,    color: T.accent },
          { label: 'Critical',     value: criticalCount,  color: T.criticalTxt },
          { label: 'Read',         value: readCount,      color: isLight ? '#059669' : '#34D399' },
        ].map(s => (
          <div key={s.label} style={{ ...panel, ...(cardAccent || {}), padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.txt2, marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>

        {/* Read/Unread toggle */}
        <div style={{ display: 'flex', gap: 2, padding: 4,
          background: T.tabBg, border: `1px solid ${T.tabBdr}`, borderRadius: 12 }}>
          {FILTER_TABS.map(f => {
            const active = readFilter === f
            return (
              <button key={f} onClick={() => setReadFilter(f)}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  background: active ? T.accent : 'transparent',
                  color:      active ? '#FFFFFF' : T.tabTxt }}>
                {f}
                {f === 'Unread' && unreadCount > 0 && (
                  <span style={{ minWidth: 16, height: 16, borderRadius: 8,
                    background: isLight ? '#DC2626' : '#F87171',
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
          background: T.tabBg, border: `1px solid ${T.tabBdr}`, borderRadius: 12 }}>
          {TYPE_FILTERS.map(t => {
            const active = typeFilter === t
            const cfg    = TYPE_CONFIG[t]
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ padding: '5px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                  background: active ? (cfg ? cfg.bg : (isLight ? '#CCCCCC' : 'rgba(255,255,255,0.08)')) : 'transparent',
                  color:      active ? (cfg ? cfg.color : T.txt1) : T.tabTxt }}>
                {t === 'All' ? 'All Types' : (cfg?.label ?? t)}
              </button>
            )
          })}
        </div>

        <span style={{ color: T.txt3, fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ ...panel, padding: '12px 16px',
          background: isLight ? '#FEF2F2' : 'rgba(248,113,113,0.06)',
          border: isLight ? '1px solid #FECACA' : '1px solid rgba(248,113,113,0.20)',
          display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle style={{ width: 15, height: 15, color: T.criticalTxt, flexShrink: 0 }} />
          <span style={{ color: T.criticalTxt, fontSize: 12 }}>{error}</span>
        </div>
      )}

      {/* ── Alert list ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Loading skeleton */}
        {loading && alerts.length === 0 && (
          <TPLLoader label="Loading alerts…" />
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div style={{ ...panel, padding: '64px 24px', textAlign: 'center' }}>
            <Wifi style={{ width: 40, height: 40, color: T.txt3, margin: '0 auto 14px' }} />
            <p style={{ color: T.txt2, fontSize: 14, fontWeight: 600 }}>
              {alerts.length === 0 ? 'No anomalies detected' : 'No alerts match your filters'}
            </p>
            <p style={{ color: T.txt3, fontSize: 12, marginTop: 6 }}>
              {alerts.length === 0
                ? 'All devices are healthy — battery OK, online, within geofence bounds'
                : 'Try changing the filter above'}
            </p>
          </div>
        )}

        {/* Alert rows */}
        {filtered.map(alert => {
          const cfg    = TYPE_CONFIG[alert.type] || TYPE_CONFIG.DEVICE_OFFLINE
          const sevCfg = SEV_CONFIG[alert.severity] || SEV_CONFIG.medium
          const { Icon } = cfg

          return (
            <div key={alert.id}
              style={{ ...panel, padding: 16,
                background: alert.isRead
                  ? T.readCardBg
                  : (isLight ? cfg.bg : cfg.bg),
                border: `1px solid ${alert.isRead ? T.readCardBdr : cfg.border}`,
                opacity: alert.isRead ? 0.70 : 1,
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
                      <span style={{ color: T.txt1, fontWeight: 600, fontSize: 13 }}>
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
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.unreadDot,
                          flexShrink: 0, display: 'inline-block' }} />
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: T.txt3, fontSize: 11 }}>
                        {fmtTime(alert.timestamp)}
                      </span>
                      {!alert.isRead && (
                        <button onClick={() => markRead(alert.id)}
                          style={{ fontSize: 11, padding: '3px 9px', borderRadius: 8, cursor: 'pointer',
                            background: T.btnMarkBg, border: `1px solid ${T.btnMarkBdr}`,
                            color: T.btnMarkTxt, fontWeight: 600 }}
                          onMouseEnter={e => { if (isLight) { e.currentTarget.style.background = '#8B2328' } else { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.50)'; e.currentTarget.style.color = T.accent } }}
                          onMouseLeave={e => { if (isLight) { e.currentTarget.style.background = T.btnMarkBg } else { e.currentTarget.style.borderColor = T.btnMarkBdr; e.currentTarget.style.color = T.btnMarkTxt } }}>
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Message */}
                  <div style={{ color: T.txt2, fontSize: 12, lineHeight: 1.5 }}>
                    {alert.message}
                  </div>

                  {/* Device ID footer */}
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600,
                      color: /^\d+$/.test(String(alert.deviceId)) ? T.monoViolet : T.monoAccent }}>
                      {alert.deviceId}
                    </span>
                    <span style={{ color: T.txt3, fontSize: 10 }}>
                      {alert.id}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
