import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════
   LiveCharts — in-house SVG chart primitives matching the registry API:

     <LiveLineChart data={..} value={..} window={25} margin={{..}}>
       <LiveLine dataKey="value" momentumColors={{up,down,flat}} formatValue={f} dotSize={5} />
       <LiveXAxis />
       <LiveYAxis position="left" formatValue={f} />
     </LiveLineChart>

     <Gauge value={66} centerValue={..} defaultLabel=".." startAngle={140}
            endAngle={400} activeGradient={[a,b]} inactiveGradient={[a,b]}
            inactiveFillOpacity={0.4} notchCornerRadius={7} spacing={0}
            useGradient formatOptions={{..Intl.NumberFormat opts..}} />

   No external chart deps — everything renders as plain SVG and sizes
   itself to the parent via ResizeObserver.
   ═══════════════════════════════════════════════════════════════════ */

function useMeasure() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/* ── LiveLineChart family ─────────────────────────────────────────── */

const LiveChartCtx = createContext(null);

// Horizontal room reserved for the y-axis labels.
const Y_GUTTER = 34;

export function LiveLineChart({
  data = [],
  value,            // current live value (drives nothing structural; exposed to children)
  window: win = 25, // most recent N points shown
  margin = { top: 8, right: 8, bottom: 40, left: 8 },
  children,
}) {
  const [ref, { w, h }] = useMeasure();

  const ctx = useMemo(() => {
    const pts = (data || []).slice(-win);
    const values = pts.map((p) => Number(p.value ?? 0));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.12;
    const lo = min - pad, hi = max + pad;

    const x0 = margin.left + Y_GUTTER;
    const innerW = Math.max(0, w - x0 - margin.right);
    const innerH = Math.max(0, h - margin.top - margin.bottom);
    const xFor = (i) => (pts.length > 1 ? x0 + (i / (pts.length - 1)) * innerW : x0 + innerW / 2);
    const yFor = (v) => margin.top + (1 - (v - lo) / (hi - lo)) * innerH;

    return { pts, min, max, lo, hi, xFor, yFor, x0, innerW, innerH, margin, w, h, value };
  }, [data, win, w, h, margin.top, margin.right, margin.bottom, margin.left, value]);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
          <LiveChartCtx.Provider value={ctx}>{children}</LiveChartCtx.Provider>
        </svg>
      )}
    </div>
  );
}

export function LiveLine({
  dataKey = "value",
  momentumColors = {},
  formatValue = (v) => String(v),
  dotSize = 5,
}) {
  const c = useContext(LiveChartCtx);
  const gradId = useRef(`ll-${Math.random().toString(36).slice(2, 8)}`).current;
  if (!c || c.pts.length === 0) return null;

  const vals = c.pts.map((p) => Number(p[dataKey] ?? 0));
  const last = vals[vals.length - 1];
  const prev = vals.length > 1 ? vals[vals.length - 2] : last;
  const dir = last > prev ? "up" : last < prev ? "down" : "flat";
  const color = momentumColors[dir] || "#9CA3AF";

  const d = vals
    .map((v, i) => `${i === 0 ? "M" : "L"}${c.xFor(i).toFixed(1)},${c.yFor(v).toFixed(1)}`)
    .join(" ");
  const lx = c.xFor(vals.length - 1);
  const ly = c.yFor(last);
  const baseline = c.margin.top + c.innerH;

  return (
    <g>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* soft area fill under the line */}
      <path
        d={`${d} L${lx.toFixed(1)},${baseline.toFixed(1)} L${c.x0.toFixed(1)},${baseline.toFixed(1)} Z`}
        fill={`url(#${gradId})`}
        stroke="none"
      />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
      />
      {/* pulsing live dot on the newest point */}
      <circle cx={lx} cy={ly} r={dotSize + 3} fill={color} opacity={0.18}>
        <animate attributeName="r" values={`${dotSize + 2};${dotSize + 8};${dotSize + 2}`} dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.28;0.05;0.28" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx={lx} cy={ly} r={dotSize} fill={color} stroke="rgba(0,0,0,0.55)" strokeWidth={1.5} />
      <text
        x={lx}
        y={ly - dotSize - 7}
        textAnchor={lx > c.x0 + c.innerW - 36 ? "end" : "middle"}
        fill="#FFFFFF"
        fontSize={11}
        fontWeight={700}
      >
        {formatValue(last)}
      </text>
    </g>
  );
}

