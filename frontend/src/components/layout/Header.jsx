import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Bell, Moon, Sun, BatteryLow, WifiOff, MapPin, ArrowRight, CheckCheck } from 'lucide-react'
import FieldStaffPill from '../FieldStaffPill.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useApp } from '../../App.jsx'
import Switch from '../Switch.jsx'
import ModalPortal from '../common/ModalPortal.jsx'

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

const inp = {
  width: '100%', background: '#18181b',
  border: '1px solid #3f3f46', borderRadius: 8,
  padding: '9px 12px', color: '#f4f4f5', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
}

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 }
const SEVERITY_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#eab308' }

function relTime(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function AlertIcon({ type, color }) {
  const s = { width: 13, height: 13, color, strokeWidth: 2.2, flexShrink: 0 }
  if (type === 'BATTERY_LOW')  return <BatteryLow style={s} />
  if (type === 'DEVICE_OFFLINE') return <WifiOff style={s} />
  return <MapPin style={s} />
}

export default function Header({ pageTheme, setPageTheme }) {
  const { pathname } = useLocation()
  const navigate     = useNavigate()

  let alertsCtx = null
  try { alertsCtx = useAlerts() } catch {}
  const unreadCount = alertsCtx?.unreadCount ?? 0
  const allAlerts   = alertsCtx?.alerts      ?? []
  const markRead    = alertsCtx?.markRead
  const markAllRead = alertsCtx?.markAllRead

  const { user } = useApp()
  const { updateProfile } = useAuth()

  // Alerts drawer
  const [showAlerts, setShowAlerts] = useState(false)
  const drawerRef = useRef(null)

  useEffect(() => {
    if (!showAlerts) return
    const handler = e => { if (drawerRef.current && !drawerRef.current.contains(e.target)) setShowAlerts(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAlerts])

  const drawerAlerts = [...allAlerts]
    .sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
      const sr = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
      if (sr !== 0) return sr
      return new Date(b.timestamp) - new Date(a.timestamp)
    })
    .slice(0, 8)

  // Profile modal state
  const [showProfile,      setShowProfile]      = useState(false)
  const [profileName,      setProfileName]      = useState('')
  const [profileCurrentPw, setProfileCurrentPw] = useState('')
  const [profileNewPw,     setProfileNewPw]     = useState('')
  const [profileConfirmPw, setProfileConfirmPw] = useState('')
  const [profileErr,       setProfileErr]       = useState('')
  const [profileSuccess,   setProfileSuccess]   = useState('')
  const [profileLoading,   setProfileLoading]   = useState(false)

  useEffect(() => {
    if (showProfile) {
      setProfileName(user?.name || '')
      setProfileCurrentPw(''); setProfileNewPw(''); setProfileConfirmPw('')
      setProfileErr(''); setProfileSuccess('')
    }
  }, [showProfile, user?.name])

  const handleProfileSave = async () => {
    setProfileErr(''); setProfileSuccess('')
    const changingPw = profileNewPw || profileConfirmPw || profileCurrentPw
    if (changingPw) {
      if (!profileCurrentPw) { setProfileErr('Current password is required to set a new password.'); return }
      if (profileNewPw !== profileConfirmPw) { setProfileErr('New passwords do not match.'); return }
      if (profileNewPw.length < 6) { setProfileErr('New password must be at least 6 characters.'); return }
    }
    setProfileLoading(true)
    try {
      const payload = {}
      if (profileName.trim() && profileName.trim() !== user?.name) payload.name = profileName.trim()
      if (changingPw) { payload.currentPassword = profileCurrentPw; payload.newPassword = profileNewPw }
      if (Object.keys(payload).length === 0) { setProfileErr('No changes to save.'); setProfileLoading(false); return }
      await updateProfile(payload)
      setProfileSuccess('Profile updated successfully.')
      setProfileCurrentPw(''); setProfileNewPw(''); setProfileConfirmPw('')
    } catch (e) {
      setProfileErr(e.message || 'Update failed.')
    } finally {
      setProfileLoading(false)
    }
  }

  const parts    = getCrumbs(pathname)
  const initials = (user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <header className="h-[60px] flex items-center px-5 gap-4 bg-black border-b border-gray-800 flex-shrink-0">

        {/* Breadcrumb */}
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
              const isLast = i === parts.length - 1
              const route  = !isLast ? crumbRouteMap[p] : null
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

        {/* Theme toggle */}
        <div className="flex items-center gap-1.5" title={pageTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          <Moon className="w-3.5 h-3.5 text-gray-500" />
          <Switch checked={pageTheme === 'light'} onChange={v => setPageTheme(v ? 'light' : null)} />
          <Sun className="w-3.5 h-3.5 text-gray-500" />
        </div>

        {/* Alerts bell + drawer */}
        <div style={{ position: 'relative' }} ref={drawerRef}>
          <button
            onClick={() => setShowAlerts(v => !v)}
            style={{ position: 'relative', padding: 8, borderRadius: 12,
              background: showAlerts ? '#1a1a1a' : unreadCount > 0 ? 'rgba(167,44,50,0.16)' : 'transparent',
              border: `1px solid ${showAlerts ? 'rgba(255,255,255,0.12)' : unreadCount > 0 ? 'rgba(167,44,50,0.45)' : 'transparent'}`,
              cursor: 'pointer',
              color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.2s, background 0.2s, border-color 0.2s' }}
            title={unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'Alerts'}>
            <Bell style={{ width: 18, height: 18, strokeWidth: 2.4, fill: unreadCount > 0 ? 'rgba(255,255,255,0.16)' : 'none' }} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 2, right: 2,
                minWidth: 16, height: 16, borderRadius: 8,
                background: '#A72C32', color: '#FFFFFF', fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', lineHeight: 1, boxShadow: '0 0 0 2px #000000',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Drawer */}
          {showAlerts && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              width: 340, maxHeight: 480,
              background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.75)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              zIndex: 500,
            }}>
              {/* Drawer header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f4f4f5' }}>Alerts</span>
                  {unreadCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff',
                      background: '#A72C32', borderRadius: 6, padding: '2px 6px' }}>
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={() => markAllRead?.()} title="Mark all as read"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.40)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}
                    onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.70)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.40)'}>
                    <CheckCheck style={{ width: 13, height: 13 }} />
                    Mark all read
                  </button>
                )}
              </div>

              {/* Alert list */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {drawerAlerts.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 13 }}>
                    No alerts right now
                  </div>
                ) : drawerAlerts.map(alert => {
                  const color = SEVERITY_COLOR[alert.severity] ?? '#6b7280'
                  return (
                    <div key={alert.id}
                      onClick={() => { markRead?.(alert.id) }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '11px 16px', cursor: 'default',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        background: alert.isRead ? 'transparent' : 'rgba(255,255,255,0.03)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                      onMouseLeave={e => e.currentTarget.style.background = alert.isRead ? 'transparent' : 'rgba(255,255,255,0.03)'}>

                      {/* Severity dot + icon */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingTop: 2, flexShrink: 0 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: alert.isRead ? 'transparent' : color, border: `1px solid ${color}`, flexShrink: 0 }} />
                        <AlertIcon type={alert.type} color={alert.isRead ? 'rgba(255,255,255,0.25)' : color} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: alert.isRead ? 'rgba(255,255,255,0.45)' : '#f4f4f5',
                          lineHeight: 1.4, wordBreak: 'break-word' }}>
                          {alert.message}
                        </div>
                        <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)' }}>{relTime(alert.timestamp)}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.04em',
                            opacity: alert.isRead ? 0.4 : 1 }}>
                            {alert.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* View all footer */}
              <button
                onClick={() => { setShowAlerts(false); navigate('/alerts') }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)',
                  background: 'none', border: 'none', cursor: 'pointer', width: '100%',
                  color: 'rgba(255,255,255,0.50)', fontSize: 12, fontWeight: 600,
                  transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; e.currentTarget.style.background = 'none' }}>
                View all alerts
                <ArrowRight style={{ width: 13, height: 13 }} />
              </button>
            </div>
          )}
        </div>

        {/* Profile avatar button */}
        <button
          onClick={() => setShowProfile(true)}
          title="Profile settings"
          style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
            background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
            border: '2px solid rgba(167,44,50,0.40)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
            transition: 'border-color 0.2s, box-shadow 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.80)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,44,50,0.20)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.40)'; e.currentTarget.style.boxShadow = 'none' }}>
          {initials}
        </button>
      </header>

      {/* Profile modal */}
      {showProfile && (
        <ModalPortal>
          <div onClick={() => setShowProfile(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.60)',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#000', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
                boxShadow: '0 24px 64px rgba(0,0,0,0.80)', width: '100%', maxWidth: 420, padding: 28 }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 16, fontWeight: 700 }}>
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Profile Settings</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>{user?.email}</div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Display Name
                </label>
                <input value={profileName} onChange={e => setProfileName(e.target.value)}
                  placeholder="Your name" style={{ ...inp }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                  onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '18px 0' }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Change Password
              </div>

              <div style={{ marginBottom: 10 }}>
                <input type="password" value={profileCurrentPw} onChange={e => setProfileCurrentPw(e.target.value)}
                  placeholder="Current password" style={{ ...inp }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                  onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <input type="password" value={profileNewPw} onChange={e => setProfileNewPw(e.target.value)}
                  placeholder="New password" style={{ ...inp }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                  onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <input type="password" value={profileConfirmPw} onChange={e => setProfileConfirmPw(e.target.value)}
                  placeholder="Confirm new password" style={{ ...inp }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                  onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
              </div>

              {profileErr && (
                <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(167,44,50,0.12)', border: '1px solid rgba(167,44,50,0.30)', color: '#f87171', fontSize: 12 }}>
                  {profileErr}
                </div>
              )}
              {profileSuccess && (
                <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8,
                  background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', color: '#86efac', fontSize: 12 }}>
                  {profileSuccess}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowProfile(false)}
                  style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>
                  Cancel
                </button>
                <button onClick={handleProfileSave} disabled={profileLoading}
                  style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: profileLoading ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                    border: '1px solid rgba(167,44,50,0.40)', color: '#fff', opacity: profileLoading ? 0.7 : 1 }}>
                  {profileLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
