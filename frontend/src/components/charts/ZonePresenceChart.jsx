import React from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/**
 * Zone presence over the selected window — one line for reports inside the
 * zone, one for reports outside it, bucketed per hour. recharts is already a
 * dependency; the shadcn ChartContainer/ChartTooltip wrappers are not, so the
 * theming that those provide is done inline here against the app's tokens.
 */

const SERIES = [
  { key: 'inZone',  label: 'In zone', color: '#2dd4bf' },
  { key: 'outside', label: 'Outside', color: '#fb923c' },
]

function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[#0d0d0d]/95 px-3 py-2 shadow-lg">
      <div className="mb-1 text-xs font-bold tracking-wide text-white/70">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs text-white/80">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="flex-1">{SERIES.find(s => s.key === p.dataKey)?.label ?? p.dataKey}</span>
          <span className="font-mono font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function ZonePresenceChart({ data = [], height = 200 }) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white/35"
        style={{ height }}
      >
        No location reports in this window
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fill: 'rgba(255,255,255,0.40)', fontSize: 11 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: 'rgba(255,255,255,0.40)', fontSize: 11 }}
          />
          <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.18)' }} content={<ChartTooltipContent />} />
          {SERIES.map(s => (
            <Line
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 flex items-center justify-center gap-4">
        {SERIES.map(s => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs font-semibold text-white/55">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  )
}
