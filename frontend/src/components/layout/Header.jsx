import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, ChevronRight, RefreshCw, Bell } from 'lucide-react'
import FieldStaffPill from '../FieldStaffPill.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'


const crumbs = {
  '/dashboard':   ['Dashboard'],
  '/search':      ['Search'],
  '/locators':    ['Devices', 'Locators'],
  '/stickers':    ['Devices', 'Smart Stickers'],
  '/missing':     ['Devices', 'Offline Devices'],
  '/map':         ['Intelligence', 'Map View'],
  '/trajectory':  ['Intelligence', 'Trajectory'],
  '/playback':    ['Intelligence', 'Playback'],
  '/fence':       ['Intelligence', 'Fence'],
  '/alerts':      ['Alerts'],
  '/reports':     ['Reports & Admin', 'Reports'],
  '/field-staff': ['Dashboard', 'Field Staff'],
  '/users':       ['Reports & Admin', 'Users'],
}
const getCrumbs = path => {
  if (crumbs[path]) return crumbs[path]
  if (path.startsWith('/locators/')) return ['Devices', 'Locators', path.split('/')[2]]
  if (path.startsWith('/stickers/')) return ['Devices', 'Smart Stickers', path.split('/')[2]]
  return ['Page']
}

// Route each crumb label resolves to when clicked (intermediate crumbs only)
const crumbRouteMap = {
  'Dashboard':       '/dashboard',
  'Devices':         '/locators',
  'Locators':        '/locators',
  'Smart Stickers':  '/stickers',
  'Offline Devices': '/missing',
  'Map View':        '/map',
  'Trajectory':      '/trajectory',
  'Playback':        '/playback',
  'Fence':           '/fence',
  'Alerts':          '/alerts',
  'Reports':         '/reports',
  'Field Staff':     '/field-staff',
  'Users':           '/users',
  'Search':          '/search',
}

export default function Header({ pageTheme, setPageTheme }) {
  const { pathname } = useLocation()
  const navigate     = useNavigate()
  const [now, setNow] = useState(new Date())

  // Safely read AlertsContext — returns null if not yet mounted
  let alertsCtx = null
  try { alertsCtx = useAlerts() } catch {}
  const unreadCount = alertsCtx?.unreadCount ?? 0
  const loading     = alertsCtx?.loading     ?? false
  const refresh     = alertsCtx?.refresh     ?? null

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const parts = getCrumbs(pathname)
  const time  = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const date  = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <header className="h-[60px] flex items-center px-5 gap-4 bg-black border-b border-gray-800 flex-shrink-0">
      {/* Breadcrumb / Dashboard hint */}
      {pathname === '/dashboard' ? (
        <div className="flex items-center gap-1.5 text-xs flex-1">
          <span className="text-gray-500 font-medium cursor-pointer hover:text-gray-300 transition-colors"
            onClick={() => navigate('/dashboard')}>TPL LOCATOR</span>
          <ChevronRight className="w-3 h-3 text-gray-700" />
          <span className="text-white font-semibold">Dashboard</span>
          <div style={{ marginLeft: 8 }}>
            <FieldStaffPill onClick={() => navigate('/field-staff')} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs flex-1">
          <span className="text-gray-500 font-medium cursor-pointer hover:text-gray-300 transition-colors"
            onClick={() => navigate('/dashboard')}>TPL LOCATOR</span>
          {parts.map((p, i) => {
            const isLast  = i === parts.length - 1
            const route   = !isLast ? crumbRouteMap[p] : null
            return (
              <React.Fragment key={i}>
                <ChevronRight className="w-3 h-3 text-gray-700" />
                {isLast ? (
                  <span className="text-white font-semibold">{p}</span>
                ) : route ? (
                  <span className="text-gray-400 cursor-pointer hover:text-gray-200 transition-colors"
                    onClick={() => navigate(route)}>{p}</span>
                ) : (
                  <span className="text-gray-400">{p}</span>
                )}
              </React.Fragment>
            )
          })}
        </div>
      )}

      {/* Search removed per user request */}

      {/* Clock */}
      <div className="hidden lg:flex flex-col items-end">
        <div className="text-white text-xs font-mono font-semibold">{time}</div>
        <div className="text-gray-500 text-[10px]">{date}</div>
      </div>

      {/* Alerts bell */}
      <button
        onClick={() => navigate('/alerts')}
        style={{ position: 'relative', padding: 8, borderRadius: 12,
          background: unreadCount > 0 ? 'rgba(167,44,50,0.16)' : 'transparent',
          border: `1px solid ${unreadCount > 0 ? 'rgba(167,44,50,0.45)' : 'transparent'}`, cursor: 'pointer',
          color: unreadCount > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.2s, background 0.2s, border-color 0.2s' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1a1a1a'; e.currentTarget.style.color = '#FFFFFF' }}
        onMouseLeave={e => { e.currentTarget.style.background = unreadCount > 0 ? 'rgba(167,44,50,0.16)' : 'transparent'; e.currentTarget.style.color = unreadCount > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.65)' }}
        title={unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'Alerts'}>
        <Bell style={{ width: 18, height: 18, strokeWidth: 2.4, fill: unreadCount > 0 ? 'rgba(255,255,255,0.16)' : 'none' }} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#A72C32',
            color: '#FFFFFF', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
            boxShadow: '0 0 0 2px #000000',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Refresh */}
      <button
        onClick={() => refresh?.()}
        disabled={loading}
        className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-[#1a1a1a] transition-colors"
        title="Refresh alerts"
        style={{ opacity: loading ? 0.5 : 1 }}>
        <RefreshCw className="w-3.5 h-3.5" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </header>
  )
}
