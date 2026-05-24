import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

const DEFAULT = {
  gradient:    'linear-gradient(145deg, #320608 0%, #4a0b10 35%, #380809 65%, #240405 100%)',
  border:      'rgba(167,44,50,0.26)',
  shadow:      '0 0 24px rgba(167,44,50,0.12), 0 12px 38px rgba(0,0,0,0.52), inset 0 0 60px rgba(0,0,0,0.20)',
  shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60), inset 0 0 60px rgba(0,0,0,0.15)',
  shimmer:     'rgba(196,78,84,0.36)',
  radialTL:    'rgba(167,44,50,0.14)',
  iconBg:      'rgba(167,44,50,0.16)',
  iconBorder:  'rgba(167,44,50,0.26)',
  iconColor:   '#C86068',
}

export default function KPICard({ title, value, sub, icon: Icon, trend, trendVal, onClick, colors = {} }) {
  const c = { ...DEFAULT, ...colors }

  return (
    <div
      onClick={onClick}
      style={{
        background: c.gradient,
        border: `1px solid ${c.border}`,
        borderRadius: '18px',
        padding: '22px',
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease',
        boxShadow: c.shadow,
        minHeight: '130px',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = c.shadowHover
        if (onClick) e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = c.shadow
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* ── Unified lighting layer 1: top shimmer line ── */}
      <div style={{
        position: 'absolute', top: 0, left: '6%', right: '6%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${c.shimmer}, transparent)`,
        pointerEvents: 'none',
      }} />

      {/* ── Unified lighting layer 2: top-left radial warmth ── */}
      <div style={{
        position: 'absolute', top: '-40px', left: '-30px',
        width: '160px', height: '160px',
        background: `radial-gradient(circle, ${c.radialTL} 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      {/* ── Unified lighting layer 3: center gloss sweep ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(160deg, rgba(255,255,255,${c.gloss ?? 0.032}) 0%, transparent 48%)`,
        pointerEvents: 'none', borderRadius: '18px',
      }} />

      {/* ── Unified lighting layer 4: dark edge vignette ── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.10) 100%)',
        pointerEvents: 'none', borderRadius: '18px',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Header: icon + trend pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div style={{
            padding: '8px',
            background: c.iconBg,
            borderRadius: '10px',
            border: `1px solid ${c.iconBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon style={{ width: '18px', height: '18px', color: c.iconColor }} />
          </div>
          {trend && (
            <div style={{
              fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '999px',
              background: 'rgba(0,0,0,0.38)', border: '1px solid rgba(255,255,255,0.07)',
              color: trend === 'up' ? '#6ee7b7' : '#fca5a5',
              display: 'flex', alignItems: 'center', gap: '3px',
            }}>
              {trend === 'up' ? <TrendingUp style={{ width: '10px', height: '10px' }} /> : <TrendingDown style={{ width: '10px', height: '10px' }} />}
              {trendVal}
            </div>
          )}
        </div>

        <div style={{ fontSize: '36px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.72)', marginTop: '6px', letterSpacing: '0.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.34)', marginTop: '5px' }}>{sub}</div>}
      </div>
    </div>
  )
}
