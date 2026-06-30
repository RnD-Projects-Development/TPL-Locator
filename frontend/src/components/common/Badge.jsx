
// Badge component for displaying status indicators
// Props:
// - status: string representing the status (e.g., 'Active', 'Idle', 'Delivered')
// - size: string representing the size (e.g., 'sm', 'xs')
// The component uses a configuration object to map statuses to their corresponding styles and dot colors.

import React from 'react'

const cfg = {
  'Active':      { cls: 'bg-jade-500/15 text-jade-400 border-jade-500/30',    dot: 'bg-jade-400',   pulse: true  },
  'In Transit':  { cls: 'bg-brand-500/15 text-brand-400 border-brand-500/30', dot: 'bg-brand-400',  pulse: true  },
  'Idle':        { cls: 'bg-ink-600/60 text-slate-400 border-ink-500/40',      dot: 'bg-slate-500',  pulse: false },
  'Delivered':   { cls: 'bg-jade-500/15 text-jade-400 border-jade-500/30',    dot: 'bg-jade-400',   pulse: false },
  'At Risk':     { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', dot: 'bg-amber-400',  pulse: true  },
  'Missing':     { cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30',    dot: 'bg-rose-500',   pulse: true  },
  'critical':    { cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30',    dot: 'bg-rose-500',   pulse: true  },
  'high':        { cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30', dot: 'bg-orange-500', pulse: false },
  'medium':      { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', dot: 'bg-amber-400',  pulse: false },
  'low':         { cls: 'bg-brand-500/15 text-brand-300 border-brand-500/20', dot: 'bg-brand-400',  pulse: false },
  'Active-user': { cls: 'bg-jade-500/15 text-jade-400 border-jade-500/30',    dot: 'bg-jade-400',   pulse: false },
  'Inactive':    { cls: 'bg-ink-600/60 text-slate-500 border-ink-500/30',     dot: 'bg-slate-600',  pulse: false },
  'Suspended':   { cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30',    dot: 'bg-rose-500',   pulse: false },
}
const fallback = { cls: 'bg-ink-700 text-slate-400 border-ink-600', dot: 'bg-slate-500', pulse: false }

export default function Badge({ status, size = 'sm' }) {
  const c = cfg[status] || fallback
  const pad = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${c.cls} ${pad}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot} ${c.pulse ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}
