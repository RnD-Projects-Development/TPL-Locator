import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../../App.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'
import {
  LayoutDashboard, Radio, Tag, Map, AlertOctagon,
  FileText, ChevronRight,
  LogOut, Search, Navigation, PlayCircle, Shield, UserCog
} from 'lucide-react'
import tplLogo from '../../assets/tpl.png'

const nav = [
  { section: 'OVERVIEW', links: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/search',    icon: Search,          label: 'Search' },
  ]},
    { section: 'DEVICES', links: [
    { to: '/locators', icon: Radio,        label: 'Locators' },
    { to: '/stickers', icon: Tag,          label: 'Smart Stickers' },
    { to: '/missing',  icon: AlertOctagon, label: 'Offline Devices' },
  ]},
  { section: 'INTELLIGENCE', links: [
    { to: '/map',        icon: Map,        label: 'Map View' },
    { to: '/trajectory', icon: Navigation, label: 'Trajectory' },
    { to: '/playback',   icon: PlayCircle, label: 'Playback' },
    { to: '/fence',      icon: Shield,     label: 'Fence' },
  ]},
  { section: 'REPORTS & ADMIN', links: [
    { to: '/users',       icon: UserCog,  label: 'Users' },
    { to: '/reports',     icon: FileText, label: 'Reports' },
  ]},
]

export default function Sidebar() {
  const { user, setUser, sidebarOpen, setSidebarOpen, unreadAlerts } = useApp()
  const { alerts } = useAlerts()
  const navigate = useNavigate()

  // Count offline device alerts (OFFLINE-* type) as the "missing" badge number.
  // AlertsContext scans the first 200 devices every 5 min — a good proxy for missing count.
  const missingCount = alerts.filter(a => a.type === 'DEVICE_OFFLINE').length

  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()

  return (
    <>
      <aside className={`flex flex-col flex-shrink-0 h-screen bg-black border-r border-gray-800 transition-all duration-300 ${sidebarOpen ? 'w-56' : 'w-14'}`}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-800 min-h-[60px]">
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-lg">
            <img src={tplLogo} alt="TPL" className="w-6 h-6 object-contain" />
          </div>
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-sm leading-tight tracking-wide">TPL TRAKKER</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {nav.map(({ section, links }) => (
            <div key={section} className="mb-1">
              {sidebarOpen && (
                <div className="px-2 py-1.5 text-[9px] font-bold text-gray-600 tracking-widest uppercase">{section}</div>
              )}
              {links.map(({ to, icon: Icon, label, badge }) => {
                const count = badge === 'alerts' ? unreadAlerts : badge === 'missing' ? missingCount : 0
                return (
                  <NavLink key={to} to={to} title={!sidebarOpen ? label : undefined}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2 py-2 rounded-xl text-xs font-medium transition-all duration-150 mb-0.5 relative
                       ${isActive
                         ? 'bg-[#A72C32]/20 text-[#C44E54]'
                         : 'text-white hover:text-white hover:bg-[#1a1a1a]'}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {sidebarOpen && <span className="flex-1 truncate">{label}</span>}
                    {sidebarOpen && count > 0 && (
                      <span className="text-[10px] bg-[#A72C32] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">{count}</span>
                    )}
                    {!sidebarOpen && count > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-[#A72C32] rounded-full" />
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Expand / view sidebar — only when collapsed. The sidebar auto-collapses
            on navigation, so there is no manual "Collapse" button. */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
            className="flex items-center justify-center mx-auto mb-2 mt-1 w-10 h-10 rounded-full
                       bg-[#A72C32] text-white hover:bg-[#8B2328] active:scale-95 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* User */}
        <div className="border-t border-gray-800 p-2">
          {sidebarOpen ? (
            <div className="flex items-center gap-2 px-1">
              <div className="w-7 h-7 rounded-full bg-[#A72C32] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">{initials}</div>
              <div className="flex-1 min-w-0">
                <div className="text-gray-200 text-xs font-semibold truncate">{user.name}</div>
                <div className="text-gray-500 text-[10px] capitalize">{user.role}</div>
              </div>
              <button onClick={() => { setUser(null); navigate('/') }}
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => { setUser(null); navigate('/') }}
              className="w-full flex items-center justify-center p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
