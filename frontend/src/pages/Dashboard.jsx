import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radio, Tag, WifiOff, Battery, Activity, AlertOctagon, Users, Shield, Layers, Link2, Unlink, FileDown, Loader } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'
import { useHomePageCache } from '../context/HomePageCacheContext.jsx'
import { useAlerts } from '../context/AlertsContext.jsx'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import KPICard from '../components/common/KPICard.jsx'


/* ── shared panel style ─────────────────────────────────────────── */
const panel = {
  background: '#242323',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '16px',
}

/* ── hover shadow helper ────────────────────────────────────────── */
const PANEL_SHADOW       = '0 4px 24px rgba(0,0,0,0.35)'
const PANEL_SHADOW_HOVER = '0 0 44px rgba(167,44,50,0.52), 0 12px 40px rgba(0,0,0,0.55)'

function usePanelHover() {
  const [hov, setHov] = React.useState(false)
  const bind = {
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
  }
  const style = {
    boxShadow:  hov ? PANEL_SHADOW_HOVER : PANEL_SHADOW,
    transition: 'box-shadow 0.22s ease, transform 0.22s ease',
    transform:  hov ? 'translateY(-2px)' : 'translateY(0)',
  }
  return { bind, style }
}

/* ── Tooltip ───────────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'rgba(12,12,12,0.95)', border:'1px solid rgba(180,20,20,0.3)', borderRadius:'10px', padding:'8px 12px', fontSize:'12px' }}>
      <div style={{ color:'#CFCFCF', marginBottom:'4px' }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ color:'#E05555', fontWeight:700 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

/* ── Battery donut colors: High / Medium / Low ─────────────────── */
const BATT_COLORS = ['#4ade80', '#F59E0B', '#f87171']

/* ── Insight card shell — identical to existing panel cards ─────── */
const INSIGHT_CARD = {
  ...panel,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
}
const CARD_HDR = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '10px', padding: '18px 20px 12px', flexShrink: 0,
}
const CARD_TTL = {
  fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em',
}
const CARD_SUB = { fontSize: '11px', color: '#E0E0E0', marginTop: '3px' }
const EMPTY_MSG = {
  color: '#D0D0D0', fontSize: '12px',
  textAlign: 'center', padding: '20px 0', margin: 0,
}
const BAR_COLORS = ['#3A86FF', '#4CAF50', '#F4A261', '#8E7DBE', '#2A9D8F']

function fmtRelTime(ts) {
  if (!ts) return '—'
  try {
    const diff = Date.now() - new Date(ts).getTime()
    if (isNaN(diff) || diff < 0)    return '—'
    if (diff < 60_000)              return 'Just now'
    if (diff < 3_600_000)           return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000)          return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 604_800_000)         return `${Math.floor(diff / 86_400_000)}d ago`
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '—' }
}

/* ══════════════════════════════════════════════════════════════════
   FLEET HEALTH SNAPSHOT — 4-column system diagnostics card for admin
   No filters — always shows live fleet state at a glance
   ══════════════════════════════════════════════════════════════════ */
