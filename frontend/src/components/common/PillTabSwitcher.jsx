import React, { useState, useEffect, useRef } from 'react'

/**
 * Generic sliding-pill tab switcher used in the topbar (Header).
 *
 * Props:
 *   tabs      — [{ key, label, icon: Component }]
 *   activeKey — the key of the currently active tab
 *   onSelect  — (key) => void
 */
export default function PillTabSwitcher({ tabs, activeKey, onSelect }) {
  const activeIdx = tabs.findIndex(t => t.key === activeKey)
  const idx       = activeIdx === -1 ? 0 : activeIdx

  const tabRefs           = useRef([])
  const [pill, setPill]   = useState({ left: 0, width: 0 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const tab = tabRefs.current[idx]
    if (!tab) return
    setPill({ left: tab.offsetLeft, width: tab.offsetWidth })
    // Defer enabling transition so first paint has no sliding animation
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [idx, tabs.length])

  if (tabs.length === 0) return null

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        height: 36,
        padding: '3px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid #2a2a2a',
        flexShrink: 0,
      }}
    >
      {/* Sliding active pill */}
      {pill.width > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: pill.left,
            width: pill.width,
            height: 'calc(100% - 6px)',
            borderRadius: 6,
            background: '#A72C32',
            border: '1px solid rgba(255,255,255,0.10)',
            transition: ready
              ? 'left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1)'
              : 'none',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tab buttons */}
      {tabs.map((tab, i) => {
        const isActive = i === idx
        const Icon = tab.icon
        return (
          <button
            key={tab.key}
            ref={el => { tabRefs.current[i] = el }}
            onClick={() => onSelect(tab.key)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '0 13px',
              height: '100%',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isActive ? '#FFFFFF' : '#94a3b8',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#FFFFFF' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#94a3b8' }}
          >
            {Icon && <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