export function LiveXAxis() {
  const c = useContext(LiveChartCtx);
  if (!c || c.pts.length === 0) return null;
  const n = c.pts.length;
  const step = Math.max(1, Math.ceil(n / 6));
  const y = c.margin.top + c.innerH + 16;
  const ticks = [];
  for (let i = 0; i < n; i += step) {
    ticks.push(
      <text key={i} x={c.xFor(i)} y={y} textAnchor="middle" fill="#B8B8B8" fontSize={10}>
        {c.pts[i].label ?? i}
      </text>
    );
  }
  return <g>{ticks}</g>;
}

export function LiveYAxis({ position = "left", formatValue = (v) => String(v) }) {
  const c = useContext(LiveChartCtx);
  if (!c) return null;
  const ticks = [c.min, (c.min + c.max) / 2, c.max];
  const x = position === "left" ? c.x0 - 6 : c.x0 + c.innerW + 6;
  const anchor = position === "left" ? "end" : "start";
  return (
    <g>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={c.x0} x2={c.x0 + c.innerW}
            y1={c.yFor(t)} y2={c.yFor(t)}
            stroke="rgba(255,255,255,0.05)" strokeDasharray="1 4"
          />
          <text x={x} y={c.yFor(t) + 3} textAnchor={anchor} fill="#B8B8B8" fontSize={10}>
            {formatValue(Math.round(t))}
          </text>
        </g>
      ))}
    </g>
  );
}

/* ── ComposedChart family (bars + line + tooltip + x-axis) ────────────
     <ComposedChart data={..} xDataKey="date" margin={{..}} barGap={0} maxBarSize={32}>
       <Grid horizontal />
       <SeriesBar dataKey="units" fill="#.." radius={5} />
       <Line dataKey="revenue" stroke="#.." />
       <ChartTooltip showCrosshair={false} />
       <XAxis numTicks={8} />
     </ComposedChart>
   ─────────────────────────────────────────────────────────────────── */

const ComposedCtx = createContext(null);

export function ComposedChart({
  data = [],
  xDataKey = "x",
  margin = { top: 8, right: 8, bottom: 40, left: 8 },
  aspectRatio,        // accepted for API parity; sizing follows the parent box
  barGap = 0,
  maxBarSize = 32,
  children,
}) {
  const [ref, { w, h }] = useMeasure();
  const [hover, setHover] = useState(null);
  const seriesRef = useRef(new Map()); // dataKey -> { color, name, type }

  const n = data.length;
  const innerW = Math.max(0, w - margin.left - margin.right);
  const innerH = Math.max(0, h - margin.top - margin.bottom);

  let max = 0;
  data.forEach((row) => {
    Object.entries(row).forEach(([k, v]) => {
      if (k !== xDataKey && typeof v === "number" && v > max) max = v;
    });
  });
  if (max <= 0) max = 1;
  max *= 1.08;

  const slotW = n > 0 ? innerW / n : innerW;
  const xCenter = (i) => margin.left + slotW * (i + 0.5);
  const yFor = (v) => margin.top + (1 - Math.max(0, v) / max) * innerH;
  const barW = Math.min(maxBarSize, Math.max(2, slotW * 0.72 - barGap));

  const registerSeries = (key, info) => { seriesRef.current.set(key, info); };

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - margin.left;
    if (n === 0 || x < 0 || x > innerW) { setHover(null); return; }
    setHover(Math.max(0, Math.min(n - 1, Math.floor(x / slotW))));
  };

  const ctx = {
    data, xDataKey, n, xCenter, yFor, barW, slotW,
    innerW, innerH, margin, w, h, max,
    hover, seriesRef, registerSeries,
  };

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0, ...(aspectRatio && h === 0 ? { aspectRatio } : null) }}>
      {w > 0 && h > 0 && (
        <svg
          width={w} height={h}
          style={{ display: "block", overflow: "visible" }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <ComposedCtx.Provider value={ctx}>{children}</ComposedCtx.Provider>
        </svg>
      )}
    </div>
  );
}

