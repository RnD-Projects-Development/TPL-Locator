import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import {
  Users, Search, X, RefreshCw, Shield, ShieldCheck, UserCog,
  Plus, Trash2, Radio, Tag, ChevronRight, ChevronDown, Pencil, Link2,
  Eye, PlusCircle, Check, Loader2, Smartphone, LayoutDashboard,
} from 'lucide-react'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
  DrawerBody, DrawerFooter, DrawerClose,
} from '../components/ui/Drawer.jsx'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import AddDeviceToUserModal from '../components/AddDeviceToUserModal.jsx'
import { displayContact, isValidIdentifier } from '../utils/userContact.js'
import { isUserOnline, lastActiveTs, lastActiveStamp, parseTs } from '../utils/userPresence.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'
import ModalPortal from '../components/common/ModalPortal.jsx'
import SearchHistoryDropdown from '../components/common/SearchHistoryDropdown.jsx'
import { useSearchHistory } from '../hooks/useSearchHistory.js'
import { APP_CACHE_STORAGE_KEYS } from '../utils/clearAppCaches.js'
import { useTrailNav } from '../hooks/useBreadcrumbTrail.js'

// Remembers the Users list view (search + page + which rows are expanded) so
// returning via the breadcrumb restores it instantly. Data itself lives in the
// always-mounted UserCache context, so there is no re-fetch.
const USERS_VIEW_KEY = 'bc:usersview'
function loadUsersView() {
  try { return JSON.parse(sessionStorage.getItem(USERS_VIEW_KEY)) || null } catch { return null }
}
function saveUsersView(v) {
  try { sessionStorage.setItem(USERS_VIEW_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function parseDeviceTs(raw) {
  if (!raw) return null
  if (typeof raw === 'number') {
    const d = new Date(raw > 1e11 ? raw : raw * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof raw === 'string') {
    const str = raw.trim().replace(' ', 'T')
    let d = new Date(str)
    if (!isNaN(d.getTime())) return d
    if (!str.includes('Z') && !str.includes('+')) {
      d = new Date(str + 'Z')
      if (!isNaN(d.getTime())) return d
    }
  }
  return null
}

function fmtDeviceDisplayTime(device) {
  const raw = device?.dataRetrievalTime ?? device?.last_seen ?? device?.lastSeen ?? device?.last_report ?? device?.lastReport ?? device?.timestamp ?? null
  const d = parseDeviceTs(raw)
  if (!d) return '—'
  const diff = Date.now() - d.getTime()
  if (diff >= 0 && diff < 60_000) return 'Just now'
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleString(undefined, {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function fmtRelTime(ts) {
  if (!ts) return '—'
  try {
    const d = parseDeviceTs(ts)
    if (!d) return '—'
    const diff = Date.now() - d.getTime()
    if (diff < 60_000)     return 'Just now'
    if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
}

/* ── Active avatar stack ──────────────────────────────────────────────────── */
const AVATAR_COLORS = [
  { bg: '#E87178', color: '#FFFFFF' },
  { bg: '#60A5FA', color: '#FFFFFF' },
  { bg: '#34D399', color: '#FFFFFF' },
  { bg: '#FBBF24', color: '#FFFFFF' },
  { bg: '#A78BFA', color: '#FFFFFF' },
  { bg: '#F472B6', color: '#FFFFFF' },
  { bg: '#38BDF8', color: '#FFFFFF' },
  { bg: '#EAB308', color: '#FFFFFF' },
]

function ActiveAvatarStack({ users, isLight }) {
  const ringColor = isLight ? '#F1F1F1' : '#18181b'
  const active = users
    .filter(u => {
      const ts = u.last_logged_in || u.last_login
      const ms = parseTs(ts)
      return ms > 0 && Date.now() - ms < 86_400_000
    })
    .sort((a, b) => {
      const tsA = parseTs(a.last_logged_in || a.last_login)
      const tsB = parseTs(b.last_logged_in || b.last_login)
      return tsB - tsA
    })
  if (active.length === 0) return null
  const shown = active.slice(0, 7)
  const extra = active.length - shown.length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 6px #10B981' }} />
        <span style={{ fontSize: 10, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.40)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {active.length} active today
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {shown.map((u, i) => {
          const contact = displayContact(u)
          const initials = (u.name || contact || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
          const col = AVATAR_COLORS[i % AVATAR_COLORS.length]
          return (
            <div
              key={u._id || u.id || i}
              title={`${u.name || contact} · ${fmtRelTime(u.last_logged_in || u.last_login)}`}
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: col.bg, border: `2.5px solid ${ringColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: col.color,
                marginLeft: i === 0 ? 0 : -10,
                position: 'relative', zIndex: shown.length - i,
                cursor: 'default', transition: 'transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.zIndex = 99 }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.zIndex = String(shown.length - i) }}
            >
              {initials}
            </div>
          )
        })}
        {extra > 0 && (
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: isLight ? '#E5E7EB' : '#3F3F46',
            border: `2.5px solid ${ringColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
            color: isLight ? '#4B5563' : '#D4D4D8',
            marginLeft: -10, position: 'relative', zIndex: 0,
          }}>
            +{extra}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Role badge ───────────────────────────────────────────────────────────── */
function RoleBadge({ role, isLight }) {
  const r = (role || 'user').toLowerCase()
  const map = {
    admin:      'badge-red-500',
    superadmin: 'badge-primary',
    user:       'badge-secondary',
    operator:   'badge-teal-500',
  }
  const cls = map[r] || 'badge-secondary'
  const label = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User'
  
  const customStyle = (isLight && cls === 'badge-secondary')
    ? { background: '#F3F4F6', color: '#4B5563', border: '1px solid #E5E7EB' }
    : {}

  return (
    <span className={`badge ${cls}`} style={customStyle}>{label}</span>
  )
}

/* ── Battery bar ──────────────────────────────────────────────────────────── */
function BattBar({ v }) {
  const color = v > 40 ? '#10B981' : v > 20 ? '#F59E0B' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 52, height: 5, borderRadius: 3, background: 'rgba(128,128,128,0.15)' }}>
        <div style={{ height: 5, borderRadius: 3, width: `${v}%`, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{v}%</span>
    </div>
  )
}

/* ── Device card ──────────────────────────────────────────────────────────── */
function DeviceCard({ device, pushTrail, isAdmin, onUnbind, isLight }) {
  const [hov, setHov] = useState(false)
  const isSticker = /^\d+$/.test(String(device.sn ?? ''))
  const DevIcon = isSticker ? Tag : Radio
  const path = isSticker ? `/stickers/${device.sn}` : `/locators/${device.sn}`

  const cardBg = isLight
    ? (hov
        ? 'linear-gradient(145deg, #FFFFFF, #FAFAFA) padding-box, linear-gradient(135deg, rgba(167,44,50,0.50) 0%, rgba(255,255,255,0) 55%) border-box'
        : 'linear-gradient(145deg, #FFFFFF, #F9F9F9) padding-box, linear-gradient(135deg, rgba(167,44,50,0.28) 0%, rgba(255,255,255,0) 55%) border-box')
    : '#242323'

  return (
    <div
      onClick={() => pushTrail(path)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        border: isLight ? '1.5px solid transparent' : '1px solid rgba(255,255,255,0.07)',
        background: cardBg,
        borderRadius: 14,
        boxShadow: isLight
          ? (hov ? '0 8px 32px rgba(167,44,50,0.14)' : '0 2px 12px rgba(167,44,50,0.06)')
          : (hov ? '0 0 44px rgba(167,44,50,0.52), 0 12px 40px rgba(0,0,0,0.55)' : '0 4px 24px rgba(0,0,0,0.35)'),
        padding: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease, background 0.22s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: 'rgba(167,44,50,0.10)', border: '1px solid rgba(167,44,50,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DevIcon style={{ width: 15, height: 15, color: '#C44E54' }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isLight ? '#111111' : '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {device.name || device.assigned_user_name || device.sn}
          </div>
          <div style={{ fontSize: 10, color: isLight ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.32)', fontFamily: 'monospace', marginTop: 2 }}>
            {device.sn}
          </div>
        </div>
      </div>
      <ChevronRight style={{ width: 14, height: 14, color: isLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
      {isAdmin && (
        <button
          onClick={e => { e.stopPropagation(); onUnbind(device) }}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 10, color: '#fff',
            background: '#A72C32', border: '1px solid rgba(167,44,50,0.60)',
            borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#8B2328' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#A72C32' }}
        >
          <Trash2 style={{ width: 10, height: 10 }} /> Unbind
        </button>
      )}
    </div>
  )
}

/* ── Permissions dropdown (Dashboard, Fence Access & Fence Create) ───────── */
function PermissionsDropdown({ u, isLight, onTogglePermission, permLoading }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, openUp: false })
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  const uid = String(u._id || u.id || '')
  const hasDashboard = u.dashboard_access !== false
  const hasAccess = Boolean(u.geofence_access)
  const hasCreate = Boolean(u.geofence_create_access)
  const activeCount = (hasDashboard ? 1 : 0) + (hasAccess ? 1 : 0) + (hasCreate ? 1 : 0)

  const loadingDashboard = Boolean(permLoading?.[`${uid}_dashboard_access`])
  const loadingAccess = Boolean(permLoading?.[`${uid}_geofence_access`])
  const loadingCreate = Boolean(permLoading?.[`${uid}_geofence_create_access`])

  const toggle = (e) => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const r = btnRef.current.getBoundingClientRect()
    const menuW = 285
    const menuH = 240
    const openUp = r.bottom + menuH + 12 > window.innerHeight
    const left = Math.max(10, Math.min(r.left, window.innerWidth - menuW - 16))
    const top = openUp ? Math.max(10, r.top - menuH - 6) : r.bottom + 6
    setPos({ top, left, openUp })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onMotion = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onMotion)
    window.addEventListener('scroll', onMotion, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onMotion)
      window.removeEventListener('scroll', onMotion, true)
    }
  }, [open])

  // Color tokens
  const bgActive = isLight ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.14)'
  const bdrActive = isLight ? 'rgba(16,185,129,0.30)' : 'rgba(16,185,129,0.35)'
  const txtActive = isLight ? '#059669' : '#34D399'

  const bgMuted = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const bdrMuted = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)'
  const txtMuted = isLight ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.45)'

  const menuBg = isLight ? '#FFFFFF' : '#1A1D20'
  const menuBdr = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'
  const itemHov = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'
  const subTxt = isLight ? '#666666' : 'rgba(255,255,255,0.48)'
  const mainTxt = isLight ? '#111111' : '#FFFFFF'

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Manage User Permissions"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.36em',
          padding: '0.28em 0.65em', borderRadius: '0.5em', cursor: 'pointer',
          background: activeCount > 0 ? bgActive : bgMuted,
          border: `1px solid ${activeCount > 0 ? bdrActive : bdrMuted}`,
          color: activeCount > 0 ? txtActive : txtMuted,
          fontSize: '0.8em', fontWeight: 600, transition: 'all 0.15s',
          userSelect: 'none',
        }}
        onMouseEnter={e => {
          if (activeCount > 0) {
            e.currentTarget.style.background = isLight ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.22)'
            e.currentTarget.style.borderColor = isLight ? 'rgba(16,185,129,0.45)' : 'rgba(16,185,129,0.50)'
          } else {
            e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
            e.currentTarget.style.borderColor = isLight ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.18)'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.background = activeCount > 0 ? bgActive : bgMuted
            e.currentTarget.style.borderColor = activeCount > 0 ? bdrActive : bdrMuted
          }
        }}
      >
        <Shield style={{ width: '0.88em', height: '0.88em', color: activeCount > 0 ? (isLight ? '#059669' : '#34D399') : (isLight ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.35)') }} />
        <span>Permission</span>
        <ChevronDown style={{
          width: '0.78em', height: '0.78em',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s ease',
          opacity: 0.7,
        }} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: 285,
            background: menuBg,
            border: `1px solid ${menuBdr}`,
            borderRadius: 12,
            boxShadow: isLight
              ? '0 12px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)'
              : '0 16px 40px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.05)',
            zIndex: 99999,
            padding: 8,
            fontFamily: 'inherit',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px 8px', borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
            marginBottom: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield style={{ width: 13, height: 13, color: '#A72C32' }} />
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: mainTxt }}>
                User Permissions
              </span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: txtActive, background: bgActive, padding: '2px 6px', borderRadius: 6 }}>
              {activeCount} of 3 Active
            </span>
          </div>

          {/* Option 1: Dashboard Access */}
          <div
            onClick={() => {
              if (loadingDashboard) return
              onTogglePermission(u, 'dashboard_access')
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: 8, cursor: loadingDashboard ? 'wait' : 'pointer',
              background: hasDashboard ? (isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.08)') : 'transparent',
              border: `1px solid ${hasDashboard ? (isLight ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.22)') : 'transparent'}`,
              marginBottom: 4, transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              if (!hasDashboard) e.currentTarget.style.background = itemHov
            }}
            onMouseLeave={e => {
              if (!hasDashboard) e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{
                marginTop: 2, width: 22, height: 22, borderRadius: 6,
                background: hasDashboard ? (isLight ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.18)') : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <LayoutDashboard style={{ width: 12, height: 12, color: hasDashboard ? (isLight ? '#059669' : '#34D399') : subTxt }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: mainTxt, lineHeight: 1.2 }}>Dashboard</div>
                <div style={{ fontSize: 10, color: subTxt, marginTop: 2, lineHeight: 1.2 }}>View overview & KPIs dashboard</div>
              </div>
            </div>

            {/* Switch / Status Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
              {loadingDashboard ? (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.20)'}`,
                  borderTopColor: '#10B981', animation: 'spin 0.6s linear infinite',
                }} />
              ) : (
                <div style={{
                  width: 32, height: 18, borderRadius: 10,
                  background: hasDashboard ? '#10B981' : (isLight ? '#D1D5DB' : '#4B5563'),
                  position: 'relative', transition: 'background 0.18s ease',
                  padding: 2, boxSizing: 'border-box',
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF',
                    transform: hasDashboard ? 'translateX(14px)' : 'translateX(0)',
                    transition: 'transform 0.18s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  }} />
                </div>
              )}
            </div>
          </div>

          {/* Option 2: Fence Access (View) */}
          <div
            onClick={() => {
              if (loadingAccess) return
              onTogglePermission(u, 'geofence_access')
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: 8, cursor: loadingAccess ? 'wait' : 'pointer',
              background: hasAccess ? (isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.08)') : 'transparent',
              border: `1px solid ${hasAccess ? (isLight ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.22)') : 'transparent'}`,
              marginBottom: 4, transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              if (!hasAccess) e.currentTarget.style.background = itemHov
            }}
            onMouseLeave={e => {
              if (!hasAccess) e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{
                marginTop: 2, width: 22, height: 22, borderRadius: 6,
                background: hasAccess ? (isLight ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.18)') : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Eye style={{ width: 12, height: 12, color: hasAccess ? (isLight ? '#059669' : '#34D399') : subTxt }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: mainTxt, lineHeight: 1.2 }}>Fence Access</div>
                <div style={{ fontSize: 10, color: subTxt, marginTop: 2, lineHeight: 1.2 }}>View fence map & events</div>
              </div>
            </div>

            {/* Switch / Status Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
              {loadingAccess ? (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.20)'}`,
                  borderTopColor: '#10B981', animation: 'spin 0.6s linear infinite',
                }} />
              ) : (
                <div style={{
                  width: 32, height: 18, borderRadius: 10,
                  background: hasAccess ? '#10B981' : (isLight ? '#D1D5DB' : '#4B5563'),
                  position: 'relative', transition: 'background 0.18s ease',
                  padding: 2, boxSizing: 'border-box',
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF',
                    transform: hasAccess ? 'translateX(14px)' : 'translateX(0)',
                    transition: 'transform 0.18s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  }} />
                </div>
              )}
            </div>
          </div>

          {/* Option 3: Fence Create */}
          <div
            onClick={() => {
              if (loadingCreate) return
              onTogglePermission(u, 'geofence_create_access')
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', borderRadius: 8, cursor: loadingCreate ? 'wait' : 'pointer',
              background: hasCreate ? (isLight ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.08)') : 'transparent',
              border: `1px solid ${hasCreate ? (isLight ? 'rgba(16,185,129,0.18)' : 'rgba(16,185,129,0.22)') : 'transparent'}`,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              if (!hasCreate) e.currentTarget.style.background = itemHov
            }}
            onMouseLeave={e => {
              if (!hasCreate) e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{
                marginTop: 2, width: 22, height: 22, borderRadius: 6,
                background: hasCreate ? (isLight ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.18)') : (isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <PlusCircle style={{ width: 12, height: 12, color: hasCreate ? (isLight ? '#059669' : '#34D399') : subTxt }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: mainTxt, lineHeight: 1.2 }}>Create Fence</div>
                <div style={{ fontSize: 10, color: subTxt, marginTop: 2, lineHeight: 1.2 }}>Create & manage fences</div>
              </div>
            </div>

            {/* Switch / Status Pill */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
              {loadingCreate ? (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: `2px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.20)'}`,
                  borderTopColor: '#10B981', animation: 'spin 0.6s linear infinite',
                }} />
              ) : (
                <div style={{
                  width: 32, height: 18, borderRadius: 10,
                  background: hasCreate ? '#10B981' : (isLight ? '#D1D5DB' : '#4B5563'),
                  position: 'relative', transition: 'background 0.18s ease',
                  padding: 2, boxSizing: 'border-box',
                }}>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF',
                    transform: hasCreate ? 'translateX(14px)' : 'translateX(0)',
                    transition: 'transform 0.18s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                  }} />
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

/* ── User Devices Drawer (Slider) ────────────────────────────────────────── */
function UserDevicesDrawer({
  user,
  devices = [],
  open,
  onClose,
  isAdmin,
  onUnbindDevice,
  pushTrail,
  isLight,
}) {
  if (!user) return null

  const contact = displayContact(user)
  const initials = (user.name || contact || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const online = isUserOnline(user)

  // Status computation for each device
  const enrichedDevices = devices.map(d => {
    const isSticker = /^\d+$/.test(String(d.sn ?? ''))
    const path = isSticker ? `/stickers/${d.sn}` : `/locators/${d.sn}`
    const st = String(d.status || d.deviceStatus || '').toLowerCase()
    const rawTs = d.dataRetrievalTime ?? d.last_seen ?? d.lastSeen ?? d.last_report ?? d.lastReport ?? d.timestamp ?? null
    const parsedD = parseDeviceTs(rawTs)
    const isOnline = st === 'online' || st === 'on' || (parsedD && (Date.now() - parsedD.getTime() < 12 * 3600 * 1000))
    const lastSeenFormatted = fmtDeviceDisplayTime(d)
    return {
      ...d,
      isSticker,
      path,
      isOnline,
      lastSeenFormatted,
    }
  })

  return (
    <Drawer open={open} onOpenChange={isOpen => { if (!isOpen) onClose() }} swipeDirection="right">
      <DrawerContent style={{ background: '#141414', borderLeft: '1px solid rgba(255,255,255,0.10)' }}>
        <DrawerHeader style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                background: '#A72C32', border: '1.5px solid #C44E54',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, color: '#FFFFFF',
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <DrawerTitle style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user.name || contact || 'User Details'}
                  </span>
                </DrawerTitle>
                <DrawerDescription style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{contact}</span>
                  <span>·</span>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
                </DrawerDescription>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                background: online ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${online ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.12)'}`,
                color: online ? '#34d399' : 'rgba(255,255,255,0.40)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: online ? '#10b981' : '#6b7280' }} />
                {online ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {devices.length === 0 ? (
            <div style={{
              padding: '40px 20px', textAlign: 'center', background: 'rgba(255,255,255,0.02)',
              borderRadius: 12, border: '1px dashed rgba(255,255,255,0.10)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <Smartphone style={{ width: 32, height: 32, color: 'rgba(255,255,255,0.18)' }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)' }}>No devices assigned to this user</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {enrichedDevices.map(d => {
                const DevIcon = d.isSticker ? Tag : Radio
                return (
                  <div
                    key={d.sn}
                    onClick={() => pushTrail(d.path)}
                    style={{
                      background: '#1d1d1d',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: 10,
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#252525'
                      e.currentTarget.style.borderColor = 'rgba(167,44,50,0.45)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#1d1d1d'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(167,44,50,0.12)', border: '1px solid rgba(167,44,50,0.25)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <DevIcon style={{ width: 15, height: 15, color: '#C44E54' }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.name || d.assigned_user_name || d.sn}
                          </div>
                          <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                            {d.sn} {d.client ? `· ${d.client}` : ''}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span style={{
                        padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: d.isOnline ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${d.isOnline ? 'rgba(16,185,129,0.30)' : 'rgba(255,255,255,0.10)'}`,
                        color: d.isOnline ? '#34d399' : 'rgba(255,255,255,0.40)',
                        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: d.isOnline ? '#10b981' : '#6b7280' }} />
                        {d.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                      <span>Last report: <strong style={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{d.lastSeenFormatted}</strong></span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              onClose?.()
                              onUnbindDevice(d)
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                              background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.25)',
                              color: '#f87171', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.20)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.40)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.10)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.25)'; }}
                          >
                            <Trash2 style={{ width: 11, height: 11 }} /> Unbind
                          </button>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#60a5fa', fontWeight: 600, fontSize: 11 }}>
                          <span>Track</span>
                          <ChevronRight style={{ width: 12, height: 12 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DrawerBody>

        <DrawerFooter style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '14px 24px', display: 'flex', justifyContent: 'flex-end' }}>
          <DrawerClose />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/* ── User row ─────────────────────────────────────────────────────────────── */
function UserRow({
  u, idx, isAdmin, onDelete, onEdit, onAddDevice, onTogglePermission,
  permLoading, onOpenDevices, boundDevices, isLight,
}) {
  const [hov, setHov] = useState(false)
  const contact = displayContact(u)
  const initials = (u.name || contact || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  const txt1    = isLight ? '#111111'              : '#FFFFFF'
  const txt2    = isLight ? '#555555'              : 'rgba(255,255,255,0.55)'
  const txt3    = isLight ? '#888888'              : 'rgba(255,255,255,0.38)'
  const txt4    = isLight ? 'rgba(0,0,0,0.38)'    : 'rgba(255,255,255,0.28)'
  const rowHov  = isLight ? 'rgba(167,44,50,0.03)' : 'rgba(255,255,255,0.03)'
  const rowAlt  = isLight ? 'rgba(0,0,0,0.02)'    : 'rgba(255,255,255,0.015)'
  const rowBdr  = isLight ? 'rgba(0,0,0,0.07)'    : 'rgba(255,255,255,0.04)'

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? rowHov : idx % 2 === 0 ? 'transparent' : rowAlt,
        transition: 'background 0.12s',
        borderBottom: `1px solid ${rowBdr}`,
        cursor: 'pointer',
      }}
      onClick={() => onOpenDevices(u)}
    >
      {/* Name + avatar */}
      <td style={{ padding: '0.92em 1.15em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
          <div style={{
            width: '2.4em', height: '2.4em', borderRadius: '50%', flexShrink: 0,
            background: '#A72C32', border: '1px solid #8B2328',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8em', fontWeight: 700, color: '#FFFFFF',
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: '0.92em', fontWeight: 600, color: txt1 }}>{u.name || '—'}</div>
            <div style={{ fontSize: '0.7em', color: txt4, fontFamily: 'var(--font-mono)' }}>
              {String(u._id || u.id || '').slice(-10)}
            </div>
          </div>
        </div>
      </td>

      {/* Email */}
      <td style={{ padding: '0.92em 1.15em' }}>
        <span style={{ fontSize: '0.85em', color: txt2, fontFamily: 'var(--font-mono)' }}>
          {contact || '—'}
        </span>
      </td>

      {/* Role */}
      <td style={{ padding: '0.92em 1.15em' }}>
        <RoleBadge role={u.role} isLight={isLight} />
      </td>

      {/* Last Logged In — Online badge while logged in; elapsed time after */}
      <td style={{ padding: '0.92em 1.15em' }}>
        {isUserOnline(u) ? (
          <span className="badge badge-teal-500 text-uppercase tracking-wider">
            Online
          </span>
        ) : (
          <span style={{ fontSize: '0.8em', color: txt3, fontFamily: 'var(--font-mono)' }}>
            {(u.last_logged_in || u.last_login || lastActiveStamp(u))
              ? fmtRelTime(u.last_logged_in || u.last_login || lastActiveStamp(u))
              : <span style={{ color: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.20)' }}>Never</span>}
          </span>
        )}
      </td>

      {/* Devices */}
      <td style={{ padding: '0.92em 1.15em' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onOpenDevices(u); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
            background: boundDevices.length > 0 ? 'rgba(59,130,246,0.12)' : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'),
            border: `1px solid ${boundDevices.length > 0 ? 'rgba(59,130,246,0.30)' : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)')}`,
            color: boundDevices.length > 0 ? '#60a5fa' : txt4,
            fontSize: '0.85em', fontWeight: boundDevices.length > 0 ? 600 : 400,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (boundDevices.length > 0) {
              e.currentTarget.style.background = 'rgba(59,130,246,0.22)'
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.50)'
            }
          }}
          onMouseLeave={e => {
            if (boundDevices.length > 0) {
              e.currentTarget.style.background = 'rgba(59,130,246,0.12)'
              e.currentTarget.style.borderColor = 'rgba(59,130,246,0.30)'
            }
          }}
          title="Click to view assigned devices slider"
        >
          <Smartphone style={{ width: 12, height: 12 }} />
          <span>{boundDevices.length} device{boundDevices.length !== 1 ? 's' : ''}</span>
        </button>
      </td>

      {/* Actions */}
      <td style={{ padding: '0.92em 1.15em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.57em' }} onClick={e => e.stopPropagation()}>
          {isAdmin && (
            <PermissionsDropdown
              u={u}
              isLight={isLight}
              onTogglePermission={onTogglePermission}
              permLoading={permLoading}
            />
          )}
          {isAdmin && (
            <button
              onClick={() => onEdit(u)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.28em',
                padding: '0.28em 0.7em', borderRadius: '0.5em', cursor: 'pointer',
                background: 'rgba(167,44,50,0.10)', border: '1px solid rgba(167,44,50,0.25)',
                color: '#C44E54', fontSize: '0.8em', fontWeight: 600, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.18)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.40)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.10)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.25)' }}
            >
              <Pencil style={{ width: '0.8em', height: '0.8em' }} /> Edit
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => onAddDevice(u)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.28em',
                padding: '0.28em 0.7em', borderRadius: '0.5em', cursor: 'pointer',
                background: isLight ? 'rgba(37,99,235,0.07)' : 'rgba(59,130,246,0.10)',
                border: `1px solid ${isLight ? 'rgba(37,99,235,0.20)' : 'rgba(59,130,246,0.25)'}`,
                color: isLight ? '#1D4ED8' : '#60A5FA', fontSize: '0.8em', fontWeight: 600, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(37,99,235,0.13)' : 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = isLight ? 'rgba(37,99,235,0.35)' : 'rgba(59,130,246,0.40)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isLight ? 'rgba(37,99,235,0.07)' : 'rgba(59,130,246,0.10)'; e.currentTarget.style.borderColor = isLight ? 'rgba(37,99,235,0.20)' : 'rgba(59,130,246,0.25)' }}
            >
              <Link2 style={{ width: '0.8em', height: '0.8em' }} /> Add Device
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => onDelete(u)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.28em',
                padding: '0.28em 0.7em', borderRadius: '0.5em', cursor: 'pointer',
                background: isLight ? 'rgba(220,38,38,0.06)' : 'rgba(220,38,38,0.08)',
                border: `1px solid ${isLight ? 'rgba(220,38,38,0.18)' : 'rgba(220,38,38,0.20)'}`,
                color: isLight ? '#B91C1C' : '#f87171', fontSize: '0.8em', fontWeight: 600, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.16)'; e.currentTarget.style.borderColor = isLight ? 'rgba(220,38,38,0.30)' : 'rgba(220,38,38,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isLight ? 'rgba(220,38,38,0.06)' : 'rgba(220,38,38,0.08)'; e.currentTarget.style.borderColor = isLight ? 'rgba(220,38,38,0.18)' : 'rgba(220,38,38,0.20)' }}
            >
              <Trash2 style={{ width: '0.8em', height: '0.8em' }} /> Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export default function UsersPage() {
  const pushTrail = useTrailNav()
  const { users, loading, error, refresh, silentRefresh, lastFetched } = useUserCache()
  const { isAdmin } = useAuth()
  const { devices, refresh: refreshDevices, silentRefresh: silentRefreshDevices } = useDeviceCache()

  useEffect(() => {
    const id = setInterval(async () => {
      // Sequential (users → devices) to avoid a double request spike / lag.
      await silentRefresh()
      await silentRefreshDevices()
    }, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [silentRefresh, silentRefreshDevices])
  const { adminCreateUser, adminDeleteUser, adminUpdateUser, unbindDevice, adminAssignDeviceToUser } = useCityTag()
  const [addDeviceTarget, setAddDeviceTarget] = useState(null)
  const unboundDevices = useMemo(() => devices.filter(d => !(d.user_id || d.assigned_user_name)), [devices])

  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  /* ── Theme tokens ──────────────────────────────────────────────────────── */
  const panelStyle = isLight ? {
    border: '1.5px solid transparent',
    background: 'linear-gradient(145deg, #FFFFFF 0%, #FAFAFA 100%) padding-box, linear-gradient(135deg, rgba(167,44,50,0.28) 0%, rgba(255,255,255,0) 55%) border-box',
    borderRadius: 16,
    boxShadow: '0 4px 30px rgba(167,44,50,0.07)',
  } : {
    background: 'linear-gradient(157deg, rgba(32,31,31,0.55) 0%, rgba(26,25,25,0.50) 58%, rgba(21,20,20,0.45) 100%)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
  }

  const modalPanelStyle = isLight ? {
    border: '1.5px solid transparent',
    background: 'linear-gradient(145deg, #FFFFFF 0%, #FAFAFA 100%) padding-box, linear-gradient(135deg, rgba(167,44,50,0.30) 0%, rgba(255,255,255,0) 55%) border-box',
    borderRadius: 16,
    boxShadow: '0 24px 64px rgba(167,44,50,0.12)',
  } : {
    background: '#000000',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
  }

  const overlayStyle = {
    position: 'fixed', inset: 0,
    background: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    zIndex: 9999, padding: 24, overflowY: 'auto',
  }

  const inputSt = {
    width: '100%', boxSizing: 'border-box',
    padding: '10px 12px',
    background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    border: isLight ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: isLight ? '#111111' : '#f4f4f5', fontSize: 13,
    outline: 'none',
  }

  const T = {
    txt1:      isLight ? '#111111'           : '#FFFFFF',
    txt2:      isLight ? '#555555'           : 'rgba(255,255,255,0.65)',
    txt3:      isLight ? '#888888'           : 'rgba(255,255,255,0.38)',
    txt4:      isLight ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.22)',
    lblColor:  isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.58)',
    bdrLight:  isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.07)',
    theadBg:   isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.22)',
    theadBdr:  isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)',
    theadTxt:  isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)',
    searchBg:  isLight ? '#EFEFEF'          : '#18181b',
    searchBdr: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)',
    pageBdr:   isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
    pageTxt:   isLight ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.45)',
    paginBdr:  isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)',
    errBg:     isLight ? 'rgba(127,29,29,0.07)'  : 'rgba(127,29,29,0.20)',
    errBdr:    isLight ? 'rgba(127,29,29,0.20)'  : 'rgba(127,29,29,0.40)',
    errTxt:    isLight ? '#991b1b'          : '#fca5a5',
    dlgBg:     isLight ? '#FFFFFF'          : '#000000',
    dlgBdr:    isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)',
    dlgTxt1:   isLight ? '#111111'          : '#FFFFFF',
    dlgTxt2:   isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.52)',
    cancelBg:  isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
    cancelBdr: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.10)',
    cancelTxt: isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.68)',
  }

  const muiTheme = useMemo(() => createTheme({
    palette: {
      mode: isLight ? 'light' : 'dark',
      primary: { main: '#A72C32', contrastText: '#FFFFFF' },
    },
  }), [isLight])

  const savedUsersView = useRef(loadUsersView()).current
  const [query,      setQuery]      = useState(savedUsersView?.q || '')
  const [debouncedQ, setDQ]         = useState((savedUsersView?.q || '').trim().toLowerCase())
  const [page,       setPage]       = useState(savedUsersView?.page || 1)
  const [drawerUser, setDrawerUser] = useState(null)
  const PAGE_SIZE   = 6
  const debounceRef = useRef(null)
  const tableContainerRef = useRef(null)

  // Search-history dropdown (recent user searches, separate from the Devices
  // page). Recorded on Enter / on pick; the store is wiped on logout.
  const { history, record: recordSearch, remove: removeSearch, clearAll: clearSearchHistory } =
    useSearchHistory(APP_CACHE_STORAGE_KEYS.SEARCH_HISTORY_USERS)
  const [histOpen, setHistOpen] = useState(false)
  const searchWrapRef = useRef(null)

  // Close the history dropdown on any click outside the search box.
  useEffect(() => {
    if (!histOpen) return
    const onDocMouseDown = e => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setHistOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [histOpen])

  // Persist the list view (search query & page only)
  useEffect(() => {
    saveUsersView({ q: query, page })
  }, [query, page])

  /* Create User state */
  const [showCreate,    setShowCreate]    = useState(false)
  const [newIdentifier, setNewIdentifier] = useState('')
  const [newName,       setNewName]       = useState('')
  const [newPassword,   setNewPassword]   = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError,   setCreateError]   = useState('')

  /* Delete User state */
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  /* Edit User state */
  const [editTarget,               setEditTarget]               = useState(null)
  const [editName,                 setEditName]                 = useState('')
  const [editPassword,             setEditPassword]             = useState('')
  const [editDashboardAccess,      setEditDashboardAccess]      = useState(true)
  const [editGeofenceAccess,       setEditGeofenceAccess]       = useState(false)
  const [editGeofenceCreateAccess, setEditGeofenceCreateAccess] = useState(false)
  const [editLoading,              setEditLoading]              = useState(false)
  const [editError,                setEditError]                = useState('')

  /* Permissions per-row loading state map: { `${uid}_${permKey}`: true } */
  const [permLoading, setPermLoading] = useState({})

  /* Unbind Device state */
  const [unbindTarget,  setUnbindTarget]  = useState(null)
  const [unbindLoading, setUnbindLoading] = useState(false)

  const handleSearch = useCallback((val) => {
    setQuery(val)
    setPage(1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDQ(val.trim().toLowerCase()), 300)
  }, [])

  /* Build userId → bound devices map */
  const devicesByUser = useMemo(() => {
    const map = {}
    ;(devices || []).forEach(d => {
      const uid = String(d.user_id || d.assigned_user_id || '')
      if (!uid) return
      if (!map[uid]) map[uid] = []
      map[uid].push(d)
    })
    return map
  }, [devices])

  /* Build device SN → full device object map */
  const deviceBySn = useMemo(() => {
    const map = {}
    ;(devices || []).forEach(d => {
      const sn = String(d.sn || d.local_id || '')
      if (sn) map[sn] = d
    })
    return map
  }, [devices])

  /* Helper to resolve all rich device objects belonging to a user */
  const resolveUserDevices = useCallback((u) => {
    if (!u) return []
    const uid = String(u._id || u.id || '')
    const fromUserId = devicesByUser[uid] || []
    const userDevs = Array.isArray(u.devices) ? u.devices : []
    const fromUserDoc = userDevs.map(d => {
      const sn = String(typeof d === 'object' && d !== null ? (d.sn || d.local_id || '') : d)
      return deviceBySn[sn] || (typeof d === 'object' && d !== null ? d : { sn })
    }).filter(Boolean)

    const map = new Map()
    fromUserId.forEach(d => {
      const sn = String(d.sn || d.local_id || '')
      if (sn) map.set(sn, d)
    })
    fromUserDoc.forEach(d => {
      const sn = String(d.sn || d.local_id || '')
      if (sn) {
        const cached = deviceBySn[sn]
        map.set(sn, cached ? { ...d, ...cached } : d)
      }
    })
    return Array.from(map.values())
  }, [devicesByUser, deviceBySn])

  // Priority order:
  // 1. Active Today / Online users with assigned devices (most recent activity & active devices first)
  // 2. Active Today / Online users without assigned devices (most recent activity first)
  // 3. Other users with assigned devices (most recent activity first)
  // 4. Other users without assigned devices (most recent activity first)
  const filtered = useMemo(() => {
    const q = debouncedQ
    const list = users.filter(u => {
      if (!q) return true
      return u.name?.toLowerCase().includes(q) || displayContact(u).toLowerCase().includes(q)
    })

    return list.sort((a, b) => {
      const boundA = resolveUserDevices(a)
      const boundB = resolveUserDevices(b)

      const isDevActive = (d) => {
        const st = String(d.status || d.deviceStatus || '').toLowerCase()
        const rawTs = d.dataRetrievalTime ?? d.last_seen ?? d.lastSeen ?? d.last_report ?? d.lastReport ?? d.timestamp ?? null
        const parsedD = parseDeviceTs(rawTs)
        return st === 'online' || st === 'on' || (parsedD && (Date.now() - parsedD.getTime() < 12 * 3600 * 1000))
      }

      const activeDevsA = boundA.filter(isDevActive).length
      const activeDevsB = boundB.filter(isDevActive).length

      const onlineA = isUserOnline(a)
      const onlineB = isUserOnline(b)

      const tsA = a.last_logged_in || a.last_login
      const tsB = b.last_logged_in || b.last_login
      const loginA = parseTs(tsA)
      const loginB = parseTs(tsB)

      const activeTodayA = (loginA > 0 && (Date.now() - loginA < 86_400_000)) || onlineA
      const activeTodayB = (loginB > 0 && (Date.now() - loginB < 86_400_000)) || onlineB

      const hasDevsA = boundA.length > 0
      const hasDevsB = boundB.length > 0

      // Tier 1: Active Today with assigned devices
      const t1A = activeTodayA && hasDevsA
      const t1B = activeTodayB && hasDevsB
      if (t1A !== t1B) return t1B ? 1 : -1
      if (t1A && t1B) {
        if (onlineA !== onlineB) return onlineB ? 1 : -1
        if (activeDevsB !== activeDevsA) return activeDevsB - activeDevsA
        const actDiff = lastActiveTs(b) - lastActiveTs(a)
        if (actDiff !== 0) return actDiff
      }

      // Tier 2: Active Today without assigned devices
      const t2A = activeTodayA && !hasDevsA
      const t2B = activeTodayB && !hasDevsB
      if (t2A !== t2B) return t2B ? 1 : -1
      if (t2A && t2B) {
        if (onlineA !== onlineB) return onlineB ? 1 : -1
        const actDiff = lastActiveTs(b) - lastActiveTs(a)
        if (actDiff !== 0) return actDiff
      }

      // Tier 3: Inactive users with assigned devices
      const t3A = !activeTodayA && hasDevsA
      const t3B = !activeTodayB && hasDevsB
      if (t3A !== t3B) return t3B ? 1 : -1
      if (t3A && t3B) {
        if (activeDevsB !== activeDevsA) return activeDevsB - activeDevsA
        const actDiff = lastActiveTs(b) - lastActiveTs(a)
        if (actDiff !== 0) return actDiff
      }

      // Tier 4: Inactive users without assigned devices
      return lastActiveTs(b) - lastActiveTs(a)
    })
  }, [users, debouncedQ, devicesByUser])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Accordion behavior: only one row expanded at a time
  const toggleExpand = useCallback((userId) => {
    setExpanded(prev => (prev.has(userId) ? new Set() : new Set([userId])))
  }, [])

  /* ── Toggle user permissions (Dashboard / Fence Access / Fence Create) ──── */
  const handleTogglePermission = useCallback(async (u, permKey) => {
    const uid = String(u._id || u.id || '')
    if (!uid) return
    const loadingKey = `${uid}_${permKey}`
    setPermLoading(prev => ({ ...prev, [loadingKey]: true }))
    try {
      const currentVal = permKey === 'dashboard_access' ? (u.dashboard_access !== false) : Boolean(u[permKey])
      const nextVal = !currentVal
      await adminUpdateUser(uid, { [permKey]: nextVal })
      await silentRefresh()
    } catch (err) {
      console.error(`Failed to toggle ${permKey}:`, err)
    } finally {
      setPermLoading(prev => {
        const next = { ...prev }
        delete next[loadingKey]
        return next
      })
    }
  }, [adminUpdateUser, silentRefresh])

  /* ── Create user ────────────────────────────────────────────────────────── */
  const openCreate  = () => { setNewIdentifier(''); setNewName(''); setNewPassword(''); setCreateError(''); setShowCreate(true) }
  const closeCreate = () => setShowCreate(false)

  const handleCreate = async () => {
    if (!newIdentifier.trim() || !newPassword.trim() || !newName.trim()) {
      setCreateError('Email or phone, name and password are all required')
      return
    }
    if (!isValidIdentifier(newIdentifier)) {
      setCreateError('Enter a valid email or Pakistani number (03XXXXXXXXX or +92XXXXXXXXX)')
      return
    }
    setCreateError(''); setCreateLoading(true)
    try {
      await adminCreateUser({ identifier: newIdentifier.trim(), password: newPassword.trim(), name: newName.trim() })
      refresh()
      closeCreate()
    } catch (err) {
      setCreateError(err.message || 'Failed to create user')
    } finally {
      setCreateLoading(false)
    }
  }

  /* ── Delete user ────────────────────────────────────────────────────────── */
  const handleDeleteUser = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await adminDeleteUser(deleteTarget._id || deleteTarget.id)
      refresh()
      setDeleteTarget(null)
    } catch {}
    finally { setDeleteLoading(false) }
  }

  /* ── Edit user ──────────────────────────────────────────────────────────── */
  const openEdit  = (u) => {
    setEditTarget(u)
    setEditName(u.name || '')
    setEditPassword('')
    setEditDashboardAccess(u.dashboard_access !== false)
    setEditGeofenceAccess(Boolean(u.geofence_access))
    setEditGeofenceCreateAccess(Boolean(u.geofence_create_access))
    setEditError('')
  }
  const closeEdit = () => { if (!editLoading) setEditTarget(null) }

  const handleEditUser = async () => {
    if (!editTarget) return
    if (!editName.trim()) { setEditError('Name is required'); return }
    setEditError(''); setEditLoading(true)
    try {
      const uid = editTarget._id || editTarget.id
      const payload = {
        name: editName.trim(),
        dashboard_access: editDashboardAccess,
        geofence_access: editGeofenceAccess,
        geofence_create_access: editGeofenceCreateAccess,
      }
      if (editPassword.trim()) payload.password = editPassword.trim()
      await adminUpdateUser(uid, payload)
      refresh()
      setEditTarget(null)
    } catch (err) {
      setEditError(err.message || 'Failed to update user')
    } finally { setEditLoading(false) }
  }

  /* ── Unbind device ──────────────────────────────────────────────────────── */
  const handleUnbindDevice = async () => {
    if (!unbindTarget) return
    setUnbindLoading(true)
    try {
      await unbindDevice(unbindTarget.sn)
      refresh()
      refreshDevices()
      setUnbindTarget(null)
    } catch {}
    finally { setUnbindLoading(false) }
  }

  /* ── Admin gate ─────────────────────────────────────────────────────────── */
  if (!isAdmin) {
    return (
      <div style={{ ...panelStyle, padding: '64px 20px', textAlign: 'center' }}>
        <Shield style={{ width: 42, height: 42, color: '#A72C32', margin: '0 auto 14px' }} />
        <p style={{ fontSize: 15, fontWeight: 700, color: T.txt1, margin: '0 0 8px' }}>Admin access required</p>
        <p style={{ fontSize: 12, color: T.txt3, margin: 0 }}>Only admins can view the user list.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txt1, letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserCog style={{ width: 22, height: 22, color: '#C44E54', flexShrink: 0 }} />
            Users
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ActiveAvatarStack users={users} isLight={isLight} />
          {users.length > 0 && <div style={{ width: 1, height: 36, background: T.bdrLight, flexShrink: 0 }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastFetched && (
              <span style={{ fontSize: 10, color: T.txt4, fontFamily: 'var(--font-mono)' }}>
                Updated {fmtRelTime(lastFetched)}
              </span>
            )}

            <button
              onClick={openCreate}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px',
                background: 'linear-gradient(135deg, #BF3840 0%, #8B2328 100%)',
                border: '1px solid rgba(167,44,50,0.45)',
                borderRadius: 10, color: '#FFFFFF', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 4px 14px rgba(167,44,50,0.28)', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 28px rgba(167,44,50,0.50)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(167,44,50,0.28)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <Plus style={{ width: 13, height: 13 }} />
              Create User
            </button>
          </div>
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div ref={searchWrapRef} style={{ position: 'relative', flex: '0 0 260px' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3, pointerEvents: 'none' }} />
          <input
            type="text"
            name="users-table-search"
            autoComplete="off"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { setHistOpen(false) }
              else if (e.key === 'Escape') setHistOpen(false)
            }}
            placeholder="Search by name or email…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 32, paddingRight: query ? 30 : 12, paddingTop: 8, paddingBottom: 8,
              background: T.searchBg, border: `1px solid ${T.searchBdr}`,
              borderRadius: 10, color: T.txt1, fontSize: 12, outline: 'none',
            }}
            onFocus={e => { setHistOpen(true); e.target.style.borderColor = 'rgba(167,44,50,0.50)' }}
            onBlur={e  => { e.target.style.borderColor = T.searchBdr }}
          />
          {query && (
            <button onClick={() => handleSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 2, display: 'flex', alignItems: 'center' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
          {histOpen && (
            <SearchHistoryDropdown
              items={history}
              query={query}
              onPick={term => { handleSearch(term); recordSearch(term); setHistOpen(false) }}
              onRemove={removeSearch}
              onClearAll={() => { clearSearchHistory(); setHistOpen(false) }}
              isLight={isLight}
            />
          )}
        </div>
        <span style={{ fontSize: 11, color: T.txt4, marginLeft: 'auto' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {error ? (
        <div style={{ ...panelStyle, padding: '32px 20px', textAlign: 'center', color: T.errTxt, fontSize: 13 }}>
          {error}
        </div>
      ) : loading && users.length === 0 ? (
        <TPLLoader label="Loading users…" />
      ) : (
        <div ref={tableContainerRef} style={{ ...panelStyle, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="scalable-container" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.theadBdr}`, background: T.theadBg }}>
                  {['User', 'Email', 'Role', 'Last Logged In', 'Devices', 'Actions'].map(col => (
                    <th key={col} style={{ padding: '0.85em 1.15em', textAlign: 'left', fontSize: '0.65em', fontWeight: 700, color: T.theadTxt, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: T.txt3, fontSize: 13 }}>
                      {debouncedQ ? `No users matching "${debouncedQ}"` : 'No users found'}
                    </td>
                  </tr>
                ) : (
                  paged.map((u, i) => {
                    const uid = String(u._id || u.id || '')
                    const bound = resolveUserDevices(u)
                    return (
                      <UserRow
                        key={uid || i}
                        u={u} idx={i} isAdmin={isAdmin}
                        onDelete={setDeleteTarget} onEdit={openEdit}
                        onAddDevice={setAddDeviceTarget}
                        onTogglePermission={handleTogglePermission}
                        permLoading={permLoading}
                        onOpenDevices={(user) => { recordSearch(query); setDrawerUser(user) }}
                        boundDevices={bound} isLight={isLight}
                      />
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: `1px solid ${T.paginBdr}` }}>
              <span style={{ fontSize: 11, color: T.txt4 }}>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <ThemeProvider theme={muiTheme}>
                <Stack>
                  <Pagination
                    count={totalPages}
                    page={safePage}
                    onChange={(_, p) => {
                      setPage(p)
                    }}
                    color="primary"
                    shape="rounded"
                    size="medium"
                    sx={{
                      '& .MuiPaginationItem-root': {
                        fontFamily: 'inherit',
                        fontSize: 13,
                        fontWeight: 600,
                        color: isLight ? '#000000' : 'rgba(255,255,255,0.70)',
                        border: 'none',
                        '&:hover': {
                          background: isLight ? 'rgba(167,44,50,0.08)' : 'rgba(255,255,255,0.08)',
                        },
                        '&.Mui-selected': {
                          background: isLight ? '#A72C32' : '#3d3d3d',
                          color: '#ffffff',
                          fontWeight: 700,
                          border: 'none',
                          '&:hover': {
                            background: isLight ? '#8B2328' : '#4a4a4a',
                          },
                        },
                        '&.MuiPaginationItem-ellipsis': {
                          color: isLight ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.30)',
                        },
                      },
                    }}
                  />
                </Stack>
              </ThemeProvider>
            </div>
          )}
        </div>
      )}

      {/* ── Create User Modal ──────────────────────────────────────────────── */}
      {showCreate && (
        <ModalPortal>
          <div onClick={closeCreate} style={overlayStyle}>
            <div onClick={e => e.stopPropagation()} style={{ ...modalPanelStyle, width: '100%', maxWidth: 440, margin: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${T.bdrLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ padding: 7, background: 'rgba(167,44,50,0.14)', borderRadius: 8, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
                    <Plus style={{ width: 14, height: 14, color: '#C86068' }} />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.dlgTxt1 }}>Create User</span>
                </div>
                <button onClick={closeCreate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 4, display: 'flex', borderRadius: 6 }}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {createError && (
                  <div style={{ padding: '8px 12px', background: T.errBg, border: `1px solid ${T.errBdr}`, borderRadius: 6, color: T.errTxt, fontSize: 12 }}>
                    {createError}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>Full Name <span style={{ color: '#C86068' }}>*</span></label>
                  <input type="text" placeholder="e.g. Ahmed Khan" name="cu-fullname" autoComplete="off"
                    value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} autoFocus style={inputSt} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>Email or Phone Number <span style={{ color: '#C86068' }}>*</span></label>
                  <input type="text" placeholder="Email or phone number"
                    value={newIdentifier} onChange={e => setNewIdentifier(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} style={inputSt} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>Password <span style={{ color: '#C86068' }}>*</span></label>
                  <input type="password" placeholder="Minimum 8 characters" name="cu-password" autoComplete="new-password"
                    value={newPassword} onChange={e => setNewPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} style={inputSt} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: `1px solid ${T.bdrLight}` }}>
                <button onClick={closeCreate} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: T.cancelBg, border: `1px solid ${T.cancelBdr}`, color: T.cancelTxt }}>Cancel</button>
                <button onClick={handleCreate} disabled={createLoading || !newIdentifier.trim() || !newName.trim() || !newPassword.trim()}
                  style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (createLoading || !newIdentifier.trim() || !newName.trim() || !newPassword.trim()) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)', border: '1px solid rgba(167,44,50,0.40)', color: '#fff', opacity: (createLoading || !newIdentifier.trim() || !newName.trim() || !newPassword.trim()) ? 0.50 : 1, transition: 'opacity 0.15s' }}>
                  {createLoading ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── Edit User Modal ──────────────────────────────────────────────────── */}
      {editTarget && (
        <ModalPortal>
          <div onClick={closeEdit} style={overlayStyle}>
            <div onClick={e => e.stopPropagation()} style={{ ...modalPanelStyle, width: '100%', maxWidth: 440, margin: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: `1px solid ${T.bdrLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ padding: 7, background: 'rgba(167,44,50,0.14)', borderRadius: 8, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
                    <Pencil style={{ width: 14, height: 14, color: '#C86068' }} />
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 700, color: T.dlgTxt1 }}>Edit User</span>
                </div>
                <button onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 4, display: 'flex', borderRadius: 6 }}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>
              <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {editError && (
                  <div style={{ padding: '8px 12px', background: T.errBg, border: `1px solid ${T.errBdr}`, borderRadius: 6, color: T.errTxt, fontSize: 12 }}>
                    {editError}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>Email</label>
                  <input type="email" value={editTarget.email || ''} disabled style={{ ...inputSt, opacity: 0.55, cursor: 'not-allowed' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>Full Name <span style={{ color: '#C86068' }}>*</span></label>
                  <input type="text" placeholder="e.g. Ahmed Khan" name="eu-fullname" autoComplete="off"
                    value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditUser()} autoFocus style={inputSt} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>
                    New Password <span style={{ fontWeight: 400, color: T.txt4 }}>(leave blank to keep current)</span>
                  </label>
                  <input type="password" placeholder="Minimum 8 characters" name="eu-password" autoComplete="new-password"
                    value={editPassword} onChange={e => setEditPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditUser()} style={inputSt} />
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${T.bdrLight}`,
                  borderRadius: 8,
                  marginBottom: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.dlgTxt1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LayoutDashboard style={{ width: 14, height: 14, color: '#C86068' }} />
                      Dashboard Access
                    </div>
                    <div style={{ fontSize: 11, color: T.txt4, marginTop: 2 }}>
                      Allow this user to access the Overview Dashboard and metrics
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                    <input
                      type="checkbox"
                      checked={editDashboardAccess}
                      onChange={e => setEditDashboardAccess(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#A72C32' }}
                    />
                  </label>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${T.bdrLight}`,
                  borderRadius: 8,
                  marginBottom: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.dlgTxt1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Shield style={{ width: 14, height: 14, color: '#C86068' }} />
                      Geofence Access
                    </div>
                    <div style={{ fontSize: 11, color: T.txt4, marginTop: 2 }}>
                      Allow this user to view their geofence map and events
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                    <input
                      type="checkbox"
                      checked={editGeofenceAccess}
                      onChange={e => setEditGeofenceAccess(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#A72C32' }}
                    />
                  </label>
                </div>

                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${T.bdrLight}`,
                  borderRadius: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.dlgTxt1, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PlusCircle style={{ width: 14, height: 14, color: '#C86068' }} />
                      Create Fence Access
                    </div>
                    <div style={{ fontSize: 11, color: T.txt4, marginTop: 2 }}>
                      Allow this user to create, edit, and delete geofences
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}>
                    <input
                      type="checkbox"
                      checked={editGeofenceCreateAccess}
                      onChange={e => setEditGeofenceCreateAccess(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#A72C32' }}
                    />
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: `1px solid ${T.bdrLight}` }}>
                <button onClick={closeEdit} disabled={editLoading} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: T.cancelBg, border: `1px solid ${T.cancelBdr}`, color: T.cancelTxt }}>Cancel</button>
                <button onClick={handleEditUser} disabled={editLoading || !editName.trim()}
                  style={{ padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (editLoading || !editName.trim()) ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)', border: '1px solid rgba(167,44,50,0.40)', color: '#fff', opacity: (editLoading || !editName.trim()) ? 0.50 : 1, transition: 'opacity 0.15s' }}>
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* ── Delete User Confirm ─────────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          onClick={() => !deleteLoading && setDeleteTarget(null)}
          style={{ position: 'fixed', inset: 0, background: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.55)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ background: T.dlgBg, border: `1px solid ${T.dlgBdr}`, borderRadius: 16, width: '100%', maxWidth: 380, padding: 22, boxShadow: isLight ? '0 24px 64px rgba(167,44,50,0.12)' : '0 24px 64px rgba(0,0,0,0.72)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.dlgTxt1, marginBottom: 8 }}>Delete User</div>
            <div style={{ fontSize: 13, color: T.dlgTxt2, marginBottom: 20 }}>
              Permanently delete{' '}
              <span style={{ color: T.dlgTxt1, fontWeight: 600 }}>{deleteTarget.name || displayContact(deleteTarget)}</span>?{' '}
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleteTarget(null)} disabled={deleteLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: T.cancelBg, border: `1px solid ${T.cancelBdr}`, color: T.cancelTxt }}>Cancel</button>
              <button onClick={handleDeleteUser} disabled={deleteLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: deleteLoading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)', border: '1px solid rgba(127,29,29,0.40)', color: '#fca5a5', opacity: deleteLoading ? 0.55 : 1 }}>
                {deleteLoading ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unbind Device Confirm ───────────────────────────────────────────── */}
      {unbindTarget && (
        <div
          onClick={() => !unbindLoading && setUnbindTarget(null)}
          style={{ position: 'fixed', inset: 0, background: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.55)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ background: T.dlgBg, border: `1px solid ${T.dlgBdr}`, borderRadius: 16, width: '100%', maxWidth: 380, padding: 22, boxShadow: isLight ? '0 24px 64px rgba(167,44,50,0.12)' : '0 24px 64px rgba(0,0,0,0.72)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.dlgTxt1, marginBottom: 8 }}>Unbind Device</div>
            <div style={{ fontSize: 13, color: T.dlgTxt2, marginBottom: 20 }}>
              Remove binding for{' '}
              <span style={{ color: T.dlgTxt1, fontFamily: 'monospace' }}>{unbindTarget.sn}</span>
              {unbindTarget.assigned_user_name ? ` from ${unbindTarget.assigned_user_name}` : ''}?{' '}
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setUnbindTarget(null)} disabled={unbindLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: T.cancelBg, border: `1px solid ${T.cancelBdr}`, color: T.cancelTxt }}>Cancel</button>
              <button onClick={handleUnbindDevice} disabled={unbindLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: unbindLoading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)', border: '1px solid rgba(127,29,29,0.40)', color: '#fca5a5', opacity: unbindLoading ? 0.55 : 1 }}>
                {unbindLoading ? 'Removing…' : 'Unbind'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addDeviceTarget && (
        <AddDeviceToUserModal
          user={addDeviceTarget}
          devices={unboundDevices}
          onAssign={async (sns, opts) => {
            const userId = addDeviceTarget._id ?? addDeviceTarget.id
            const snList = Array.isArray(sns) ? sns : [sns]
            for (const sn of snList) {
              await adminAssignDeviceToUser(userId, sn, opts)
            }
            await silentRefresh()
            await silentRefreshDevices()
          }}
          onClose={() => setAddDeviceTarget(null)}
        />
      )}

      {/* ── User Assigned Devices Drawer (Slider) ───────────────────────── */}
      {drawerUser && (
        <UserDevicesDrawer
          user={drawerUser}
          devices={resolveUserDevices(drawerUser)}
          open={Boolean(drawerUser)}
          onClose={() => setDrawerUser(null)}
          isAdmin={isAdmin}
          onUnbindDevice={(d) => {
            setDrawerUser(null)
            setUnbindTarget(d)
          }}
          pushTrail={pushTrail}
          isLight={isLight}
        />
      )}
    </div>
  )
}
