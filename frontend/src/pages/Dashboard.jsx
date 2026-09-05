import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTrailNav } from '../hooks/useBreadcrumbTrail.js'
import { WifiOff, Battery, Activity, Users, Shield, Layers, Link2, Unlink, FileDown } from 'lucide-react'
import {
  ComposedChart, Grid as ChartGrid, SeriesBar, Line as ChartLine,
  ChartTooltip as ComposedTooltip, XAxis as ChartXAxis,
  FunnelChart, RingChart, Ring, RingCenter, Gauge,
  PieChart, PieSlice, RadialGradient,
} from '../components/charts/LiveCharts.jsx'
import { pointInPolygon, pointInMultiPolygon } from '../utils/zonePolygonManager.js'
import { isUserOnline } from '../utils/userPresence.js'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'
import { useHomePageCache } from '../context/HomePageCacheContext.jsx'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { useZoneCache } from '../context/ZoneCacheContext.jsx'
import { useDashboardChrome } from '../context/DashboardChromeContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import KPICard from '../components/common/KPICard.jsx'


/* ── shared panel style ─────────────────────────────────────────── */
const panel = {
  // Flat glossy surface — no rounded corners, no 3D depth
  background: 'linear-gradient(157deg, rgba(32,31,31,0.55) 0%, rgba(26,25,25,0.50) 58%, rgba(21,20,20,0.45) 100%)',
  border: '1px solid rgba(255,255,255,0.04)',
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
const CARD_HDR = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.625em', padding: '0.875em 1.125em 0.5em', flexShrink: 0, flexWrap: 'wrap' }
const CARD_TTL = { fontSize: 'clamp(0.8125em, 1.1vw, 1.2em)', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }
const CARD_SUB = { fontSize: '0.6875em', color: '#E0E0E0', marginTop: '0.125em' }
const SECTION_HDR = { fontSize: '0.625em', fontWeight: 700, color: '#909090', textTransform: 'uppercase', letterSpacing: '0.10em', marginBottom: '0.625em' }
const EMPTY_MSG = { color: '#D0D0D0', fontSize: '0.75em', textAlign: 'center', padding: '1.25em 0', margin: 0 }
const VIEW_ALL_BTN = { background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: '0.6875em', fontWeight: 700, padding: 0, transition: 'color 0.15s' }

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

  // Build the funnel hierarchy from the metrics array.
  // The caller passes: Total Devices, Locators, Stickers, Users (in that order).
  const totalDevices = Number(metrics[0]?.value) || 0
  const locatorCount = Number(metrics[1]?.value) || 0
  const stickerCount = Number(metrics[2]?.value) || 0
  const userCount    = Number(metrics[3]?.value) || 0

  const locatorPct = totalDevices > 0 ? ((locatorCount / totalDevices) * 100).toFixed(1) : '0'
  const footer = totalDevices > 0
    ? `${locatorCount} of ${totalDevices} devices are locators (${locatorPct}%)`
    : ''

  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={{ flex: 1, minHeight: 0, padding: '12px 4px 8px' }}>
        <FunnelChart
          data={metrics}
          layers={4}
          grid={{ bands: false, lines: true }}
          edges="straight"
          orientation="vertical"
          footer={footer}
        />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CELL 6 — RECENT TREND (hourly activity area chart)
   ══════════════════════════════════════════════════════════════════ */
function RecentTrendPanel({ generalBins, peakLabel }) {
  const { bind, style: hoverStyle } = usePanelHover()
  // Auburn family — bars: total hourly reports; line: reports from devices
  // currently inside their assigned zone.
  const AUBURN = '#A72C32'
  const AUBURN_LIGHT = '#E0868B'
  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div style={CARD_TTL}>Recent Trend</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#B8B8B8' }}>
            <span style={{ width: 8, height: 8, background: AUBURN, display: 'inline-block' }} />
            Total reports
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#B8B8B8' }}>
            <span style={{ width: 10, height: 2.5, background: AUBURN_LIGHT, display: 'inline-block' }} />
            In zone
          </span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#C44E54', background: 'rgba(164,44,50,0.12)', border: '1px solid rgba(164,44,50,0.22)', borderRadius: 0, padding: '3px 10px' }}>
            {peakLabel}
          </span>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: '0 14px 6px' }}>
        <ComposedChart
          data={generalBins}
          xDataKey="label"
          margin={{ top: 8, right: 8, bottom: 40, left: 8 }}
          barGap={0}
          maxBarSize={32}
        >
          <ChartGrid horizontal />
          <SeriesBar dataKey="count" name="Total reports" fill={AUBURN} radius={5} />
          <ChartLine dataKey="inZone" name="In zone" stroke={AUBURN_LIGHT} />
          <ComposedTooltip showCrosshair={false} />
          <ChartXAxis numTicks={8} />
        </ComposedChart>
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
  const total = batteryTiers.total || 1
  // One ring per battery tier — each ring fills with that tier's share of
  // the reporting fleet; center shows the fleet-wide average charge.
  const ringData = [
    { label: 'High', value: (batteryTiers.high / total) * 100, color: BATT_COLORS[0] },
    { label: 'Medium', value: (batteryTiers.medium / total) * 100, color: BATT_COLORS[1] },
    { label: 'Low', value: (batteryTiers.low / total) * 100, color: BATT_COLORS[2] },
  ]
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 96 }}>
        <RingChart
          data={ringData}
          endAngle={Math.PI / 2}
          size={250}
          startAngle={-Math.PI}
        >
          {ringData.map((item, index) => (
            <Ring index={index} key={item.label} />
          ))}
          <RingCenter defaultLabel="avg battery" value={`${Math.round(batteryTiers.avg)}%`} />
        </RingChart>
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
    <div {...bind} className="scalable-container" style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85em 1.15em', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: '0.7em', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 10em' }}>
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
            flexShrink: 0, height: '2em', padding: '0 0.85em', fontSize: '0.8em',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 0, color: '#F5F5F5', outline: 'none',
            width: 'min(10em, 100%)', maxWidth: '100%', transition: 'border-color 0.15s, width 0.2s',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.55)'; e.target.style.width = 'min(13em, 100%)' }}
          onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.width = 'min(10em, 100%)' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(4.5em, 0.8fr) minmax(0, 1fr)', padding: '0.57em 1.15em', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        {['Device Name', 'User / Label', 'Status', 'Last Reported'].map(h => (
          <span key={h} style={{ fontSize: '0.65em', fontWeight: 700, color: '#B8B8B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {visibleRows.length === 0 ? (
          <div style={{ padding: '2.3em', textAlign: 'center', color: '#B8B8B8', fontSize: '0.92em' }}>
            {isSearching ? `No results for "${search.trim()}"` : 'No active devices'}
          </div>
        ) : visibleRows.map((row, idx) => (
          <div key={row.id}
            style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.4fr) minmax(4.5em, 0.8fr) minmax(0, 1fr)',
              padding: '0.7em 1.15em', borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
              transition: 'background 0.12s', cursor: 'default',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,44,50,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45em', overflow: 'hidden' }}>
              <span style={{ fontSize: '0.85em', fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
              <span className={`badge ${row.type === 'Sticker' ? 'badge-yellow-500' : 'badge-primary'}`}>
                {row.type}
              </span>
            </span>
            <span style={{ fontSize: '0.85em', color: '#F0F0F0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '0.57em' }}>{row.user}</span>
            <span>
              <span className="badge badge-teal-500">
                <span className="badge-dot bg-current animate-pulse" />
                Active
              </span>
            </span>
            <span style={{ fontSize: '0.85em', color: '#D4D4D4', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtRelTime(row.lastSeen)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   CELL 9 — AVAILABILITY FACTOR (device + user gauges from summary)
   The user gauge is admin-only — the users list is admin-scoped data.
   ══════════════════════════════════════════════════════════════════ */
function AvailabilityFactorCard({ summary, totalUsers = 0, onlineUsers = 0, showUsers = false }) {
  const { bind, style: hoverStyle } = usePanelHover()

  const totalDevices = Number(summary?.total) || 0
  const onlineDevices = Number(summary?.online) || 0

  const gauges = [
    {
      key: 'devices', label: 'Device', centerLabel: 'Devices Online',
      online: onlineDevices, total: totalDevices,
      gradient: ['#a855f7', '#06b6d4'], accent: '#22d3ee',
    },
    ...(showUsers ? [{
      key: 'users', label: 'User', centerLabel: 'Users Online',
      online: onlineUsers, total: totalUsers,
      gradient: ['#22c55e', '#4ade80'], accent: '#4ade80',
    }] : []),
  ]

  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div style={CARD_TTL}>Availability Factor</div>
        <span style={{ fontSize: 10, color: '#B8B8B8' }}>
          {totalDevices.toLocaleString()} Devices{showUsers ? ` · ${totalUsers.toLocaleString()} Users` : ''}
        </span>
      </div>

      {/* Gauges share the row equally; each pane sizes its gauge to its own
          box (min(w,h) via ResizeObserver), so halves shrink cleanly on
          narrow columns without clipping. */}
      <div style={{
        flex: 1, minHeight: 0, display: 'grid',
        gridTemplateColumns: `repeat(${gauges.length}, minmax(0, 1fr))`,
        gap: 'clamp(6px, 0.8vw, 12px)',
        padding: '0 clamp(10px, 1.2vw, 16px) clamp(10px, 1.2vw, 16px)',
      }}>
        {gauges.map(g => {
          const rate = g.total > 0 ? Math.round((g.online / g.total) * 100) : 0
          return (
            <div key={g.key} style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 92 }}>
                <Gauge
                  value={rate}
                  centerValue={g.online}
                  defaultLabel={g.centerLabel}
                  startAngle={140}
                  endAngle={400}
                  activeGradient={g.gradient}
                  inactiveGradient={['#334155', '#38bdf8']}
                  inactiveFillOpacity={0.4}
                  notchCornerRadius={7}
                  spacing={0}
                  useGradient
                  formatOptions={{ maximumFractionDigits: 0 }}
                />
              </div>
              <div style={{ textAlign: 'center', marginTop: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: g.accent, fontWeight: 700 }}>{rate}%</span>
                <span style={{ fontSize: 11, color: '#9A9A9A' }}> {g.label} Availability</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   BATTERY STATUS — sole card (top of 4th column)
   ══════════════════════════════════════════════════════════════════ */
function BatteryCard({ batteryTiers }) {
  const { bind, style: hoverStyle } = usePanelHover()
  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div style={CARD_TTL}>Battery Status</div>
        <span style={{ fontSize: 10, color: '#B8B8B8' }}>
          {batteryTiers.total} reporting
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 14px 10px' }}>
        <BatteryRadial batteryTiers={batteryTiers} />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   TOP ACTIVE ZONES — gradient pie card (replaces Alerts Summary)
   ══════════════════════════════════════════════════════════════════ */
const ZONE_PIE_GRADS = [
  { id: 'pg-1', from: '#0ea5e9', to: '#06b6d4' },
  { id: 'pg-2', from: '#a855f7', to: '#ec4899' },
  { id: 'pg-3', from: '#f59e0b', to: '#ef4444' },
]

function TopZonesCard({ zones, devices, onView }) {
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
      .slice(0, 3)
  }, [zones, devices])

  return (
    <div {...bind} style={{ ...CARD_ROOT, ...hoverStyle }}>
      <div style={CARD_HDR}>
        <div style={CARD_TTL}>Top Active Zones</div>
        <button onClick={onView} style={VIEW_ALL_BTN}
          onMouseEnter={e => { e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          View all →
        </button>
      </div>
      {topZones.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={EMPTY_MSG}>No zone activity yet</p>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '0 14px 10px' }}>
          <div style={{ flex: 1, minHeight: 110 }}>
            <PieChart data={topZones} size={200}>
              <RadialGradient from={ZONE_PIE_GRADS[0].from} id="pg-1" to={ZONE_PIE_GRADS[0].to} />
              <RadialGradient from={ZONE_PIE_GRADS[1].from} id="pg-2" to={ZONE_PIE_GRADS[1].to} />
              <RadialGradient from={ZONE_PIE_GRADS[2].from} id="pg-3" to={ZONE_PIE_GRADS[2].to} />
              <PieSlice fill="url(#pg-1)" index={0} />
              <PieSlice fill="url(#pg-2)" index={1} />
              <PieSlice fill="url(#pg-3)" index={2} />
            </PieChart>
          </div>
          <ChipLegend items={topZones.map((z, i) => ({
            label: `${z.name} · ${z.count}`,
            color: ZONE_PIE_GRADS[i % ZONE_PIE_GRADS.length].from,
          }))} />
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
   DASHBOARD — single scrollable page, fixed 4-column grid (2:4:5 rows)
   ══════════════════════════════════════════════════════════════════ */
import { emitDevicesUpdated } from '../utils/deviceEvents.js'

export default function Dashboard() {
  const { locations, activityData, devices: rawDevices, summary, refreshAll } = useHomePageCache()

  // Silent auto-refresh every 15 min — keeps the current dashboard on screen
  // (no loaders) while fresh data is fetched sequentially in the background.
  useEffect(() => {
    const iv = setInterval(() => emitDevicesUpdated(), 15 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])
  const navigate = useNavigate()
  const pushTrail = useTrailNav()
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

  // In/out-of-zone status per zone-assigned device — its latest position
  // tested against the zone geometry (polygon(s) or circle). Feeds the
  // Recent Trend chart's "In zone" series.
  const zoneStatusBySn = useMemo(() => {
    const status = {}
    const coordsOf = (loc) => {
      const lat = Number(loc?.lat ?? loc?.latitude ?? loc?.gpsLat ?? loc?.wgLat)
      const lng = Number(loc?.lng ?? loc?.lon ?? loc?.longitude ?? loc?.gpsLng ?? loc?.wgLng)
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
    }
    zones.forEach(z => (z.device_sns || []).forEach(sn => {
      const c = coordsOf(locations?.[sn])
      if (!c) return
      let inside = false
      try {
        if (Array.isArray(z.polygons) && z.polygons.length) inside = pointInMultiPolygon(c.lat, c.lng, z.polygons)
        else if (Array.isArray(z.polygon) && z.polygon.length >= 3) inside = pointInPolygon(c.lat, c.lng, z.polygon)
        else if (z.shape === 'circle' && z.center && z.radius) {
          const R = 6371000
          const dLat = (c.lat - z.center.lat) * Math.PI / 180
          const dLng = (c.lng - z.center.lng) * Math.PI / 180
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(z.center.lat * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
          inside = 2 * R * Math.asin(Math.sqrt(a)) <= z.radius
        }
      } catch { /* malformed zone geometry — treat as outside */ }
      // A device in ANY of its zones counts as in-zone.
      if (inside) status[sn] = 'in'
      else if (!status[sn]) status[sn] = 'out'
    }))
    return status
  }, [zones, locations])

  // Hourly activity bins from real playback data — total reports per hour
  // plus how many of them came from devices currently inside their zone.
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
    return Array.from({ length: 24 }, (_, h) => {
      let count = 0, inZone = 0
      Object.entries(devHour).forEach(([sn, hc]) => {
        const c = hc[h] ?? 0
        count += c
        if (zoneStatusBySn[sn] === 'in') inZone += c
      })
      return { hour: h, label: `${String(h).padStart(2, '0')}h`, count, inZone }
    })
  }, [activityData, rawDevices, zoneStatusBySn])

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

  // Battery tiers — sourced from latest location doc (batteryStatus)
  const batteryTiers = useMemo(() => {
    const vals = Object.values(locations || {})
      .map(loc => {
        const b = loc?.batteryStatus ?? loc?.batteryLevel ?? loc?.battery ?? loc?.battery_status ?? loc?.batteryPowerVal
        const num = Number(b)
        return b != null && !isNaN(num) ? num : null
      })
      .filter(v => v != null)
    return {
      high: vals.filter(v => v >= 60).length,
      medium: vals.filter(v => v >= 20 && v < 60).length,
      low: vals.filter(v => v < 20).length,
      total: vals.length,
      avg: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0,
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

  // Users currently logged in (login newer than logout) — drives the user
  // availability gauge (admin dashboard only)
  const onlineUserCount = useMemo(() => users.filter(isUserOnline).length, [users])

  const totalDevices = Number(summary?.total) || 0
  const assignedDevices = Number(summary?.assigned) || 0
  const unboundCount = Math.max(0, totalDevices - assignedDevices)

  // Only count zones that actually have a device assigned — an empty zone
  // (drawn but not yet wired to a device) isn't "active" yet.
  const activeZonesCount = zones.filter(z => (z.device_sns?.length || 0) > 0).length

  // Cell 5 — funnel hierarchy: Total Devices → Locators → Stickers → Users
  const locatorCount = Number(summary?.locators) || 0
  const stickerCount = Number(summary?.stickers) || 0
  const stackMetrics = [
    { label: 'Total Devices', value: totalDevices, onClick: () => navigate('/devices') },
    { label: 'Locators',      value: locatorCount,  onClick: () => navigate('/locators') },
    { label: 'Stickers',      value: stickerCount,  onClick: () => navigate('/stickers') },
    { label: 'Users',         value: users.length,   onClick: () => navigate('/users') },
  ]

  const isWide = cols === 4
  const isSingle = cols === 1
  // span2 adapts: spans 2 at 2+ cols, spans 1 in single-column mode
  const span2 = { gridColumn: isSingle ? 'span 1' : 'span 2', height: '100%', minHeight: 0 }

  return (
    <div
      ref={gridRef}
      style={{
        height: isWide ? '100%' : 'auto', minHeight: isWide ? '40em' : undefined,
        display: 'grid', gap: isSingle ? '0.625em' : '0.875em',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: isWide ? '1.6fr 4.1fr 5.3fr' : undefined,
        gridAutoRows: isWide ? undefined : 'minmax(11.25em, auto)',
        fontWeight: 400, letterSpacing: '0.04em',
        fontSize: 'clamp(10px, 1.6vh, 18px)',
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
      <BatteryCard batteryTiers={batteryTiers} />

      {/* ── Row 3 — recent activity wide (2 cols) · fleet (1 col) · alerts (1 col) ── */}
      <div style={span2}>
        <RecentActivityPanel activityRows={activityRows} totalActive={summary.online} />
      </div>
      <AvailabilityFactorCard
        summary={summary}
        totalUsers={users.length}
        onlineUsers={onlineUserCount}
        showUsers={isAdmin}
      />
      <TopZonesCard zones={zones} devices={rawDevices} onView={() => pushTrail('/fence')} />
    </div>

  )
}