export function Grid({ horizontal = false, vertical = false, lines = 4 }) {
  const c = useContext(ComposedCtx);
  if (!c) return null;
  const els = [];
  if (horizontal) {
    for (let i = 0; i <= lines; i++) {
      const y = c.margin.top + (i / lines) * c.innerH;
      els.push(<line key={`h${i}`} x1={c.margin.left} x2={c.margin.left + c.innerW} y1={y} y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="1 4" />);
    }
  }
  if (vertical) {
    for (let i = 0; i <= lines; i++) {
      const x = c.margin.left + (i / lines) * c.innerW;
      els.push(<line key={`v${i}`} x1={x} x2={x} y1={c.margin.top} y2={c.margin.top + c.innerH} stroke="rgba(255,255,255,0.05)" strokeDasharray="1 4" />);
    }
  }
  return <g>{els}</g>;
}

export function SeriesBar({ dataKey, fill = "#A72C32", radius = 0, name }) {
  const c = useContext(ComposedCtx);
  if (!c) return null;
  c.registerSeries(dataKey, { color: fill, name: name || dataKey, type: "bar" });
  const baseline = c.margin.top + c.innerH;
  return (
    <g>
      {c.data.map((row, i) => {
        const v = Number(row[dataKey] ?? 0);
        const y = c.yFor(v);
        const bh = Math.max(0, baseline - y);
        if (bh <= 0) return null;
        const r = Math.min(radius, c.barW / 2, bh);
        const x = c.xCenter(i) - c.barW / 2;
        // rounded TOP corners only
        const d = `M${x},${baseline} V${y + r} Q${x},${y} ${x + r},${y} H${x + c.barW - r} Q${x + c.barW},${y} ${x + c.barW},${y + r} V${baseline} Z`;
        return <path key={i} d={d} fill={fill} opacity={c.hover == null || c.hover === i ? 0.92 : 0.45} style={{ transition: "opacity 0.12s" }} />;
      })}
    </g>
  );
}

