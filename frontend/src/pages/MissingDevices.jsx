import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertOctagon, AlertTriangle, Shield, Clock,
  Battery, MapPin, Radio, Tag, Search, X,
} from 'lucide-react'
import { useHomePageCache } from '../context/HomePageCacheContext.jsx'
import { usePaginatedDevices } from '../hooks/usePaginatedDevices.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'

/* ── Recovery score (decreases 1.8%/h from last contact) ─────────────────── */
function recoveryScore(hoursAgo, detections) {
  const base  = Math.max(0, 100 - hoursAgo * 1.8)
  const bonus = Math.min(10, (detections || 0) * 0.05)
  return Math.round(Math.max(5, base + bonus))
}
const recoveryColor = s => s > 60 ? '#059669' : s > 30 ? '#D97706' : '#DC2626'
const recoveryLabel = s => s > 60 ? 'Likely nearby' : s > 30 ? 'Uncertain' : 'Critical'

/* ── Relative time formatter ──────────────────────────────────────────────── */
function fmtHours(h) {
  if (h < 1)   return `${Math.round(h * 60)}m ago`
  if (h < 24)  return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

/* ── Absolute "last seen" formatter ───────────────────────────────────────── */
function fmtLastSeen(ts) {
  if (!ts) return 'No record'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return 'No record'
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ── Battery progress bar ─────────────────────────────────────────────────── */
function BattBar({ v, isLight }) {
  const pct   = Math.max(0, Math.min(100, v || 0))
  const color = pct > 40 ? '#059669' : pct > 20 ? '#D97706' : '#DC2626'
  const trackBg = isLight ? '#F3F4F6' : 'rgba(255,255,255,0.08)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ display: 'inline-block', width: 44, height: 4, borderRadius: 3, background: trackBg, flexShrink: 0 }}>
        <span style={{ display: 'block', height: 4, borderRadius: 3, width: `${pct}%`, background: color }} />
      </span>
      <span style={{ fontSize: 10, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{pct}%</span>
    </span>
  )
}

/* ── Recovery donut ───────────────────────────────────────────────────────── */
function RecoveryDonut({ score, isLight }) {
  const color = recoveryColor(score)
  const label = recoveryLabel(score)
  const r     = 20
  const circ  = 2 * Math.PI * r
  const dash  = (score / 100) * circ
  const trackColor = isLight ? '#CACACA' : 'rgba(255,255,255,0.06)'
  const labelColor = isLight ? '#333333' : 'rgba(255,255,255,0.32)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0, minWidth: 60 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Recovery</span>
      <div style={{ position: 'relative', width: 52, height: 52 }}>
        <svg width={52} height={52} viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)', display: 'block' }}>
          <circle cx={26} cy={26} r={r} fill="none" stroke={trackColor} strokeWidth={5} />
          <circle cx={26} cy={26} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color }}>{score}%</span>
        </div>
      </div>
      <span style={{ fontSize: 9, color: labelColor, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
    </div>
  )
}

/* ── Status pill ──────────────────────────────────────────────────────────── */
function StatusPill({ status, isLight }) {
  const isMissing = status === 'Missing'
  const darkClr  = isMissing ? '#fca5a5' : '#fbbf24'
  const bg       = isLight ? (isMissing ? '#DC2626' : '#D97706') : 'transparent'
  const color    = isLight ? '#FFFFFF' : darkClr
  const border   = isLight ? (isMissing ? '#B91C1C' : '#B45309') : (isMissing ? 'rgba(239,68,68,0.45)' : 'rgba(245,158,11,0.45)')
  const dotColor = isLight ? '#FFFFFF' : darkClr
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, animation: 'mdPulse 2s ease-in-out infinite', flexShrink: 0 }} />
      {status}
    </span>
  )
}

