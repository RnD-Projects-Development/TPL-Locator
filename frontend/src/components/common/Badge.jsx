// Badge component for displaying status indicators
// Props:
// - status: string representing the status (e.g., 'Active', 'Idle', 'Delivered')
// - size: unused, kept for compatibility, handled by scalable-container automatically

import React from 'react'

const cfg = {
  'Active':      { cls: 'badge-teal-500',   pulse: true  },
  'In Transit':  { cls: 'badge-primary',    pulse: true  },
  'Idle':        { cls: 'badge-secondary',  pulse: false },
  'Delivered':   { cls: 'badge-teal-500',   pulse: false },
  'At Risk':     { cls: 'badge-yellow-500', pulse: true  },
  'Missing':     { cls: 'badge-red-500',    pulse: true  },
  'critical':    { cls: 'badge-red-500',    pulse: true  },
  'high':        { cls: 'badge-yellow-500', pulse: false },
  'medium':      { cls: 'badge-surface-4',  pulse: false },
  'low':         { cls: 'badge-secondary',  pulse: false },
  'Active-user': { cls: 'badge-teal-500',   pulse: false },
  'Inactive':    { cls: 'badge-secondary',  pulse: false },
  'Suspended':   { cls: 'badge-red-500',    pulse: false },
}
const fallback = { cls: 'badge-plain', pulse: false }

export default function Badge({ status, size = 'sm' }) {
  const c = cfg[status] || fallback
  return (
    <span className={`badge ${c.cls}`}>
      <span className={`badge-dot bg-current ${c.pulse ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  )
}
