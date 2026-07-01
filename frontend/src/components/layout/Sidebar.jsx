import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../../App.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'
import {
  LayoutDashboard, Map,
  FileText, Layers,
  LogOut, PlayCircle, Shield, UserCog,
} from 'lucide-react'
import tplLogo from '../../assets/tpl.png'
import ModalPortal from '../common/ModalPortal.jsx'

function getNav(isAdmin) {
  return [
    {
      section: 'OVERVIEW', links: [
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      ]
    },
    {
      section: 'DEVICES', links: [
        { to: '/devices', icon: Layers, label: 'Devices' },
      ]
    },
    {
      section: 'INTELLIGENCE', links: [
        { to: '/map', icon: Map, label: 'Map View' },
        { to: '/playback', icon: PlayCircle, label: 'Playback' },
        { to: '/fence', icon: Shield, label: 'Fence' },
      ]
    },
    {
      section: 'REPORTS & ADMIN', links: [
        ...(isAdmin ? [{ to: '/users', icon: UserCog, label: 'Users' }] : []),
        { to: '/reports', icon: FileText, label: 'Reports' },
      ]
    },
  ]
}

export default function Sidebar() {
  const { user, setUser, isAdmin, sidebarOpen, setSidebarOpen, unreadAlerts } = useApp()
  const { alerts } = useAlerts()
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const nav = getNav(isAdmin)

  const confirmLogout = () => {
    setShowLogoutConfirm(false)
    setUser(null)
    navigate('/')
  }

  const missingCount = alerts.filter(a => a.type === 'DEVICE_OFFLINE').length
  const initials = (user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <aside
        onMouseEnter={() => { if (!sidebarOpen) setSidebarOpen(true) }}
        onMouseLeave={() => { if (sidebarOpen) setSidebarOpen(false) }}
        className={`flex flex-col flex-shrink-0 h-screen bg-black transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-14'}`}>

        {/* Brand */}
        <div className="flex items-center gap-3 px-3 h-[60px] overflow-hidden">
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-lg">
            <img src={tplLogo} alt="TPL" className="w-6 h-6 object-contain" />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden" style={{
            opacity: sidebarOpen ? 1 : 0,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-6px)',
            transition: sidebarOpen
              ? 'opacity 220ms ease 120ms, transform 220ms ease 120ms'
              : 'opacity 120ms ease, transform 120ms ease',
            pointerEvents: sidebarOpen ? 'auto' : 'none',
          }}>
            <div className="text-white font-bold text-sm leading-tight tracking-wide whitespace-nowrap">TPL LOCATOR</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {nav.map(({ section, links }) => (
            <div key={section} className="mb-3">
              <div className="px-2 py-1.5 text-[11px] font-bold text-gray-600 tracking-widest uppercase overflow-hidden" style={{
                maxHeight: sidebarOpen ? 32 : 0,
                opacity: sidebarOpen ? 1 : 0,
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-6px)',
                transition: sidebarOpen
                  ? 'max-height 200ms ease 80ms, opacity 200ms ease 130ms, transform 200ms ease 130ms'
                  : 'max-height 150ms ease, opacity 100ms ease, transform 100ms ease',
              }}>
                {section}
              </div>
              {links.map(({ to, icon: Icon, label, badge }) => {
                const count = badge === 'alerts' ? unreadAlerts : badge === 'missing' ? missingCount : 0
                return (
                  <NavLink key={to} to={to} title={!sidebarOpen ? label : undefined}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `relative w-full mb-1 block ${isActive ? 'text-[#C44E54]' : 'text-white'}`}
                    style={{ height: 46 }}
                  >
                    {({ isActive }) => (
                      <>
                        {/* Collapsed icon pill — fades out when sidebar opens */}
                        <div style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', justifyContent: 'center', alignItems: 'center',
                          opacity: sidebarOpen ? 0 : 1,
                          transition: sidebarOpen
                            ? 'opacity 100ms ease 0ms'
                            : 'opacity 200ms ease 150ms',
                          pointerEvents: sidebarOpen ? 'none' : 'auto',
                        }}>
                          <div className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center ${isActive ? 'bg-[#A72C32]/20' : 'hover:bg-[#1a1a1a]'}`}>
                            <Icon className="w-5 h-5 flex-shrink-0" />
                          </div>
                          {count > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-[#A72C32] rounded-full" />
                          )}
                        </div>

                        {/* Expanded row — fades in after icon fades out */}
                        <div style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px',
                          overflow: 'hidden',
                          opacity: sidebarOpen ? 1 : 0,
                          transition: sidebarOpen
                            ? 'opacity 220ms ease 150ms'
                            : 'opacity 100ms ease 0ms',
                          pointerEvents: sidebarOpen ? 'auto' : 'none',
                        }}>
                          <div className={`absolute inset-0 rounded-xl ${isActive ? 'bg-[#A72C32]/20' : 'hover:bg-[#1a1a1a]'}`}
                            style={{ transition: 'background 0.15s' }} />
                          <Icon className="w-[18px] h-[18px] flex-shrink-0 relative z-10" />
                          <span style={{
                            flex: '1 1 0%', overflow: 'hidden', whiteSpace: 'nowrap',
                            fontSize: 13, fontWeight: 500,
                            position: 'relative', zIndex: 10,
                          }}>{label}</span>
                          <span style={{
                            flexShrink: 0,
                            opacity: count > 0 ? 1 : 0,
                            transform: count > 0 ? 'scale(1)' : 'scale(0.6)',
                            transition: 'opacity 200ms ease, transform 200ms ease',
                            pointerEvents: 'none', position: 'relative', zIndex: 10,
                          }} className="text-[10px] bg-[#A72C32] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
                            {count > 0 ? count : ''}
                          </span>
                        </div>
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="p-2 overflow-hidden">
          <div className="flex items-center gap-2 px-1">
            <div className="w-7 h-7 rounded-full bg-[#A72C32] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">{initials}</div>
            <div className="flex-1 min-w-0 overflow-hidden" style={{
              opacity: sidebarOpen ? 1 : 0,
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-6px)',
              transition: sidebarOpen
                ? 'opacity 220ms ease 150ms, transform 220ms ease 150ms'
                : 'opacity 100ms ease, transform 100ms ease',
              pointerEvents: sidebarOpen ? 'auto' : 'none',
            }}>
              <div className="text-gray-200 text-xs font-semibold truncate">{user?.name}</div>
              <div className="text-gray-500 text-[10px] capitalize">{user?.role}</div>
            </div>
            <button onClick={() => setShowLogoutConfirm(true)} title="Log out"
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <ModalPortal>
          <div onClick={() => setShowLogoutConfirm(false)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
            }}>
            <div onClick={e => e.stopPropagation()}
              style={{
                background: '#000000', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
                boxShadow: '0 24px 64px rgba(0,0,0,0.72)', width: '100%', maxWidth: 380, padding: 22
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <LogOut style={{ width: 16, height: 16, color: '#C86068' }} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Log out?</div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.52)', marginBottom: 20 }}>
                You'll be signed out of your account and returned to the login screen.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowLogoutConfirm(false)}
                  style={{
                    padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)'
                  }}>
                  Cancel
                </button>
                <button onClick={confirmLogout}
                  style={{
                    padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                    border: '1px solid rgba(167,44,50,0.40)', color: '#fff'
                  }}>
                  Log out
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}