/* ── Recovery pill (score > 30 → recovery possible) ───────────────────────── */
function RecoveryPill({ possible, isLight }) {
  const darkClr = possible ? '#6ee7b7' : 'rgba(255,255,255,0.55)'
  const bg      = isLight ? (possible ? '#059669' : '#6B7280') : 'transparent'
  const color   = isLight ? '#FFFFFF' : darkClr
  const border  = isLight ? (possible ? '#047857' : '#4B5563') : (possible ? 'rgba(5,150,105,0.45)' : 'rgba(255,255,255,0.22)')
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      <Shield style={{ width: 10, height: 10, flexShrink: 0 }} />
      {possible ? 'Recovery Possible' : 'Recovery Unlikely'}
    </span>
  )
}

/* ── Device card ──────────────────────────────────────────────────────────── */
function DeviceCard({ device, navigate, isLight, T }) {
  const [hov, setHov] = useState(false)
  const isMissing  = device.status === 'Missing'
  const battery    = device.battery ?? 0
  const hasLoc     = !!device.lastLocation && device.lastLocation !== '' && device.lastLocation !== '—'
  const DeviceIcon = device.deviceType === 'sticker' ? Tag : Radio
  const accentClr  = isMissing ? (isLight ? '#DC2626' : '#fca5a5') : (isLight ? '#D97706' : '#fbbf24')
  const accentHardClr = isMissing ? '#DC2626' : '#D97706'

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...T.panel,
        padding: '20px 22px',
        borderLeft: `3px solid ${accentHardClr}`,
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        boxShadow: hov
          ? isLight ? '0 8px 24px rgba(0,0,0,0.10), 0 20px 48px rgba(0,0,0,0.06)' : '0 8px 32px rgba(0,0,0,0.60)'
          : T.panel.boxShadow,
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>

        {/* Icon */}
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: accentHardClr, border: `1px solid ${isMissing ? '#B91C1C' : '#B45309'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DeviceIcon style={{ width: 17, height: 17, color: '#FFFFFF' }} />
        </div>

        {/* Info block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: T.txt1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
              {device.displayName}
            </span>
            <StatusPill status={device.status} isLight={isLight} />
            <RecoveryPill possible={device.recovery > 30} isLight={isLight} />
          </div>

          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: T.txt3, marginBottom: 8 }}>
            {device.id}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', fontSize: 12, color: T.txt2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Clock style={{ width: 12, height: 12, color: accentHardClr, flexShrink: 0 }} />
              {device.lastSeen ? (
                <>
                  <span style={{ fontWeight: 600, color: accentClr }}>{fmtHours(device.hoursAgo)}</span>
                  <span style={{ color: T.txt3 }}>offline</span>
                </>
              ) : (
                <span style={{ fontWeight: 600, color: accentClr }}>No recent contact</span>
              )}
            </span>
            {hasLoc && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <MapPin style={{ width: 12, height: 12, flexShrink: 0, color: T.txt3 }} />
                {device.lastLocation}
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Battery style={{ width: 12, height: 12, color: battery < 25 ? '#DC2626' : T.txt3, flexShrink: 0 }} />
              <BattBar v={battery} isLight={isLight} />
            </span>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: T.txt3, fontFamily: 'var(--font-mono)' }}>
            Last seen: {fmtLastSeen(device.lastSeen)}
          </div>
        </div>

        {/* Recovery donut */}
        <RecoveryDonut score={device.recovery} isLight={isLight} />
      </div>

      {/* Anomaly warning chips + action buttons (one inline row) */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {battery < 25 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: '#DC2626', color: '#FFFFFF', border: '1px solid #B91C1C' }}>
            <Battery style={{ width: 10, height: 10 }} /> Critical battery — may go offline soon
          </span>
        )}
        {device.hoursAgo > 48 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            background: '#D97706', color: '#FFFFFF', border: '1px solid #B45309' }}>
            <AlertTriangle style={{ width: 10, height: 10 }} /> Extended absence — 48h+
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate(`/map?device=${device.id}`)}
          style={{ padding: '6px 14px', background: '#A72C32', border: '1px solid #8B2328', borderRadius: 8, color: '#FFFFFF', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#8B2328' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#A72C32' }}
        >
          View on Map
        </button>
        <button
          onClick={() => navigate(`/trajectory?device=${device.id}`)}
          style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${T.divider}`, borderRadius: 8, color: T.txt2, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? '#D1D5DB' : 'rgba(255,255,255,0.20)'; e.currentTarget.style.color = T.txt1 }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.divider; e.currentTarget.style.color = T.txt2 }}
        >
          View History
        </button>
        <button
          onClick={() => navigate(device.deviceType === 'sticker' ? `/stickers/${device.id}` : `/locators/${device.id}`)}
          style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${T.divider}`, borderRadius: 8, color: T.txt2, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? '#D1D5DB' : 'rgba(255,255,255,0.20)'; e.currentTarget.style.color = T.txt1 }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.divider; e.currentTarget.style.color = T.txt2 }}
        >
          Device Details
        </button>
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export default function MissingDevices({ embedded = false, deviceType = undefined, externalSearch = '' }) {
  const navigate      = useNavigate()
  const { locations } = useHomePageCache()

  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  const muiTheme = useMemo(() => createTheme({
    palette: { mode: isLight ? 'light' : 'dark', primary: { main: '#A72C32', contrastText: '#FFFFFF' } },
  }), [isLight])

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const panel = isLight
    ? { background: 'linear-gradient(145deg, #FFFFFF 0%, #F0F0F0 50%, #DCDCDC 100%)', border: '1px solid #C9C9C9', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: '#242323', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }

  const T = {
    panel,
    txt1:          isLight ? '#000000' : '#f4f4f5',
    txt2:          isLight ? '#333333' : 'rgba(255,255,255,0.50)',
    txt3:          isLight ? '#333333' : 'rgba(255,255,255,0.32)',
    inputBg:       isLight ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
    inputBorder:   isLight ? '#C9C9C9' : 'rgba(255,255,255,0.10)',
    tabBg:         isLight ? '#DCDCDC' : 'rgba(255,255,255,0.05)',
    tabBorder:     isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    fieldBg:       isLight ? '#DCDCDC' : 'rgba(255,255,255,0.04)',
    divider:       isLight ? '#CFCFCF' : 'rgba(255,255,255,0.08)',
    paginBg:       isLight ? '#ECECEC' : 'rgba(255,255,255,0.05)',
    paginBorder:   isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    paginColor:    isLight ? '#333333' : 'rgba(255,255,255,0.68)',
    paginDisabled: isLight ? '#D1D5DB' : 'rgba(255,255,255,0.20)',
  }

  const [searchParams, setSearchParams] = useSearchParams()

  const [filter,     setFilter]  = useState('All')
  const [query,      setQuery]   = useState('')
  const [debouncedQ, setDQ]      = useState('')
  const [sortBy,     setSortBy]  = useState('hours')
  const debounceRef              = useRef(null)

  const handleSearch = useCallback((val) => {
    setQuery(val)
    clearTimeout(debounceRef.current)
    // trimmed (not lowercased) so it is safe to pass to the server as-is
    debounceRef.current = setTimeout(() => setDQ(val.trim()), 300)
  }, [])

  // ── Server-side paginated fetch — same hook & cache as Locators/Stickers ──
  // Always starts from page 1 on mount/refresh; search changes also reset via the effect below
  const {
    devices: offlineDocs, page, totalPages, total, loading,
    hasNextPage, hasPreviousPage, goToPage,
  } = usePaginatedDevices(20, {
    status: 'offline',
    search: embedded ? externalSearch : debouncedQ,
    search_scope: 'sn_name',
    initialPage: 1,
    ...(deviceType ? { device_type: deviceType } : {}),
  })

  // ── Smooth pagination queue ───────────────────────────────────────────────
  const pendingPageRef = useRef(null)
  const loadingRef     = useRef(loading)
  useEffect(() => { loadingRef.current = loading }, [loading])

  // Clear URL page param whenever search term or filter changes → always lands on page 1
  useEffect(() => {
    if (embedded) return
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('page')
      return next
    }, { replace: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, filter, sortBy, embedded])

  useEffect(() => {
    if (!loading && pendingPageRef.current !== null) {
      const p = pendingPageRef.current
      pendingPageRef.current = null
      const safePage = Math.max(1, p)
      if (!embedded) {
        setSearchParams(prev => {
          const next = new URLSearchParams(prev)
          if (safePage <= 1) next.delete('page')
          else next.set('page', String(safePage))
          return next
        }, { replace: true })
      }
      goToPage(safePage)
    }
  }, [loading, goToPage, setSearchParams, embedded])

  // Wrap goToPage to also sync ?page= in the URL (same pattern as Locators)
  const goToPagePersisted = useCallback((nextPage) => {
    const safePage = Math.max(1, Number(nextPage) || 1)
    if (loadingRef.current) {
      pendingPageRef.current = safePage
      return
    }
    if (!embedded) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (safePage <= 1) next.delete('page')
        else next.set('page', String(safePage))
        return next
      }, { replace: true })
    }
    return goToPage(safePage)
  }, [embedded, goToPage, setSearchParams])

  // Keep URL in sync when the hook changes page internally
  useEffect(() => {
    if (embedded) return
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (page <= 1) {
        if (!next.has('page')) return prev
        next.delete('page')
        return next
      }
      if (next.get('page') === String(page)) return prev
      next.set('page', String(page))
      return next
    }, { replace: true })
  }, [embedded, page, setSearchParams])

  /* Enrich offline devices */
  const allDevices = useMemo(() => {
    return (offlineDocs || []).map(d => {
      const loc      = locations?.[d.sn] ?? null
      // Last-seen source priority mirrors the MapView info card (fmtTs):
      // device's own dataRetrievalTime first, then the live location point's
      // timestamp ?? time ?? locTime.
      const lastSeen = d.dataRetrievalTime || loc?.timestamp || loc?.time || loc?.locTime || null
      const hoursAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 99
      if (hoursAgo < 12) return null
      const battery = loc?.batteryStatus ?? (typeof d.battery === 'number' ? d.battery : 0)
      const status  = hoursAgo > 24 ? 'Missing' : 'At Risk'
      return {
        id: d.sn || d.local_id,
        userName: d.assigned_user_name || d.name || d.sn || '—',
        status,
        hoursAgo,
        lastSeen,
        battery,
        lastLocation: d.lastLocation || '',
        detections:   d.detections ?? 0,
        displayName: d.assigned_user_name || d.name || d.sn || '—',
        deviceType:  /^\d+$/.test(String(d.sn ?? '')) ? 'sticker' : 'locator',
        recovery:    recoveryScore(hoursAgo, d.detections ?? 0),
      }
    }).filter(Boolean)
  }, [offlineDocs, locations])

  const missing = useMemo(() => allDevices.filter(d => d.status === 'Missing'), [allDevices])
  const atRisk  = useMemo(() => allDevices.filter(d => d.status === 'At Risk'),  [allDevices])

  const avgHours    = useMemo(() =>
    missing.length ? Math.round(missing.reduce((s, d) => s + d.hoursAgo, 0) / missing.length) : 0,
  [missing])

  const recoverable = useMemo(() => allDevices.filter(d => d.recovery > 30).length, [allDevices])

  const filtered = useMemo(() => {
    let list = filter === 'Missing' ? missing : filter === 'At Risk' ? atRisk : allDevices
    const activeQ = embedded ? externalSearch : debouncedQ
    if (activeQ) {
      const q = activeQ.toLowerCase()
      list = list.filter(d =>
        d.id.toLowerCase().includes(q) ||
        d.displayName.toLowerCase().includes(q) ||
        (d.lastLocation || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'hours')    return b.hoursAgo - a.hoursAgo
      if (sortBy === 'recovery') return b.recovery - a.recovery
      if (sortBy === 'battery')  return a.battery  - b.battery
      return 0
    })
  }, [allDevices, missing, atRisk, filter, debouncedQ, externalSearch, embedded, sortBy])


  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: embedded ? 12 : 24,
      height: embedded ? 'auto' : undefined,
      minHeight: embedded ? 'min-content' : undefined,
      paddingBottom: embedded ? 8 : 0,
    }}>
      <style>{`@keyframes mdPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* ── Header — hidden when embedded ──────────────────────────────────── */}
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: isLight ? 26 : 22, fontWeight: 800, color: T.txt1, letterSpacing: isLight ? '-0.02em' : '-0.03em', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: isLight ? '#A72C32' : 'rgba(167,44,50,0.14)',
                border: `1px solid ${isLight ? '#8B2328' : 'rgba(167,44,50,0.24)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <AlertOctagon style={{ width: 20, height: 20, color: isLight ? '#FFFFFF' : '#C86068' }} />
              </div>
              Offline Device Intelligence
            </h1>
            <p style={{ fontSize: 15, color: T.txt2, marginTop: 8, marginBottom: 0, paddingLeft: 52 }}>
              Devices offline 12–24h are <span style={{ color: isLight ? '#D97706' : '#fbbf24', fontWeight: 600 }}>At Risk</span> · offline 24h+ are <span style={{ color: isLight ? '#DC2626' : '#fca5a5', fontWeight: 600 }}>Missing</span>
            </p>
          </div>
          {missing.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10,
              background: '#DC2626', border: '1px solid #B91C1C' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFFFFF', animation: 'mdPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}>
                {missing.length} device{missing.length !== 1 ? 's' : ''} missing
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

        {/* Search input — hidden when embedded (parent page has search) */}
        {!embedded && (
          <div style={{ position: 'relative', flex: '0 0 220px' }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3, pointerEvents: 'none' }} />
            <input
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search devices…"
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 32, paddingRight: query ? 30 : 12, paddingTop: 8, paddingBottom: 8,
                background: T.inputBg, border: `1px solid ${T.inputBorder}`,
                borderRadius: 10, color: T.txt1, fontSize: 12, outline: 'none',
                fontFamily: 'var(--font-sans)', boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
              }}
              onFocus={e => { e.target.style.borderColor = '#A72C32'; e.target.style.boxShadow = '0 0 0 3px rgba(167,44,50,0.12)' }}
              onBlur={e  => { e.target.style.borderColor = T.inputBorder; e.target.style.boxShadow = isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none' }}
            />
            {query && (
              <button
                onClick={() => handleSearch('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 2, display: 'flex', alignItems: 'center' }}
              >
                <X style={{ width: 12, height: 12 }} />
              </button>
            )}
          </div>
        )}

        {/* Status filter (All / Offline / At Risk) — hidden when embedded */}
        {!embedded && (
          <div style={{ display: 'flex', gap: 3, padding: 4, background: T.tabBg, borderRadius: 10, border: `1px solid ${T.tabBorder}` }}>
            {[
              { key: 'All',     label: 'All',     count: allDevices.length },
              { key: 'Missing', label: 'Offline', count: missing.length    },
              { key: 'At Risk', label: 'At Risk', count: atRisk.length     },
            ].map(({ key, label, count }) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                background: filter === key ? '#A72C32' : 'transparent',
                color:      filter === key ? '#FFFFFF' : T.txt2,
              }}>
                {label}{count > 0 ? ` (${count})` : ''}
              </button>
            ))}
          </div>
        )}

        {/* Sort controls — always shown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: T.txt3, fontWeight: 600 }}>Sort:</span>
          {[
            { key: 'hours',    label: 'Longest offline' },
            { key: 'recovery', label: 'Best recovery' },
            { key: 'battery',  label: 'Low battery' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setSortBy(key)} style={{
              padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              border:     sortBy === key
                ? `1px solid ${isLight ? '#8B2328' : 'rgba(167,44,50,0.40)'}`
                : `1px solid ${T.tabBorder}`,
              background: sortBy === key
                ? (isLight ? '#A72C32' : 'rgba(167,44,50,0.18)')
                : T.tabBg,
              color:      sortBy === key ? (isLight ? '#FFFFFF' : '#C86068') : T.txt2,
              boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Device list ─────────────────────────────────────────────────────── */}
      {loading ? (
        <TPLLoader label={debouncedQ ? 'Searching…' : 'Loading devices…'} />
      ) : filtered.length === 0 ? (
        <div style={{ ...panel, padding: '64px 20px', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14,
            background: isLight ? '#ECFDF5' : 'rgba(5,150,105,0.12)',
            border: `1px solid ${isLight ? '#A7F3D0' : 'rgba(5,150,105,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Shield style={{ width: 24, height: 24, color: isLight ? '#059669' : '#6ee7b7' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: T.txt1, margin: '0 0 8px' }}>
            {allDevices.length === 0 ? 'All devices are online' : 'No matches found'}
          </p>
          <p style={{ fontSize: 13, color: T.txt2, margin: 0 }}>
            {allDevices.length === 0
              ? 'No device has been offline for 12+ hours'
              : 'Try adjusting your search or filter'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(device => (
            <DeviceCard key={device.id} device={device} navigate={navigate} isLight={isLight} T={T} />
          ))}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, padding: '4px 2px', opacity: loading ? 0.45 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
          <span style={{ fontSize: 11, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)', marginRight: 4, fontWeight: 500 }}>
            {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
            {pendingPageRef.current && <span style={{ marginLeft: 6, color: '#C86068', fontStyle: 'italic' }}>→ pg {pendingPageRef.current}</span>}
          </span>
          <ThemeProvider theme={muiTheme}>
            <Stack>
              <Pagination
                count={totalPages} page={page}
                onChange={(_, p) => goToPagePersisted(p)}
                color="primary" variant="outlined" shape="rounded" size="small"
                sx={{ '& .MuiPaginationItem-root': { fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)', borderColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)', '&:hover': { background: 'rgba(167,44,50,0.08)', borderColor: 'rgba(167,44,50,0.40)' }, '&.Mui-selected': { background: isLight ? 'rgba(167,44,50,0.12)' : 'rgba(167,44,50,0.25)', color: isLight ? '#A72C32' : '#E87178', borderColor: isLight ? 'rgba(167,44,50,0.40)' : 'rgba(167,44,50,0.55)', fontWeight: 700, '&:hover': { background: isLight ? 'rgba(167,44,50,0.18)' : 'rgba(167,44,50,0.35)' } }, '&.MuiPaginationItem-ellipsis': { border: 'none', color: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' } } }}
              />
            </Stack>
          </ThemeProvider>
        </div>
      )}

      {/* ── Info strip — hidden when embedded ───────────────────────────────── */}
      {!embedded && (
        <div style={{ ...panel, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12,
          background: isLight ? '#FFFBEB' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${isLight ? '#FDE68A' : 'rgba(245,158,11,0.18)'}` }}>
          <AlertTriangle style={{ width: 14, height: 14, color: isLight ? '#D97706' : '#fbbf24', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: T.txt2, margin: 0, lineHeight: 1.65 }}>
            <span style={{ color: isLight ? '#D97706' : '#fbbf24', fontWeight: 700 }}>Detection rules: </span>
            Devices offline 12–24h → <span style={{ color: isLight ? '#D97706' : '#fbbf24', fontWeight: 600 }}>At Risk</span>.{' '}
            Offline 24h+ → <span style={{ color: isLight ? '#DC2626' : '#fca5a5', fontWeight: 600 }}>Missing</span>.{' '}
            Battery &lt;25% triggers critical warning.{' '}
            Recovery probability decreases 1.8%/h from last contact.
          </p>
        </div>
      )}
    </div>
  )
}
