import React from 'react'
import { Users, ArrowRight, ArrowLeft } from 'lucide-react'

const AUBURN = 'rgba(167,44,50,1)'

export default function FieldStaffPill({ onClick, children = 'Field Staff', arrowDirection = 'right' }) {
  const isBack = arrowDirection === 'left'
  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
      className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold text-xs focus:outline-none transform transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md"
      style={{
        background: 'linear-gradient(180deg, rgba(167,44,50,0.18) 0%, rgba(167,44,50,0.12) 100%)',
        border: '1px solid rgba(167,44,50,0.32)',
        color: '#fff',
      }}
      aria-label={isBack ? 'Back' : 'Open Field Staff Dashboard'}
    >
      {isBack ? (
        // Back button: arrow on the left, no team icon
        <>
          <span className="inline-flex items-center justify-center transform transition-transform duration-150 group-hover:-translate-x-2" style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginRight: 6 }}>
            <ArrowLeft size={12} />
          </span>
          <span style={{ fontSize: 12, lineHeight: '14px', whiteSpace: 'nowrap' }}>{children}</span>
        </>
      ) : (
        // Default: team icon left, text, arrow right
        <>
          <span className="inline-flex items-center justify-center" style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }}>
            <Users size={14} />
          </span>
          <span style={{ fontSize: 12, lineHeight: '14px', whiteSpace: 'nowrap' }}>{children}</span>
          <span className="inline-flex items-center justify-center transform transition-transform duration-150 group-hover:translate-x-2" style={{ width: 22, height: 22, borderRadius: 999, background: 'rgba(255,255,255,0.06)', marginLeft: 6 }}>
            <ArrowRight size={12} />
          </span>
        </>
      )}
    </button>
  )
}