export function Line({ dataKey, stroke = "#E0868B", strokeWidth = 2.5, name }) {
  const c = useContext(ComposedCtx);
  if (!c || c.n === 0) return null;
  c.registerSeries(dataKey, { color: stroke, name: name || dataKey, type: "line" });
  const d = c.data
    .map((row, i) => `${i === 0 ? "M" : "L"}${c.xCenter(i).toFixed(1)},${c.yFor(Number(row[dataKey] ?? 0)).toFixed(1)}`)
    .join(" ");
  return (
    <g>
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${stroke}55)` }} />
      {c.hover != null && (
        <circle cx={c.xCenter(c.hover)} cy={c.yFor(Number(c.data[c.hover]?.[dataKey] ?? 0))} r={4} fill={stroke} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
      )}
    </g>
  );
}

export function ChartTooltip({ showCrosshair = false }) {
  const c = useContext(ComposedCtx);
  if (!c || c.hover == null || !c.data[c.hover]) return null;
  const row = c.data[c.hover];
  const series = [...c.seriesRef.current.entries()];
  const lineH = 15;
  const boxW = 128;
  const boxH = 22 + series.length * lineH;
  const cx = c.xCenter(c.hover);
  const flip = cx + boxW + 12 > c.w;
  const bx = flip ? cx - boxW - 10 : cx + 10;
  const by = Math.max(4, Math.min(c.margin.top + 6, c.h - boxH - 4));
  return (
    <g style={{ pointerEvents: "none" }}>
      {showCrosshair && (
        <line x1={cx} x2={cx} y1={c.margin.top} y2={c.margin.top + c.innerH} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 3" />
      )}
      <rect x={bx} y={by} width={boxW} height={boxH} fill="rgba(16,15,15,0.96)" stroke="rgba(255,255,255,0.12)" />
      <text x={bx + 9} y={by + 15} fill="#FFFFFF" fontSize={10.5} fontWeight={700}>{String(row[c.xDataKey])}</text>
      {series.map(([key, info], i) => (
        <g key={key}>
          <rect x={bx + 9} y={by + 23 + i * lineH} width={7} height={7} fill={info.color} />
          <text x={bx + 21} y={by + 30 + i * lineH} fill="#CFCFCF" fontSize={10}>{info.name}</text>
          <text x={bx + boxW - 9} y={by + 30 + i * lineH} textAnchor="end" fill="#FFFFFF" fontSize={10} fontWeight={700}>
            {Number(row[key] ?? 0).toLocaleString()}
          </text>
        </g>
      ))}
    </g>
  );
}

export function XAxis({ numTicks = 8 }) {
  const c = useContext(ComposedCtx);
  if (!c || c.n === 0) return null;
  const step = Math.max(1, Math.ceil(c.n / numTicks));
  const y = c.margin.top + c.innerH + 16;
  const ticks = [];
  for (let i = 0; i < c.n; i += step) {
    ticks.push(
      <text key={i} x={c.xCenter(i)} y={y} textAnchor="middle" fill="#B8B8B8" fontSize={10}>
        {String(c.data[i][c.xDataKey])}
      </text>
    );
  }
  return <g>{ticks}</g>;
}

/* ── PieChart (gradient slices) ───────────────────────────────────────
     <PieChart data={pieData} size={200}>
       <RadialGradient from="#0ea5e9" id="pg-1" to="#06b6d4" />
       <PieSlice fill="url(#pg-1)" index={0} />
     </PieChart>
   Data items: { name/label, value/count }. Slices start at 12 o'clock and
   run clockwise; each shows its value at the slice's centroid.
   ─────────────────────────────────────────────────────────────────── */

const PieCtx = createContext(null);

export function PieChart({ data = [], size = 200, children }) {
  const [ref, { w, h }] = useMeasure();
  if (w <= 0 || h <= 0) return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;

  const S = Math.min(size, w, h);
  const cx = w / 2, cy = h / 2;
  const r = S / 2 - 4;
  const total = data.reduce((s, d) => s + (Number(d.value ?? d.count) || 0), 0) || 1;

  let acc = -Math.PI / 2; // start at 12 o'clock, clockwise
  const slices = data.map((d) => {
    const v = Number(d.value ?? d.count) || 0;
    const a0 = acc;
    const a1 = acc + (v / total) * 2 * Math.PI;
    acc = a1;
    return { a0, a1, v, datum: d };
  });

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      <svg width={w} height={h} style={{ display: "block" }}>
        <PieCtx.Provider value={{ slices, cx, cy, r, total }}>{children}</PieCtx.Provider>
      </svg>
    </div>
  );
}

export function RadialGradient({ from, to, id }) {
  return (
    <defs>
      <radialGradient id={id} cx="50%" cy="50%" r="70%">
        <stop offset="0%" stopColor={from} />
        <stop offset="100%" stopColor={to} />
      </radialGradient>
    </defs>
  );
}

export function PieSlice({ fill, index }) {
  const c = useContext(PieCtx);
  const [hover, setHover] = useState(false);
  const s = c?.slices?.[index];
  if (!c || !s || s.v <= 0) return null;

  const { cx, cy, r } = c;
  const sweep = s.a1 - s.a0;
  const full = sweep >= 2 * Math.PI - 1e-6;
  const a1 = full ? s.a0 + 2 * Math.PI - 1e-4 : s.a1;
  const large = a1 - s.a0 > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.cos(s.a0), y0 = cy + r * Math.sin(s.a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const d = `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;

  const mid = (s.a0 + a1) / 2;
  const lr = r * 0.62;
  const lx = cx + lr * Math.cos(mid), ly = cy + lr * Math.sin(mid);

  return (
    <g onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <path
        d={d} fill={fill} stroke="rgba(0,0,0,0.35)" strokeWidth={1}
        opacity={hover ? 1 : 0.88}
        style={{ transition: "opacity 0.15s, transform 0.15s", transformOrigin: `${cx}px ${cy}px`, transform: hover ? "scale(1.03)" : "scale(1)" }}
      >
        <title>{`${s.datum.name ?? s.datum.label ?? ""}: ${s.v} (${Math.round((s.v / c.total) * 100)}%)`}</title>
      </path>
      {sweep > 0.25 && (
        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fill="#FFFFFF" fontSize={12} fontWeight={700}
          style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 2, pointerEvents: "none" }}>
          {s.v}
        </text>
      )}
    </g>
  );
}

/* ── FunnelChart ──────────────────────────────────────────────────────
     <FunnelChart color="#.." data={[{label, value, sub?, color?, onClick?}]}
                  edges="straight" grid={{ bands: false, lines: true }}
                  layers={3} orientation="vertical" />

   Premium enterprise conversion funnel — multi-layer depth, external
   labels, centered percentage pills, staggered entrance animation.
   ─────────────────────────────────────────────────────────────────── */

const FUNNEL_LAYER_ALPHAS = [0.07, 0.05, 0.035, 0.025];

