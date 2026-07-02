import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

const DEFAULT = {
  gradient: 'linear-gradient(145deg, #320608 0%, #4a0b10 35%, #380809 65%, #240405 100%)',
  border: 'rgba(167,44,50,0.26)',
  shadow: 'none',
  shadowHover: 'none',
  shimmer: 'rgba(196,78,84,0.36)',
  radialTL: 'rgba(167,44,50,0.14)',
  iconBg: 'rgba(167,44,50,0.16)',
  iconBorder: 'rgba(167,44,50,0.26)',
  iconColor: '#C86068',
  valueColor: '#FFFFFF',
  titleColor: 'rgba(255,255,255,0.72)',
  subColor: 'rgba(255,255,255,0.34)',
}

export default function KPICard({ title, value, sub, icon: Icon, trend, trendVal, onClick, colors = {} }) {
  const c = { ...DEFAULT, ...colors }

  return (
    <div
      onClick={onClick}
      style={{
        background: c.gradient,
        border: `1px solid ${c.border}`,
        borderRadius: 0,
        padding: 'clamp(10px, 1.2vw, 16px) clamp(12px, 1.5vw, 20px)',
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.22s ease',
        boxShadow: 'none',
        height: '100%',
        minHeight: 72,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = c.iconColor
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = c.border
      }}
    >
      {/* ── Top shimmer line for gloss ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: `linear-gradient(90deg, transparent, ${c.shimmer}, transparent)`,
        pointerEvents: 'none',
      }} />

      {/* Glossy reflective sheen across the top — flat, no depth */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 20%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
        {/* Header row: icon (left) · title stacked above value (right of icon) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1vw, 12px)' }}>
          <div style={{
            padding: '8px',
            background: c.iconBg,
            borderRadius: 0,
            border: `1px solid ${c.iconBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon style={{ width: '18px', height: '18px', color: c.iconColor }} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: c.titleColor, letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
            <div style={{ fontSize: 'clamp(20px, 2.5vw, 30px)', fontWeight: 800, color: c.valueColor, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
          </div>
        </div>

        {/* Footer: subtitle (left) · trend (right) */}
        {(sub || trend) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ minWidth: 0, fontSize: '11px', color: c.subColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
            {trend && (
              <div style={{
                flexShrink: 0,
                fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: 0,
                background: 'rgba(0,0,0,0.38)', border: '1px solid rgba(255,255,255,0.07)',
                color: trend === 'up' ? '#6ee7b7' : '#fca5a5',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}>
                {trend === 'up' ? <TrendingUp style={{ width: '10px', height: '10px' }} /> : <TrendingDown style={{ width: '10px', height: '10px' }} />}
                {trendVal}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
