import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import {
  Users, Search, X, RefreshCw, Shield, UserCog,
  Plus, Trash2, Radio, Tag, ChevronRight, ChevronDown, Pencil, Link2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import AddDeviceToUserModal from '../components/AddDeviceToUserModal.jsx'
import { displayContact, isValidIdentifier } from '../utils/userContact.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'
import ModalPortal from '../components/common/ModalPortal.jsx'

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtRelTime(ts) {
  if (!ts) return '—'
  try {
    const t = typeof ts === 'string' && !ts.includes('+') && !ts.endsWith('Z') ? ts + 'Z' : ts
    const diff = Date.now() - new Date(t).getTime()
    if (isNaN(diff) || diff < 0) return '—'
    if (diff < 60_000)           return 'Just now'
    if (diff < 3_600_000)        return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000)       return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 604_800_000)      return `${Math.floor(diff / 86_400_000)}d ago`
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
}

/* ── Active avatar stack ──────────────────────────────────────────────────── */
const AVATAR_COLORS = [
  { bg: 'rgba(167,44,50,0.28)',  color: '#E87178' },
  { bg: 'rgba(59,130,246,0.24)', color: '#60A5FA' },
  { bg: 'rgba(16,185,129,0.24)', color: '#34D399' },
  { bg: 'rgba(245,158,11,0.24)', color: '#FBBF24' },
  { bg: 'rgba(139,92,246,0.24)', color: '#A78BFA' },
  { bg: 'rgba(236,72,153,0.24)', color: '#F472B6' },
  { bg: 'rgba(14,165,233,0.24)', color: '#38BDF8' },
  { bg: 'rgba(234,179,8,0.24)',  color: '#EAB308' },
]

