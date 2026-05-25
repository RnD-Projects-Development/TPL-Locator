import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radio, Tag, WifiOff, Battery, Zap, Clock, Activity, AlertOctagon } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { useHomePageCache } from '../context/HomePageCacheContext.jsx'
import { useBindCache } from '../context/BindCacheContext.jsx'
import { useAlerts } from '../context/AlertsContext.jsx'
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

/* ── Insight row card shell — identical to existing panel cards ─── */
const INSIGHT_CARD = {
  ...panel,
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
}
const CARD_HDR = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: '10px', padding: '22px 22px 14px', flexShrink: 0,
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

function todayStr() { return new Date().toISOString().slice(0, 10) }

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
   TOP DEVICES — horizontal bar chart (packet count)
   ══════════════════════════════════════════════════════════════════ */
function TopDevicesCard({ devices, activityData }) {
  const [hovered, setHovered] = useState(null)
  const [dims, setDims]       = useState({ w: 300, h: 180 })
  const wrapRef               = useRef(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setDims({ w: Math.max(width, 100), h: Math.max(height, 60) })
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const ranked = useMemo(() => [...devices]
    .map(d => {
      const sn      = d.sn ?? ''
      const packets = activityData[sn]?.length || (d.datapoint_count ?? d.packetCount ?? d.packet_count ?? 0)
      return { sn, name: d.name ?? d.assignedUser ?? sn, packets }
    })
    .filter(d => d.sn)
    .sort((a, b) => b.packets - a.packets)
    .slice(0, 5),
  [devices, activityData])

  const maxP  = ranked[0]?.packets || 1
  const PAD_L = 88, PAD_R = 48, PAD_T = 8, PAD_B = 8
  const { w: W, h: H } = dims
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B
  const rowH   = ranked.length > 0 ? chartH / ranked.length : 0
  const barH   = Math.min(14, rowH * 0.45)
  const xTicks = [0.25, 0.5, 0.75, 1]

  const { bind: hoverBind, style: hoverStyle } = usePanelHover()
  return (
    <div {...hoverBind} style={{ ...INSIGHT_CARD, minHeight: '260px', ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div>
          <div style={CARD_TTL}>Top 5 by Packets</div>
          <div style={CARD_SUB}>{ranked.length} devices reporting</div>
        </div>
      </div>
      <div ref={wrapRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {ranked.length === 0 ? (
          <p style={EMPTY_MSG}>No activity data</p>
        ) : (
          <svg width={W} height={H} style={{ display: 'block', position: 'absolute', inset: 0 }}>
            <defs>
              {ranked.map((_, i) => (
                <linearGradient key={`hbg${i}`} id={`dbhbg${i}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%"   stopColor={BAR_COLORS[i]} stopOpacity="0.55" />
                  <stop offset="100%" stopColor={BAR_COLORS[i]} stopOpacity="1" />
                </linearGradient>
              ))}
            </defs>
            {xTicks.map((f, ti) => {
              const x = PAD_L + f * chartW
              return <line key={ti} x1={x} x2={x} y1={PAD_T} y2={PAD_T + chartH} stroke="rgba(255,255,255,0.06)" strokeWidth={1} strokeDasharray="3 4" />
            })}
            <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PAD_T + chartH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            {ranked.map((r, i) => {
              const barW  = Math.max((r.packets / maxP) * chartW, 2)
              const cy    = PAD_T + i * rowH + rowH / 2
              const isHov = hovered === i
              const label = (r.name !== r.sn ? r.name : r.sn).replace('CARD-', '')
              const displayLabel = label.length > 13 ? label.slice(0, 12) + '…' : label
              return (
                <g key={r.sn} style={{ cursor: 'default' }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}>
                  {isHov && <rect x={PAD_L} y={PAD_T + i * rowH} width={chartW} height={rowH} fill="rgba(167,44,50,0.07)" rx={2} />}
                  <rect x={PAD_L} y={cy - barH / 2} width={barW} height={barH} rx={4}
                    fill={`url(#dbhbg${i})`} opacity={isHov ? 1 : 0.82}
                    style={{ transition: 'opacity 0.15s' }} />
                  <text x={PAD_L - 6} y={cy + 3.5} textAnchor="end" fontSize={10} fontWeight="600"
                    fill={isHov ? '#fca5a5' : '#D4D4D4'}
                    style={{ transition: 'fill 0.15s' }}>
                    {displayLabel}
                  </text>
                  <text x={PAD_L + barW + 5} y={cy + 3.5} textAnchor="start" fontSize={9}
                    fill={BAR_COLORS[i]} fontWeight="700">
                    {r.packets.toLocaleString()}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   USER DEVICE PANEL — pie chart + scrollable device list
   ══════════════════════════════════════════════════════════════════ */
function UserDevicePanelCard({ devices }) {
  const [hovered, setHovered] = useState(null)
  const [search, setSearch]   = useState('')
  const ini = n => n.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??'

  const { userDevices, slices } = useMemo(() => {
    const map = {}
    devices.forEach(d => {
      const u = d.assignedUser ?? d.assigned_user_name ?? d.client ?? d.name ?? 'Unassigned'
      if (!map[u]) map[u] = []
      map[u].push({ sn: d.sn ?? '', name: d.name ?? d.assignedUser ?? d.sn ?? '' })
    })
    const userDevices = Object.entries(map).sort((a, b) => b[1].length - a[1].length)
    const total = userDevices.reduce((s, [, devs]) => s + devs.length, 0)
    if (total === 0) return { userDevices, slices: [] }

    const CX = 90, CY = 90, R = 80, GAP = 1.2
    const toRad = deg => (deg * Math.PI) / 180
    let cursor = -90
    const slices = userDevices.slice(0, 5).map(([user, devs], i) => {
      const count = devs.length
      const deg   = (count / total) * (360 - Math.min(userDevices.length, 5) * GAP)
      const start = cursor
      const end   = start + deg
      cursor      = end + GAP
      const large = deg > 180 ? 1 : 0
      const x1 = CX + R * Math.cos(toRad(start))
      const y1 = CY + R * Math.sin(toRad(start))
      const x2 = CX + R * Math.cos(toRad(end))
      const y2 = CY + R * Math.sin(toRad(end))
      const mid = toRad(start + deg / 2)
      return {
        user, count, color: BAR_COLORS[i % BAR_COLORS.length],
        path: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`,
        lx: CX + R * 0.62 * Math.cos(mid),
        ly: CY + R * 0.62 * Math.sin(mid),
        pct: Math.round((count / total) * 100),
      }
    })
    return { userDevices, slices }
  }, [devices])

  const hovSlice = hovered !== null ? slices[hovered] : null
  const CX = 90, CY = 90

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase()
    return userDevices.filter(([user]) => !q || user.toLowerCase().includes(q)).slice(0, 15)
  }, [userDevices, search])

  const { bind: hoverBind, style: hoverStyle } = usePanelHover()
  return (
    <div {...hoverBind} style={{ ...INSIGHT_CARD, minHeight: '260px', ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div>
          <div style={CARD_TTL}>Users &amp; Locators</div>
          <div style={CARD_SUB}>{devices.length} total</div>
        </div>
        <input
          placeholder="Search users…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            height: '24px', padding: '0 10px', fontSize: '11px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: '999px', color: '#F5F5F5', outline: 'none',
            width: '110px', transition: 'border-color 0.15s, width 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.55)'; e.target.style.width = '140px' }}
          onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.width = '110px' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', flex: 1, minHeight: 0, padding: '6px 10px 10px', overflow: 'hidden' }}>
        {/* Pie + legend */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', flexShrink: 0 }}>
          <svg width={180} height={180}>
            {slices.length === 0
              ? <circle cx={CX} cy={CY} r={80} fill="rgba(255,255,255,0.03)" strokeDasharray="5 4" stroke="rgba(255,255,255,0.08)" />
              : slices.map((s, i) => (
                <path key={s.user} d={s.path}
                  fill={s.color}
                  opacity={hovered === null ? 0.88 : hovered === i ? 1 : 0.22}
                  style={{
                    cursor: 'pointer', transition: 'opacity 0.15s, transform 0.15s',
                    transformOrigin: `${CX}px ${CY}px`,
                    transform: hovered === i ? 'scale(1.04)' : 'scale(1)',
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
              ))}
            {hovSlice && (
              <text x={hovSlice.lx} y={hovSlice.ly + 4} textAnchor="middle"
                fontSize={12} fontWeight="700" fill="#ffffff" style={{ pointerEvents: 'none' }}>
                {hovSlice.pct}%
              </text>
            )}
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px', justifyContent: 'center', maxWidth: '180px' }}>
            {slices.map((s, i) => (
              <div key={s.user}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer',
                  opacity: hovered === null ? 1 : hovered === i ? 1 : 0.28, transition: 'opacity 0.15s' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}>
                <div style={{ width: '7px', height: '7px', borderRadius: '2px', flexShrink: 0, background: s.color }} />
                <span style={{ fontSize: '11px', color: '#F0F0F0', fontWeight: 600,
                  maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.user}
                </span>
                <span style={{ fontSize: '11px', color: s.color, fontWeight: 700 }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Scrollable device list */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', maxHeight: '300px',
          display: 'flex', flexDirection: 'column', gap: '10px', padding: '2px 4px 0 4px' }}>
          {filteredUsers.length === 0
            ? <p style={EMPTY_MSG}>{search ? `No results for "${search}"` : 'No locators'}</p>
            : filteredUsers.map(([user, devs], i) => {
              const color = BAR_COLORS[i % BAR_COLORS.length]
              return (
                <div key={user} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      fontSize: '7px', fontWeight: 800,
                      background: `${color}18`, color, border: `1px solid ${color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{ini(user)}</div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF',
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {user}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color, flexShrink: 0 }}>{devs.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', paddingLeft: '27px' }}>
                    {devs.map(dev => {
                      const displayName = (dev.name && dev.name !== dev.sn) ? dev.name : dev.sn.replace('CARD-', '')
                      return (
                        <span key={dev.sn} style={{
                          fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                          border: `1px solid ${color}30`, background: 'rgba(255,255,255,0.03)',
                          whiteSpace: 'nowrap', color: '#D8D8D8',
                        }}>
                          {displayName}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   BOUND DEVICES CHART — monthly locator bind vertical bar chart
   ══════════════════════════════════════════════════════════════════ */
function BoundDevicesCard({ devices, selectedDate }) {
  const { getMergedBindings } = useBindCache()

  const { months, total } = useMemo(() => {
    const PKT_OFFSET_MS = 5 * 60 * 60 * 1000
    const nowUtc = selectedDate ? new Date(selectedDate + 'T23:59:59.999Z') : new Date()
    const now = new Date(nowUtc.getTime() - PKT_OFFSET_MS)
    const months = []
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count: 0,
      })
    }
    const map = Object.fromEntries(months.map(m => [m.key, m]))
    const mergedMap = getMergedBindings(devices)
    const seen = new Set()
    devices.forEach(d => {
      if (!d.sn || seen.has(d.sn)) return
      seen.add(d.sn)
      const bindTime = mergedMap.get(d.sn)
      if (!bindTime) return
      const dt = new Date(bindTime)
      if (isNaN(dt) || dt > now) return
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (map[key]) map[key].count++
    })
    const total = months.reduce((s, m) => s + m.count, 0)
    return { months, total }
  }, [devices, selectedDate, getMergedBindings])

  const selectedKey = selectedDate ? selectedDate.slice(0, 7) : new Date().toISOString().slice(0, 7)

  const BoundTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: 'rgba(12,12,12,0.95)', border: '1px solid rgba(167,44,50,0.30)',
        borderRadius: '8px', padding: '6px 12px', fontSize: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}>
        <div style={{ color: '#CFCFCF', marginBottom: '3px' }}>{label}</div>
        <div style={{ color: '#f59e0b', fontWeight: 700 }}>{payload[0].value} bound</div>
      </div>
    )
  }

  const { bind: hoverBind, style: hoverStyle } = usePanelHover()
  return (
    <div {...hoverBind} style={{ ...INSIGHT_CARD, minHeight: '260px', ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div>
          <div style={CARD_TTL}>Bound Locators / Month</div>
          <div style={CARD_SUB}>{total} bound over last 8 months</div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '0 10px 14px' }}>
        {total === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80 }}>
            <span style={CARD_SUB}>No bind dates found</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 8, right: 6, bottom: 0, left: -18 }} barCategoryGap="30%">
              <defs>
                <linearGradient id="bar-bound-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#C44E54" stopOpacity={1} />
                  <stop offset="100%" stopColor="#7A1A1F" stopOpacity={0.85} />
                </linearGradient>
                <linearGradient id="bar-bound-sel" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#fcd34d" stopOpacity={1} />
                  <stop offset="100%" stopColor="#d97706" stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#B8B8B8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
                tickFormatter={l => l.split(' ')[0]}
              />
              <YAxis
                tick={{ fill: '#B8B8B8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<BoundTooltip />} cursor={{ fill: 'rgba(167,44,50,0.08)', radius: 4 }} />
              <Bar dataKey="count" name="Bound" radius={[5, 5, 0, 0]} maxBarSize={28}>
                {months.map((m) => (
                  <Cell
                    key={m.key}
                    fill={m.key === selectedKey ? 'url(#bar-bound-sel)' : 'url(#bar-bound-grad)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   RECENT ACTIVITY PANEL — table with hover shadow
   ══════════════════════════════════════════════════════════════════ */
function RecentActivityPanel({ activityRows, filteredActivity, activitySearch, setActivitySearch }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...panel, overflow:'hidden', ...hoverStyle }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:700, color:'#FFFFFF', letterSpacing:'-0.01em' }}>Recent Activity</div>
          <div style={{ fontSize:'11px', color:'#E0E0E0', marginTop:'2px' }}>
            {activityRows.length} locator{activityRows.length !== 1 ? 's' : ''} · sorted by last seen
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#22c55e', display:'block', animation:'pulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize:'10px', fontWeight:700, color:'#22c55e', letterSpacing:'0.08em' }}>LIVE</span>
          </div>
          <input
            placeholder="Search devices…"
            value={activitySearch}
            onChange={e => setActivitySearch(e.target.value)}
            style={{
              height:'28px', padding:'0 12px', fontSize:'11px',
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.10)',
              borderRadius:'999px', color:'#F5F5F5', outline:'none',
              width:'130px', transition:'border-color 0.15s, width 0.2s',
            }}
            onFocus={e => { e.target.style.borderColor='rgba(167,44,50,0.55)'; e.target.style.width='170px' }}
            onBlur={e  => { e.target.style.borderColor='rgba(255,255,255,0.10)'; e.target.style.width='130px' }}
          />
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1.4fr 130px 1fr', padding:'8px 20px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
        {['Device ID','User / Label','Status','Last Seen'].map(h => (
          <span key={h} style={{ fontSize:'9px', fontWeight:700, color:'#B8B8B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</span>
        ))}
      </div>
      <div style={{ maxHeight:'260px', overflowY:'auto' }}>
        {filteredActivity.length === 0 ? (
          <div style={{ padding:'32px', textAlign:'center', color:'#B8B8B8', fontSize:'13px' }}>
            {activitySearch ? `No results for "${activitySearch}"` : 'No devices loaded'}
          </div>
        ) : filteredActivity.map((row, idx) => (
          <div key={row.id}
            style={{
              display:'grid', gridTemplateColumns:'1.2fr 1.4fr 130px 1fr',
              padding:'10px 20px', borderBottom:'1px solid rgba(255,255,255,0.03)',
              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              transition:'background 0.12s', cursor:'default',
            }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(167,44,50,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = idx%2===0?'transparent':'rgba(255,255,255,0.015)'}
          >
            <span style={{ fontFamily:'monospace', fontSize:'12px', fontWeight:600, color:'#C44E54', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.id}</span>
            <span style={{ fontSize:'12px', color:'#F0F0F0', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:'8px' }}>{row.user}</span>
            <span>
              {row.status === 'online'
                ? <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 10px', borderRadius:'999px', fontSize:'11px', fontWeight:700, background:'rgba(74,222,128,0.10)', color:'#4ade80', border:'1px solid rgba(74,222,128,0.22)' }}>● Active</span>
                : <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'2px 10px', borderRadius:'999px', fontSize:'11px', fontWeight:700, background:'rgba(248,113,113,0.10)', color:'#f87171', border:'1px solid rgba(248,113,113,0.22)' }}>● Offline</span>
              }
            </span>
            <span style={{ fontSize:'12px', color:'#D4D4D4', fontFamily:'monospace', whiteSpace:'nowrap' }}>{fmtRelTime(row.lastSeen)}</span>
          </div>
        ))}
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
  return (
    <div {...bind} style={{ ...panel, padding:'14px 20px', display:'flex', alignItems:'center', gap:'12px', borderColor:'rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.06)', ...hoverStyle }}>
      <AlertOctagon style={{ width:'18px', height:'18px', color:'#f87171', flexShrink:0 }} />
      <div style={{ flex:1, fontSize:'13px' }}>
        <span style={{ color:'#fca5a5', fontWeight:600 }}>Critical Alerts: </span>
        <span style={{ color:'#CFCFCF' }}>{critical.map(a => a.deviceId).join(', ')} require immediate attention</span>
      </div>
      <button onClick={onView} style={{ flexShrink:0, padding:'7px 16px', background:'rgba(239,68,68,0.20)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:'8px', color:'#fca5a5', fontSize:'12px', fontWeight:700, cursor:'pointer' }}>
        View Now
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   DETECTION ACTIVITY PANEL — area chart with hover shadow
   ══════════════════════════════════════════════════════════════════ */
function DetectionActivityPanel({ generalBins, peakLabel }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...panel, padding:'22px 24px', ...hoverStyle }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'18px' }}>
        <div>
          <div style={{ fontSize:'15px', fontWeight:700, color:'#FFFFFF', letterSpacing:'-0.01em' }}>Detection Activity</div>
          <div style={{ fontSize:'11px', color:'#E0E0E0', marginTop:'3px' }}>BLE scan events by hour — today</div>
        </div>
        <span style={{ fontSize:'11px', fontWeight:700, color:'#C44E54', background:'rgba(164,44,50,0.12)', border:'1px solid rgba(164,44,50,0.22)', borderRadius:'6px', padding:'3px 10px' }}>
          {peakLabel}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={190}>
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
  )
}

/* ══════════════════════════════════════════════════════════════════
   BATTERY STATUS PANEL — donut chart with hover shadow
   ══════════════════════════════════════════════════════════════════ */
function BatteryStatusPanel({ batteryTiers }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...panel, padding:'22px 20px', display:'flex', flexDirection:'column', ...hoverStyle }}>
      <div style={{ fontSize:'15px', fontWeight:700, color:'#FFFFFF', letterSpacing:'-0.01em', marginBottom:'3px' }}>Battery Status</div>
      <div style={{ fontSize:'11px', color:'#E0E0E0', marginBottom:'16px' }}>
        {batteryTiers.noData ? 'No location data yet' : `${batteryTiers.total} devices reporting`}
      </div>
      {batteryTiers.noData ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', height:'150px' }}>
          <div style={{ textAlign:'center' }}>
            <Battery style={{ width:'28px', height:'28px', color:'#A0A0A0', margin:'0 auto 8px' }} />
            <div style={{ fontSize:'12px', color:'#B8B8B8' }}>Awaiting location data</div>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie
              data={[
                { name: 'High (≥60%)',     value: batteryTiers.high },
                { name: 'Medium (20–59%)', value: batteryTiers.medium },
                { name: 'Low (<20%)',      value: batteryTiers.low },
              ]}
              cx="50%" cy="50%"
              innerRadius={42} outerRadius={66}
              paddingAngle={3} dataKey="value" strokeWidth={0}
            >
              {BATT_COLORS.map((color, i) => <Cell key={i} fill={color} />)}
            </Pie>
            <Tooltip contentStyle={{ background:'rgba(12,12,12,0.95)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', fontSize:'12px', color:'#fff' }} />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginTop:'10px' }}>
        {[
          { name: 'High',   range: '≥ 60%',  value: batteryTiers.high,   color: BATT_COLORS[0] },
          { name: 'Medium', range: '20–59%', value: batteryTiers.medium, color: BATT_COLORS[1] },
          { name: 'Low',    range: '< 20%',  value: batteryTiers.low,    color: BATT_COLORS[2] },
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
   METRIC CARD — small stat card with hover shadow
   ══════════════════════════════════════════════════════════════════ */
function MetricCard({ m }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...panel, padding:'18px 20px', display:'flex', alignItems:'center', gap:'14px', ...hoverStyle }}>
      <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <m.icon style={{ width:'18px', height:'18px', color: m.color }} />
      </div>
      <div>
        <div style={{ fontSize:'24px', fontWeight:800, color:'#FFFFFF', letterSpacing:'-0.02em', lineHeight:1 }}>{m.value}</div>
        <div style={{ fontSize:'12px', fontWeight:600, color:'#E2E2E2', marginTop:'4px' }}>{m.label}</div>
        <div style={{ fontSize:'10px', color:'#BBBBBB', marginTop:'2px' }}>{m.sub}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { locations, activityData, devices: rawDevices, summary } = useHomePageCache()
  const navigate = useNavigate()
  const { alerts } = useAlerts()

  // Hourly activity bins from real playback data (replaces mock detectionsByHour)
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
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t+1), 3000)
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
  const [activitySearch, setActivitySearch] = useState('')

  const activityRows = useMemo(() => {
    return [...rawDevices]
      .map(d => {
        const sn  = d.sn ?? ''
        const loc = locations?.[sn]
        const lastTs = loc?.timestamp ?? loc?.time ?? loc?.locTime
          ?? d.dataRetrievalTime ?? d.last_seen ?? null
        const isOnline = lastTs
          ? (Date.now() - new Date(lastTs).getTime()) < 30 * 60_000
          : false
        return {
          id:       sn,
          user:     d.assigned_user_name ?? d.assignedUser ?? d.name ?? '—',
          status:   isOnline ? 'online' : 'offline',
          lastSeen: lastTs,
          ts:       lastTs ? new Date(lastTs).getTime() : 0,
        }
      })
      .filter(r => r.id)
      .sort((a, b) => b.ts - a.ts)
  }, [rawDevices, locations])

  const filteredActivity = useMemo(() => {
    const q = activitySearch.toLowerCase()
    return activityRows
      .filter(r => !q || r.id.toLowerCase().includes(q) || r.user.toLowerCase().includes(q))
      .slice(0, 15)
  }, [activityRows, activitySearch])

  // Low-battery count from live rawDevices battery field (GET /api/devices)
  // Battery comes from POST /api/location/latest-batch → loc.batteryStatus stored by vendor sync.
  // GET /api/devices has no battery field, so batteryTiers is the only real source.
  const lowBatteryCount = batteryTiers.noData ? null : batteryTiers.low

  // Detections today — count of activityData points whose timestamp is today
  const detectionsToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    let count = 0
    for (const pts of Object.values(activityData)) {
      if (!Array.isArray(pts)) continue
      for (const pt of pts) {
        const ts = pt?.timestamp ?? pt?.time ?? pt?.locTime ?? pt?.t
        if (ts && String(ts).slice(0, 10) === today) count++
      }
    }
    return count
  }, [activityData])

  // Last detection — most recent location update across all devices
  const lastDetect = useMemo(() => {
    let best = null
    for (const [sn, loc] of Object.entries(locations)) {
      const ts = loc?.timestamp ?? loc?.time ?? loc?.locTime
      if (!ts) continue
      const t = new Date(ts).getTime()
      if (!best || t > best.t) best = { t, sn, ts, loc }
    }
    return best
  }, [locations])

  const lastDetectTime = lastDetect ? fmtRelTime(lastDetect.ts) : '—'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'18px' }}>

      {/* ── Row 1: 4 large glossy KPI cards ───────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px' }}>

        {/* Card 1 — BLE Locators */}
        <KPICard
          title="BLE Locators"
          value={summary.locators}
          sub={`${summary.online > 0 ? Math.round(summary.online * summary.locators / Math.max(summary.total, 1)) : 0} online · server-side counts`}
          icon={Radio}
          trend="up"
          trendVal={weeklyLocators > 0 ? `+${weeklyLocators} this week` : 'No new this week'}
          onClick={() => navigate('/locators')}
          colors={{
            gradient:    'linear-gradient(145deg, #1E2B3D 0%, #1A2333 40%, #141B28 70%, #0F1420 100%)',
            border:      'rgba(0,180,216,0.25)',
            shadow:      '0 0 28px rgba(0,180,216,0.12), 0 12px 38px rgba(0,0,0,0.52)',
            shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)',
            shimmer:     'rgba(0,180,216,0.32)',
            radialTL:    'rgba(0,180,216,0.14)',
            iconBg:      'rgba(0,180,216,0.12)',
            iconBorder:  'rgba(0,180,216,0.24)',
            iconColor:   '#00B4D8',
            gloss:       0.040,
          }}
        />

        {/* Card 2 — Smart Stickers */}
        <KPICard
          title="Smart Stickers"
          value={summary.stickers}
          sub={`${summary.weekly_new_stickers > 0 ? `+${summary.weekly_new_stickers} this week` : 'Cargo & logistics tracking'}`}
          icon={Tag}
          trend="up"
          trendVal={weeklyStickers > 0 ? `+${weeklyStickers} this week` : 'No new this week'}
          onClick={() => navigate('/stickers')}
          colors={{
            gradient:    'linear-gradient(145deg, #3A2A1A 0%, #2E2216 40%, #241A10 70%, #1A1208 100%)',
            border:      'rgba(255,183,3,0.25)',
            shadow:      '0 0 28px rgba(255,183,3,0.10), 0 12px 38px rgba(0,0,0,0.52)',
            shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)',
            shimmer:     'rgba(255,183,3,0.34)',
            radialTL:    'rgba(255,183,3,0.14)',
            iconBg:      'rgba(255,183,3,0.12)',
            iconBorder:  'rgba(255,183,3,0.24)',
            iconColor:   '#FFB703',
            gloss:       0.036,
          }}
        />

        {/* Card 3 — Offline Devices */}
        <KPICard
          title="Offline Devices"
          value={offlineDevices}
          sub={`${summary.offline} offline total · requires attention`}
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

        {/* Card 4 — Active Devices */}
        <KPICard
          title="Active Devices"
          value={activeNow}
          sub={`of ${summary.total} total · last 30 min`}
          icon={Activity}
          trend="up"
          trendVal="Online now"
          onClick={() => navigate('/locators')}
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

      </div>

      {/* ── Row 2: 3 muted grey metric cards ──────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        {[
          { label:'Low Battery',      value: lowBatteryCount ?? '—',  icon: Battery, color:'#F59E0B', sub:'devices < 20%' },
          { label:'Detections Today', value: detectionsToday,          icon: Zap,     color:'#C44E54', sub:'location points today' },
          { label:'Last Detection',   value: lastDetectTime,           icon: Clock,   color:'#94a3b8', sub: lastDetect ? lastDetect.sn.slice(0, 24) : 'No data' },
        ].map(m => <MetricCard key={m.label} m={m} />)}
      </div>

      {/* ── Row 3: Detection chart + Donut ───────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'16px' }}>

        {/* Detection Activity */}
        <DetectionActivityPanel generalBins={generalBins} peakLabel={peakLabel} />

        {/* Battery Status Donut */}
        <BatteryStatusPanel batteryTiers={batteryTiers} />
      </div>

      {/* ── Row 4 (was Row 5): Advanced Device Insights ──────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'16px' }}>
        <TopDevicesCard
          devices={rawDevices}
          activityData={activityData}
        />
        <UserDevicePanelCard
          devices={rawDevices}
        />
        <BoundDevicesCard
          devices={rawDevices}
          selectedDate={todayStr()}
        />
      </div>

      {/* ── Row 5 (was Row 4): Recent Activity ───────────────── */}
      <RecentActivityPanel
        activityRows={activityRows}
        filteredActivity={filteredActivity}
        activitySearch={activitySearch}
        setActivitySearch={setActivitySearch}
      />

      {/* ── Critical alert strip ──────────────────────────────── */}
      {alerts.filter(a => !a.isRead && a.severity === 'critical').length > 0 && (
        <CriticalAlertStrip alerts={alerts} onView={() => navigate('/missing')} />
      )}
    </div>
  )
}