function FunnelStage({ cx, y0, stageH, topW, botW, layerCount, idx, hovered, item, pct, totalStages, onHover, onClick }) {
  /* Multi-depth layers — each progressively inset */
  const layers = [];
  for (let l = 0; l < layerCount; l++) {
    const inset = l * 6;
    const tW = Math.max(4, topW - inset * 2);
    const bW = Math.max(4, botW - inset * 2);
    const d = `M${cx - tW / 2},${y0} L${cx + tW / 2},${y0} L${cx + bW / 2},${y0 + stageH} L${cx - bW / 2},${y0 + stageH} Z`;
    const alpha = FUNNEL_LAYER_ALPHAS[l] ?? 0.02;
    const hoverAlpha = alpha + 0.04;
    layers.push(
      <path
        key={l}
        d={d}
        fill={`rgba(255,255,255,${hovered ? hoverAlpha : alpha})`}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={l === 0 ? 1 : 0}
        style={{ transition: 'fill 250ms ease, opacity 250ms ease' }}
      />
    );
  }

  /* Percentage pill */
  const pillW = 46, pillH = 19, pillR = 9.5;
  const pillY = y0 + stageH / 2 - pillH / 2;
  const pctText = pct >= 100 ? '100%' : pct >= 10 ? `${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;

  return (
    <g
      onMouseEnter={() => onHover(idx)}
      onMouseLeave={() => onHover(null)}
      onClick={item.onClick}
      style={{
        cursor: item.onClick ? 'pointer' : 'default',
        animation: `funnelSlideIn 700ms cubic-bezier(0.25, 1, 0.5, 1) ${idx * 70}ms both`,
      }}
    >
      {layers}
      {/* Pill background */}
      <rect
        x={cx - pillW / 2}
        y={hovered ? pillY - 2 : pillY}
        width={pillW}
        height={pillH}
        rx={pillR}
        fill="rgba(255,255,255,0.92)"
        style={{
          transition: 'y 250ms ease, filter 250ms ease',
          filter: hovered ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))' : 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))',
        }}
      />
      <text
        x={cx}
        y={(hovered ? pillY - 2 : pillY) + pillH / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#111827"
        fontSize={10}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
        style={{ transition: 'y 250ms ease', pointerEvents: 'none' }}
      >
        {pctText}
      </text>
    </g>
  );
}

export function FunnelChart({
  color = "#00B4D8",
  data = [],
  edges = "straight",
  grid = { bands: false, lines: true },
  layers = 4,
  orientation = "vertical",
  footer,
}) {
  const [ref, { w, h }] = useMeasure();
  const [hover, setHover] = useState(null);
  const items = data;
  if (w <= 0 || h <= 0 || items.length === 0) {
    return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
  }

  const layerCount = Math.min(Math.max(layers ?? 4, 1), 4);
  const n = items.length;
  const max = Math.max(...items.map((it) => Number(it.value) || 0), 1);
  const totalDevices = Number(items[0]?.value) || max;

  /* Layout — labels sit outside, funnel is centered */
  const LABEL_W_LEFT = Math.min(80, w * 0.2);
  const LABEL_W_RIGHT = Math.min(110, w * 0.28);
  const FUNNEL_PAD_TOP = 12;
  const FOOTER_H = footer ? 28 : 0;
  const funnelX0 = LABEL_W_LEFT;
  const funnelX1 = w - LABEL_W_RIGHT;
  const funnelW = funnelX1 - funnelX0;
  const funnelCx = funnelX0 + funnelW / 2;

  const GAP = 8;
  const availH = h - FUNNEL_PAD_TOP - FOOTER_H - 8;
  const stageH = Math.max(20, (availH - GAP * (n - 1)) / n);

  /* Width scaling — sqrt to keep small values visible */
  const fracFor = (v) => 0.18 + 0.82 * Math.sqrt(Math.max(0, Number(v) || 0) / max);
  const widths = items.map((it) => fracFor(it.value) * funnelW);

  /* CSS keyframe injection (once) */
  if (typeof document !== 'undefined' && !document.getElementById('funnel-anim-style')) {
    const s = document.createElement('style');
    s.id = 'funnel-anim-style';
    s.textContent = `@keyframes funnelSlideIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(s);
  }

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
        {/* Grid lines — full width, faint */}
        {items.map((_, i) => {
          const y = FUNNEL_PAD_TOP + i * (stageH + GAP);
          return (
            <line
              key={`grid-top-${i}`}
              x1={4} x2={w - 4}
              y1={y} y2={y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
            />
          );
        })}
        {/* Bottom grid line */}
        <line
          x1={4} x2={w - 4}
          y1={FUNNEL_PAD_TOP + n * (stageH + GAP) - GAP}
          y2={FUNNEL_PAD_TOP + n * (stageH + GAP) - GAP}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={1}
        />

        {/* Stages */}
        {items.map((it, i) => {
          const topW = widths[i];
          const botW = i < n - 1 ? widths[i + 1] : widths[i] * 0.65;
          const y0 = FUNNEL_PAD_TOP + i * (stageH + GAP);
          const pct = totalDevices > 0 ? (Number(it.value) / totalDevices) * 100 : 0;
          return (
            <FunnelStage
              key={it.label ?? i}
              cx={funnelCx}
              y0={y0}
              stageH={stageH}
              topW={topW}
              botW={botW}
              layerCount={layerCount}
              idx={i}
              hovered={hover === i}
              item={it}
              pct={pct}
              totalStages={n}
              onHover={setHover}
              onClick={it.onClick}
            />
          );
        })}

        {/* Left labels — values */}
        {items.map((it, i) => {
          const y = FUNNEL_PAD_TOP + i * (stageH + GAP) + stageH / 2;
          return (
            <text
              key={`lv-${i}`}
              x={LABEL_W_LEFT - 10}
              y={y + 1}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#FFFFFF"
              fontSize={Math.min(22, stageH * 0.5)}
              fontWeight={700}
              fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
              style={{
                animation: `funnelSlideIn 700ms cubic-bezier(0.25, 1, 0.5, 1) ${i * 70}ms both`,
              }}
            >
              {Number(it.value ?? 0).toLocaleString()}
            </text>
          );
        })}

        {/* Right labels — names */}
        {items.map((it, i) => {
          const y = FUNNEL_PAD_TOP + i * (stageH + GAP) + stageH / 2;
          return (
            <text
              key={`ln-${i}`}
              x={funnelX1 + 12}
              y={y + 1}
              textAnchor="start"
              dominantBaseline="middle"
              fill="#9CA3AF"
              fontSize={Math.min(14, stageH * 0.32)}
              fontWeight={500}
              fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
              style={{
                animation: `funnelSlideIn 700ms cubic-bezier(0.25, 1, 0.5, 1) ${i * 70}ms both`,
              }}
            >
              {it.label}
            </text>
          );
        })}

        {/* Footer summary */}
        {footer && (
          <text
            x={8}
            y={h - 6}
            fill="#6B7280"
            fontSize={10}
            fontWeight={500}
            fontFamily="ui-sans-serif, system-ui, -apple-system, sans-serif"
          >
            {footer}
          </text>
        )}
      </svg>
    </div>
  );
}