function ActiveAvatarStack({ users, isLight }) {
  const ringColor = isLight ? '#F1F1F1' : '#18181b'
  const active = users.filter(u => {
    const ts = u.last_logged_in || u.last_login
    return ts && Date.now() - new Date(ts).getTime() < 86_400_000
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
            background: isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)',
            border: `2.5px solid ${ringColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
            color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)',
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
function RoleBadge({ role }) {
  const r = (role || 'user').toLowerCase()
  const cfg = {
    admin:      { bg: 'rgba(167,44,50,0.12)',  color: '#C44E54', border: 'rgba(167,44,50,0.25)',  label: 'Admin' },
    superadmin: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.25)', label: 'Super Admin' },
    user:       { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)', label: 'User' },
    operator:   { bg: 'rgba(16,185,129,0.12)', color: '#34d399', border: 'rgba(16,185,129,0.25)', label: 'Operator' },
  }
  const c = cfg[r] || cfg.user
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
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
function DeviceCard({ device, navigate, isAdmin, onUnbind, isLight }) {
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
      onClick={() => navigate(path)}
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

/* ── User row ─────────────────────────────────────────────────────────────── */
function UserRow({ u, idx, isAdmin, onDelete, onEdit, onAddDevice, expanded, onToggle, boundDevices, navigate, onUnbindDevice, isLight }) {
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
    <>
      <tr
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          background: hov ? rowHov : idx % 2 === 0 ? 'transparent' : rowAlt,
          transition: 'background 0.12s',
          borderBottom: expanded ? 'none' : `1px solid ${rowBdr}`,
          cursor: 'pointer',
        }}
        onClick={onToggle}
      >
        {/* Name + avatar */}
        <td style={{ padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(167,44,50,0.15)', border: '1px solid rgba(167,44,50,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: '#C44E54',
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: txt1 }}>{u.name || '—'}</div>
              <div style={{ fontSize: 10, color: txt4, fontFamily: 'var(--font-mono)' }}>
                {String(u._id || u.id || '').slice(-10)}
              </div>
            </div>
          </div>
        </td>

        {/* Email */}
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: 12, color: txt2, fontFamily: 'var(--font-mono)' }}>
            {contact || '—'}
          </span>
        </td>

        {/* Role */}
        <td style={{ padding: '13px 16px' }}>
          <RoleBadge role={u.role} />
        </td>

        {/* Last active */}
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: 11, color: txt3, fontFamily: 'var(--font-mono)' }}>
            {(u.last_logged_in || u.last_login || u.lastLogin)
              ? fmtRelTime(u.last_logged_in || u.last_login || u.lastLogin)
              : <span style={{ color: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.20)' }}>Never</span>}
          </span>
        </td>

        {/* Devices */}
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: 12, color: boundDevices.length > 0 ? '#60a5fa' : txt4, fontWeight: boundDevices.length > 0 ? 600 : 400 }}>
            {boundDevices.length} device{boundDevices.length !== 1 ? 's' : ''}
          </span>
        </td>

        {/* Actions */}
        <td style={{ padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={onToggle}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: txt3, padding: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
            >
              {expanded
                ? <ChevronDown style={{ width: 13, height: 13 }} />
                : <ChevronRight style={{ width: 13, height: 13 }} />}
            </button>
            {isAdmin && (
              <button
                onClick={() => onEdit(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                  background: 'rgba(167,44,50,0.10)', border: '1px solid rgba(167,44,50,0.25)',
                  color: '#C44E54', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.18)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.40)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.10)'; e.currentTarget.style.borderColor = 'rgba(167,44,50,0.25)' }}
              >
                <Pencil style={{ width: 11, height: 11 }} /> Edit
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => onAddDevice(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                  background: isLight ? 'rgba(37,99,235,0.07)' : 'rgba(59,130,246,0.10)',
                  border: `1px solid ${isLight ? 'rgba(37,99,235,0.20)' : 'rgba(59,130,246,0.25)'}`,
                  color: isLight ? '#1D4ED8' : '#60A5FA', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(37,99,235,0.13)' : 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = isLight ? 'rgba(37,99,235,0.35)' : 'rgba(59,130,246,0.40)' }}
                onMouseLeave={e => { e.currentTarget.style.background = isLight ? 'rgba(37,99,235,0.07)' : 'rgba(59,130,246,0.10)'; e.currentTarget.style.borderColor = isLight ? 'rgba(37,99,235,0.20)' : 'rgba(59,130,246,0.25)' }}
              >
                <Link2 style={{ width: 11, height: 11 }} /> Add Device
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => onDelete(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                  background: isLight ? 'rgba(220,38,38,0.06)' : 'rgba(220,38,38,0.08)',
                  border: `1px solid ${isLight ? 'rgba(220,38,38,0.18)' : 'rgba(220,38,38,0.20)'}`,
                  color: isLight ? '#B91C1C' : '#f87171', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(220,38,38,0.12)' : 'rgba(220,38,38,0.16)'; e.currentTarget.style.borderColor = isLight ? 'rgba(220,38,38,0.30)' : 'rgba(220,38,38,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.background = isLight ? 'rgba(220,38,38,0.06)' : 'rgba(220,38,38,0.08)'; e.currentTarget.style.borderColor = isLight ? 'rgba(220,38,38,0.18)' : 'rgba(220,38,38,0.20)' }}
              >
                <Trash2 style={{ width: 11, height: 11 }} /> Delete
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Bound devices section */}
      {expanded && (
        <tr style={{ borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.04)'}` }}>
          <td colSpan={6} style={{ padding: '0 16px 16px', background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.015)') }}>
            {boundDevices.length === 0 ? (
              <div style={{ padding: '16px 0', fontSize: 12, color: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.28)', textAlign: 'center' }}>
                No devices bound to this user
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, paddingTop: 10 }}>
                {boundDevices.map(d => (
                  <DeviceCard key={d.sn} device={d} navigate={navigate} isAdmin={isAdmin} onUnbind={onUnbindDevice} isLight={isLight} />
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════════════════ */
export default function UsersPage() {
  const navigate = useNavigate()
  const { users, loading, error, refresh, silentRefresh, lastFetched } = useUserCache()
  const { isAdmin } = useAuth()
  const { devices, refresh: refreshDevices, silentRefresh: silentRefreshDevices } = useDeviceCache()

  useEffect(() => {
    const id = setInterval(() => { silentRefresh(); silentRefreshDevices() }, 60_000)
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
    background: '#242323',
    border: '1px solid rgba(255,255,255,0.07)',
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

  const [query,      setQuery]    = useState('')
  const [debouncedQ, setDQ]       = useState('')
  const [page,       setPage]     = useState(1)
  const [expanded,   setExpanded] = useState(new Set())
  const PAGE_SIZE   = 15
  const debounceRef = useRef(null)

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
  const [editTarget,   setEditTarget]   = useState(null)
  const [editName,     setEditName]     = useState('')
  const [editRole,     setEditRole]     = useState('user')
  const [editPassword, setEditPassword] = useState('')
  const [editLoading,  setEditLoading]  = useState(false)
  const [editError,    setEditError]    = useState('')

  /* Unbind Device state */
  const [unbindTarget,  setUnbindTarget]  = useState(null)
  const [unbindLoading, setUnbindLoading] = useState(false)

  const handleSearch = useCallback((val) => {
    setQuery(val)
    setPage(1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDQ(val.trim().toLowerCase()), 300)
  }, [])

  const filtered = useMemo(() => {
    const q = debouncedQ
    const list = users.filter(u => {
      if (!q) return true
      return u.name?.toLowerCase().includes(q) || displayContact(u).toLowerCase().includes(q)
    })
    return list.sort((a, b) => {
      const ta = new Date(a.last_logged_in || a.last_login || a.lastLogin || 0).getTime()
      const tb = new Date(b.last_logged_in || b.last_login || b.lastLogin || 0).getTime()
      return tb - ta
    })
  }, [users, debouncedQ])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  /* Build userId → bound devices map */
  const devicesByUser = useMemo(() => {
    const map = {}
    ;(devices || []).forEach(d => {
      const uid = d.user_id || d.assigned_user_id
      if (!uid) return
      if (!map[uid]) map[uid] = []
      map[uid].push(d)
    })
    return map
  }, [devices])

  const toggleExpand = useCallback((userId) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }, [])

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
  const openEdit  = (u) => { setEditTarget(u); setEditName(u.name || ''); setEditRole((u.role || 'user').toLowerCase()); setEditPassword(''); setEditError('') }
  const closeEdit = () => { if (!editLoading) setEditTarget(null) }

  const handleEditUser = async () => {
    if (!editTarget) return
    if (!editName.trim()) { setEditError('Name is required'); return }
    setEditError(''); setEditLoading(true)
    try {
      const uid = editTarget._id || editTarget.id
      const payload = { name: editName.trim(), role: editRole }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txt1, letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserCog style={{ width: 22, height: 22, color: '#C44E54', flexShrink: 0 }} />
            Users
          </h1>
          <p style={{ fontSize: 15, color: T.txt3, marginTop: 5, marginBottom: 0 }}>
            {users.length} registered account{users.length !== 1 ? 's' : ''}
          </p>
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
              onClick={refresh}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                background: 'rgba(167,44,50,0.10)', border: '1px solid rgba(167,44,50,0.25)',
                borderRadius: 10, color: '#C44E54', fontSize: 12, fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(167,44,50,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,44,50,0.10)' }}
            >
              <RefreshCw style={{ width: 12, height: 12, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              {loading ? 'Loading…' : 'Refresh'}
            </button>
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
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3, pointerEvents: 'none' }} />
          <input
            type="search"
            name="users-table-search"
            autoComplete="off"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 32, paddingRight: query ? 30 : 12, paddingTop: 8, paddingBottom: 8,
              background: T.searchBg, border: `1px solid ${T.searchBdr}`,
              borderRadius: 10, color: T.txt1, fontSize: 12, outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.50)' }}
            onBlur={e  => { e.target.style.borderColor = T.searchBdr }}
          />
          {query && (
            <button onClick={() => handleSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 2, display: 'flex', alignItems: 'center' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
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
        <div style={{ ...panelStyle, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.theadBdr}`, background: T.theadBg }}>
                  {['User', 'Email', 'Role', 'Last Active', 'Devices', 'Actions'].map(col => (
                    <th key={col} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: T.theadTxt, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
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
                    const bound = u.devices?.length ? u.devices : (devicesByUser[uid] || [])
                    return (
                      <UserRow
                        key={uid || i}
                        u={u} idx={i} isAdmin={isAdmin}
                        onDelete={setDeleteTarget} onEdit={openEdit}
                        onAddDevice={setAddDeviceTarget}
                        expanded={expanded.has(uid)} onToggle={() => toggleExpand(uid)}
                        boundDevices={bound} navigate={navigate}
                        onUnbindDevice={setUnbindTarget} isLight={isLight}
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
                    onChange={(_, p) => setPage(p)}
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
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>Role</label>
                  <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ ...inputSt, cursor: 'pointer' }}>
                    <option value="user">User</option>
                    <option value="operator">Operator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.lblColor }}>
                    New Password <span style={{ fontWeight: 400, color: T.txt4 }}>(leave blank to keep current)</span>
                  </label>
                  <input type="password" placeholder="Minimum 8 characters" name="eu-password" autoComplete="new-password"
                    value={editPassword} onChange={e => setEditPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditUser()} style={inputSt} />
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
          onAssign={async (sn) => {
            const userId = addDeviceTarget._id ?? addDeviceTarget.id
            await adminAssignDeviceToUser(userId, sn)
            await silentRefresh()
            await silentRefreshDevices()
          }}
          onClose={() => setAddDeviceTarget(null)}
        />
      )}
    </div>
  )
}
