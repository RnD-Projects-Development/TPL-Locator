import React, { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tag, MapPin, Clock, Battery, ArrowLeft, Navigation, Route, FileText } from 'lucide-react'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { landmarkFromPoint, clientReverseGeocode, parseLandmarkDisplay } from '../utils/landmark.js'
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

export default function StickerDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { zones }            = useZoneCache()
  const { getLatestLocation, getDeviceBySn, getGeocode } = useCityTag()

  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  const panel = isLight
    ? { border: '1.5px solid transparent', background: 'linear-gradient(145deg, #FFFFFF 0%, #FAFAFA 100%) padding-box, linear-gradient(135deg, rgba(167,44,50,0.28) 0%, rgba(255,255,255,0) 55%) border-box', borderRadius: 14, boxShadow: '0 4px 28px rgba(167,44,50,0.07)' }
    : { background: '#161616', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14 }

  const T = {
    accent:        isLight ? '#DC2626' : '#A72C32',
    txt1:          isLight ? '#000000' : '#FFFFFF',
    txt2:          isLight ? '#444444' : 'rgba(255,255,255,0.72)',
    txt3:          isLight ? '#666666' : 'rgba(255,255,255,0.30)',
    locColor:      isLight ? '#2563EB' : '#22D3EE',
    headIconBg:    isLight ? '#A72C32' : 'rgba(167,44,50,0.12)',
    headIconBdr:   isLight ? '#8B2328' : 'rgba(167,44,50,0.28)',
    headIconColor: isLight ? '#FFFFFF' : '#C86068',
    fieldBg:       isLight ? '#E8E8E8' : 'rgba(255,255,255,0.07)',
    fieldBdr:      isLight ? '#D0D0D0' : 'rgba(255,255,255,0.10)',
    fieldLabel:    isLight ? '#555555' : 'rgba(255,255,255,0.65)',
    fieldVal:      isLight ? '#000000' : '#FFFFFF',
    primBtnBg:     isLight ? '#A72C32' : 'rgba(167,44,50,0.10)',
    primBtnBdr:    isLight ? '#8B2328' : 'rgba(167,44,50,0.28)',
    primBtnBgHov:  isLight ? '#8B2328' : 'rgba(167,44,50,0.20)',
    primBtnBdrHov: isLight ? '#8B2328' : 'rgba(167,44,50,0.55)',
    ghostBtnBg:    isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    ghostBtnBdr:   isLight ? '#C0C0C0' : 'rgba(255,255,255,0.09)',
    ghostBtnBgHov: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
    ghostBtnBdrHov:isLight ? '#A0A0A0' : 'rgba(255,255,255,0.18)',
    ghostIcon:     isLight ? '#555555' : '#94a3b8',
    primBtnTxt:    '#FFFFFF',
    primBtnSub:    isLight ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.60)',
    ghostBtnTxt:   isLight ? '#111111' : '#FFFFFF',
    ghostBtnSub:   isLight ? 'rgba(0,0,0,0.50)'      : 'rgba(255,255,255,0.60)',
    notFoundIcon:  isLight ? '#DC2626' : 'rgba(255,255,255,0.18)',
    topBarBg:      isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.02)',
  }

  const cardAccent = null

  const [sticker, setSticker] = useState(null)
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
        setSticker({
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
        const stored = landmarkFromPoint(point)
        if (stored) {
          setGeoLabel(stored)
        } else {
          const ptLat = point?.lat ?? point?.latitude ?? point?.gpsLat ?? point?.wgLat
          const ptLng = point?.lng ?? point?.lon ?? point?.longitude ?? point?.gpsLng ?? point?.wgLng
          if (ptLat != null && ptLng != null) {
            clientReverseGeocode(ptLat, ptLng)
              .then(lm => {
                if (lm) { if (!cancelled) setGeoLabel(lm); return; }
                return getGeocode(ptLat, ptLng)
                  .then(geo => { if (!cancelled && geo?.landmark) setGeoLabel(geo.landmark) })
              })
              .catch(() => {})
          }
        }
      })
      .catch(err => { if (!cancelled) setLocError(err?.message || 'Location unavailable') })
      .finally(() => { if (!cancelled) setLocLoading(false) })
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fenceZoneNames = useMemo(() => {
    if (!sticker?.fence_zone_ids?.length) return '—'
    return sticker.fence_zone_ids
      .map(zid => zones.find(z => z.zone_id === zid)?.name || zid)
      .join(', ')
  }, [sticker?.fence_zone_ids, zones])

  if (devLoading) return <TPLLoader label="Loading sticker…" />

  if (!sticker) return (
    <div style={{ ...panel, padding: '80px 24px', textAlign: 'center', margin: '20px auto', maxWidth: 480 }}>
      <Tag style={{ width: 40, height: 40, color: T.notFoundIcon, margin: '0 auto 12px' }} />
      <p style={{ color: T.txt1, fontWeight: 600, marginBottom: 16 }}>Sticker not found</p>
      <button onClick={() => navigate('/stickers')}
        style={{ color: T.accent, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer' }}>
        ← Back to Stickers
      </button>
    </div>
  )

  const liveTs    = livePoint?.timestamp ?? livePoint?.time ?? livePoint?.locTime ?? null
  const deviceTs  = sticker.dataRetrievalTime ?? null
  const displayTs = liveTs ?? deviceTs

  const liveHoursAgo = displayTs
    ? (Date.now() - new Date(displayTs).getTime()) / 3_600_000
    : (sticker.hoursAgo ?? 99)

  const liveBattery = livePoint?.batteryStatus ?? livePoint?.battery ?? sticker.battery ?? null

  const geoDisplay  = parseLandmarkDisplay(geoLabel)
  const liveLocation = locLoading
    ? 'Acquiring position…'
    : locError
    ? 'No position data'
    : (geoDisplay?.secondary || geoDisplay?.primary || sticker.lastLocation || (
        livePoint?.lat != null
          ? `${Number(livePoint.lat).toFixed(5)}, ${Number(livePoint.lng).toFixed(5)}`
          : 'No position data'
      ))

  const liveLastSeen = locLoading
    ? 'Fetching…'
    : (displayTs ? new Date(displayTs).toLocaleString() : '—')

  const displayStatus = sticker.status || 'Active'
  const sStyle        = statusStyle(displayStatus, isLight)

  const battColor = isLight
    ? ((liveBattery ?? 0) <= 20 ? '#DC2626' : (liveBattery ?? 0) <= 40 ? '#D97706' : '#059669')
    : ((liveBattery ?? 0) <= 20 ? '#F87171' : (liveBattery ?? 0) <= 40 ? '#FBBF24' : '#34D399')

  const headGlyphColor = liveBattery == null
    ? T.headIconColor
    : liveBattery < 50  ? (isLight ? '#DC2626' : '#F87171')
    : liveBattery <= 60 ? (isLight ? '#D97706' : '#FBBF24')
    :                     (isLight ? '#059669' : '#34D399')

  const bindDateStr = sticker.bindTime
    ? new Date(sticker.bindTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  const mapLat = livePoint?.lat ?? livePoint?.latitude ?? livePoint?.gpsLat ?? livePoint?.wgLat
  const mapLng = livePoint?.lng ?? livePoint?.lon ?? livePoint?.longitude ?? livePoint?.gpsLng ?? livePoint?.wgLng
  const hasMapCoords = mapLat != null && mapLng != null && !isNaN(Number(mapLat)) && !isNaN(Number(mapLng))

  const fullMapAddress = locLoading
    ? 'Acquiring position…'
    : !hasMapCoords
    ? 'No position data'
    : ([geoDisplay?.primary, geoDisplay?.secondary].filter(Boolean).join(', ') || geoLabel || `${Number(mapLat).toFixed(5)}, ${Number(mapLng).toFixed(5)}`)

  const infoFields = [
    { l: 'Device ID',     v: sticker.id },
    { l: 'Registered',    v: bindDateStr },
    { l: 'Category',      v: sticker.category || '—' },
    { l: 'Client',        v: sticker.company  || '—' },
    { l: 'Assigned Zone', v: fenceZoneNames },
    { l: 'Detections',    v: sticker.detections ?? 0 },
  ]

  const actionBtns = [
    { label: 'Live Tracking', sub: 'View current position on map',  icon: MapPin,  onClick: () => navigate(`/map?device=${sticker.id}`),        primary: true },
    { label: 'Route History', sub: 'View historical movement path', icon: Route,   onClick: () => navigate(`/trajectory?device=${sticker.id}`), primary: false },
    { label: 'Export Report', sub: 'Download location history',     icon: FileText,onClick: () => navigate(`/reports?device=${sticker.id}`),    primary: false },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', letterSpacing: '1px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px', padding: '9px 14px',
        flexShrink: 0, borderBottom: `1px solid ${T.fieldBdr}`, background: T.topBarBg }}>
        <button onClick={() => navigate('/stickers')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: T.txt2,
            background: T.fieldBg, border: `1px solid ${T.fieldBdr}`, borderRadius: 7,
            padding: '4px 9px', cursor: 'pointer', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = T.txt1}
          onMouseLeave={e => e.currentTarget.style.color = T.txt2}>
          <ArrowLeft style={{ width: 12, height: 12 }} /> Stickers
        </button>

        <div style={{ width: 1, height: 18, background: T.fieldBdr, flexShrink: 0 }} />

        <div style={{ padding: '6px 7px', borderRadius: 9, background: T.headIconBg,
          border: `1px solid ${T.headIconBdr}`, flexShrink: 0 }}>
          <Tag style={{ width: 15, height: 15, color: headGlyphColor, display: 'block' }} />
        </div>

        <span style={{ fontSize: 16, fontWeight: 600, color: T.txt1, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sticker.userName}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: T.accent, flexShrink: 0 }}>{sticker.id}</span>
        {sticker.category && (
          <><span style={{ color: T.txt3, flexShrink: 0 }}>·</span>
          <span style={{ color: T.txt2, fontSize: 14, flexShrink: 0 }}>{sticker.category}</span></>
        )}
        <span style={{ ...sStyle, fontSize: 11, fontWeight: 700, padding: '2px 8px',
          borderRadius: 20, letterSpacing: '0.05em', flexShrink: 0 }}>
          {displayStatus.toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 10, padding: 10, overflowY: 'auto' }}>

        {/* Left column */}
        <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Stat strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, flexShrink: 0 }}>
            <div style={{ ...panel, ...(cardAccent || {}), padding: '13px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <MapPin style={{ width: 11, height: 11, color: T.txt2 }} />
                <span style={{ color: T.txt2, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Last Position</span>
              </div>
              <div style={{ color: T.txt1, fontSize: 13, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.4 }}>
                {liveLocation}
              </div>
            </div>

            <div style={{ ...panel, ...(cardAccent || {}), padding: '13px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <Clock style={{ width: 11, height: 11, color: T.txt2 }} />
                <span style={{ color: T.txt2, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Last Report</span>
              </div>
              <div style={{ color: T.txt1, fontSize: 13, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.4 }}>
                {liveLastSeen}
              </div>
            </div>

            <div style={{ ...panel, ...(cardAccent || {}), padding: '13px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <Battery style={{ width: 11, height: 11, color: battColor }} />
                <span style={{ color: T.txt2, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Power</span>
              </div>
              <div style={{ color: battColor, fontSize: 13, fontWeight: 600 }}>
                {liveBattery != null ? `${liveBattery}%` : '—'}
              </div>
              {liveBattery != null && (
                <div style={{ height: 3, borderRadius: 2, background: T.fieldBdr, marginTop: 5 }}>
                  <div style={{ height: 3, borderRadius: 2, width: `${Math.min(liveBattery, 100)}%`, background: battColor }} />
                </div>
              )}
            </div>
          </div>

          {/* Device details */}
          <div style={{ ...panel, ...(cardAccent || {}), padding: '8px 13px 13px 13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Tag style={{ width: 12, height: 12, color: T.accent }} />
              <span style={{ color: T.txt1, fontWeight: 600, fontSize: 12 }}>Device Details</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {infoFields.map(f => (
                <div key={f.l} style={{ background: T.fieldBg, borderRadius: 9, padding: '11px 10px', border: `1px solid ${T.fieldBdr}` }}>
                  <div style={{ color: T.fieldLabel, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{f.l}</div>
                  <div style={{ color: T.fieldVal, fontSize: 13, fontWeight: 400, letterSpacing: '0.04em', wordBreak: 'break-word', lineHeight: 1.4 }}>
                    {f.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ ...panel, ...(cardAccent || {}), padding: '13px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
              <Navigation style={{ width: 12, height: 12, color: T.accent }} />
              <span style={{ color: T.txt1, fontWeight: 600, fontSize: 12 }}>Actions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {actionBtns.map(btn => (
                <button key={btn.label} onClick={btn.onClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
                    borderRadius: 9, cursor: 'pointer', width: '100%', textAlign: 'left',
                    background: btn.primary ? T.primBtnBg : T.ghostBtnBg,
                    border: `1px solid ${btn.primary ? T.primBtnBdr : T.ghostBtnBdr}`,
                    color: btn.primary ? T.primBtnTxt : T.ghostBtnTxt, fontSize: 13, fontWeight: 600,
                    transition: 'background 0.15s, border-color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = btn.primary ? T.primBtnBgHov : T.ghostBtnBgHov; e.currentTarget.style.borderColor = btn.primary ? T.primBtnBdrHov : T.ghostBtnBdrHov }}
                  onMouseLeave={e => { e.currentTarget.style.background = btn.primary ? T.primBtnBg : T.ghostBtnBg; e.currentTarget.style.borderColor = btn.primary ? T.primBtnBdr : T.ghostBtnBdr }}
                >
                  <btn.icon style={{ width: 13, height: 13, color: btn.primary ? (isLight ? '#FFFFFF' : T.accent) : T.ghostIcon, flexShrink: 0 }} />
                  <div>
                    <div style={{ letterSpacing: '0.04em' }}>{btn.label}</div>
                    <div style={{ fontSize: 11, color: btn.primary ? T.primBtnSub : T.ghostBtnSub, fontWeight: 400, marginTop: 1, letterSpacing: '0.04em' }}>{btn.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>{/* end left */}

        {/* Right column — map */}
        <div style={{ flex: '2 1 280px', minWidth: 0, minHeight: '300px', display: 'flex', flexDirection: 'column',
          ...panel, ...(cardAccent || {}), overflow: 'hidden' }}>
          {/* Map header */}
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.fieldBdr}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <MapPin style={{ width: 13, height: 13, color: T.locColor, flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.txt1, fontWeight: 600, fontSize: 13, wordBreak: 'break-word', lineHeight: 1.4 }}>
                  {fullMapAddress}
                </div>
                {hasMapCoords && (
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: T.txt2, marginTop: 3 }}>
                    {`${Number(mapLat).toFixed(5)}, ${Number(mapLng).toFixed(5)}`}
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Map body */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {locLoading ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: T.txt2, fontSize: 13 }}>
                Acquiring position…
              </div>
            ) : hasMapCoords ? (
              <MapView
                sn={sticker.id}
                label={sticker.userName || sticker.name}
                latest={livePoint}
                trajectory={[]}
                playbackPoint={null}
                showFences={false}
                zones={zones}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center' }}>
                <MapPin style={{ width: 28, height: 28, color: T.txt3 }} />
                <div style={{ color: T.txt1, fontWeight: 600, fontSize: 13 }}>No position data</div>
                <div style={{ color: T.txt2, fontSize: 12 }}>This device has not reported a position yet.</div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
