import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

const DEFAULT = {
  gradient: 'linear-gradient(145deg, #320608 0%, #4a0b10 35%, #380809 65%, #240405 100%)',
  border: 'rgba(167,44,50,0.26)',
  borderRadius: 16,
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
        padding: 'clamp(0.625em, 1.2vw, 1em) clamp(0.75em, 1.5vw, 1.25em)',
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.22s ease',
        boxShadow: 'none',
        height: '100%',
        minHeight: '3.875em',
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

      {/* One horizontal row: [icon] title ······ count.
          Sizes are clamped em rather than fixed px — the dashboard grid scales
          its own font-size to the viewport, so a hard px would break the
          fit-to-screen layout on short windows. The bounds land the title at
          15–16px and the count at 36–40px on a normal desktop. */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'clamp(10px, 0.75em, 16px)', minWidth: 0,
      }}>
        {/* Left group: icon + title (+ optional subtitle) */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 'clamp(12px, 1.1em, 20px)',
          minWidth: 0, flex: '1 1 auto',
        }}>
          <div style={{
            padding: '0.625em',
            background: c.iconBg,
            borderRadius: 0,
            border: `1px solid ${c.iconBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon style={{ width: '1.375em', height: '1.375em', color: c.iconColor }} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 'clamp(13px, 1.05em, 18px)', fontWeight: 600, color: c.titleColor,
              letterSpacing: '0.01em', lineHeight: 1.25,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {title}
            </div>
            {sub && (
              <div style={{
                marginTop: '0.25em', fontSize: '0.75em', color: c.subColor,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {sub}
              </div>
            )}
          </div>
        </div>

        {/* Right group: trend badge (when given) + the count, pinned to the edge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexShrink: 0 }}>
          {trend && (
            <div style={{
              fontSize: '0.625em', fontWeight: 700, padding: '0.1875em 0.5625em', borderRadius: 0,
              background: 'rgba(0,0,0,0.38)', border: '1px solid rgba(255,255,255,0.07)',
              color: trend === 'up' ? '#6ee7b7' : '#fca5a5',
              display: 'flex', alignItems: 'center', gap: '0.1875em', whiteSpace: 'nowrap',
            }}>
              {trend === 'up' ? <TrendingUp style={{ width: '0.625em', height: '0.625em' }} /> : <TrendingDown style={{ width: '0.625em', height: '0.625em' }} />}
              {trendVal}
            </div>
          )}
          <div style={{
            fontSize: 'clamp(22px, 2.4em, 40px)', fontWeight: 800, color: c.valueColor,
            letterSpacing: '-0.03em', lineHeight: 1, whiteSpace: 'nowrap',
          }}>
            {value}
          </div>
        </div>
      </div>
    </div>
  )
}