/* ── RingChart (concentric activity-style rings) ──────────────────────
     <RingChart data={items} startAngle={-Math.PI} endAngle={Math.PI/2} size={250}>
       {items.map((item, i) => <Ring index={i} key={item.label} />)}
       <RingCenter defaultLabel="Activity" />
     </RingChart>
   Angles in radians (0 = 3 o'clock, increasing clockwise). Each data item:
   { label, value (0–100), color }.
   ─────────────────────────────────────────────────────────────────── */

const RingCtx = createContext(null);

export function RingChart({
  data = [],
  startAngle = -Math.PI,
  endAngle = Math.PI / 2,
  size = 250,
  children,
}) {
  const [ref, { w, h }] = useMeasure();
  if (w <= 0 || h <= 0) return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;

  const S = Math.min(size, w, h);
  const cx = w / 2, cy = h / 2;
  const outerR = S / 2 - 4;
  const count = Math.max(1, data.length);
  const gap = 3;
  const thick = Math.max(6, (outerR * 0.52 - gap * (count - 1)) / count);
  const radiusFor = (i) => outerR - i * (thick + gap) - thick / 2;

  const ctx = { data, startAngle, endAngle, cx, cy, thick, radiusFor };
  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      <svg width={w} height={h} style={{ display: "block" }}>
        <RingCtx.Provider value={ctx}>{children}</RingCtx.Provider>
      </svg>
    </div>
  );
}

function ringArcPath(cx, cy, r, from, to) {
  // multi-segment safe arc (handles sweeps > π)
  const large = to - from > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(from), y1 = cy + r * Math.sin(from);
  const x2 = cx + r * Math.cos(to), y2 = cy + r * Math.sin(to);
  return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
}

