import React, { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Radio, MapPin, Clock, Battery, ArrowLeft, User, Navigation, Route, FileText } from 'lucide-react'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { tplGeocode } from '../utils/tplGeocode.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'

// ── Status style (dark vs light) ────────────────────────────────────────────
const statusStyle = (s, isLight) => {
  if (isLight) {
    if (s === 'Active')  return { color: '#FFFFFF', background: '#059669', border: '1px solid #047857' }
    if (s === 'At Risk') return { color: '#FFFFFF', background: '#D97706', border: '1px solid #B45309' }
    return                      { color: '#FFFFFF', background: '#A72C32', border: '1px solid #8B2328' }
  }
  if (s === 'Active')   return { color: '#34D399', background: 'rgba(52,211,153,0.12)',  border: '1px solid rgba(52,211,153,0.25)' }
  if (s === 'At Risk')  return { color: '#FBBF24', background: 'rgba(251,191,36,0.12)',  border: '1px solid rgba(251,191,36,0.25)' }
  return                       { color: '#F87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }
}

export default function LocatorDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { zones }            = useZoneCache()
  const { getLatestLocation, getDeviceBySn } = useCityTag()

  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  // ── Theme tokens ────────────────────────────────────────────────────────────
  const panel = isLight
    ? { background: '#E6E6E6', border: '1px solid #C9C9C9', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: '#242323', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }

  const T = {
    txt1:        isLight ? '#111827' : '#f4f4f5',
    txt2:        isLight ? '#6B7280' : 'rgba(255,255,255,0.50)',
    txt3:        isLight ? '#9CA3AF' : 'rgba(255,255,255,0.32)',
    fieldBg:     isLight ? '#F9FAFB' : 'rgba(255,255,255,0.04)',
    fieldBorder: isLight ? '#F3F4F6' : 'rgba(255,255,255,0.08)',
    divider:     isLight ? '#F3F4F6' : 'rgba(255,255,255,0.07)',
    redBg:       isLight ? '#FEF2F2' : 'rgba(220,38,38,0.12)',
    redBorder:   isLight ? '#FECACA' : 'rgba(220,38,38,0.22)',
    btnGhost:    isLight
      ? { background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111827' }
      : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#f4f4f5' },
    sectionIconBg:     isLight ? '#FEF2F2' : 'rgba(220,38,38,0.12)',
    sectionIconBorder: isLight ? '#FECACA' : 'rgba(220,38,38,0.22)',
  }

  // Solid auburn left-accent for light theme cards (harmonizes with dark brand)
  const cardAccent = isLight ? { borderLeft: '3px solid #A72C32' } : null

  // ── Device metadata state ────────────────────────────────────────────────────
  const [loc, setLoc] = useState(null)
  const [devLoading, setDevLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setDevLoading(true)
    getDeviceBySn(id)
      .then(d => {
        if (cancelled || !d) return
        const lastSeen = d.dataRetrievalTime || null
        const hoursAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 99
        let status = 'Active'
        if ((d.status || '') === 'offline' && hoursAgo > 24) status = 'Missing'
        else if ((d.status || '') === 'offline' && hoursAgo > 12) status = 'At Risk'
        setLoc({
          id: d.sn || d.local_id,
          userName: d.assigned_user_name || d.name || d.sn || '—',
          category: d.category || '',
          company:  d.client || '',
          status, hoursAgo,
          battery: typeof d.battery === 'number' ? d.battery : null,
          lastLocation: d.lastLocation || '',
          dataRetrievalTime: d.dataRetrievalTime || null,
          bindTime: d.bindTime,
          fence_zone_ids: d.fence_zone_ids || [],
          detections: d.detections ?? 0,
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDevLoading(false) })
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live location state ──────────────────────────────────────────────────────
  const [livePoint,  setLivePoint]  = useState(null)
  const [geoLabel,   setGeoLabel]   = useState('')
  const [locLoading, setLocLoading] = useState(false)
  const [locError,   setLocError]   = useState('')

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLocLoading(true)
    setLocError('')
    getLatestLocation(id)
      .then(res => {
        if (cancelled) return
        const point = res?.latest ?? res ?? null
        setLivePoint(point)
        if (point?.lat != null && point?.lng != null) {
          tplGeocode(point.lat, point.lng).then(geo => {
            if (cancelled) return
            const label = geo?.area || geo?.name || geo?.roadOnly || geo?.primary
            if (label) setGeoLabel(label)
          }).catch(() => {})
        }
      })
      .catch(err => { if (!cancelled) setLocError(err?.message || 'Location unavailable') })
      .finally(() => { if (!cancelled) setLocLoading(false) })
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── useMemo must be above ALL early returns (Rules of Hooks) ────────────────
  const fenceZoneNames = useMemo(() => {
    if (!loc?.fence_zone_ids?.length) return '—'
    return loc.fence_zone_ids
      .map(zid => zones.find(z => z.zone_id === zid)?.name || zid)
      .join(', ')
  }, [loc?.fence_zone_ids, zones])

  if (devLoading) return <TPLLoader label="Loading locator…" />

  if (!loc) return (
    <div style={{ ...panel, padding: '80px 24px', textAlign: 'center', margin: '20px auto', maxWidth: 480 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: T.redBg, border: `1px solid ${T.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        <Radio style={{ width: 24, height: 24, color: '#DC2626' }} />
      </div>
      <p style={{ color: T.txt1, fontWeight: 600, marginBottom: 16 }}>Locator not found</p>
      <button onClick={() => navigate('/locators')}
        style={{ color: '#DC2626', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
        ← Back to Locators
      </button>
    </div>
  )

  // ── Derive display values ────────────────────────────────────────────────────
  const liveTs    = livePoint?.timestamp ?? livePoint?.time ?? livePoint?.locTime ?? null
  const deviceTs  = loc.dataRetrievalTime ?? null
  const displayTs = liveTs ?? deviceTs

  const liveHoursAgo = displayTs
    ? (Date.now() - new Date(displayTs).getTime()) / 3_600_000
    : (loc.hoursAgo ?? 99)

  const liveBattery  = livePoint?.batteryStatus ?? livePoint?.battery ?? loc.battery ?? null

  const liveLocation = locLoading
    ? 'Locating…'
    : locError
    ? 'No GPS data'
    : (geoLabel || loc.lastLocation || (
        livePoint?.lat != null
          ? `${Number(livePoint.lat).toFixed(5)}, ${Number(livePoint.lng).toFixed(5)}`
          : 'No GPS data'
      ))

  const liveLastSeen = locLoading
    ? 'Fetching…'
    : (displayTs ? new Date(displayTs).toLocaleString() : '—')

  const displayStatus = loc.status || 'Active'
  const sStyle        = statusStyle(displayStatus, isLight)
  const battColor     = (liveBattery ?? 0) <= 20 ? '#DC2626' : (liveBattery ?? 0) <= 40 ? '#D97706' : '#059669'
  const timeColor     = liveHoursAgo > 24 ? '#DC2626' : liveHoursAgo > 12 ? '#D97706' : '#059669'

  const statIconBg = color => {
    if (!isLight) {
      if (color === '#DC2626') return { bg: 'rgba(220,38,38,0.12)',   border: 'rgba(220,38,38,0.22)' }
      if (color === '#D97706') return { bg: 'rgba(217,119,6,0.12)',   border: 'rgba(217,119,6,0.22)' }
      if (color === '#059669') return { bg: 'rgba(5,150,105,0.12)',   border: 'rgba(5,150,105,0.22)' }
      return { bg: 'rgba(37,99,235,0.12)', border: 'rgba(37,99,235,0.22)' }
    }
    if (color === '#DC2626') return { bg: '#FEF2F2', border: '#FECACA' }
    if (color === '#D97706') return { bg: '#FFFBEB', border: '#FDE68A' }
    if (color === '#059669') return { bg: '#ECFDF5', border: '#A7F3D0' }
    return { bg: '#EFF6FF', border: '#BFDBFE' }
  }

  const stats = [
    { icon: MapPin,  label: 'Last Location', value: liveLocation,  color: '#2563EB',  ...(() => { const s = statIconBg('#2563EB'); return { iconBg: s.bg, iconBorder: s.border } })() },
    { icon: Clock,   label: 'Last Seen',      value: liveLastSeen, color: timeColor,  ...(() => { const s = statIconBg(timeColor); return { iconBg: s.bg, iconBorder: s.border } })() },
    { icon: Battery, label: 'Battery',        value: liveBattery != null ? `${liveBattery}%` : '—', color: battColor, ...(() => { const s = statIconBg(battColor); return { iconBg: s.bg, iconBorder: s.border } })() },
  ]

  const bindDateStr = loc.bindTime
    ? new Date(loc.bindTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  const infoFields = [
    { l: 'Device ID',   v: loc.id },
    { l: 'Bind Date',   v: bindDateStr },
    { l: 'Category',    v: loc.category || '—' },
    { l: 'Company',     v: loc.company  || '—' },
    { l: 'Fence Zones', v: fenceZoneNames },
    { l: 'Detections',  v: loc.detections ?? 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760, padding: '4px 0' }}>

      {/* Back */}
      <button onClick={() => navigate('/locators')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.txt2, fontSize: 13,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 'fit-content', fontWeight: 500 }}
        onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
        onMouseLeave={e => e.currentTarget.style.color = T.txt2}>
        <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Locators
      </button>

      {/* Header card */}
      <div style={{ ...panel, ...(cardAccent || {}), padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: T.redBg, border: `1px solid ${T.redBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Radio style={{ width: 24, height: 24, color: '#DC2626' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: T.txt1, margin: 0, letterSpacing: '-0.02em' }}>{loc.userName}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', color: '#DC2626', fontSize: 13, fontWeight: 600 }}>{loc.id}</span>
              {loc.category && (
                <><span style={{ color: T.txt3 }}>·</span>
                <span style={{ color: T.txt2, fontSize: 13 }}>{loc.category}</span></>
              )}
              {loc.company && (
                <><span style={{ color: T.txt3 }}>·</span>
                <span style={{ color: T.txt2, fontSize: 13 }}>{loc.company}</span></>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={{ ...sStyle, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, letterSpacing: '0.04em' }}>
                {displayStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ ...panel, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: s.iconBg, border: `1px solid ${s.iconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <s.icon style={{ width: 13, height: 13, color: s.color }} />
              </div>
              <span style={{ color: T.txt3, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{s.label}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.txt1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={s.value}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Device info */}
      <div style={{ ...panel, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: T.sectionIconBg, border: `1px solid ${T.sectionIconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User style={{ width: 13, height: 13, color: '#DC2626' }} />
          </div>
          <span style={{ color: T.txt1, fontWeight: 600, fontSize: 14 }}>Device Info</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {infoFields.map(f => (
            <div key={f.l} style={{ background: T.fieldBg, borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.fieldBorder}` }}>
              <div style={{ color: T.txt3, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, fontWeight: 600 }}>{f.l}</div>
              <div style={{ color: T.txt1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={String(f.v)}>
                {f.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Track device */}
      <div style={{ ...panel, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: T.sectionIconBg, border: `1px solid ${T.sectionIconBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Navigation style={{ width: 13, height: 13, color: '#DC2626' }} />
          </div>
          <span style={{ color: T.txt1, fontWeight: 600, fontSize: 14 }}>Track Device</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>

          {/* Live Map — primary CTA */}
          <button
            onClick={() => navigate(`/map?device=${loc.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
              background: T.redBg, border: `1px solid ${T.redBorder}`,
              color: T.txt1, fontSize: 13, fontWeight: 600,
              transition: 'all 0.18s', textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#DC2626'; e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.querySelector('.track-sub').style.color = 'rgba(255,255,255,0.65)' }}
            onMouseLeave={e => { e.currentTarget.style.background = T.redBg; e.currentTarget.style.borderColor = T.redBorder; e.currentTarget.style.color = T.txt1; e.currentTarget.querySelector('.track-sub').style.color = T.txt3 }}
          >
            <MapPin style={{ width: 16, height: 16, color: '#DC2626', flexShrink: 0 }} />
            <div>
              <div>Live Map View</div>
              <div className="track-sub" style={{ fontSize: 10, color: T.txt3, fontWeight: 400, marginTop: 2 }}>See current location</div>
            </div>
          </button>

          {/* GPS Trajectory */}
          <button
            onClick={() => navigate(`/trajectory?device=${loc.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
              ...T.btnGhost,
              fontSize: 13, fontWeight: 600,
              transition: 'all 0.18s', textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? '#D1D5DB' : 'rgba(255,255,255,0.20)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.btnGhost.border.replace('1px solid ',''); e.currentTarget.style.boxShadow = 'none' }}
          >
            <Route style={{ width: 16, height: 16, color: T.txt2, flexShrink: 0 }} />
            <div>
              <div>GPS Trajectory</div>
              <div style={{ fontSize: 10, color: T.txt3, fontWeight: 400, marginTop: 2 }}>View historical GPS path</div>
            </div>
          </button>

          {/* Reports */}
          <button
            onClick={() => navigate(`/reports?device=${loc.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
              ...T.btnGhost,
              fontSize: 13, fontWeight: 600,
              transition: 'all 0.18s', textAlign: 'left',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = isLight ? '#D1D5DB' : 'rgba(255,255,255,0.20)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.btnGhost.border.replace('1px solid ',''); e.currentTarget.style.boxShadow = 'none' }}
          >
            <FileText style={{ width: 16, height: 16, color: T.txt2, flexShrink: 0 }} />
            <div>
              <div>Reports</div>
              <div style={{ fontSize: 10, color: T.txt3, fontWeight: 400, marginTop: 2 }}>Export location history</div>
            </div>
          </button>

        </div>
      </div>

    </div>
  )
}
