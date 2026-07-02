import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { WifiOff, Battery, Activity, Users, Shield, Layers, Link2, Unlink, FileDown } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar, PolarAngleAxis, PolarRadiusAxis, Label,
} from 'recharts'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'
import { useHomePageCache } from '../context/HomePageCacheContext.jsx'
import { useAlerts } from '../context/AlertsContext.jsx'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import { useDashboardChrome } from '../context/DashboardChromeContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import KPICard from '../components/common/KPICard.jsx'


/* ── shared panel style ─────────────────────────────────────────── */
const panel = {
  // Flat glossy surface — no rounded corners, no 3D depth
  background: 'linear-gradient(157deg, #201F1F 0%, #1A1919 58%, #151414 100%)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 0,
}

/* ── hover helper (flat — no shadows) ───────────────────────────── */
function usePanelHover() {
  const [hov, setHov] = React.useState(false)
  const bind = {
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
  }
  const style = {
    boxShadow: 'none',
    borderColor: hov ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
    transition: 'border-color 0.22s ease',
  }
  return { bind, style }
}

/* ── Tooltip ───────────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(12,12,12,0.95)', border: '1px solid rgba(180,20,20,0.3)', borderRadius: 0, padding: '8px 12px', fontSize: '12px' }}>
      <div style={{ color: '#CFCFCF', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: '#E05555', fontWeight: 700 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

/* ── Shared design tokens (one cohesive card system) ────────────── */
const BATT_COLORS = ['#4ade80', '#F59E0B', '#f87171']   // High / Medium / Low
const BAR_COLORS = ['#3A86FF', '#4CAF50', '#F4A261', '#8E7DBE', '#2A9D8F']

const CARD_ROOT = { ...panel, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' }
const CARD_HDR = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '14px 18px 8px', flexShrink: 0, flexWrap: 'wrap' }
const CARD_TTL = { fontSize: 'clamp(13px, 1.1vw, 15px)', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }
const CARD_SUB = { fontSize: '11px', color: '#E0E0E0', marginTop: '2px' }
const SECTION_HDR = { fontSize: 10, fontWeight: 700, color: '#909090', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: 10 }
const EMPTY_MSG = { color: '#D0D0D0', fontSize: '12px', textAlign: 'center', padding: '20px 0', margin: 0 }
const VIEW_ALL_BTN = { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: 700, padding: 0, transition: 'color 0.15s' }

function fmtRelTime(ts) {
  if (!ts) return '—'
  try {
    const diff = Date.now() - new Date(ts).getTime()
    if (isNaN(diff) || diff < 0) return '—'
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return '—' }
}

