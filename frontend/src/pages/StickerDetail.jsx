import React, { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tag, MapPin, Clock, Battery, ArrowLeft, Package, Navigation, Route, FileText } from 'lucide-react'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { tplGeocode } from '../utils/tplGeocode.js'
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
        style={{ color: T.accent, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
        ← Back to Stickers
      </button>
    </div>
  )

  // ── Derive display values ────────────────────────────────────────────────────
  const liveTs    = livePoint?.timestamp ?? livePoint?.time ?? livePoint?.locTime ?? null
  const deviceTs  = sticker.dataRetrievalTime ?? null
  const displayTs = liveTs ?? deviceTs

  const liveHoursAgo = displayTs
    ? (Date.now() - new Date(displayTs).getTime()) / 3_600_000
    : (sticker.hoursAgo ?? 99)

  const liveBattery  = livePoint?.batteryStatus ?? livePoint?.battery ?? sticker.battery ?? null

  const liveLocation = locLoading
    ? 'Locating…'
    : locError
    ? 'No GPS data'
    : (geoLabel || sticker.lastLocation || (
        livePoint?.lat != null
          ? `${Number(livePoint.lat).toFixed(5)}, ${Number(livePoint.lng).toFixed(5)}`
          : 'No GPS data'
      ))

  const liveLastSeen = locLoading
    ? 'Fetching…'
    : (displayTs ? new Date(displayTs).toLocaleString() : '—')

  const displayStatus = sticker.status || 'Active'
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

  const bindDateStr = sticker.bindTime
    ? new Date(sticker.bindTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  // Coordinates for the side map (last reported location)
  const mapLat = livePoint?.lat ?? livePoint?.latitude ?? livePoint?.gpsLat ?? livePoint?.wgLat
  const mapLng = livePoint?.lng ?? livePoint?.lon ?? livePoint?.longitude ?? livePoint?.gpsLng ?? livePoint?.wgLng
  const hasMapCoords = mapLat != null && mapLng != null && !isNaN(Number(mapLat)) && !isNaN(Number(mapLng))

  const infoFields = [
    { l: 'Device ID',   v: sticker.id },
    { l: 'Bind Date',   v: bindDateStr },
    { l: 'Category',    v: sticker.category || '—' },
    { l: 'Company',     v: sticker.company  || '—' },
    { l: 'Fence Zones', v: fenceZoneNames },
    { l: 'Detections',  v: sticker.detections ?? 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>

      {/* Back */}
      <button onClick={() => navigate('/stickers')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: isLight ? '#000000' : T.txt2, fontSize: 13,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 'fit-content' }}
        onMouseEnter={e => e.currentTarget.style.color = isLight ? '#000000' : T.txt1}
        onMouseLeave={e => e.currentTarget.style.color = isLight ? '#000000' : T.txt2}>
        <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Stickers
      </button>

      {/* Two-column: details (left) + last-location map (right) */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: '1 1 560px', minWidth: 0, maxWidth: 760 }}>

      {/* Header card */}
      <div style={{ ...panel, ...(cardAccent || {}), padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ padding: 12, borderRadius: 14, background: T.headIconBg, border: `1px solid ${T.headIconBdr}`, flexShrink: 0 }}>
            <Package style={{ width: 26, height: 26, color: headGlyphColor }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: T.txt1, margin: 0 }}>{sticker.userName || sticker.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', color: T.accent, fontSize: 13 }}>{sticker.id}</span>
              {sticker.category && (
                <><span style={{ color: T.txt3 }}>·</span>
                <span style={{ color: T.txt2, fontSize: 13 }}>{sticker.category}</span></>
              )}
              {sticker.company && (
                <><span style={{ color: T.txt3 }}>·</span>
                <span style={{ color: T.txt2, fontSize: 13 }}>{sticker.company}</span></>
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
          <div key={s.label} style={{ ...panel, ...(cardAccent || {}), padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <s.icon style={{ width: 13, height: 13, color: s.color }} />
              <span style={{ color: T.statLabel, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{s.label}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: s.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={s.value}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Device info */}
      <div style={{ ...panel, ...(cardAccent || {}), padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Tag style={{ width: 15, height: 15, color: T.accent }} />
          <span style={{ color: T.txt1, fontWeight: 600, fontSize: 14 }}>Device Info</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {infoFields.map(f => (
            <div key={f.l} style={{ background: T.fieldBg, borderRadius: 12, padding: 12, border: `1px solid ${T.fieldBdr}` }}>
              <div style={{ color: T.fieldLabel, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{f.l}</div>
              <div style={{ color: T.fieldVal, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={String(f.v)}>
                {f.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Track device */}
      <div style={{ ...panel, ...(cardAccent || {}), padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Navigation style={{ width: 15, height: 15, color: T.accent }} />
          <span style={{ color: T.txt1, fontWeight: 600, fontSize: 14 }}>Track Device</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <button
            onClick={() => navigate(`/map?device=${sticker.id}`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
              background: T.primBtnBg, border: `1px solid ${T.primBtnBdr}`,
              color: T.btnTxt, fontSize: 13, fontWeight: 600,
              transition: 'background 0.18s, border-color 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.primBtnBgHov; e.currentTarget.style.borderColor = T.primBtnBdrHov }}
            onMouseLeave={e => { e.currentTarget.style.background = T.primBtnBg; e.currentTarget.style.borderColor = T.primBtnBdr }}
          >
            <MapPin style={{ width: 16, height: 16, color: isLight ? '#FFFFFF' : T.accent, flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div>Live Map View</div>
              <div style={{ fontSize: 10, color: T.btnSub, fontWeight: 400, marginTop: 2 }}>See current location on map</div>
            </div>
          </button>
          <button
            onClick={() => navigate(`/trajectory?device=${sticker.id}`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
              background: T.ghostBtnBg, border: `1px solid ${T.ghostBtnBdr}`,
              color: T.btnTxt, fontSize: 13, fontWeight: 600,
              transition: 'background 0.18s, border-color 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.ghostBtnBgHov; e.currentTarget.style.borderColor = T.ghostBtnBdrHov }}
            onMouseLeave={e => { e.currentTarget.style.background = T.ghostBtnBg; e.currentTarget.style.borderColor = T.ghostBtnBdr }}
          >
            <Route style={{ width: 16, height: 16, color: T.ghostIcon, flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div>GPS Trajectory</div>
              <div style={{ fontSize: 10, color: T.btnSub, fontWeight: 400, marginTop: 2 }}>View historical GPS path</div>
            </div>
          </button>
          <button
            onClick={() => navigate(`/reports?device=${sticker.id}`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
              background: T.ghostBtnBg, border: `1px solid ${T.ghostBtnBdr}`,
              color: T.btnTxt, fontSize: 13, fontWeight: 600,
              transition: 'background 0.18s, border-color 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = T.ghostBtnBgHov; e.currentTarget.style.borderColor = T.ghostBtnBdrHov }}
            onMouseLeave={e => { e.currentTarget.style.background = T.ghostBtnBg; e.currentTarget.style.borderColor = T.ghostBtnBdr }}
          >
            <FileText style={{ width: 16, height: 16, color: T.ghostIcon, flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div>Reports</div>
              <div style={{ fontSize: 10, color: T.btnSub, fontWeight: 400, marginTop: 2 }}>Export location history</div>
            </div>
          </button>
        </div>
      </div>

      </div>{/* end left column */}

      {/* Right column — last-location map (TPL Maps) */}
      <div style={{ flex: '1 1 420px', minWidth: 300, alignSelf: 'stretch' }}>
        <div style={{ ...panel, ...(cardAccent || {}), overflow: 'hidden', position: 'sticky', top: 12,
          display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', minHeight: 480 }}>
          {/* Map header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 18px', borderBottom: `1px solid ${T.fieldBdr}`, flexShrink: 0 }}>
            <MapPin style={{ width: 15, height: 15, color: T.locColor }} />
            <span style={{ color: T.txt1, fontWeight: 600, fontSize: 14 }}>Current Location</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: T.txt2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
              {hasMapCoords ? (geoLabel || `${Number(mapLat).toFixed(5)}, ${Number(mapLng).toFixed(5)}`) : ''}
            </span>
          </div>
          {/* Map body */}
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            {locLoading ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.txt2, fontSize: 13 }}>
                Locating…
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
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, textAlign: 'center' }}>
                <MapPin style={{ width: 30, height: 30, color: T.txt3 }} />
                <div style={{ color: T.txt1, fontWeight: 600, fontSize: 14 }}>No GPS data</div>
                <div style={{ color: T.txt2, fontSize: 12 }}>This device has no reported location yet.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      </div>{/* end two-column row */}

    </div>
  )
}
