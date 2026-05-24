import React, { useMemo, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Tag, MapPin, Clock, Battery, ArrowLeft, Package, Navigation, Route, FileText } from 'lucide-react'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { tplGeocode } from '../utils/tplGeocode.js'

const panel = {
  background: '#242323',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 18,
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
}

const statusStyle = s => {
  if (s === 'Active')   return { color: '#34D399', background: 'rgba(52,211,153,0.12)',  border: '1px solid rgba(52,211,153,0.25)' }
  if (s === 'At Risk')  return { color: '#FBBF24', background: 'rgba(251,191,36,0.12)',  border: '1px solid rgba(251,191,36,0.25)' }
  return                       { color: '#F87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)' }
}

export default function StickerDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const { zones }            = useZoneCache()
  const { getLatestLocation, getDeviceBySn } = useCityTag()

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

  if (devLoading) return (
    <div style={{ ...panel, padding: '80px 24px', textAlign: 'center', margin: '20px auto', maxWidth: 480 }}>
      <p style={{ color: 'rgba(255,255,255,0.40)', fontWeight: 600 }}>Loading sticker…</p>
    </div>
  )

  if (!sticker) return (
    <div style={{ ...panel, padding: '80px 24px', textAlign: 'center', margin: '20px auto', maxWidth: 480 }}>
      <Tag style={{ width: 40, height: 40, color: 'rgba(255,255,255,0.18)', margin: '0 auto 12px' }} />
      <p style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600, marginBottom: 16 }}>Sticker not found</p>
      <button onClick={() => navigate('/stickers')}
        style={{ color: '#A72C32', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
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
  const sStyle        = statusStyle(displayStatus)
  const battColor     = (liveBattery ?? 0) <= 20 ? '#F87171' : (liveBattery ?? 0) <= 40 ? '#FBBF24' : '#34D399'
  const timeColor     = liveHoursAgo > 24 ? '#F87171' : liveHoursAgo > 12 ? '#FBBF24' : '#34D399'

  const stats = [
    { icon: MapPin,  label: 'Last Location', value: liveLocation,  color: '#22D3EE' },
    { icon: Clock,   label: 'Last Seen',      value: liveLastSeen, color: timeColor },
    { icon: Battery, label: 'Battery',        value: liveBattery != null ? `${liveBattery}%` : '—', color: battColor },
  ]

  const bindDateStr = sticker.bindTime
    ? new Date(sticker.bindTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—'

  const infoFields = [
    { l: 'Device ID',   v: sticker.id },
    { l: 'Bind Date',   v: bindDateStr },
    { l: 'Category',    v: sticker.category || '—' },
    { l: 'Company',     v: sticker.company  || '—' },
    { l: 'Fence Zones', v: fenceZoneNames },
    { l: 'Detections',  v: sticker.detections ?? 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 760, padding: '4px 0' }}>

      {/* Back */}
      <button onClick={() => navigate('/stickers')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.50)', fontSize: 13,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: 'fit-content' }}
        onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.50)'}>
        <ArrowLeft style={{ width: 15, height: 15 }} /> Back to Stickers
      </button>

      {/* Header card */}
      <div style={{ ...panel, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ padding: 12, borderRadius: 14, background: 'rgba(167,44,50,0.10)', border: '1px solid rgba(167,44,50,0.25)', flexShrink: 0 }}>
            <Package style={{ width: 26, height: 26, color: '#A72C32' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', margin: 0 }}>{sticker.userName || sticker.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'monospace', color: '#A72C32', fontSize: 13 }}>{sticker.id}</span>
              {sticker.category && (
                <><span style={{ color: 'rgba(255,255,255,0.18)' }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{sticker.category}</span></>
              )}
              {sticker.company && (
                <><span style={{ color: 'rgba(255,255,255,0.18)' }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{sticker.company}</span></>
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
          <div key={s.label} style={{ ...panel, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <s.icon style={{ width: 13, height: 13, color: s.color }} />
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{s.label}</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13, color: s.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={s.value}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Device info */}
      <div style={{ ...panel, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Tag style={{ width: 15, height: 15, color: '#A72C32' }} />
          <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 14 }}>Device Info</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {infoFields.map(f => (
            <div key={f.l} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{f.l}</div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={String(f.v)}>
                {f.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Track device */}
      <div style={{ ...panel, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Navigation style={{ width: 15, height: 15, color: '#A72C32' }} />
          <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: 14 }}>Track Device</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <button
            onClick={() => navigate(`/map?device=${sticker.id}`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(167,44,50,0.10)', border: '1px solid rgba(167,44,50,0.28)',
              color: '#FFFFFF', fontSize: 13, fontWeight: 600,
              transition: 'background 0.18s, border-color 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.20)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.55)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.10)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.28)' }}
          >
            <MapPin style={{ width: 16, height: 16, color: '#A72C32', flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div>Live Map View</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', fontWeight: 400, marginTop: 2 }}>See current location on map</div>
            </div>
          </button>
          <button
            onClick={() => navigate(`/trajectory?device=${sticker.id}`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              color: '#FFFFFF', fontSize: 13, fontWeight: 600,
              transition: 'background 0.18s, border-color 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
          >
            <Route style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div>GPS Trajectory</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', fontWeight: 400, marginTop: 2 }}>View historical GPS path</div>
            </div>
          </button>
          <button
            onClick={() => navigate(`/reports?device=${sticker.id}`)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              color: '#FFFFFF', fontSize: 13, fontWeight: 600,
              transition: 'background 0.18s, border-color 0.18s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
          >
            <FileText style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div>Reports</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', fontWeight: 400, marginTop: 2 }}>Export location history</div>
            </div>
          </button>
        </div>
      </div>

    </div>
  )
}