/* ── Horizontal wrapping legend: rounded-square swatch + label, centered ── */
function ChipLegend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: '3px 9px', marginTop: 6 }}>
      {items.map((it, i) => (
        <span key={it.key ?? i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: '#D8D8D8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 96 }}>
            {it.label}
            {it.value != null && <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 4, fontWeight: 700 }}>{it.value}</span>}
          </span>
        </span>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CELL 5 — METRICS STACK (Total Devices · Users · Fences)
   Three metric rows in one card, evenly distributed to fill the cell.
   ══════════════════════════════════════════════════════════════════ */
function MetricsStackCard({ metrics }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...CARD_ROOT, justifyContent: 'space-around', padding: '6px 0', ...hoverStyle }}>
      {metrics.map((m, i) => (
        <div
          key={m.label}
          onClick={m.onClick}
          style={{
            display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1vw, 12px)', padding: 'clamp(6px, 0.8vw, 10px) clamp(12px, 1.4vw, 18px)',
            cursor: m.onClick ? 'pointer' : 'default',
            borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          {/* Left — icon */}
          <div style={{ width: 38, height: 38, borderRadius: 0, flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <m.icon style={{ width: 17, height: 17, color: m.color }} />
          </div>
          {/* Center — label + subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</div>
            {m.sub && <div style={{ fontSize: 10, color: '#BBBBBB', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.sub}</div>}
          </div>
          {/* Right — value */}
          <div style={{ flexShrink: 0, fontSize: 'clamp(18px, 1.8vw, 22px)', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1 }}>{m.value}</div>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CELL 6 — RECENT TREND (hourly activity area chart)
   ══════════════════════════════════════════════════════════════════ */
function RecentTrendPanel({ generalBins, peakLabel }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div style={CARD_TTL}>Recent Trend</div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#C44E54', background: 'rgba(164,44,50,0.12)', border: '1px solid rgba(164,44,50,0.22)', borderRadius: 0, padding: '3px 10px' }}>
          {peakLabel}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '0 14px 12px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={generalBins} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A72C32" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#A72C32" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="1 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="hour" ticks={[0, 4, 8, 12, 16, 20]} tickFormatter={h => `${String(h).padStart(2, '0')}h`}
              tick={{ fill: '#B8B8B8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#B8B8B8', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} />
            <Area
              type="monotone"
              dataKey="count"
              name="Detections"
              stroke="#C44E54"
              strokeWidth={2.5}
              fill="url(#redGrad)"
              dot={false}
              activeDot={{ r: 5, fill: '#E05555', stroke: 'rgba(200,50,50,0.4)', strokeWidth: 4 }}
              style={{ filter: 'drop-shadow(0 0 6px rgba(196,78,84,0.6))' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   BATTERY — radial-stacked half-donut (High / Medium / Low)
   ══════════════════════════════════════════════════════════════════ */
function BatteryRadial({ batteryTiers }) {
  if (batteryTiers.noData) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
        <div style={{ textAlign: 'center' }}>
          <Battery style={{ width: 24, height: 24, color: '#A0A0A0', margin: '0 auto 6px' }} />
          <div style={{ fontSize: 11, color: '#B8B8B8' }}>Awaiting data</div>
        </div>
      </div>
    )
  }
  const total = batteryTiers.total
  const data = [{ high: batteryTiers.high, medium: batteryTiers.medium, low: batteryTiers.low }]
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 96 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} startAngle={180} endAngle={0} innerRadius="58%" outerRadius="100%" barSize={15}>
            <PolarAngleAxis type="number" domain={[0, total || 1]} tick={false} axisLine={false} />
            <RadialBar dataKey="high" stackId="a" cornerRadius={4} fill={BATT_COLORS[0]} />
            <RadialBar dataKey="medium" stackId="a" cornerRadius={4} fill={BATT_COLORS[1]} />
            <RadialBar dataKey="low" stackId="a" cornerRadius={4} fill={BATT_COLORS[2]} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label content={({ viewBox }) => {
                if (viewBox && 'cx' in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy - 4} fill="#FFFFFF" style={{ fontSize: 22, fontWeight: 800 }}>{total}</tspan>
                      <tspan x={viewBox.cx} y={viewBox.cy + 13} fill="#B8B8B8" style={{ fontSize: 9 }}>reporting</tspan>
                    </text>
                  )
                }
                return null
              }} />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <ChipLegend items={[
        { label: 'High', value: batteryTiers.high, color: BATT_COLORS[0] },
        { label: 'Medium', value: batteryTiers.medium, color: BATT_COLORS[1] },
        { label: 'Low', value: batteryTiers.low, color: BATT_COLORS[2] },
      ]} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   ALERTS — bubble / network field (Critical / Battery / Fence)
   ══════════════════════════════════════════════════════════════════ */
const BUBBLE_MIN_R = 30
const BUBBLE_MAX_R = 54
function bubbleRadius(count, maxCount) {
  if (!maxCount || maxCount <= 0) return BUBBLE_MIN_R
  const frac = Math.log2(1 + count) / Math.log2(1 + maxCount)
  return Math.round(BUBBLE_MIN_R + (BUBBLE_MAX_R - BUBBLE_MIN_R) * frac)
}
function fmtPct(value, total) {
  if (!total || total <= 0 || value <= 0) return '0%'
  const pct = (value / total) * 100
  return `${pct.toFixed(1).replace(/\.0$/, '')}%`
}

// Single floating bubble. Three nested layers keep transforms separate:
// position (center on anchor) · float (idle bob) · scale (hover).
function AlertBubble({ data, radius, pct, delay }) {
  const [hov, setHov] = useState(false)
  const d = radius * 2
  const small = radius < 42
  const numFont = Math.min(22, Math.max(13, Math.round(radius * 0.5)))
  return (
    <div style={{ position: 'absolute', left: `${data.x}%`, top: `${data.y}%`, transform: 'translate(-50%, -50%)', zIndex: 2 }}>
      <div style={{ animation: `alertBubbleFloat 6s ease-in-out ${delay}s infinite` }}>
        <div
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          style={{
            width: d, height: d, borderRadius: '50%',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: `radial-gradient(circle at 30% 30%, ${data.light}, ${data.base})`,
            border: `1px solid ${data.border}`,
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            boxShadow: 'none',
            transform: hov ? 'scale(1.08)' : 'scale(1)',
            transition: 'transform 0.25s ease, box-shadow 0.25s ease',
            cursor: 'default',
          }}
        >
          <div style={{ fontSize: numFont, fontWeight: 800, color: '#FFFFFF', lineHeight: 1, letterSpacing: '-0.02em' }}>{data.value}</div>
          <div style={{ fontSize: small ? 9 : 11, fontWeight: 700, color: data.text, marginTop: 2 }}>{pct}</div>
          <div style={{ fontSize: small ? 8 : 10, fontWeight: 600, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>{data.label}</div>
        </div>
      </div>
    </div>
  )
}

function AlertBubbleField({ stats }) {
  const bubbles = [
    {
      key: 'critical', label: 'Critical', value: stats.critical, x: 42, y: 32,
      base: '#7F1D1D', light: '#C2433F', border: 'rgba(248,113,113,0.55)', text: '#fca5a5',
      glow: 'rgba(239,68,68,0.32)', glowHover: 'rgba(239,68,68,0.55)'
    },
    {
      key: 'battery', label: 'Battery', value: stats.battery, x: 73, y: 70,
      base: '#5A3D08', light: '#B5841F', border: 'rgba(245,158,11,0.55)', text: '#FCD34D',
      glow: 'rgba(245,158,11,0.28)', glowHover: 'rgba(245,158,11,0.50)'
    },
    {
      key: 'fence', label: 'Fence', value: stats.fence, x: 26, y: 72,
      base: '#0B3A52', light: '#1E7FA8', border: 'rgba(34,211,238,0.55)', text: '#7DD3FC',
      glow: 'rgba(34,211,238,0.26)', glowHover: 'rgba(34,211,238,0.48)'
    },
  ]
  const maxCount = Math.max(0, ...bubbles.map(b => b.value))
  const [critical, battery, fence] = bubbles

  if (stats.total === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px', borderRadius: 0, background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}>
        <Shield style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#86efac', fontWeight: 600 }}>All clear — no active alerts</span>
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative', flex: 1, minHeight: 160,
      backgroundImage: 'radial-gradient(circle at 50% 40%, rgba(167,44,50,0.10), transparent 60%)',
    }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}>
        <line x1={`${critical.x}%`} y1={`${critical.y}%`} x2={`${fence.x}%`} y2={`${fence.y}%`} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1={`${critical.x}%`} y1={`${critical.y}%`} x2={`${battery.x}%`} y2={`${battery.y}%`} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <line x1={`${fence.x}%`} y1={`${fence.y}%`} x2={`${battery.x}%`} y2={`${battery.y}%`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      </svg>
      {bubbles.map((b, i) => (
        <AlertBubble key={b.key} data={b} radius={bubbleRadius(b.value, maxCount)} pct={fmtPct(b.value, stats.total)} delay={-i * 1.8} />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   ALERTS SUMMARY — dedicated bubble card (bottom of the 4th column)
   ══════════════════════════════════════════════════════════════════ */
function AlertsCard({ stats, onView }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <style>{`@keyframes alertBubbleFloat { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }`}</style>
      <div style={{ ...CARD_HDR, zIndex: 3 }}>
        <div style={CARD_TTL}>Alerts Summary</div>
        <button onClick={onView} style={VIEW_ALL_BTN}
          onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          View all →
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 18px 16px' }}>
        <AlertBubbleField stats={stats} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CELL 8 — RECENT ACTIVITY (filtered table, fills its cell)
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

  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 140px' }}>
          <div style={CARD_TTL}>Recent Activity</div>
          <div style={CARD_SUB}>
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
            borderRadius: 0, color: '#F5F5F5', outline: 'none',
            width: 'min(140px, 100%)', maxWidth: '100%', transition: 'border-color 0.15s, width 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.55)'; e.target.style.width = 'min(180px, 100%)' }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.width = 'min(140px, 100%)' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(60px, 0.8fr) minmax(0, 1fr)', padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        {['Device Name', 'User / Label', 'Status', 'Last Reported'].map(h => (
          <span key={h} style={{ fontSize: '9px', fontWeight: 700, color: '#B8B8B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {visibleRows.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#B8B8B8', fontSize: '13px' }}>
            {isSearching ? `No results for "${search.trim()}"` : 'No active devices'}
          </div>
        ) : visibleRows.map((row, idx) => (
          <div key={row.id}
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(60px, 0.8fr) minmax(0, 1fr)',
              padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              transition: 'background 0.12s', cursor: 'default',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,44,50,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
              <span style={{
                flexShrink: 0, fontSize: '9px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                padding: '1px 6px', borderRadius: 0, whiteSpace: 'nowrap',
                ...(row.type === 'Sticker'
                  ? { background: 'rgba(255,183,3,0.12)', color: '#FFB703', border: '1px solid rgba(255,183,3,0.24)' }
                  : { background: 'rgba(0,180,216,0.12)', color: '#00B4D8', border: '1px solid rgba(0,180,216,0.24)' })
              }}>
                {row.type}
              </span>
            </span>
            <span style={{ fontSize: '12px', color: '#F0F0F0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>{row.user}</span>
            <span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: 0, fontSize: '11px', fontWeight: 700, background: 'rgba(74,222,128,0.10)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.22)' }}>● Active</span>
            </span>
            <span style={{ fontSize: '12px', color: '#D4D4D4', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtRelTime(row.lastSeen)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CELL 9 — FLEET UPTIME + DEVICE MIX (from summary)
   ══════════════════════════════════════════════════════════════════ */
function FleetMixCard({ summary }) {
  const { bind, style: hoverStyle } = usePanelHover()

  const total = Number(summary?.total) || 0
  const onlineNow = Number(summary?.online) || 0
  const onlineRate = total > 0 ? Math.round((onlineNow / total) * 100) : 0
  const locatorCount = Number(summary?.locators) || 0
  const stickerCount = Number(summary?.stickers) || 0
  const typeTotal = locatorCount + stickerCount || 1
  const locPct = Math.round((locatorCount / typeTotal) * 100)

  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div style={CARD_TTL}>Device Health</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'clamp(2px, 0.4vw, 4px) clamp(12px, 1.4vw, 18px) clamp(10px, 1.2vw, 16px)' }}>
        {/* Device Uptime — equal top half, centered */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
          <div style={SECTION_HDR}>Device Uptime</div>
          <div style={{ fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: 800, color: '#4ade80', lineHeight: 1, letterSpacing: '-0.04em' }}>{onlineRate}%</div>
          <div style={{ fontSize: 12, color: '#C0C0C0', marginTop: 5 }}>{onlineNow} of {total} online</div>
          <div style={{ marginTop: 9, height: 5, borderRadius: 0, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${onlineRate}%`, background: '#4ade80', borderRadius: 0, transition: 'width 0.5s ease' }} />
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)', marginTop: 6 }}>
            {onlineRate >= 70 ? 'Devices healthy' : onlineRate >= 40 ? 'Needs attention' : 'Critical — many offline'}
          </div>
        </div>

        {/* Device Mix — equal bottom half */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={SECTION_HDR}>Device Mix</div>
          <div style={{ display: 'flex', height: 7, borderRadius: 0, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ width: `${locPct}%`, background: '#00B4D8', transition: 'width 0.5s ease' }} />
            <div style={{ flex: 1, background: '#FFB703' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[
              { label: 'Locators', value: locatorCount, color: '#00B4D8', pct: locPct },
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
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   TOP ACTIVE ZONES + BATTERY — side-by-side card (top of 4th column)
   ══════════════════════════════════════════════════════════════════ */
function ZonesBatteryCard({ zones, devices, batteryTiers }) {
  const { bind, style: hoverStyle } = usePanelHover()

  const topZones = useMemo(() => {
    const zoneCount = {}
    devices.forEach(d => {
      const dzones = d.fence_zone_ids?.length ? d.fence_zone_ids : (d.zone ? [d.zone] : [])
      dzones.forEach(zid => { zoneCount[zid] = (zoneCount[zid] || 0) + 1 })
    })
    return zones
      .map(z => ({ name: z.name || z.beat || 'Unnamed', count: zoneCount[z.zone_id] || 0 }))
      .filter(z => z.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [zones, devices])

  const totalCount = topZones.reduce((s, z) => s + z.count, 0)

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
    const RAD = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.55
    const x = cx + r * Math.cos(-midAngle * RAD)
    const y = cy + r * Math.sin(-midAngle * RAD)
    return (
      <text x={x} y={y} fill="#FFFFFF" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12, fontWeight: 700, paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.45)', strokeWidth: 2 }}>
        {value}
      </text>
    )
  }

  const halfTitle = { ...CARD_TTL, fontSize: 12, marginBottom: 4 }

  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap' }}>
        {/* Top Active Zones */}
        <div style={{ flex: '1 1 140px', minWidth: 0, display: 'flex', flexDirection: 'column', padding: '10px 8px 8px 14px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={halfTitle}>Top Active Zones</div>
          {topZones.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={EMPTY_MSG}>No zone activity yet</p>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <Pie data={topZones} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius="72%"
                    labelLine={false} label={renderLabel} stroke="none" isAnimationActive={false}>
                    {topZones.map((z, i) => <Cell key={z.name} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    cursor={false}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const z = payload[0].payload
                      const color = BAR_COLORS[topZones.indexOf(z) % BAR_COLORS.length]
                      const pct = totalCount ? Math.round((z.count / totalCount) * 100) : 0
                      return (
                        <div style={{ background: '#161616', border: `1px solid ${color}40`, borderRadius: 0, padding: '8px 12px', pointerEvents: 'none', boxShadow: 'none' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{z.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'block' }} />
                            <span style={{ fontSize: 11, color, fontWeight: 700 }}>{z.count} device{z.count !== 1 ? 's' : ''}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 2 }}>{pct}%</span>
                          </div>
                        </div>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {topZones.length > 0 && (
            <ChipLegend items={topZones.map((z, i) => ({ label: z.name, color: BAR_COLORS[i % BAR_COLORS.length] }))} />
          )}
        </div>

        {/* Battery */}
        <div style={{ flex: '1 1 140px', minWidth: 0, display: 'flex', flexDirection: 'column', padding: '10px 14px 8px 8px' }}>
          <div style={halfTitle}>Battery</div>
          <BatteryRadial batteryTiers={batteryTiers} />
        </div>

      </div>

    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   DASHBOARD — single scrollable page, fixed 4-column grid (2:4:5 rows)
   ══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { locations, activityData, devices: rawDevices, summary } = useHomePageCache()
  const navigate = useNavigate()
  const { alerts } = useAlerts()
  const { isAdmin } = useAuth()
  const { users } = useUserCache()
  const { zones } = useZoneCache()
  const chrome = useDashboardChrome()
  const gridRef = useRef(null)

  const [exporting, setExporting] = useState(false)

  // Responsive: 4 → 2 → 1 columns based on available width.
  const [cols, setCols] = useState(4)
  useEffect(() => {
    const el = gridRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width
      setCols(w < 540 ? 1 : w < 900 ? 2 : 4)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleExportPDF = async () => {
    if (exporting) return
    setExporting(true)
    await new Promise(r => setTimeout(r, 80))
    try {
      const el = gridRef.current
      if (!el) return
      const PX_TO_MM = 25.4 / 96
      const prev = { height: el.style.height, overflow: el.style.overflow }
      el.style.height = 'auto'
      el.style.overflow = 'visible'
      await new Promise(r => requestAnimationFrame(r))
      await new Promise(r => setTimeout(r, 120))
      const w = el.scrollWidth
      const h = el.scrollHeight
      const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: '#0d0d0d', width: w, height: h })
      el.style.height = prev.height
      el.style.overflow = prev.overflow

      const wmm = w * PX_TO_MM
      const hmm = h * PX_TO_MM
      const pdf = new jsPDF({ orientation: wmm >= hmm ? 'landscape' : 'portrait', unit: 'mm', format: [wmm, hmm] })
      pdf.addImage(dataUrl, 'PNG', 0, 0, wmm, hmm)
      const now = new Date()
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      pdf.save(`TPL-Dashboard-${stamp}.pdf`)
    } catch (err) {
      console.error('PDF export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  // Register the Export PDF trigger so the topbar (Header) can render the button.
  const exportRef = useRef(handleExportPDF)
  exportRef.current = handleExportPDF
  const registerExport = chrome?.registerExport
  const setChromeExport = chrome?.setExporting
  useEffect(() => {
    if (!registerExport) return
    registerExport({ run: () => exportRef.current?.(), label: 'Export PDF', icon: FileDown })
    return () => registerExport(null)
  }, [registerExport])
  useEffect(() => {
    setChromeExport?.(exporting)
  }, [exporting, setChromeExport])

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

  // Device counts from lightweight summary endpoint
  const activeNow = summary.online
  const offlineDevices = summary.offline

  // Battery tiers — sourced from GET /api/location/{sn} → batteryStatus field
  const batteryTiers = useMemo(() => {
    const vals = Object.values(locations)
      .map(loc => loc?.batteryStatus)
      .filter(v => v != null && !isNaN(v))
    return {
      high: vals.filter(v => v >= 60).length,
      medium: vals.filter(v => v >= 20 && v < 60).length,
      low: vals.filter(v => v < 20).length,
      total: vals.length,
      noData: vals.length === 0,
    }
  }, [locations])

  // Recent Activity table — real devices sorted by latest location timestamp
  const activityRows = useMemo(() => {
    return [...rawDevices]
      .map(d => {
        const sn = d.sn ?? ''
        const loc = locations?.[sn]
        const lastTs = loc?.timestamp ?? loc?.time ?? loc?.locTime
          ?? d.dataRetrievalTime ?? d.last_seen ?? null
        const withinWindow = lastTs
          ? (Date.now() - new Date(lastTs).getTime()) < 12 * 60 * 60_000
          : false
        const devStatus = String(d.status ?? d.deviceStatus ?? '').toLowerCase()
        const isOnline = withinWindow || devStatus === 'online' || devStatus === 'on'
        const type = /^\d+$/.test(String(sn)) ? 'Sticker' : 'Locator'
        return {
          id: sn,
          name: d.name || d.assigned_name || sn,
          user: d.assigned_user_name ?? d.assignedUser ?? d.name ?? '—',
          status: isOnline ? 'online' : 'offline',
          lastSeen: lastTs,
          type,
          ts: lastTs ? new Date(lastTs).getTime() : 0,
        }
      })
      .filter(r => r.id)
      .sort((a, b) => b.ts - a.ts)
  }, [rawDevices, locations])

  // Executive alert aggregates — unread alerts from AlertsContext
  const alertStats = useMemo(() => {
    const unread = alerts.filter(a => !a.isRead)
    return {
      critical: unread.filter(a => a.severity === 'critical').length,
      warning: unread.filter(a => a.severity === 'high').length,
      info: unread.filter(a => a.severity === 'medium').length,
      offline: unread.filter(a => a.type === 'DEVICE_OFFLINE').length,
      battery: unread.filter(a => a.type === 'BATTERY_LOW').length,
      fence: unread.filter(a => a.type === 'GEOFENCE').length,
      total: unread.length,
    }
  }, [alerts])

  const totalDevices = Number(summary?.total) || 0
  const assignedDevices = Number(summary?.assigned) || 0
  const unboundCount = Math.max(0, totalDevices - assignedDevices)

  // Only count zones that actually have a device assigned — an empty zone
  // (drawn but not yet wired to a device) isn't "active" yet.
  const activeZonesCount = zones.filter(z => (z.device_sns?.length || 0) > 0).length

  // Cell 5 — stacked metrics
  const stackMetrics = [
    { label: 'Total Devices', value: totalDevices, icon: Layers, color: '#00B4D8', sub: `${summary.locators ?? 0} locators · ${summary.stickers ?? 0} stickers`, onClick: () => navigate('/devices') },
    ...(isAdmin ? [{ label: 'Users', value: users.length, icon: Users, color: '#22D3EE', sub: 'under your account', onClick: () => navigate('/users') }] : []),
    { label: 'Fences', value: activeZonesCount, icon: Shield, color: '#F59E0B', sub: 'active Fence zones', onClick: () => navigate('/fence') },
  ]

  const isWide = cols === 4
  const isSingle = cols === 1
  // span2 adapts: spans 2 at 2+ cols, spans 1 in single-column mode
  const span2 = { gridColumn: isSingle ? 'span 1' : 'span 2', height: '100%', minHeight: 0 }

  return (
    <div
      ref={gridRef}
      style={{
        height: isWide ? '100%' : 'auto', minHeight: isWide ? 640 : undefined,
        display: 'grid', gap: isSingle ? 10 : 14,
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: isWide ? '2fr 4fr 5fr' : undefined,
        gridAutoRows: isWide ? undefined : 'minmax(180px, auto)',
        fontWeight: 400, letterSpacing: '0.04em',
      }}
    >
      {/* ── Row 1 — KPI cards (cells 1–4) ── */}
      <KPICard
        title="Assigned Devices" value={assignedDevices} sub="" icon={Link2}
        onClick={() => navigate('/devices?status=assigned')}
        colors={{ gradient: 'linear-gradient(145deg, #2A2210 0%, #201A08 40%, #181206 70%, #100C03 100%)', border: 'rgba(234,179,8,0.25)', shadow: '0 0 28px rgba(234,179,8,0.10), 0 12px 38px rgba(0,0,0,0.52)', shadowHover: '0 0 44px rgba(234,179,8,0.40), 0 16px 46px rgba(0,0,0,0.60)', shimmer: 'rgba(234,179,8,0.32)', radialTL: 'rgba(234,179,8,0.14)', iconBg: 'rgba(234,179,8,0.12)', iconBorder: 'rgba(234,179,8,0.24)', iconColor: '#EAB308', gloss: 0.034 }}
      />
      <KPICard
        title="Unassigned Devices" value={unboundCount} sub="" icon={Unlink}
        onClick={() => navigate('/devices?status=unassigned')}
        colors={{ gradient: 'linear-gradient(145deg, #1C2A4A 0%, #18223C 40%, #121A2E 70%, #0C1220 100%)', border: 'rgba(59,130,246,0.25)', shadow: '0 0 28px rgba(59,130,246,0.10), 0 12px 38px rgba(0,0,0,0.52)', shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)', shimmer: 'rgba(59,130,246,0.32)', radialTL: 'rgba(59,130,246,0.14)', iconBg: 'rgba(59,130,246,0.12)', iconBorder: 'rgba(59,130,246,0.24)', iconColor: '#3B82F6', gloss: 0.034 }}
      />
      <KPICard
        title="Active Devices" value={activeNow} sub="" icon={Activity}
        onClick={() => navigate('/devices?status=active')}
        colors={{ gradient: 'linear-gradient(145deg, #1A3328 0%, #142820 40%, #0F2018 70%, #0A1810 100%)', border: 'rgba(46,196,182,0.25)', shadow: '0 0 28px rgba(46,196,182,0.10), 0 12px 38px rgba(0,0,0,0.52)', shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)', shimmer: 'rgba(46,196,182,0.34)', radialTL: 'rgba(46,196,182,0.14)', iconBg: 'rgba(46,196,182,0.12)', iconBorder: 'rgba(46,196,182,0.24)', iconColor: '#2EC4B6', gloss: 0.032 }}
      />
      <KPICard
        title="Offline Devices" value={offlineDevices} sub="" icon={WifiOff}
        onClick={() => navigate('/devices?status=offline')}
        colors={{ gradient: 'linear-gradient(145deg, #3D1D22 0%, #2D191E 40%, #231015 70%, #180C10 100%)', border: 'rgba(255,77,109,0.25)', shadow: '0 0 28px rgba(255,77,109,0.10), 0 12px 38px rgba(0,0,0,0.52)', shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60)', shimmer: 'rgba(255,77,109,0.34)', radialTL: 'rgba(255,77,109,0.14)', iconBg: 'rgba(255,77,109,0.12)', iconBorder: 'rgba(255,77,109,0.24)', iconColor: '#FF4D6D', gloss: 0.028 }}
      />
      {/* ── Row 2 — metrics (1 col) · trend wide (2 cols) · zones & battery inline (1 col) ── */}
      <MetricsStackCard metrics={stackMetrics} />
      <div style={span2}>
        <RecentTrendPanel generalBins={generalBins} peakLabel={peakLabel} />
      </div>
      {/* Ab ye card Row 2 ke andar hi inline align hoga aur side column khatam ho gaya */}
      <ZonesBatteryCard zones={zones} devices={rawDevices} batteryTiers={batteryTiers} />

      {/* ── Row 3 — recent activity wide (2 cols) · fleet (1 col) · alerts (1 col) ── */}
      <div style={span2}>
        <RecentActivityPanel activityRows={activityRows} totalActive={summary.online} />
      </div>
      <FleetMixCard summary={summary} />
      <AlertsCard stats={alertStats} onView={() => navigate('/alerts')} />
    </div>

  )
}
