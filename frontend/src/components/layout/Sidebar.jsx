import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../../App.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'
import {
  LayoutDashboard, Radio, Tag, Map, AlertOctagon,
  FileText,
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
      <aside
        onMouseEnter={() => { if (!sidebarOpen) setSidebarOpen(true) }}
        onMouseLeave={() => { if (sidebarOpen) setSidebarOpen(false) }}
        className={`flex flex-col flex-shrink-0 h-screen bg-black border-r border-gray-800 transition-all duration-300 ${sidebarOpen ? 'w-56' : 'w-14'}`}>
        {/* Brand */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-800 min-h-[60px] overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-lg">
            <img src={tplLogo} alt="TPL" className="w-6 h-6 object-contain" />
          </div>
          <div
            className="flex-1 min-w-0 overflow-hidden"
            style={{
              opacity: sidebarOpen ? 1 : 0,
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-6px)',
              transition: sidebarOpen
                ? 'opacity 220ms ease 120ms, transform 220ms ease 120ms'
                : 'opacity 120ms ease, transform 120ms ease',
              pointerEvents: sidebarOpen ? 'auto' : 'none',
            }}
          >
            <div className="text-white font-bold text-sm leading-tight tracking-wide whitespace-nowrap">TPL TRAKKER</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {nav.map(({ section, links }) => (
            <div key={section} className="mb-1">
              {/* Section header — fades in after sidebar expands */}
              <div
                className="px-2 py-1.5 text-[9px] font-bold text-gray-600 tracking-widest uppercase overflow-hidden"
                style={{
                  maxHeight: sidebarOpen ? 28 : 0,
                  opacity: sidebarOpen ? 1 : 0,
                  transform: sidebarOpen ? 'translateX(0)' : 'translateX(-6px)',
                  transition: sidebarOpen
                    ? 'max-height 200ms ease 80ms, opacity 200ms ease 130ms, transform 200ms ease 130ms'
                    : 'max-height 150ms ease, opacity 100ms ease, transform 100ms ease',
                }}
              >
                {section}
              </div>
              {links.map(({ to, icon: Icon, label, badge }) => {
                const count = badge === 'alerts' ? unreadAlerts : badge === 'missing' ? missingCount : 0
                return (
                  <NavLink key={to} to={to} title={!sidebarOpen ? label : undefined}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2 py-2 rounded-xl text-xs font-medium transition-all duration-150 mb-0.5 relative overflow-hidden
                       ${isActive
                         ? 'bg-[#A72C32]/20 text-[#C44E54]'
                         : 'text-white hover:text-white hover:bg-[#1a1a1a]'}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {/* Label — slides + fades in */}
                    <span
                      className="flex-1 truncate"
                      style={{
                        opacity: sidebarOpen ? 1 : 0,
                        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-8px)',
                        transition: sidebarOpen
                          ? 'opacity 220ms ease 140ms, transform 220ms ease 140ms'
                          : 'opacity 100ms ease, transform 100ms ease',
                        pointerEvents: 'none',
                      }}
                    >
                      {label}
                    </span>
                    {/* Badge (expanded) */}
                    <span
                      style={{
                        opacity: sidebarOpen && count > 0 ? 1 : 0,
                        transform: sidebarOpen && count > 0 ? 'scale(1)' : 'scale(0.6)',
                        transition: sidebarOpen
                          ? 'opacity 200ms ease 180ms, transform 200ms ease 180ms'
                          : 'opacity 80ms ease, transform 80ms ease',
                        pointerEvents: 'none',
                      }}
                      className="text-[10px] bg-[#A72C32] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold flex-shrink-0"
                    >
                      {count > 0 ? count : ''}
                    </span>
                    {/* Dot badge (collapsed) */}
                    {!sidebarOpen && count > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-[#A72C32] rounded-full" />
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-gray-800 p-2 overflow-hidden">
          <div className="flex items-center gap-2 px-1">
            <div className="w-7 h-7 rounded-full bg-[#A72C32] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">{initials}</div>
            {/* Name + role — fade/slide in */}
            <div
              className="flex-1 min-w-0 overflow-hidden"
              style={{
                opacity: sidebarOpen ? 1 : 0,
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-6px)',
                transition: sidebarOpen
                  ? 'opacity 220ms ease 150ms, transform 220ms ease 150ms'
                  : 'opacity 100ms ease, transform 100ms ease',
                pointerEvents: sidebarOpen ? 'auto' : 'none',
              }}
            >
              <div className="text-gray-200 text-xs font-semibold truncate">{user.name}</div>
              <div className="text-gray-500 text-[10px] capitalize">{user.role}</div>
            </div>
            {/* Logout button — always visible but shifts with sidebar */}
            <button
              onClick={() => { setUser(null); navigate('/') }}
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