export function Ring({ index }) {
  const c = useContext(RingCtx);
  const item = c?.data?.[index];
  if (!c || !item) return null;
  const r = c.radiusFor(index);
  if (r <= 0) return null;
  const frac = Math.max(0, Math.min(0.999, (Number(item.value) || 0) / 100));
  const color = item.color || "#A72C32";
  return (
    <g>
      <path d={ringArcPath(c.cx, c.cy, r, c.startAngle, c.endAngle)} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={c.thick} strokeLinecap="round" />
      {frac > 0 && (
        <path
          d={ringArcPath(c.cx, c.cy, r, c.startAngle, c.startAngle + (c.endAngle - c.startAngle) * frac)}
          fill="none" stroke={color} strokeWidth={c.thick} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}
        />
      )}
    </g>
  );
}

export function RingCenter({ defaultLabel = "", value, valueSize = 20, labelSize = 9.5 }) {
  const c = useContext(RingCtx);
  if (!c) return null;
  return (
    <g>
      {value != null && (
        <text x={c.cx} y={c.cy} textAnchor="middle" fill="#FFFFFF" fontSize={valueSize} fontWeight={800}>{value}</text>
      )}
      {defaultLabel && (
        <text x={c.cx} y={c.cy + (value != null ? valueSize * 0.78 : 4)} textAnchor="middle" fill="#B8B8B8" fontSize={labelSize}>{defaultLabel}</text>
      )}
    </g>
  );
}

/* ── Gauge ────────────────────────────────────────────────────────── */

function hexLerp(a, b, t) {
  const pa = a.replace("#", ""), pb = b.replace("#", "");
  const ch = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
  const mix = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${mix(ch(pa, 0), ch(pb, 0))}${mix(ch(pa, 2), ch(pb, 2))}${mix(ch(pa, 4), ch(pb, 4))}`;
}

export function Gauge({
  value = 0,               // 0–100 — how much of the arc is active
  centerValue,             // number shown in the middle (formatted via formatOptions)
  defaultLabel = "",
  startAngle = 140,
  endAngle = 400,
  activeGradient = ["#a855f7", "#06b6d4"],
  inactiveGradient = ["#334155", "#38bdf8"],
  inactiveFillOpacity = 0.4,
  notchCornerRadius = 7,
  spacing = 0,
  useGradient = true,
  formatOptions,
}) {
  const [ref, { w, h }] = useMeasure();
  if (w <= 0 || h <= 0) return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;

  const NOTCHES = 36;
  const sweep = endAngle - startAngle;
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const activeCount = Math.round((clamped / 100) * NOTCHES);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.max(12, Math.min(w, h) / 2 - 4);
  const notchLen = Math.max(9, R * 0.3);
  const arcLenPerNotch = (2 * Math.PI * (R - notchLen / 2) * (sweep / 360)) / NOTCHES;
  const notchW = Math.max(2.5, arcLenPerNotch - Math.max(1.5, spacing));

  const centerText = centerValue != null
    ? (formatOptions
        ? new Intl.NumberFormat(undefined, formatOptions).format(centerValue)
        : String(centerValue))
    : `${Math.round(clamped)}%`;

  const notches = [];
  for (let i = 0; i < NOTCHES; i++) {
    const t = NOTCHES > 1 ? i / (NOTCHES - 1) : 0;
    const angle = startAngle + (sweep * (i + 0.5)) / NOTCHES;
    const active = i < activeCount;
    const grad = active ? activeGradient : inactiveGradient;
    const fill = useGradient ? hexLerp(grad[0], grad[1] ?? grad[0], t) : grad[0];
    notches.push(
      <g key={i} transform={`translate(${cx} ${cy}) rotate(${angle + 90})`}>
        <rect
          x={-notchW / 2}
          y={-R}
          width={notchW}
          height={notchLen}
          rx={Math.min(notchCornerRadius, notchW / 2)}
          fill={fill}
          opacity={active ? 1 : inactiveFillOpacity}
        />
      </g>
    );
  }

  return (
    <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      <svg width={w} height={h} style={{ display: "block" }}>
        {notches}
        <text x={cx} y={cy} textAnchor="middle" fill="#FFFFFF" fontSize={Math.max(16, R * 0.34)} fontWeight={800}>
          {centerText}
        </text>
        {defaultLabel && (
          <text x={cx} y={cy + Math.max(14, R * 0.24)} textAnchor="middle" fill="#B8B8B8" fontSize={Math.max(9, R * 0.13)}>
            {defaultLabel}
          </text>
        )}
      </svg>
    </div>
  );
}
