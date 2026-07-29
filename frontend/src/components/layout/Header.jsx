import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Bell, Moon, Sun, BatteryLow, WifiOff, MapPin, ArrowRight, CheckCheck, LogOut, Settings, FileDown, Loader } from 'lucide-react'
import DashboardSwitcher from '../common/DashboardSwitcher.jsx'
import PillTabSwitcher from '../common/PillTabSwitcher.jsx'
import { useAlerts } from '../../context/AlertsContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useApp } from '../../App.jsx'
import { useDashboardChrome } from '../../context/DashboardChromeContext.jsx'
import { useProfileCache } from '../../context/ProfileCacheContext.jsx'
import Switch from '../Switch.jsx'
import ModalPortal from '../common/ModalPortal.jsx'
import { useCityTag } from '../../hooks/useCityTag.js'
import { buildCrumbs } from '../../utils/breadcrumbs.js'
import AddEmailBanner from '../AddEmailBanner.jsx'
import Skeleton from '../ui/Skeleton.jsx'
import { isValidEmail } from '../../utils/email.js'
import { isSyntheticEmail } from '../../utils/userContact.js'

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
  const { pathname, search, state } = useLocation()
  const navigate     = useNavigate()

  let alertsCtx = null
  try { alertsCtx = useAlerts() } catch {}
  const unreadCount = alertsCtx?.unreadCount ?? 0
  const allAlerts   = alertsCtx?.alerts      ?? []
  const markRead    = alertsCtx?.markRead
  const markAllRead = alertsCtx?.markAllRead

  // `user` here is App.jsx's derived appUser — only {name, role, company, email}.
  // Fine for display, but never feed it back into auth state: it has no id/devices.
  const { user } = useApp()
  const { updateProfile, logout, updateUser, accessToken, role } = useAuth()
  const { updateMyProfile } = useCityTag()
  const {
    profile: cachedProfile,
    refresh: refreshProfile,
    applyProfile: applyProfileToCache,
  } = useProfileCache()

  // Page-registered topbar action (Export PDF on dashboard, Export CSV on devices, …).
  // Only the mounted page registers, so showing it whenever present is correct.
  const chrome       = useDashboardChrome()
  const exportAction = chrome?.exportAction
  const exporting    = chrome?.exporting ?? false
  const showExport   = !!exportAction
  const ExportIcon   = exportAction?.icon ?? FileDown
  const exportLabel  = exportAction?.label ?? 'Export'
  const tabSwitcher  = chrome?.tabSwitcher

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showProfileMenu,   setShowProfileMenu]   = useState(false)
  const profileMenuRef = useRef(null)

  useEffect(() => {
    if (!showProfileMenu) return
    const handler = e => { if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) setShowProfileMenu(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfileMenu])

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
  const [profileEmail,     setProfileEmail]     = useState('')
  const [profilePhone,     setProfilePhone]     = useState('')
  const [profileCnic,      setProfileCnic]      = useState('')
  const [profileCnicExpiry,setProfileCnicExpiry]= useState('')
  const [profileLicenseNo, setProfileLicenseNo] = useState('')
  const [profileLicenseExp,setProfileLicenseExp]= useState('')
  const [profileEmergency, setProfileEmergency] = useState('')
  const [profileAddress,   setProfileAddress]   = useState('')
  const [profileImageFile, setProfileImageFile] = useState(null)
  const [profileImageUrl,  setProfileImageUrl]  = useState('')
  const [profileImageApiUrl, setProfileImageApiUrl] = useState('')
  const [profileImageReloadKey, setProfileImageReloadKey] = useState(0)
  const [profileReady,     setProfileReady]     = useState(false)
  const profileImageInputRef = useRef(null)
  const profileImageObjectUrlRef = useRef(null)
  const [profileCurrentPw, setProfileCurrentPw] = useState('')
  const [profileNewPw,     setProfileNewPw]     = useState('')
  const [profileConfirmPw, setProfileConfirmPw] = useState('')
  const [profileErr,       setProfileErr]       = useState('')
  const [profileSuccess,   setProfileSuccess]   = useState('')
  const [profileLoading,   setProfileLoading]   = useState(false)

  // Seed the form from the profile prefetched at login (ProfileCacheContext), so
  // opening the dialog paints populated instead of fetching every time. If the
  // prefetch hasn't landed yet — dialog opened immediately after login, or it
  // failed — fall back to fetching here so the form is never left empty.
  // Read the cache inside the open-effect without making it a dependency.
  const cachedProfileRef = useRef(cachedProfile)
  useEffect(() => { cachedProfileRef.current = cachedProfile }, [cachedProfile])

  const applyProfileToForm = useCallback((p) => {
    setProfileName(p?.name || '')
    // /me/profile still returns the legacy p<digits>@accounts.tpllocator.com
    // placeholder for accounts with no email. Never surface it in an editable
    // field — show it as empty so the user fills in a real address.
    setProfileEmail(isSyntheticEmail(p?.email) ? '' : (p?.email || ''))
    setProfilePhone(p?.phone || '')
    setProfileCnic(p?.cnic || '')
    setProfileCnicExpiry(p?.cnic_expiry || '')
    setProfileLicenseNo(p?.driving_license_no || '')
    setProfileLicenseExp(p?.license_expiry || '')
    setProfileEmergency(p?.emergency_contact || '')
    setProfileAddress(p?.address || '')
    setProfileImageApiUrl(p?.profile_image_url || '')
  }, [])

  // On open: clear transient state, and fetch only if the login-time prefetch
  // hasn't landed. Keyed on showProfile alone — this must NOT re-run when the
  // cache updates, or saving would immediately wipe its own success message.
  useEffect(() => {
    if (!showProfile) return
    let cancelled = false
    setProfileErr('')
    setProfileSuccess('')
    setProfileCurrentPw('')
    setProfileNewPw('')
    setProfileConfirmPw('')
    setProfileImageFile(null)
    setProfileImageApiUrl('')
    // Clear object URL (if any); the effect below will repopulate.
    if (profileImageObjectUrlRef.current) {
      URL.revokeObjectURL(profileImageObjectUrlRef.current)
      profileImageObjectUrlRef.current = null
    }
    setProfileImageUrl('')

    if (cachedProfileRef.current) {
      setProfileReady(true)
      return
    }
    setProfileReady(false)
    refreshProfile()
      .then((p) => { if (!cancelled && !p) setProfileErr('Unable to load profile') })
      .catch((e) => { if (!cancelled) setProfileErr(e.message || 'Unable to load profile') })
      .finally(() => { if (!cancelled) setProfileReady(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfile])

  // Seed the fields whenever the cached profile is available or changes (login
  // prefetch resolving, or a save pushing the server's response back in).
  useEffect(() => {
    if (!showProfile || !cachedProfile) return
    applyProfileToForm(cachedProfile)
  }, [showProfile, cachedProfile, applyProfileToForm])

  useEffect(() => {
    let cancelled = false
    const loadImage = async () => {
      if (!showProfile) return
      if (!profileImageApiUrl) return
      try {
        // Cache-bust to force fetching latest image bytes.
        const bustUrl = `${profileImageApiUrl}${profileImageApiUrl.includes("?") ? "&" : "?"}v=${profileImageReloadKey}`
        const res = await fetch(bustUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`Image fetch failed (${res.status})`)
        const blob = await res.blob()
        if (cancelled) return
        if (profileImageObjectUrlRef.current) {
          URL.revokeObjectURL(profileImageObjectUrlRef.current)
        }
        const objUrl = URL.createObjectURL(blob)
        profileImageObjectUrlRef.current = objUrl
        setProfileImageUrl(objUrl)
      } catch (e) {
        if (!cancelled) {
          // Keep initials fallback if image can't be fetched.
          setProfileImageUrl('')
        }
      }
    }
    loadImage()
    return () => { cancelled = true }
  }, [showProfile, profileImageApiUrl, accessToken, profileImageReloadKey])

  // Blank is allowed (clears the email); anything else must be a valid address.
  const emailFieldError = Boolean(profileEmail.trim()) && !isValidEmail(profileEmail)

  const handleProfileSave = async () => {
    setProfileErr(''); setProfileSuccess('')
    if (emailFieldError) { setProfileErr('Enter a valid email address.'); return }
    const changingPw = profileNewPw || profileConfirmPw || profileCurrentPw
    if (changingPw) {
      if (!profileCurrentPw) { setProfileErr('Current password is required to set a new password.'); return }
      if (profileNewPw !== profileConfirmPw) { setProfileErr('New passwords do not match.'); return }
      if (profileNewPw.length < 6) { setProfileErr('New password must be at least 6 characters.'); return }
    }
    setProfileLoading(true)
    try {
      const profilePayload = {
        name: profileName,
        email: profileEmail.trim(),
        cnic: profileCnic,
        cnic_expiry: profileCnicExpiry,
        driving_license_no: profileLicenseNo,
        license_expiry: profileLicenseExp,
        emergency_contact: profileEmergency,
        address: profileAddress,
        ...(profileImageFile ? { profile_image: profileImageFile } : {}),
      }
      // PUT /me/profile returns the updated profile — push it straight into the
      // cache so reopening the dialog shows the new values, not the ones
      // prefetched at login.
      const saved = await updateMyProfile(profilePayload)
      applyProfileToCache(saved)

      if (changingPw) {
        await updateProfile({ currentPassword: profileCurrentPw, newPassword: profileNewPw })
      }

      // Merge only what this form owns. Previously this spread appUser into
      // loginSuccess(), which replaced the auth user wholesale — dropping id,
      // devices and admin_id (disabling the non-admin device filter in
      // Devices.jsx), writing the phone number into `name` whenever the name was
      // blank, and clearing every cache on each save.
      // Phone is read-only here and already on the auth user, so it is left alone —
      // the merge preserves it, which is what displayContact() falls back to when
      // the account has no email.
      updateUser({
        name: profileName.trim(),
        email: profileEmail.trim(),
      })

      setProfileSuccess('Profile updated successfully.')
      setProfileCurrentPw(''); setProfileNewPw(''); setProfileConfirmPw('')
      setProfileImageFile(null)
      try {
        const refreshed = await refreshProfile()
        setProfileImageApiUrl(refreshed?.profile_image_url || '')
        setProfileImageUrl('')
        setProfileImageReloadKey(Date.now())
      } catch {}
    } catch (e) {
      setProfileErr(e.message || 'Update failed.')
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    if (showProfile) return
    // Modal closed: cleanup object URL.
    if (profileImageObjectUrlRef.current) {
      URL.revokeObjectURL(profileImageObjectUrlRef.current)
      profileImageObjectUrlRef.current = null
    }
    setProfileImageUrl('')
    setProfileImageApiUrl('')
  }, [showProfile])

  const parts    = buildCrumbs(pathname, search, state)
  const initials = (user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  // AuthContext normalizes user.email to displayContact() — a real address (which
  // always contains '@') or the phone number. So no '@' means this account has no
  // email yet, covering both new NULL rows and legacy placeholder ones.
  const needsEmail = role === 'user' && !String(user?.email || '').includes('@')

  return (
    <>
      {needsEmail && !showProfile && (
        <AddEmailBanner onOpenProfile={() => setShowProfile(true)} />
      )}
      <header className="h-[60px] flex items-center px-5 gap-5 bg-black flex-shrink-0">

        {/* Breadcrumb */}
        {(pathname === '/dashboard' || pathname === '/field-staff') ? (
          <div className="flex items-center gap-2.5 text-xs flex-1">
            <span className="text-gray-500 font-medium cursor-pointer hover:text-gray-300 transition-colors"
              onClick={() => navigate('/dashboard')}>TPL LOCATOR</span>
            <ChevronRight className="w-3 h-3 text-gray-700" />
            <DashboardSwitcher />
          </div>
        ) : tabSwitcher ? (
          <div className="flex items-center gap-2.5 text-xs flex-1">
            <span className="text-gray-500 font-medium cursor-pointer hover:text-gray-300 transition-colors"
              onClick={() => navigate('/dashboard')}>TPL LOCATOR</span>
            <ChevronRight className="w-3 h-3 text-gray-700" />
            <PillTabSwitcher tabs={tabSwitcher.tabs} activeKey={tabSwitcher.activeKey} onSelect={tabSwitcher.onSelect} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs flex-1">
            <span className="text-gray-500 font-medium cursor-pointer hover:text-gray-300 transition-colors"
              onClick={() => navigate('/dashboard')}>TPL LOCATOR</span>
            {parts.map((p, i) => (
              <React.Fragment key={i}>
                <ChevronRight className="w-3 h-3 text-gray-700" />
                {p.isCurrent ? (
                  <span className="text-white font-semibold">{p.label}</span>
                ) : p.url ? (
                  <span className="text-gray-400 cursor-pointer hover:text-gray-200 transition-colors"
                    onClick={() => navigate(p.url)}>{p.label}</span>
                ) : (
                  <span className="text-gray-400">{p.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Page-registered export action (Export PDF / Export CSV), rendered in the topbar */}
        {showExport && (
          <button
            onClick={() => { if (!exporting) exportAction.run() }}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px', borderRadius: 10, flexShrink: 0,
              background: exporting ? 'rgba(167,44,50,0.25)' : 'rgba(167,44,50,0.14)',
              border: '1px solid rgba(167,44,50,0.35)',
              color: exporting ? 'rgba(255,255,255,0.45)' : '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: exporting ? 'not-allowed' : 'pointer',
              transition: 'all 0.18s', letterSpacing: '0.01em',
            }}
            onMouseEnter={e => { if (!exporting) { e.currentTarget.style.background='rgba(167,44,50,0.30)'; e.currentTarget.style.borderColor='rgba(167,44,50,0.60)' }}}
            onMouseLeave={e => { e.currentTarget.style.background= exporting ? 'rgba(167,44,50,0.25)' : 'rgba(167,44,50,0.14)'; e.currentTarget.style.borderColor='rgba(167,44,50,0.35)' }}
          >
            {exporting
              ? <Loader style={{ width:14, height:14, animation:'spin 1s linear infinite' }} />
              : <ExportIcon style={{ width:14, height:14 }} />}
            {exporting ? 'Exporting…' : exportLabel}
          </button>
        )}

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
            <Bell style={{ width: 22, height: 22, strokeWidth: 2.2, fill: unreadCount > 0 ? 'rgba(255,255,255,0.16)' : 'none' }} />
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

        {/* Profile dropdown */}
        <div ref={profileMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowProfileMenu(v => !v)}
            title="Account"
            style={{ width: 38, height: 38, borderRadius: '50%', cursor: 'pointer',
              background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
              border: `2px solid ${showProfileMenu ? 'rgba(167,44,50,0.90)' : 'rgba(167,44,50,0.40)'}`,
              boxShadow: showProfileMenu ? '0 0 0 3px rgba(167,44,50,0.22)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '0.02em',
              transition: 'border-color 0.2s, box-shadow 0.2s' }}
            onMouseEnter={e => { if (!showProfileMenu) { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.80)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(167,44,50,0.20)' } }}
            onMouseLeave={e => { if (!showProfileMenu) { e.currentTarget.style.borderColor = 'rgba(167,44,50,0.40)'; e.currentTarget.style.boxShadow = 'none' } }}>
            {initials}
          </button>

          {showProfileMenu && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              width: 270,
              background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.80)',
              overflow: 'hidden', zIndex: 500,
            }}>
              {/* Section label */}
              <div style={{ padding: '12px 16px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.30)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                Account
              </div>

              {/* User card */}
              <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                  border: '2px solid rgba(167,44,50,0.40)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 15, fontWeight: 700 }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.name || 'User'}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {user?.email}
                  </div>
                </div>
              </div>

              {/* Profile Settings */}
              <button
                onClick={() => { setShowProfileMenu(false); setShowProfile(true) }}
                style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 500,
                  borderBottom: '1px solid rgba(255,255,255,0.07)', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                <Settings style={{ width: 18, height: 18, flexShrink: 0, color: 'rgba(255,255,255,0.45)' }} />
                Profile Settings
              </button>

              {/* Theme toggle */}
              <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {pageTheme === 'light'
                  ? <Sun style={{ width: 18, height: 18, flexShrink: 0, color: 'rgba(255,255,255,0.45)' }} />
                  : <Moon style={{ width: 18, height: 18, flexShrink: 0, color: 'rgba(255,255,255,0.45)' }} />
                }
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.72)', textAlign: 'left' }}>
                  {pageTheme === 'light' ? 'Light Mode' : 'Dark Mode'}
                </span>
                <Switch checked={pageTheme === 'light'} onChange={v => setPageTheme(v ? 'light' : null)} />
              </div>

              {/* Log out */}
              <button
                onClick={() => { setShowProfileMenu(false); setShowLogoutConfirm(true) }}
                style={{ width: '100%', padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: 500,
                  transition: 'background 0.15s, color 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.10)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(255,255,255,0.72)' }}>
                <LogOut style={{ width: 18, height: 18, flexShrink: 0, color: 'rgba(255,255,255,0.45)' }} />
                Log out
              </button>
            </div>
          )}
        </div>
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
                boxShadow: '0 24px 64px rgba(0,0,0,0.80)', width: '42em', maxWidth: '100%', padding: 24, transition: 'width 0.3s ease',
                maxHeight: '90vh', overflowY: 'auto' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div style={{ position: 'relative', width: 54, height: 54, flexShrink: 0 }}>
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt="Profile"
                      style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }}
                    />
                  ) : (
                    <div style={{ width: 54, height: 54, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 16, fontWeight: 700 }}>
                      {initials}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => profileImageInputRef.current?.click()}
                    style={{
                      position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: '50%',
                      border: 'none', background: '#A72C32', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    }}
                    title="Upload profile image"
                  >
                    +
                  </button>
                  <input
                    ref={profileImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setProfileImageFile(file)
                      // Use locally selected file preview; don't fetch from API again.
                      if (profileImageObjectUrlRef.current) {
                        URL.revokeObjectURL(profileImageObjectUrlRef.current)
                        profileImageObjectUrlRef.current = null
                      }
                      setProfileImageUrl(URL.createObjectURL(file))
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Profile Settings</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginTop: 2 }}>{profileEmail || user?.email}</div>
                </div>
              </div>

              {/* The inputs are mounted only after /me/profile resolves. Rendering
                  them empty during the fetch gave the browser a window to autofill
                  them (saved address into Address, saved credential into the password
                  boxes) — and because these are controlled inputs, that value can sit
                  in the DOM while React state stays '', so a later Save would post the
                  empty string and wipe the stored field. Load from the DB first, then
                  render. */}
              {!profileReady ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginBottom: 14 }}>Loading profile...</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 16px' }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i}>
                        <Skeleton height="11px" width="90px" style={{ marginBottom: 6 }} />
                        <Skeleton height="38px" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
              <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 16px', marginBottom: 14 }}>
                {/* Name & Email */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Name
                  </label>
                  <input value={profileName} onChange={e => setProfileName(e.target.value)}
                    placeholder="Your name" style={{ ...inp }} autoComplete="off"
                    onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                    onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Email
                  </label>
                  <input
                    value={profileEmail}
                    onChange={e => setProfileEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="off"
                    style={{ ...inp, borderColor: emailFieldError ? '#ef4444' : '#3f3f46' }}
                    onFocus={e => { if (!emailFieldError) e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                    onBlur={e => { e.target.style.borderColor = emailFieldError ? '#ef4444' : '#3f3f46' }} />
                  {emailFieldError && (
                    <p style={{ fontSize: 11, color: '#fca5a5', marginTop: 4 }}>
                      Enter a valid email address
                    </p>
                  )}
                  {!profileEmail.trim() && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 4 }}>
                      Add one to enable password reset and code sign-in.
                    </p>
                  )}
                </div>

                {/* Phone & Emergency */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Phone (read only)
                  </label>
                  <input value={profilePhone || ''} readOnly style={{ ...inp, opacity: 0.75 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Emergency Contact
                  </label>
                  <input value={profileEmergency} onChange={e => setProfileEmergency(e.target.value)} placeholder="03001234567" style={{ ...inp }} autoComplete="off" />
                </div>

                {/* CNIC & CNIC Expiry */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    CNIC / ID Number
                  </label>
                  <input value={profileCnic} onChange={e => setProfileCnic(e.target.value)} placeholder="12345-1234567-1" style={{ ...inp }} autoComplete="off" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    CNIC Expiry
                  </label>
                  <input type="date" value={profileCnicExpiry} onChange={e => setProfileCnicExpiry(e.target.value)} style={{ ...inp }} />
                </div>

                {/* License & License Expiry */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Driving License No.
                  </label>
                  <input value={profileLicenseNo} onChange={e => setProfileLicenseNo(e.target.value)} placeholder="ABC12345" style={{ ...inp }} autoComplete="off" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    License Expiry
                  </label>
                  <input type="date" value={profileLicenseExp} onChange={e => setProfileLicenseExp(e.target.value)} style={{ ...inp }} />
                </div>

                {/* Address */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Address
                  </label>
                  <input value={profileAddress} onChange={e => setProfileAddress(e.target.value)} placeholder="Lahore" style={{ ...inp }} autoComplete="off" type="text" />
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '18px 0' }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.50)', marginBottom: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Change Password
              </div>

              <div style={{ marginBottom: 10 }}>
                <input type="password" value={profileCurrentPw} onChange={e => setProfileCurrentPw(e.target.value)}
                  placeholder="Current password" style={{ ...inp }}
                  autoComplete="new-password"
                  onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                  onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 16px', marginBottom: 18 }}>
                <div>
                  <input type="password" value={profileNewPw} onChange={e => setProfileNewPw(e.target.value)}
                    placeholder="New password" style={{ ...inp }}
                    autoComplete="new-password"
                    onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                    onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
                </div>
                <div>
                  <input type="password" value={profileConfirmPw} onChange={e => setProfileConfirmPw(e.target.value)}
                    placeholder="Confirm new password" style={{ ...inp }}
                    autoComplete="new-password"
                    onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.60)' }}
                    onBlur={e => { e.target.style.borderColor = '#3f3f46' }} />
                </div>
              </div>
              </>
              )}

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
                {/* Also gated on profileReady — saving before the fetch resolves would
                    post empty strings and clear stored fields. */}
                <button onClick={handleProfileSave} disabled={profileLoading || !profileReady}
                  style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: (profileLoading || !profileReady) ? 'not-allowed' : 'pointer',
                    background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                    border: '1px solid rgba(167,44,50,0.40)', color: '#fff',
                    opacity: (profileLoading || !profileReady) ? 0.7 : 1 }}>
                  {profileLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      {/* Logout confirmation */}
      {showLogoutConfirm && (
        <ModalPortal>
          <div onClick={() => setShowLogoutConfirm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16,
                boxShadow: '0 24px 64px rgba(0,0,0,0.80)', width: '100%', maxWidth: 360, padding: 28 }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                  background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LogOut style={{ width: 17, height: 17, color: '#f87171' }} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Log Out</div>
              </div>

              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 24 }}>
                Are you sure you want to log out? Any unsaved changes will be lost.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setShowLogoutConfirm(false)}
                  style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>
                  Cancel
                </button>
                <button onClick={() => { setShowLogoutConfirm(false); logout() }}
                  style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                    border: '1px solid rgba(167,44,50,0.40)', color: '#fff' }}>
                  Log Out
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  )
}
