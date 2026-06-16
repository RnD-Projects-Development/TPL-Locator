import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../../App.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'
import {
  LayoutDashboard, Map,
  FileText, Layers,
  LogOut, Navigation, PlayCircle, Shield, UserCog,
  Settings, User, Sun, ChevronRight, ChevronLeft, X,
} from 'lucide-react'
import Switch from '../Switch.jsx'
import tplLogo from '../../assets/tpl.png'
import ModalPortal from '../common/ModalPortal.jsx'

const nav = [
  { section: 'OVERVIEW', links: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  ]},
  { section: 'DEVICES', links: [
    { to: '/devices', icon: Layers, label: 'Devices' },
  ]},
  { section: 'INTELLIGENCE', links: [
    { to: '/map',        icon: Map,        label: 'Map View' },
    { to: '/trajectory', icon: Navigation, label: 'Trajectory' },
    { to: '/playback',   icon: PlayCircle, label: 'Playback' },
    { to: '/fence',      icon: Shield,     label: 'Fence' },
  ]},
  { section: 'REPORTS & ADMIN', links: [
    { to: '/users',   icon: UserCog,  label: 'Users' },
    { to: '/reports', icon: FileText, label: 'Reports' },
  ]},
]

const DARK_ONLY = ['/dashboard', '/users', '/map', '/trajectory', '/playback', '/fence', '/field-staff', '/reports']

const panelInput = {
  width: '100%', padding: '9px 11px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8, color: '#f4f4f5', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
}