function FleetSnapshotCard({ devices, locations, activityData, zones, summary }) {
  const { bind, style: hoverStyle } = usePanelHover()

  const total     = Number(summary?.total)  || devices.length
  const onlineNow = Number(summary?.online) || 0
  const onlineRate = total > 0 ? Math.round((onlineNow / total) * 100) : 0
  const upColor    = onlineRate >= 70 ? '#4ade80' : onlineRate >= 40 ? '#FBBF24' : '#f87171'

  const batteryWarn = useMemo(() =>
    Object.values(locations).filter(loc => loc?.batteryStatus != null && loc.batteryStatus < 20).length
  , [locations])

  const longOffline = useMemo(() => {
    const cutoff = 7 * 24 * 60 * 60 * 1000
    return devices.filter(d => {
      const loc = locations?.[d.sn]
      const ts  = loc?.timestamp ?? loc?.time ?? loc?.locTime ?? d.last_seen ?? d.dataRetrievalTime
      return ts && (Date.now() - new Date(ts).getTime()) > cutoff
    }).length
  }, [devices, locations])

  const inZone = useMemo(() =>
    devices.filter(d => d.fence_zone_ids?.length > 0).length
  , [devices])

  const locatorCount = Number(summary?.locators) || 0
  const stickerCount = Number(summary?.stickers) || 0
  const typeTotal    = locatorCount + stickerCount || 1
  const locPct       = Math.round((locatorCount / typeTotal) * 100)

  const { topZones, extraZones } = useMemo(() => {
    const active = [...zones]
      .map(z => ({ name: z.name || 'Unnamed', count: z.device_sns?.length || 0 }))
      .sort((a, b) => b.count - a.count)
      .filter(z => z.count > 0)
    return { topZones: active.slice(0, 4), extraZones: Math.max(0, active.length - 4) }
  }, [zones])

  const topDevices = useMemo(() =>
    [...devices]
      .map(d => ({ sn: d.sn, pts: activityData?.[d.sn]?.length || 0 }))
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 4)
  , [devices, activityData])

  const DIVIDER = { borderRight: '1px solid rgba(255,255,255,0.06)' }
  const SECTION_HDR = { fontSize: 10, fontWeight: 700, color: '#909090', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 14 }

  return (
    <div {...bind} style={{ ...INSIGHT_CARD, ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div>
          <div style={CARD_TTL}>Fleet Health Snapshot</div>
          <div style={CARD_SUB}>Live system diagnostics</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', padding: '2px 0 20px' }}>

        {/* ── Section 1: Uptime ── */}
        <div style={{ padding: '4px 24px 4px 20px', ...DIVIDER }}>
          <div style={SECTION_HDR}>Fleet Uptime</div>
          <div style={{ fontSize: 52, fontWeight: 800, color: upColor, lineHeight: 1, letterSpacing: '-0.04em' }}>{onlineRate}%</div>
          <div style={{ fontSize: 12, color: '#C0C0C0', marginTop: 6 }}>{onlineNow} of {total} online</div>
          <div style={{ marginTop: 14, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${onlineRate}%`, background: upColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', marginTop: 6 }}>
            {onlineRate >= 70 ? 'Fleet healthy' : onlineRate >= 40 ? 'Needs attention' : 'Critical — many offline'}
          </div>
        </div>

        {/* ── Section 2: Critical Watches ── */}
        <div style={{ padding: '4px 24px 4px', ...DIVIDER }}>
          <div style={SECTION_HDR}>Critical Watches</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Battery (Less than 20%)',  value: batteryWarn,  warn: batteryWarn > 0,  color: batteryWarn > 0 ? '#F59E0B' : '#4ade80' },
              { label: 'Offline (More than 7 days)', value: longOffline, warn: longOffline > 0,  color: longOffline > 0  ? '#f87171' : '#4ade80' },
              { label: 'fence',  value: inZone,        warn: false,            color: '#22D3EE' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, display: 'block', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#D0D0D0' }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: item.color, flexShrink: 0 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 3: Device Mix ── */}
        <div style={{ padding: '4px 24px 4px', ...DIVIDER }}>
          <div style={SECTION_HDR}>Device Mix</div>
          {/* Segmented bar */}
          <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ width: `${locPct}%`, background: '#00B4D8', transition: 'width 0.5s ease' }} />
            <div style={{ flex: 1, background: '#FFB703' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Locators',       value: locatorCount, color: '#00B4D8', pct: locPct },
              { label: 'Smart Stickers', value: stickerCount, color: '#FFB703', pct: 100 - locPct },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, display: 'block', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#D0D0D0' }}>{item.label}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace' }}>{item.pct}%</span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 4: Zone Pizza Chart or Top Devices ── */}
        <div style={{ padding: '4px 20px 4px 24px' }}>
          <div style={SECTION_HDR}>Top Active Zones</div>
          {topZones.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Legend on left */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 0.5 }}>
                {topZones.map((z, i) => {
                  const totalCount = topZones.reduce((s, x) => s + x.count, 0)
                  const pct = Math.round((z.count / totalCount) * 100)
                  const color = BAR_COLORS[i % BAR_COLORS.length]
                  return (
                    <div key={z.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'block', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#D0D0D0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, flexShrink: 0 }}>{pct}%</span>
                    </div>
                  )
                })}
                {extraZones > 0 && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', paddingLeft: 12, fontStyle: 'italic' }}>
                    +{extraZones} more zone{extraZones !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              {/* Pie chart on right */}
              <div style={{ flex: 0.5 }}>
                <ResponsiveContainer width="100%" height={90}>
                  <PieChart>
                    <Pie
                      data={topZones}
                      dataKey="count"
                      cx="50%"
                      cy="50%"
                      outerRadius={42}
                      paddingAngle={topZones.length > 1 ? 3 : 0}
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {topZones.map((z, i) => (
                        <Cell key={z.name} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      cursor={false}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const z = payload[0].payload
                        const color = BAR_COLORS[topZones.indexOf(z) % BAR_COLORS.length]
                        const pct = Math.round((z.count / topZones.reduce((s, x) => s + x.count, 0)) * 100)
                        return (
                          <div style={{ background: '#161616', border: `1px solid ${color}40`, borderRadius: 8, padding: '8px 12px', pointerEvents: 'none', boxShadow: `0 4px 16px rgba(0,0,0,0.5)` }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{z.name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'block' }} />
                              <span style={{ fontSize: 11, color: color, fontWeight: 700 }}>{z.count} device{z.count !== 1 ? 's' : ''}</span>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>{pct}%</span>
                            </div>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topDevices.map((d, i) => (
                <div key={d.sn} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: BAR_COLORS[i % BAR_COLORS.length], display: 'block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#D0D0D0', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.sn}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: BAR_COLORS[i % BAR_COLORS.length], flexShrink: 0 }}>{d.pts} pts</span>
                </div>
              ))}
              {topDevices.every(d => d.pts === 0) && (
                <p style={EMPTY_MSG}>No activity data yet</p>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   RECENT ACTIVITY PANEL — filtered table, max 8 rows, no scroll
   ══════════════════════════════════════════════════════════════════ */
function RecentActivityPanel({ activityRows, totalActive }) {
  const { bind, style: hoverStyle } = usePanelHover()
  const [search, setSearch] = useState('')

  const activeRows = useMemo(() =>
    activityRows.filter(r => r.status === 'online')
  , [activityRows])

  const isSearching = search.trim().length > 0

  const visibleRows = useMemo(() => {
    if (!isSearching) return activeRows.slice(0, 6)
    const q = search.toLowerCase()
    return activityRows
      .filter(r => r.id.toLowerCase().includes(q) || r.user.toLowerCase().includes(q))
      .slice(0, 6)
  }, [activityRows, activeRows, search, isSearching])

  const trueTotal = totalActive ?? activeRows.length
  const overflow  = !isSearching ? Math.max(0, trueTotal - 6) : 0

  return (
    <div {...bind} style={{ ...panel, overflow: 'hidden', ...hoverStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>Recent Activity</div>
          <div style={{ fontSize: '11px', color: '#E0E0E0', marginTop: '2px' }}>
            {isSearching
              ? `${visibleRows.length} result${visibleRows.length !== 1 ? 's' : ''} for "${search.trim()}"`
              : trueTotal === 0
                ? 'No active devices right now'
                : `Showing ${visibleRows.length} of ${trueTotal} active device${trueTotal !== 1 ? 's' : ''}`}
          </div>
        </div>
        <input
          placeholder="Search devices…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flexShrink: 0, height: '28px', padding: '0 12px', fontSize: '11px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '999px', color: '#F5F5F5', outline: 'none',
            width: '140px', transition: 'border-color 0.15s, width 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.55)'; e.target.style.width = '180px' }}
          onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.width = '140px' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 130px 1fr', padding: '8px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {['Device ID', 'User / Label', 'Status', 'Last Reported'].map(h => (
          <span key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#B8B8B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
        ))}
      </div>
      <div>
        {visibleRows.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#B8B8B8', fontSize: '13px' }}>
            {isSearching ? `No results for "${search.trim()}"` : 'No active devices'}
          </div>
        ) : visibleRows.map((row, idx) => (
          <div key={row.id}
            style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 130px 1fr',
              padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              transition: 'background 0.12s', cursor: 'default',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,44,50,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
        >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.id}</span>
              <span style={{ flexShrink: 0, fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                padding: '1px 6px', borderRadius: '4px', whiteSpace: 'nowrap',
                ...(row.type === 'Sticker'
                  ? { background: 'rgba(255,183,3,0.12)', color: '#FFB703', border: '1px solid rgba(255,183,3,0.24)' }
                  : { background: 'rgba(0,180,216,0.12)', color: '#00B4D8', border: '1px solid rgba(0,180,216,0.24)' }) }}>
                {row.type}
              </span>
            </span>
            <span style={{ fontSize: '12px', color: '#F0F0F0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>{row.user}</span>
            <span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(74,222,128,0.10)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.22)' }}>● Active</span>
            </span>
            <span style={{ fontSize: '12px', color: '#D4D4D4', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtRelTime(row.lastSeen)}</span>
          </div>
        ))}
        {overflow > 0 && (
          <div style={{ padding: '10px 20px', fontSize: '11px', color: 'rgba(255,255,255,0.35)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', fontStyle: 'italic' }}>
            +{overflow} more active · search by device ID or user name to find them
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CRITICAL ALERT STRIP — alert banner with hover shadow
   ══════════════════════════════════════════════════════════════════ */
function CriticalAlertStrip({ alerts, onView }) {
  const { bind, style: hoverStyle } = usePanelHover()
  const critical = alerts.filter(a => !a.isRead && a.severity === 'critical')
  const PREVIEW = 3
  const names   = critical.map(a => a.deviceName || a.deviceId)
  const preview = names.slice(0, PREVIEW).join(', ')
  const more    = names.length - PREVIEW
  return (
    <div {...bind} style={{ ...panel, padding:'12px 20px', display:'flex', alignItems:'center', gap:'12px', borderColor:'rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.06)', ...hoverStyle }}>
      <AlertOctagon style={{ width:'18px', height:'18px', color:'#f87171', flexShrink:0 }} />
      {/* Single fixed-height line — truncates with ellipsis no matter how many alerts */}
      <div style={{ flex:1, minWidth:0, fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        <span style={{ color:'#fca5a5', fontWeight:600 }}>
          {names.length} Critical Alert{names.length !== 1 ? 's' : ''}:{' '}
        </span>
        <span style={{ color:'#CFCFCF' }}>
          {preview}{more > 0 ? `, +${more} more` : ''} require immediate attention
        </span>
      </div>
      <button
        onClick={onView}
        style={{ flexShrink:0, display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:8,
          background:'#A72C32', border:'1px solid #8B2328', color:'#FFFFFF',
          fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap' }}
        onMouseEnter={e => { e.currentTarget.style.background='#8B2328' }}
        onMouseLeave={e => { e.currentTarget.style.background='#A72C32' }}
      >
        View all →
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   RECENT TREND PANEL — hourly activity area chart
   ══════════════════════════════════════════════════════════════════ */
function RecentTrendPanel({ generalBins, peakLabel }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...panel, padding:'18px 20px', display:'flex', flexDirection:'column', ...hoverStyle }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
        <div style={{ fontSize:'15px', fontWeight:700, color:'#FFFFFF', letterSpacing:'-0.01em' }}>Recent Trend</div>
        <span style={{ fontSize:'11px', fontWeight:700, color:'#C44E54', background:'rgba(164,44,50,0.12)', border:'1px solid rgba(164,44,50,0.22)', borderRadius:'6px', padding:'3px 10px' }}>
          {peakLabel}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={generalBins} margin={{ top:4, right:4, bottom:0, left:-20 }}>
            <defs>
              <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#A72C32" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#A72C32" stopOpacity={0} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="hour" ticks={[0,4,8,12,16,20]} tickFormatter={h => `${String(h).padStart(2,'0')}h`}
              tick={{ fill:'#B8B8B8', fontSize:10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'#B8B8B8', fontSize:10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} />
            <Area
              type="monotone"
              dataKey="count"
              name="Detections"
              stroke="#C44E54"
              strokeWidth={2.5}
              fill="url(#redGrad)"
              dot={false}
              activeDot={{ r:5, fill:'#E05555', stroke:'rgba(200,50,50,0.4)', strokeWidth:4 }}
              style={{ filter:'drop-shadow(0 0 6px rgba(196,78,84,0.6))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   BATTERY STATUS PANEL — donut chart with hover shadow
   ══════════════════════════════════════════════════════════════════ */
function BatteryStatusPanel({ batteryTiers }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...panel, padding:'18px 20px', display:'flex', flexDirection:'column', ...hoverStyle }}>
      <div style={{ fontSize:'15px', fontWeight:700, color:'#FFFFFF', letterSpacing:'-0.01em', marginBottom:'3px' }}>Battery Status</div>
      <div style={{ fontSize:'11px', color:'#E0E0E0', marginBottom:'10px' }}>
        {batteryTiers.noData ? 'No location data yet' : `${batteryTiers.total} devices reporting`}
      </div>
      {batteryTiers.noData ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', height:'130px' }}>
          <div style={{ textAlign:'center' }}>
            <Battery style={{ width:'28px', height:'28px', color:'#A0A0A0', margin:'0 auto 8px' }} />
            <div style={{ fontSize:'12px', color:'#B8B8B8' }}>Awaiting location data</div>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={130}>
          <PieChart>
            <Pie
              data={[
                { name: 'High (≥60%)',     value: batteryTiers.high },
                { name: 'Medium (20–59%)', value: batteryTiers.medium },
                { name: 'Low (<20%)',      value: batteryTiers.low },
              ]}
              cx="50%" cy="50%"
              innerRadius={38} outerRadius={60}
              paddingAngle={3} dataKey="value" strokeWidth={0}
            >
              {BATT_COLORS.map((color, i) => <Cell key={i} fill={color} />)}
            </Pie>
            <Tooltip contentStyle={{ background:'rgba(12,12,12,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', fontSize:'12px', color:'#fff' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:'7px', marginTop:'10px' }}>
        {[
          { name: 'High',   range: 'atleast 60%',  value: batteryTiers.high,   color: BATT_COLORS[0] },
          { name: 'Medium', range: '20 to 50%', value: batteryTiers.medium, color: BATT_COLORS[1] },
          { name: 'Low',    range: 'less than 20%',  value: batteryTiers.low,    color: BATT_COLORS[2] },
        ].map(s => (
          <div key={s.name} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:s.color, display:'block', flexShrink:0 }} />
              <span style={{ fontSize:'12px', color:'#D8D8D8' }}>{s.name}</span>
              <span style={{ fontSize:'10px', color:'#B8B8B8', fontFamily:'monospace' }}>{s.range}</span>
            </div>
            <span style={{ fontSize:'12px', fontWeight:700, color:'#F5F5F5' }}>
              {batteryTiers.noData ? '—' : s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   ALERTS SUMMARY — executive aggregate of unread alerts by severity
   and category (offline / battery / geofence), from AlertsContext
   ══════════════════════════════════════════════════════════════════ */
function AlertSummaryCard({ stats, alerts = [], onView }) {
  const { bind, style: hoverStyle } = usePanelHover()

  const severities = [
    { label: 'Critical', value: stats.critical, color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.25)' },
    { label: 'Warning',  value: stats.warning,  color: '#FBBF24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.25)' },
    { label: 'Info',     value: stats.info,     color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',  border: 'rgba(96,165,250,0.25)' },
  ]
  const categories = [
    { icon: WifiOff, label: 'Offline alerts', value: stats.offline, color: '#f87171' },
    { icon: Battery, label: 'Low battery',    value: stats.battery, color: '#F59E0B' },
    { icon: Shield,  label: 'Fence activity', value: stats.fence,   color: '#22D3EE' },
  ]

  // Device names/IDs from unread critical alerts
  const criticalDevices = useMemo(() => {
    const unreadCritical = alerts.filter(a => !a.isRead && a.severity === 'critical')
    // deduplicate by device
    const seen = new Set()
    return unreadCritical
      .map(a => ({ name: a.deviceName || a.deviceId || '—', type: a.type }))
      .filter(({ name }) => { if (seen.has(name)) return false; seen.add(name); return true })
  }, [alerts])

  const SHOW_LIMIT = 6
  const visibleDevices = criticalDevices.slice(0, SHOW_LIMIT)
  const overflow       = criticalDevices.length - SHOW_LIMIT

  const typeLabel = t => {
    if (t === 'DEVICE_OFFLINE') return 'Offline'
    if (t === 'BATTERY_LOW')    return 'Battery'
    if (t === 'GEOFENCE')       return 'Fence'
    return null
  }

  return (
    <div {...bind} style={{ ...panel, padding: '18px 20px', ...hoverStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>Alerts Summary</div>
        <button onClick={onView}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, padding: 0, transition: 'color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          View all →
        </button>
      </div>

      {stats.total === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', borderRadius: 10, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}>
          <Shield style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#86efac', fontWeight: 600 }}>All clear — no active alerts</span>
        </div>
      ) : (
        <>
          {/* Severity chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            {severities.map(s => (
              <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Critical device list */}
          {visibleDevices.length > 0 && (
            <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.14)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 8 }}>
                Critical devices
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {visibleDevices.map(({ name, type }) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f87171', flexShrink: 0, display: 'block' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    {typeLabel(type) && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
                        {typeLabel(type)}
                      </span>
                    )}
                  </div>
                ))}
                {overflow > 0 && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', paddingLeft: 11, fontStyle: 'italic' }}>
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Category breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {categories.map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <c.icon style={{ width: 12, height: 12, color: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#D8D8D8', flex: 1 }}>{c.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#F5F5F5' }}>{c.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   METRIC CARD — compact stat card with hover shadow
   ══════════════════════════════════════════════════════════════════ */
function MetricCard({ m }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...panel, padding:'14px 18px', display:'flex', alignItems:'center', gap:'12px', cursor: m.onClick ? 'pointer' : 'default', ...hoverStyle }} onClick={m.onClick}>
      <div style={{ width:'38px', height:'38px', borderRadius:'10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <m.icon style={{ width:'17px', height:'17px', color: m.color }} />
      </div>
      <div>
        <div style={{ fontSize:'22px', fontWeight:800, color:'#FFFFFF', letterSpacing:'-0.02em', lineHeight:1 }}>{m.value}</div>
        <div style={{ fontSize:'12px', fontWeight:600, color:'#E2E2E2', marginTop:'3px' }}>{m.label}</div>
        <div style={{ fontSize:'10px', color:'#BBBBBB', marginTop:'1px' }}>{m.sub}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { locations, activityData, devices: rawDevices, summary } = useHomePageCache()
  const navigate = useNavigate()
  const { alerts } = useAlerts()
  const { users } = useUserCache()
  const { zones } = useZoneCache()
  const dashboardRef = useRef(null)
  const page1Ref     = useRef(null)
  const page2Ref     = useRef(null)
  const exportBtnRef = useRef(null)

  const [exporting,    setExporting]    = useState(false)
  const [isCapturing,  setIsCapturing]  = useState(false)
  const [activePage,   setActivePage]   = useState(1)

  const handleExportPDF = async () => {
    if (exporting) return
    setExporting(true)
    const savedPage = activePage
    setIsCapturing(true)
    await new Promise(r => setTimeout(r, 80))

    try {
      const p1 = page1Ref.current
      const p2 = page2Ref.current
      if (!p1 || !p2) return

      const PX_TO_MM = 25.4 / 96

      const nodeFilter = node => {
        if (exportBtnRef.current && node === exportBtnRef.current) return false
        return true
      }

      async function captureEl(el) {
        // Temporarily reveal full content so nothing is clipped
        const prev = { overflow: el.style.overflow, height: el.style.height }
        el.style.overflow = 'visible'
        el.style.height   = 'auto'
        await new Promise(r => requestAnimationFrame(r))
        const w = el.scrollWidth
        const h = el.scrollHeight
        const dataUrl = await toPng(el, {
          pixelRatio: 2,
          backgroundColor: '#0d0d0d',
          width: w, height: h,
          filter: nodeFilter,
        })
        el.style.overflow = prev.overflow
        el.style.height   = prev.height
        return { dataUrl, w, h }
      }

      // Capture page 1
      setActivePage(1)
      await new Promise(r => setTimeout(r, 120))
      const r1 = await captureEl(p1)

      // Capture page 2
      setActivePage(2)
      await new Promise(r => setTimeout(r, 120))
      const r2 = await captureEl(p2)

      // Single PDF page — both views stacked vertically, zero padding
      const w1mm = r1.w * PX_TO_MM
      const h1mm = r1.h * PX_TO_MM
      const w2mm = r2.w * PX_TO_MM
      const h2mm = r2.h * PX_TO_MM
      const pageW = Math.max(w1mm, w2mm)
      const pageH = h1mm + h2mm

      const pdf = new jsPDF({
        orientation: pageW >= pageH ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [pageW, pageH],
      })
      pdf.addImage(r1.dataUrl, 'PNG', 0, 0, w1mm, h1mm)
      pdf.addImage(r2.dataUrl, 'PNG', 0, h1mm, w2mm, h2mm)

      const now   = new Date()
      const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      pdf.save(`TPL-Dashboard-${stamp}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setIsCapturing(false)
      setExporting(false)
      setActivePage(savedPage)
    }
  }

  // Hourly activity bins from real playback data
  const generalBins = useMemo(() => {
    const devHour = {}
    rawDevices.filter(d => d.sn).forEach(({ sn }) => {
      devHour[sn] = {};
      (activityData[sn] ?? []).forEach(pt => {
        const ts = pt.timestamp ?? pt.time ?? pt.locTime
        if (!ts) return
        const raw = typeof ts === 'string' && !ts.endsWith('Z') && !ts.includes('+') ? ts + 'Z' : ts
        const d = new Date(raw)
        if (isNaN(d)) return
        const h = d.getUTCHours()
        devHour[sn][h] = (devHour[sn][h] || 0) + 1
      })
    })
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: Object.values(devHour).reduce((s, hc) => s + (hc[h] ?? 0), 0),
    }))
  }, [activityData, rawDevices])

  const peakLabel = useMemo(() => {
    if (!generalBins.length) return 'No data'
    const peak = generalBins.reduce((m, b) => b.count > m.count ? b : m, generalBins[0])
    if (peak.count === 0) return 'No activity'
    const h = peak.hour
    return `Peak ${String(h).padStart(2, '0')}:00–${String((h + 2) % 24).padStart(2, '0')}:00`
  }, [generalBins])

  // Re-render every 3s so relative "last reported" times stay fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 3000)
    return () => clearInterval(id)
  }, [])

  // Device counts from lightweight summary endpoint — no giant array loaded
  const activeNow      = summary.online
  const offlineDevices = summary.offline
  const weeklyLocators = summary.weekly_new_locators
  const weeklyStickers = summary.weekly_new_stickers

  // Battery tiers — sourced from GET /api/location/{sn} → batteryStatus field
  const batteryTiers = useMemo(() => {
    const vals = Object.values(locations)
      .map(loc => loc?.batteryStatus)
      .filter(v => v != null && !isNaN(v))
    return {
      high:   vals.filter(v => v >= 60).length,
      medium: vals.filter(v => v >= 20 && v < 60).length,
      low:    vals.filter(v => v < 20).length,
      total:  vals.length,
      noData: vals.length === 0,
    }
  }, [locations])

  // Recent Activity table — real devices sorted by latest location timestamp
  const activityRows = useMemo(() => {
    return [...rawDevices]
      .map(d => {
        const sn  = d.sn ?? ''
        const loc = locations?.[sn]
        const lastTs = loc?.timestamp ?? loc?.time ?? loc?.locTime
          ?? d.dataRetrievalTime ?? d.last_seen ?? null
        const withinWindow = lastTs
          ? (Date.now() - new Date(lastTs).getTime()) < 12 * 60 * 60_000
          : false
        // Also check device-level status field — catches devices the location
        // batch API missed (they're online in the DB but missing from the cache)
        const devStatus = String(d.status ?? d.deviceStatus ?? '').toLowerCase()
        const isOnline = withinWindow || devStatus === 'online' || devStatus === 'on'
        const type = /^\d+$/.test(String(sn)) ? 'Sticker' : 'Locator'
        return {
          id:       sn,
          user:     d.assigned_user_name ?? d.assignedUser ?? d.name ?? '—',
          status:   isOnline ? 'online' : 'offline',
          lastSeen: lastTs,
          type,
          ts:       lastTs ? new Date(lastTs).getTime() : 0,
        }
      })
      .filter(r => r.id)
      .sort((a, b) => b.ts - a.ts)
  }, [rawDevices, locations])

  // Executive alert aggregates — unread alerts from AlertsContext
  // (severity: critical/high/medium · type: DEVICE_OFFLINE/BATTERY_LOW/GEOFENCE)
  const alertStats = useMemo(() => {
    const unread = alerts.filter(a => !a.isRead)
    return {
      critical: unread.filter(a => a.severity === 'critical').length,
      warning:  unread.filter(a => a.severity === 'high').length,
      info:     unread.filter(a => a.severity === 'medium').length,
      offline:  unread.filter(a => a.type === 'DEVICE_OFFLINE').length,
      battery:  unread.filter(a => a.type === 'BATTERY_LOW').length,
      fence:    unread.filter(a => a.type === 'GEOFENCE').length,
      total:    unread.length,
    }
  }, [alerts])

  const totalDevices    = Number(summary?.total) || 0
  const assignedDevices = Number(summary?.assigned) || 0
  const unboundCount    = Math.max(0, totalDevices - assignedDevices)

  const p1TransLock = useRef(false)
  const p2TransLock = useRef(false)
  const goToPage2 = () => setActivePage(2)
  const goToPage1 = () => setActivePage(1)

  const handlePage1Wheel = (e) => {
    if (e.deltaY > 0 && !p1TransLock.current) {
      p1TransLock.current = true
      goToPage2()
      setTimeout(() => { p1TransLock.current = false }, 600)
    }
  }

  const handlePage2Wheel = (e) => {
    if (page2Ref.current?.scrollTop === 0 && e.deltaY < 0 && !p2TransLock.current) {
      p2TransLock.current = true
      goToPage1()
      setTimeout(() => { p2TransLock.current = false }, 600)
    }
  }

  return (
    <div ref={dashboardRef} style={{ position:'relative', height:'100%', overflow:'hidden' }}>
      {/* ══════════════════════════════ PAGE 1 ══════════════════════════════ */}
      {/* Outer wrapper owns the slide transform */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateY(${activePage === 1 ? '0' : '-100%'})`,
        transition: isCapturing ? 'none' : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)',
      }}>

      {/* Inner content div — overflow hidden */}
      <div
        ref={page1Ref}
        style={{
          position: 'absolute', inset: 0,
          overflow: 'hidden',
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}
        onWheel={handlePage1Wheel}
      >

        {/* ── Dashboard header ──────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <h1 style={{ fontSize:22, fontWeight:800, color:'#FFFFFF', margin:0, letterSpacing:'-0.01em' }}>Dashboard</h1>
          <button
            ref={exportBtnRef}
            onClick={handleExportPDF}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 10,
              background: exporting ? 'rgba(167,44,50,0.25)' : 'rgba(167,44,50,0.14)',
              border: '1px solid rgba(167,44,50,0.35)',
              color: exporting ? 'rgba(255,255,255,0.45)' : '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.18s', letterSpacing: '0.01em',
            }}
            onMouseEnter={e => { if (!exporting) { e.currentTarget.style.background='rgba(167,44,50,0.30)'; e.currentTarget.style.borderColor='rgba(167,44,50,0.60)' }}}
            onMouseLeave={e => { e.currentTarget.style.background= exporting ? 'rgba(167,44,50,0.25)' : 'rgba(167,44,50,0.14)'; e.currentTarget.style.borderColor='rgba(167,44,50,0.35)' }}
          >
            {exporting
              ? <Loader style={{ width:14, height:14, animation:'spin 1s linear infinite' }} />
              : <FileDown style={{ width:14, height:14 }} />}
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'10px', flexShrink: 0 }}>
          <KPICard
            title="Assigned Devices"
            value={assignedDevices}
            sub=""
            icon={Link2}
            onClick={() => navigate('/devices?status=assigned')}
          />
          <KPICard
            title="Unassigned Devices"
            value={unboundCount}
            sub=""
            icon={Unlink}
            onClick={() => navigate('/devices?status=unassigned')}
            colors={{
              gradient:    'linear-gradient(145deg, #1C2A4A 0%, #18223C 40%, #121A2E 70%, #0C1220 100%)',
              border:      'rgba(59,130,246,0.25)',
              shadow:      '0 0 28px rgba(59,130,246,0.10), 0 12px 38px rgba(0,0,0,0.52)',
              shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)',
              shimmer:     'rgba(59,130,246,0.32)',
              radialTL:    'rgba(59,130,246,0.14)',
              iconBg:      'rgba(59,130,246,0.12)',
              iconBorder:  'rgba(59,130,246,0.24)',
              iconColor:   '#3B82F6',
              gloss:       0.034,
            }}
          />
          <KPICard
            title="Active Devices"
            value={activeNow}
            sub="last 30 min"
            icon={Activity}
            trend="up"
            trendVal="Online now"
            onClick={() => navigate('/devices?tab=locator&status=active')}
            colors={{
              gradient:    'linear-gradient(145deg, #1A3328 0%, #142820 40%, #0F2018 70%, #0A1810 100%)',
              border:      'rgba(46,196,182,0.25)',
              shadow:      '0 0 28px rgba(46,196,182,0.10), 0 12px 38px rgba(0,0,0,0.52)',
              shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)',
              shimmer:     'rgba(46,196,182,0.34)',
              radialTL:    'rgba(46,196,182,0.14)',
              iconBg:      'rgba(46,196,182,0.12)',
              iconBorder:  'rgba(46,196,182,0.24)',
              iconColor:   '#2EC4B6',
              gloss:       0.032,
            }}
          />
          <KPICard
            title="Offline Devices"
            value={offlineDevices}
            sub="requires attention"
            icon={WifiOff}
            trend={offlineDevices > 0 ? 'down' : 'up'}
            trendVal={offlineDevices > 0 ? 'Needs review' : 'All online'}
            onClick={() => navigate('/missing')}
            colors={{
              gradient:    'linear-gradient(145deg, #3D1D22 0%, #2D191E 40%, #231015 70%, #180C10 100%)',
              border:      'rgba(255,77,109,0.25)',
              shadow:      '0 0 28px rgba(255,77,109,0.10), 0 12px 38px rgba(0,0,0,0.52)',
              shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)',
              shimmer:     'rgba(255,77,109,0.34)',
              radialTL:    'rgba(255,77,109,0.14)',
              iconBg:      'rgba(255,77,109,0.12)',
              iconBorder:  'rgba(255,77,109,0.24)',
              iconColor:   '#FF4D6D',
              gloss:       0.028,
            }}
          />
        </div>

        {/* ── Platform metrics ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'10px', flexShrink: 0 }}>
          {[
            { label:'Total Devices',  value: totalDevices,     icon: Layers, color:'#00B4D8', sub:`${summary.locators ?? 0} locators · ${summary.stickers ?? 0} stickers`, onClick: () => navigate('/devices') },
            { label:'Users',          value: users.length,     icon: Users,  color:'#22D3EE', sub:'under your account' },
            { label:'fences',     value: zones.length,     icon: Shield, color:'#F59E0B', sub:'active fence zones', onClick: () => navigate('/geofence') },
            { label:'Smart Stickers', value: summary.stickers, icon: Tag,    color:'#FFB703', sub: weeklyStickers > 0 ? `+${weeklyStickers} this week` : '', onClick: () => navigate('/stickers') },
          ].map(m => <MetricCard key={m.label} m={m} />)}
        </div>

        {/* ── Analytics ── */}
        <div style={{ flex: 1, minHeight: 0, display:'grid', gridTemplateColumns:'minmax(0, 2fr) minmax(240px, 1fr)', gap:'10px' }}>
          <RecentTrendPanel generalBins={generalBins} peakLabel={peakLabel} />
          <BatteryStatusPanel batteryTiers={batteryTiers} />
        </div>


      </div>

      </div>{/* ── closes page 1 slide wrapper ── */}

      {/* ══════════════════════════════ PAGE 2 ══════════════════════════════ */}
      {/* Outer wrapper owns the slide transform; inner div owns the scroll */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translateY(${activePage === 2 ? '0' : '100%'})`,
        transition: isCapturing ? 'none' : 'transform 0.45s cubic-bezier(0.22,1,0.36,1)',
      }}>

        {/* Scrollable content */}
        <div
          ref={page2Ref}
          style={{
            position: 'absolute', inset: 0,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '14px',
          }}
          onWheel={handlePage2Wheel}
        >

          {/* ── Level 2 ── */}
          <div style={{ display:'grid', gridTemplateColumns:'minmax(0, 2fr) minmax(300px, 1fr)', gap:'14px' }}>
            <RecentActivityPanel activityRows={activityRows} totalActive={summary.online} />
            <AlertSummaryCard stats={alertStats} alerts={alerts} onView={() => navigate('/alerts')} />
          </div>

          {/* ── Level 3 ── */}
          <FleetSnapshotCard
            devices={rawDevices}
            locations={locations}
            activityData={activityData}
            zones={zones}
            summary={summary}
          />

        </div>
      </div>

    </div>
  )
}
