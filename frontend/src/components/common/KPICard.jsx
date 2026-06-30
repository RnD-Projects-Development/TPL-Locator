import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

const DEFAULT = {
  gradient: 'linear-gradient(145deg, #320608 0%, #4a0b10 35%, #380809 65%, #240405 100%)',
  border: 'rgba(167,44,50,0.26)',
  shadow: '0 0 24px rgba(167,44,50,0.12), 0 12px 38px rgba(0,0,0,0.52), inset 0 0 60px rgba(0,0,0,0.20)',
  shadowHover: '0 0 44px rgba(167,44,50,0.52), 0 16px 46px rgba(0,0,0,0.60), inset 0 0 60px rgba(0,0,0,0.15)',
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
        border: 'none',
        borderRadius: '18px',
        padding: '16px 20px',
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease',
        boxShadow: '0 2px 12px rgba(0,0,0,0.40)',
        height: '100%',
        minHeight: 84,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = c.shadowHover
        if (onClick) e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.40)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* ── Unified lighting layer 1: top shimmer line ── */}
      <div style={{
        position: 'absolute', top: 0, left: '6%', right: '6%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${c.shimmer}, transparent)`,
        pointerEvents: 'none',
      }} />

      {/* Flat dark tint — darkens the surface and removes the domed 3D depth */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.22)',
        pointerEvents: 'none', borderRadius: '18px',
      }} />

      {/* Glossy reflective sheen across the top */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(125deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 15%, transparent 40%)',
        pointerEvents: 'none', borderRadius: '18px',
      }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
        {/* Header row: icon (left) · title stacked above value (right of icon) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            padding: '8px',
            background: c.iconBg,
            borderRadius: '10px',
            border: `1px solid ${c.iconBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon style={{ width: '18px', height: '18px', color: c.iconColor }} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: c.titleColor, letterSpacing: '0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </div>
            <div style={{ fontSize: '30px', fontWeight: 800, color: c.valueColor, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
          </div>
        </div>

        {/* Footer: subtitle (left) · trend (right) */}
        {(sub || trend) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ minWidth: 0, fontSize: '11px', color: c.subColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
            {trend && (
              <div style={{
                flexShrink: 0,
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
        )}
      </div>
    </div>
  )
}