export default function Sidebar({ pageTheme, setPageTheme }) {
  const { user, setUser, sidebarOpen, setSidebarOpen, unreadAlerts } = useApp()
  const { updateProfile } = useAuth()
  const { alerts } = useAlerts()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // null = closed | 'menu' = settings list | 'profile' | 'theme'
  const [settingsPanel, setSettingsPanel] = useState(null)

  // Profile form state
  const [profileName,      setProfileName]      = useState(user?.name || '')
  const [profileCurrentPw, setProfileCurrentPw] = useState('')
  const [profileNewPw,     setProfileNewPw]      = useState('')
  const [profileConfirmPw, setProfileConfirmPw]  = useState('')
  const [profileErr,       setProfileErr]        = useState('')
  const [profileSuccess,   setProfileSuccess]    = useState(false)
  const [profileLoading,   setProfileLoading]    = useState(false)

  // Reset form each time the profile view is opened
  useEffect(() => {
    if (settingsPanel === 'profile') {
      setProfileName(user?.name || '')
      setProfileCurrentPw('')
      setProfileNewPw('')
      setProfileConfirmPw('')
      setProfileErr('')
      setProfileSuccess(false)
    }
  }, [settingsPanel, user?.name])

  const confirmLogout = () => {
    setShowLogoutConfirm(false)
    setUser(null)
    navigate('/')
  }

  const missingCount = alerts.filter(a => a.type === 'DEVICE_OFFLINE').length
  const initials = (user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const isDarkOnly = DARK_ONLY.some(r => pathname.startsWith(r))
  const panelOpen = settingsPanel !== null

  const handleProfileSave = async () => {
    setProfileErr('')
    setProfileSuccess(false)
    const hasNameChange = profileName.trim() && profileName.trim() !== user?.name
    const hasPwChange   = profileNewPw.trim() !== ''
    if (!hasNameChange && !hasPwChange) { setProfileErr('No changes to save'); return }
    if (hasPwChange) {
      if (!profileCurrentPw)            { setProfileErr('Enter your current password'); return }
      if (profileNewPw.length < 6)      { setProfileErr('New password must be at least 6 characters'); return }
      if (profileNewPw !== profileConfirmPw) { setProfileErr('New passwords do not match'); return }
    }
    setProfileLoading(true)
    try {
      await updateProfile({
        name:            hasNameChange ? profileName.trim() : undefined,
        currentPassword: hasPwChange   ? profileCurrentPw  : undefined,
        newPassword:     hasPwChange   ? profileNewPw      : undefined,
      })
      setProfileSuccess(true)
      setProfileCurrentPw('')
      setProfileNewPw('')
      setProfileConfirmPw('')
    } catch (err) {
      setProfileErr(err.message || 'Update failed')
    } finally {
      setProfileLoading(false)
    }
  }

  return (
    <>
      {/* ── Main sidebar ──────────────────────────────────────────────────── */}
      <aside
        onMouseEnter={() => { if (!sidebarOpen && !panelOpen) setSidebarOpen(true) }}
        onMouseLeave={() => { if (sidebarOpen) setSidebarOpen(false) }}
        style={{ position: 'relative', zIndex: 101 }}
        className={`flex flex-col flex-shrink-0 h-screen bg-black border-r border-gray-800 transition-all duration-300 ${sidebarOpen ? 'w-56' : 'w-14'}`}>

        {/* Brand */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-gray-800 min-h-[60px] overflow-hidden">
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
        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {nav.map(({ section, links }) => (
            <div key={section} className="mb-1">
              <div className="px-2 py-1.5 text-[9px] font-bold text-gray-600 tracking-widest uppercase overflow-hidden" style={{
                maxHeight: sidebarOpen ? 28 : 0,
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
                    onClick={() => { setSidebarOpen(false); setSettingsPanel(null) }}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2 py-2 rounded-xl text-xs font-medium transition-all duration-150 mb-0.5 relative overflow-hidden
                       ${isActive ? 'bg-[#A72C32]/20 text-[#C44E54]' : 'text-white hover:text-white hover:bg-[#1a1a1a]'}`}>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate" style={{
                      opacity: sidebarOpen ? 1 : 0,
                      transform: sidebarOpen ? 'translateX(0)' : 'translateX(-8px)',
                      transition: sidebarOpen
                        ? 'opacity 220ms ease 140ms, transform 220ms ease 140ms'
                        : 'opacity 100ms ease, transform 100ms ease',
                      pointerEvents: 'none',
                    }}>{label}</span>
                    <span style={{
                      opacity: sidebarOpen && count > 0 ? 1 : 0,
                      transform: sidebarOpen && count > 0 ? 'scale(1)' : 'scale(0.6)',
                      transition: sidebarOpen
                        ? 'opacity 200ms ease 180ms, transform 200ms ease 180ms'
                        : 'opacity 80ms ease, transform 80ms ease',
                      pointerEvents: 'none',
                    }} className="text-[10px] bg-[#A72C32] text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold flex-shrink-0">
                      {count > 0 ? count : ''}
                    </span>
                    {!sidebarOpen && count > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-[#A72C32] rounded-full" />}
                  </NavLink>
                )
              })}
            </div>
          ))}

          {/* PREFERENCES section */}
          <div className="mb-1">
            <div className="px-2 py-1.5 text-[9px] font-bold text-gray-600 tracking-widest uppercase overflow-hidden" style={{
              maxHeight: sidebarOpen ? 28 : 0,
              opacity: sidebarOpen ? 1 : 0,
              transform: sidebarOpen ? 'translateX(0)' : 'translateX(-6px)',
              transition: sidebarOpen
                ? 'max-height 200ms ease 80ms, opacity 200ms ease 130ms, transform 200ms ease 130ms'
                : 'max-height 150ms ease, opacity 100ms ease, transform 100ms ease',
            }}>
              PREFERENCES
            </div>
            <button
              onClick={() => setSettingsPanel(panelOpen ? null : 'menu')}
              title={!sidebarOpen ? 'Settings' : undefined}
              className={`flex items-center gap-2.5 px-2 py-2 rounded-xl text-xs font-medium transition-all duration-150 mb-0.5 relative overflow-hidden w-full text-left
                ${panelOpen ? 'bg-[#A72C32]/20 text-[#C44E54]' : 'text-white hover:text-white hover:bg-[#1a1a1a]'}`}>
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate" style={{
                opacity: sidebarOpen ? 1 : 0,
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-8px)',
                transition: sidebarOpen
                  ? 'opacity 220ms ease 140ms, transform 220ms ease 140ms'
                  : 'opacity 100ms ease, transform 100ms ease',
                pointerEvents: 'none',
              }}>Settings</span>
            </button>
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-gray-800 p-2 overflow-hidden">
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

      {/* ── Settings child sidebar ─────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', left: 56, top: 0, height: '100vh', width: 272,
        background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.08)',
        zIndex: 100, display: 'flex', flexDirection: 'column',
        transform: panelOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 270ms cubic-bezier(0.4,0,0.2,1)',
        boxShadow: panelOpen ? '6px 0 28px rgba(0,0,0,0.60)' : 'none',
        pointerEvents: panelOpen ? 'auto' : 'none',
        overflowY: 'auto',
      }}>
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '16px 14px 13px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0, position: 'sticky', top: 0,
          background: '#0a0a0a', zIndex: 1,
        }}>
          {settingsPanel !== 'menu' && (
            <button onClick={() => setSettingsPanel('menu')} style={{
              padding: '3px 5px', background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center',
              borderRadius: 6, transition: 'color 120ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}>
              <ChevronLeft style={{ width: 16, height: 16 }} />
            </button>
          )}
          <span style={{ flex: 1, color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: '0.01em' }}>
            {settingsPanel === 'profile' ? 'Profile Settings' : settingsPanel === 'theme' ? 'Theme Settings' : 'Settings'}
          </span>
          <button onClick={() => setSettingsPanel(null)} style={{
            padding: 5, background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.38)', display: 'flex', alignItems: 'center',
            borderRadius: 6, transition: 'color 120ms',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.38)'}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* ── Menu list ── */}
        {settingsPanel === 'menu' && (
          <div style={{ padding: '10px 8px' }}>
            {[
              { key: 'profile', Icon: User, label: 'Profile Settings',  sub: user?.name || 'Update name & password' },
              { key: 'theme',   Icon: Sun,  label: 'Theme Settings',    sub: pageTheme === 'light' ? 'Currently: Light' : 'Currently: Dark' },
            ].map(({ key, Icon, label, sub }) => (
              <button key={key} onClick={() => setSettingsPanel(key)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                padding: '11px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: 'transparent', marginBottom: 3, transition: 'background 120ms',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.20)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon style={{ width: 15, height: 15, color: '#C86068' }} />
                </div>
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 1 }}>{label}</div>
                  <div style={{ color: 'rgba(255,255,255,0.36)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
                </div>
                <ChevronRight style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        {/* ── Profile settings ── */}
        {settingsPanel === 'profile' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Avatar row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px' }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%', background: '#A72C32',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0,
              }}>
                {initials}
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{user?.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, textTransform: 'capitalize' }}>{user?.role}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

            {profileErr && (
              <div style={{ padding: '8px 10px', background: 'rgba(127,29,29,0.22)', border: '1px solid rgba(127,29,29,0.40)', borderRadius: 7, color: '#fca5a5', fontSize: 12 }}>
                {profileErr}
              </div>
            )}
            {profileSuccess && (
              <div style={{ padding: '8px 10px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 7, color: '#6ee7b7', fontSize: 12 }}>
                Changes saved successfully
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Display Name</label>
              <input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Your name" style={panelInput} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
              <input value={user?.email || ''} readOnly style={{ ...panelInput, color: 'rgba(255,255,255,0.32)', cursor: 'default' }} />
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Change Password</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="password" value={profileCurrentPw} onChange={e => setProfileCurrentPw(e.target.value)} placeholder="Current password" style={panelInput} />
              <input type="password" value={profileNewPw}     onChange={e => setProfileNewPw(e.target.value)}     placeholder="New password"      style={panelInput} />
              <input type="password" value={profileConfirmPw} onChange={e => setProfileConfirmPw(e.target.value)} placeholder="Confirm new password" style={panelInput} />
            </div>

            <button onClick={handleProfileSave} disabled={profileLoading} style={{
              padding: 10, borderRadius: 9, fontSize: 13, fontWeight: 700,
              cursor: profileLoading ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
              border: '1px solid rgba(167,44,50,0.40)', color: '#fff',
              opacity: profileLoading ? 0.6 : 1, transition: 'opacity 0.2s',
            }}>
              {profileLoading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* ── Theme settings ── */}
        {settingsPanel === 'theme' && (
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 13, background: 'rgba(255,255,255,0.03)',
              borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 3 }}>Page Theme</div>
                <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11 }}>
                  {pageTheme === 'light' ? 'Light mode active' : 'Dark mode active'}
                </div>
              </div>
              {typeof setPageTheme === 'function' && (
                <Switch checked={pageTheme === 'light'} onChange={checked => setPageTheme(checked ? 'light' : 'dark')} />
              )}
            </div>

            {isDarkOnly && (
              <div style={{
                padding: '9px 11px', background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
                fontSize: 11, color: 'rgba(255,255,255,0.40)', lineHeight: 1.55,
              }}>
                The current page always uses dark mode. Theme applies to Locators, Stickers, and Alerts pages.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Overlay — clicking outside closes the panel */}
      {panelOpen && (
        <div
          style={{ position: 'fixed', top: 0, left: 56, right: 0, bottom: 0, zIndex: 99 }}
          onClick={() => setSettingsPanel(null)}
        />
      )}

      {/* ── Logout confirmation modal ───────────────────────────────────── */}
      {showLogoutConfirm && (
        <ModalPortal>
          <div onClick={() => setShowLogoutConfirm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
                boxShadow: '0 24px 64px rgba(0,0,0,0.72)', width: '100%', maxWidth: 380, padding: 22 }}>
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
                  style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>
                  Cancel
                </button>
                <button onClick={confirmLogout}
                  style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                    border: '1px solid rgba(167,44,50,0.40)', color: '#fff' }}>
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
