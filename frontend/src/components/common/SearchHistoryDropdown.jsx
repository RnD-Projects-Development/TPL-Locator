import React from 'react'
import { Clock, X } from 'lucide-react'

// Recent-search dropdown that renders below a search input. Presentational only:
// the page owns the open/close state, the input value, and the history store
// (useSearchHistory). Mirrors the recent-searches styling used elsewhere in the
// app (Clock rows, per-item remove, "Clear all"). Returns null when there is
// nothing to show so the caller can render it unconditionally.
const ACCENT = '#A72C32'

// Bold the portion of `term` matching the typed query.
function highlight(term, q, accent) {
  if (!q) return term
  const i = term.toLowerCase().indexOf(q)
  if (i < 0) return term
  return (
    <>
      {term.slice(0, i)}
      <span style={{ color: accent, fontWeight: 700 }}>{term.slice(i, i + q.length)}</span>
      {term.slice(i + q.length)}
    </>
  )
}

export default function SearchHistoryDropdown({
  items,
  query = '',
  onPick,
  onRemove,
  onClearAll,
  isLight,
  width = '100%',
  top = 'calc(100% + 6px)',
}) {
  const q = query.trim().toLowerCase()
  // Filter recents by the current query (prefix/substring), like a search engine.
  const shown = q ? (items || []).filter(x => x.toLowerCase().includes(q)) : (items || [])
  if (shown.length === 0) return null

  const bg       = isLight ? '#FFFFFF'            : '#1C1B1B'
  const border   = isLight ? 'rgba(0,0,0,0.12)'   : 'rgba(255,255,255,0.10)'
  const shadow   = isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 12px 32px rgba(0,0,0,0.55)'
  const txt1     = isLight ? 'rgba(0,0,0,0.82)'   : 'rgba(255,255,255,0.82)'
  const txt3     = isLight ? 'rgba(0,0,0,0.40)'   : 'rgba(255,255,255,0.38)'
  const rowHover = isLight ? 'rgba(0,0,0,0.05)'   : 'rgba(255,255,255,0.06)'
  const divider  = isLight ? 'rgba(0,0,0,0.08)'   : 'rgba(255,255,255,0.07)'

  return (
    <div
      // Keep focus on the input while the panel is clicked so it doesn't blur
      // away mid-interaction; the page closes it on outside-click / Escape / pick.
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'absolute', top, left: 0, width, zIndex: 50,
        background: bg, border: `1px solid ${border}`, borderRadius: 10,
        boxShadow: shadow, padding: 6, maxHeight: 300, overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock style={{ width: 12, height: 12, color: txt3 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: txt3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Recent
          </span>
        </div>
        <button
          onClick={onClearAll}
          style={{ fontSize: 10, color: txt3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = ACCENT }}
          onMouseLeave={e => { e.currentTarget.style.color = txt3 }}
        >
          Clear all
        </button>
      </div>
      <div style={{ height: 1, background: divider, margin: '0 2px 4px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {shown.map(term => (
          <div
            key={term}
            onClick={() => onPick(term)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px',
              borderRadius: 7, cursor: 'pointer', color: txt1, fontSize: 12.5,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = rowHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <Clock style={{ width: 12, height: 12, flexShrink: 0, color: txt3 }} />
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {highlight(term, q, ACCENT)}
            </span>
            <span
              onClick={e => { e.stopPropagation(); onRemove(term) }}
              style={{ padding: '2px 4px', color: txt3, display: 'flex', alignItems: 'center', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = ACCENT }}
              onMouseLeave={e => { e.currentTarget.style.color = txt3 }}
              title="Remove"
            >
              <X style={{ width: 11, height: 11 }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
