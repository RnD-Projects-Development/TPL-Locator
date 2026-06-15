import React, { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Radio, MapPin, Clock, Battery, ArrowLeft, Navigation, Route, FileText } from 'lucide-react'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'
import MapView from '../components/MapView.jsx'

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

  // ── Theme tokens (dark = original, light = enterprise) ───────────────────────
  const panel = isLight
    ? { background: 'linear-gradient(145deg, #FFFFFF 0%, #F0F0F0 50%, #DCDCDC 100%)', border: '1px solid #C9C9C9', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: '#242323', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }

  const T = {
    accent:        isLight ? '#DC2626' : '#A72C32',
    txt1:          isLight ? '#000000' : '#FFFFFF',
    txt2:          isLight ? '#333333' : 'rgba(255,255,255,0.45)',
    txt3:          isLight ? '#333333' : 'rgba(255,255,255,0.30)',
    locColor:      isLight ? '#2563EB' : '#22D3EE',
    headIconBg:    isLight ? '#A72C32' : 'rgba(167,44,50,0.10)',
    headIconBdr:   isLight ? '#8B2328' : 'rgba(167,44,50,0.25)',
    headIconColor: isLight ? '#FFFFFF' : '#C86068',
    fieldBg:       isLight ? '#DCDCDC' : 'rgba(255,255,255,0.04)',
    fieldBdr:      isLight ? '#CFCFCF' : 'rgba(255,255,255,0.05)',
    fieldLabel:    isLight ? '#333333' : 'rgba(255,255,255,0.30)',
    fieldVal:      isLight ? '#000000' : 'rgba(255,255,255,0.85)',
    statLabel:     isLight ? '#333333' : 'rgba(255,255,255,0.35)',
    primBtnBg:     isLight ? '#A72C32' : 'rgba(167,44,50,0.10)',
    primBtnBdr:    isLight ? '#8B2328' : 'rgba(167,44,50,0.28)',
    primBtnBgHov:  isLight ? '#8B2328' : 'rgba(167,44,50,0.20)',
    primBtnBdrHov: isLight ? '#8B2328' : 'rgba(167,44,50,0.55)',
    ghostBtnBg:    isLight ? '#A72C32' : 'rgba(255,255,255,0.04)',
    ghostBtnBdr:   isLight ? '#8B2328' : 'rgba(255,255,255,0.09)',
    ghostBtnBgHov: isLight ? '#8B2328' : 'rgba(255,255,255,0.08)',
    ghostBtnBdrHov:isLight ? '#8B2328' : 'rgba(255,255,255,0.18)',
    ghostIcon:     isLight ? '#FFFFFF' : '#94a3b8',
    btnTxt:        isLight ? '#FFFFFF' : '#FFFFFF',
    btnSub:        isLight ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.40)',
    notFoundIcon:  isLight ? '#DC2626' : 'rgba(255,255,255,0.18)',
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
        setGeoLabel(point?.landmark?.trim() || '')
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
      <Radio style={{ width: 40, height: 40, color: T.notFoundIcon, margin: '0 auto 12px' }} />
      <p style={{ color: T.txt1, fontWeight: 600, marginBottom: 16 }}>Locator not found</p>
      <button onClick={() => navigate('/locators')}
        style={{ color: T.accent, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
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
  const battColor     = isLight
    ? ((liveBattery ?? 0) <= 20 ? '#DC2626' : (liveBattery ?? 0) <= 40 ? '#D97706' : '#059669')
    : ((liveBattery ?? 0) <= 20 ? '#F87171' : (liveBattery ?? 0) <= 40 ? '#FBBF24' : '#34D399')
  // Header glyph colour reflects battery: <50 red · 50–60 yellow · >60 green
  const headGlyphColor = liveBattery == null
    ? T.headIconColor
    : liveBattery < 50  ? (isLight ? '#DC2626' : '#F87171')
    : liveBattery <= 60 ? (isLight ? '#D97706' : '#FBBF24')
    :                     (isLight ? '#059669' : '#34D399')
  const timeColor     = isLight
    ? (liveHoursAgo > 24 ? '#DC2626' : liveHoursAgo > 12 ? '#D97706' : '#059669')
    : (liveHoursAgo > 24 ? '#F87171' : liveHoursAgo > 12 ? '#FBBF24' : '#34D399')

  const stats = [
    { icon: MapPin,  label: 'Last Location', value: liveLocation,  color: T.locColor },
    { icon: Clock,   label: 'Last Seen',      value: liveLastSeen, color: timeColor },
    { icon: Battery, label: 'Battery',        value: liveBattery != null ? `${liveBattery}%` : '—', color: battColor },
  ]

  const bindDateStr = loc.bindTime
    ? new Date(loc.bindTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  // Coordinates for the side map (last reported location)
  const mapLat = livePoint?.lat ?? livePoint?.latitude ?? livePoint?.gpsLat ?? livePoint?.wgLat
  const mapLng = livePoint?.lng ?? livePoint?.lon ?? livePoint?.longitude ?? livePoint?.gpsLng ?? livePoint?.wgLng
  const hasMapCoords = mapLat != null && mapLng != null && !isNaN(Number(mapLat)) && !isNaN(Number(mapLng))

  const infoFields = [
    { l: 'Device ID',   v: loc.id },
    { l: 'Bind Date',   v: bindDateStr },
    { l: 'Category',    v: loc.category || '—' },
    { l: 'Company',     v: loc.company  || '—' },
    { l: 'Fence Zones', v: fenceZoneNames },
    { l: 'Detections',  v: loc.detections ?? 0 },
  ]

  return (
    // height:100% fills the flex-1 slot from Layout; overflow:hidden kills the outer scroll
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>

      {/* Back */}
      <button onClick={() => navigate('/locators')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: isLight ? '#000000' : T.txt2, fontSize: 13,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 'fit-content', flexShrink: 0 }}
        onMouseEnter={e => e.currentTarget.style.color = isLight ? '#000000' : T.txt1}
        onMouseLeave={e => e.currentTarget.style.color = isLight ? '#000000' : T.txt2}>
        <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Locators
      </button>

      {/* Two-column: map (left) + info cards (right) — fills remaining height, no outer scroll */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* LEFT — map (narrower: 55% of row) */}
        <div style={{ flex: '0 0 55%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...panel, ...(cardAccent || {}), overflow: 'hidden', flex: 1, minHeight: 0,
            display: 'flex', flexDirection: 'column' }}>
            {/* Map header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px',
              borderBottom: `1px solid ${T.fieldBdr}`, flexShrink: 0 }}>
              <MapPin style={{ width: 14, height: 14, color: T.locColor }} />
              <span style={{ color: T.txt1, fontWeight: 600, fontSize: 13 }}>Current Location</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.txt2, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                {hasMapCoords ? (geoLabel || `${Number(mapLat).toFixed(5)}, ${Number(mapLng).toFixed(5)}`) : ''}
              </span>
            </div>
            {/* Map body */}
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              {locLoading ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: T.txt2, fontSize: 13 }}>
                  Locating…
                </div>
              ) : hasMapCoords ? (
                <MapView
                  sn={loc.id}
                  label={loc.userName || loc.name}
                  latest={livePoint}
                  trajectory={[]}
                  playbackPoint={null}
                  showFences={false}
                  zones={zones}
                />
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center' }}>
                  <MapPin style={{ width: 30, height: 30, color: T.txt3 }} />
                  <div style={{ color: T.txt1, fontWeight: 600, fontSize: 14 }}>No GPS data</div>
                  <div style={{ color: T.txt2, fontSize: 12 }}>This device has no reported location yet.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — info cards, takes remaining 45% */}
        <div style={{ flex: 1, minWidth: 320, minHeight: 0, overflow: 'hidden',
          display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Header card */}
          <div style={{ ...panel, ...(cardAccent || {}), padding: 16, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ padding: 10, borderRadius: 12, background: T.headIconBg,
                border: `1px solid ${T.headIconBdr}`, flexShrink: 0 }}>
                <Radio style={{ width: 22, height: 22, color: headGlyphColor }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontSize: 17, fontWeight: 700, color: T.txt1, margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loc.userName || loc.name}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', color: T.accent, fontSize: 12 }}>{loc.id}</span>
                  {loc.category && (
                    <><span style={{ color: T.txt3 }}>·</span>
                    <span style={{ color: T.txt2, fontSize: 12 }}>{loc.category}</span></>
                  )}
                  {loc.company && (
                    <><span style={{ color: T.txt3 }}>·</span>
                    <span style={{ color: T.txt2, fontSize: 12 }}>{loc.company}</span></>
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ ...sStyle, fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20, letterSpacing: '0.04em' }}>
                    {displayStatus.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, flexShrink: 0 }}>
            {stats.map(s => (
              <div key={s.label} style={{ ...panel, ...(cardAccent || {}), padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <s.icon style={{ width: 11, height: 11, color: s.color }} />
                  <span style={{ color: T.statLabel, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.07em', fontWeight: 600 }}>{s.label}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: s.color,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={s.value}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Device info */}
          <div style={{ ...panel, ...(cardAccent || {}), padding: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
              <Radio style={{ width: 13, height: 13, color: T.accent }} />
              <span style={{ color: T.txt1, fontWeight: 600, fontSize: 13 }}>Device Info</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {infoFields.map(f => (
                <div key={f.l} style={{ background: T.fieldBg, borderRadius: 10, padding: 10,
                  border: `1px solid ${T.fieldBdr}` }}>
                  <div style={{ color: T.fieldLabel, fontSize: 9, textTransform: 'uppercase',
                    letterSpacing: '0.07em', marginBottom: 4 }}>{f.l}</div>
                  <div style={{ color: T.fieldVal, fontSize: 11, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={String(f.v)}>
                    {f.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Track device */}
          <div style={{ ...panel, ...(cardAccent || {}), padding: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Navigation style={{ width: 13, height: 13, color: T.accent }} />
              <span style={{ color: T.txt1, fontWeight: 600, fontSize: 13 }}>Track Device</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Live Map View', sub: 'See current location on map', icon: MapPin,
                  onClick: () => navigate(`/map?device=${loc.id}`), primary: true },
                { label: 'GPS Trajectory', sub: 'View historical GPS path', icon: Route,
                  onClick: () => navigate(`/trajectory?device=${loc.id}`), primary: false },
                { label: 'Reports', sub: 'Export location history', icon: FileText,
                  onClick: () => navigate(`/reports?device=${loc.id}`), primary: false },
              ].map(btn => (
                <button key={btn.label} onClick={btn.onClick}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer', width: '100%',
                    background: btn.primary ? T.primBtnBg : T.ghostBtnBg,
                    border: `1px solid ${btn.primary ? T.primBtnBdr : T.ghostBtnBdr}`,
                    color: T.btnTxt, fontSize: 12, fontWeight: 600,
                    transition: 'background 0.18s, border-color 0.18s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background    = btn.primary ? T.primBtnBgHov : T.ghostBtnBgHov;
                    e.currentTarget.style.borderColor   = btn.primary ? T.primBtnBdrHov : T.ghostBtnBdrHov;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background    = btn.primary ? T.primBtnBg : T.ghostBtnBg;
                    e.currentTarget.style.borderColor   = btn.primary ? T.primBtnBdr : T.ghostBtnBdr;
                  }}
                >
                  <btn.icon style={{ width: 14, height: 14,
                    color: btn.primary ? (isLight ? '#FFFFFF' : T.accent) : T.ghostIcon, flexShrink: 0 }} />
                  <div style={{ textAlign: 'left' }}>
                    <div>{btn.label}</div>
                    <div style={{ fontSize: 10, color: T.btnSub, fontWeight: 400, marginTop: 1 }}>{btn.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>{/* end right info column */}
      </div>{/* end two-column row */}
    </div>
  )
}
