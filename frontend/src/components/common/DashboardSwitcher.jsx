import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { LayoutGrid, Users } from 'lucide-react'

const TABS = [
  { label: 'Dashboard',             Icon: LayoutGrid, path: '/dashboard'   },
  { label: 'Field Staff Dashboard', Icon: Users,       path: '/field-staff' },
]

export default function DashboardSwitcher() {
  const { pathname } = useLocation()
  const navigate     = useNavigate()

  const activeIdx = TABS.findIndex(t => t.path === pathname)
  const idx       = activeIdx === -1 ? 0 : activeIdx

  const tabRefs          = useRef([])
  const [pill, setPill]  = useState({ left: 0, width: 0 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const tab = tabRefs.current[idx]
    if (!tab) return
    setPill({ left: tab.offsetLeft, width: tab.offsetWidth })
    // Defer enabling transition so first paint has no sliding animation
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [idx])

  if (activeIdx === -1) return null

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        height: 36,
        padding: '3px',
        borderRadius: 999,
        background: 'rgba(127,29,29,0.15)',
        border: '1px solid rgba(127,29,29,0.35)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
            borderRadius: 999,
            background: 'linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 4px 18px rgba(127,29,29,0.45)',
            transition: ready
              ? 'left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1)'
              : 'none',
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tab buttons */}
      {TABS.map((tab, i) => {
        const isActive = i === idx
        return (
          <button
            key={tab.path}
            ref={el => { tabRefs.current[i] = el }}
            onClick={() => navigate(tab.path)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '0 13px',
              height: '100%',
              borderRadius: 999,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isActive ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              whiteSpace: 'nowrap',
              letterSpacing: '0.01em',
              transition: 'color 0.25s ease',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#FFFFFF' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#9CA3AF' }}
          >
            <tab.Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
