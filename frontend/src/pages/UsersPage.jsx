import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  Users, Search, X, RefreshCw, Shield, UserCog,
  Plus, Trash2, Radio, Tag, ChevronRight, ChevronDown, Pencil,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { displayContact, isValidIdentifier } from '../utils/userContact.js'
import TPLLoader from '../components/TPLLoader.jsx'
import ModalPortal from '../components/common/ModalPortal.jsx'

/* ── Design tokens ────────────────────────────────────────────────────────── */
const panel = {
  background: '#242323',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 16,
  boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
}

// Shared modal styling — identical to the Bind modal (Locators/Stickers).
const modalPanel = {
  background: '#000000',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 16,
  boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
}

// Full-viewport overlay: scrollable so tall modals are never clipped at the top.
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  zIndex: 9999, padding: 24, overflowY: 'auto',
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: '#f4f4f5', fontSize: 13,
  outline: 'none',
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function fmtRelTime(ts) {
  if (!ts) return '—'
  try {
    const diff = Date.now() - new Date(ts).getTime()
    if (isNaN(diff) || diff < 0) return '—'
    if (diff < 60_000)           return 'Just now'
    if (diff < 3_600_000)        return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000)       return `${Math.floor(diff / 3_600_000)}h ago`
    if (diff < 604_800_000)      return `${Math.floor(diff / 86_400_000)}d ago`
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '—' }
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
      <div style={{ width: 52, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ height: 5, borderRadius: 3, width: `${v}%`, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{v}%</span>
    </div>
  )
}

/* ── Device card (matches Locators.jsx grid style) ────────────────────────── */
function DeviceCard({ device, navigate, isAdmin, onUnbind }) {
  const [hov, setHov] = useState(false)
  const isSticker = /^\d+$/.test(String(device.sn ?? ''))
  const DevIcon = isSticker ? Tag : Radio
  const path = isSticker ? `/stickers/${device.sn}` : `/locators/${device.sn}`

  return (
    <div
      onClick={() => navigate(path)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...panel,
        padding: 16, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        boxShadow: hov ? '0 0 44px rgba(167,44,50,0.52), 0 12px 40px rgba(0,0,0,0.55)' : panel.boxShadow,
        transform: hov ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease',
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
          <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {device.name || device.assigned_user_name || device.sn}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontFamily: 'monospace', marginTop: 2 }}>
            {device.sn}
          </div>
        </div>
      </div>
      <ChevronRight style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
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
function UserRow({ u, idx, isAdmin, onDelete, onEdit, expanded, onToggle, boundDevices, navigate, onUnbindDevice }) {
  const [hov, setHov] = useState(false)
  const contact = displayContact(u)
  const initials = (u.name || contact || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()

  return (
    <>
      <tr
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          background: hov ? 'rgba(255,255,255,0.03)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
          transition: 'background 0.12s',
          borderBottom: expanded ? 'none' : '1px solid rgba(255,255,255,0.04)',
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
              <div style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>{u.name || '—'}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-mono)' }}>
                {String(u._id || u.id || '').slice(-10)}
              </div>
            </div>
          </div>
        </td>

        {/* Email */}
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-mono)' }}>
            {contact || '—'}
          </span>
        </td>

        {/* Role */}
        <td style={{ padding: '13px 16px' }}>
          <RoleBadge role={u.role} />
        </td>

        {/* Last active */}
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'var(--font-mono)' }}>
            {fmtRelTime(u.last_login || u.lastLogin || u.created_at)}
          </span>
        </td>

        {/* Devices */}
        <td style={{ padding: '13px 16px' }}>
          <span style={{ fontSize: 12, color: boundDevices.length > 0 ? '#60a5fa' : 'rgba(255,255,255,0.28)', fontWeight: boundDevices.length > 0 ? 600 : 400 }}>
            {boundDevices.length} device{boundDevices.length !== 1 ? 's' : ''}
          </span>
        </td>

        {/* Actions */}
        <td style={{ padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={onToggle}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
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
                onClick={() => onDelete(u)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.20)',
                  color: '#f87171', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.16)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.20)' }}
              >
                <Trash2 style={{ width: 11, height: 11 }} /> Delete
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Bound devices section */}
      {expanded && (
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <td colSpan={6} style={{ padding: '0 16px 16px', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
            {boundDevices.length === 0 ? (
              <div style={{ padding: '16px 0', fontSize: 12, color: 'rgba(255,255,255,0.28)', textAlign: 'center' }}>
                No devices bound to this user
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, paddingTop: 10 }}>
                {boundDevices.map(d => (
                  <DeviceCard key={d.sn} device={d} navigate={navigate} isAdmin={isAdmin} onUnbind={onUnbindDevice} />
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
  const { users, loading, error, refresh, lastFetched } = useUserCache()
  const { isAdmin } = useAuth()
  const { devices, refresh: refreshDevices } = useDeviceCache()
  const { adminCreateUser, adminDeleteUser, adminUpdateUser, unbindDevice } = useCityTag()

  const [query,      setQuery]      = useState('')
  const [debouncedQ, setDQ]         = useState('')
  const [page,       setPage]       = useState(1)
  const [expanded,   setExpanded]   = useState(new Set())
  const PAGE_SIZE   = 15
  const debounceRef = useRef(null)

  /* Create User state */
  const [showCreate,   setShowCreate]   = useState(false)
  const [newIdentifier, setNewIdentifier] = useState('')
  const [newName,      setNewName]      = useState('')
  const [newPassword,  setNewPassword]  = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError,  setCreateError]  = useState('')

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

  /* Unbind Device state (from user's device grid) */
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
    return users.filter(u => {
      if (!q) return true
      return u.name?.toLowerCase().includes(q) || displayContact(u).toLowerCase().includes(q)
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
  const openCreate = () => { setNewIdentifier(''); setNewName(''); setNewPassword(''); setCreateError(''); setShowCreate(true) }
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
      await adminCreateUser({
        identifier: newIdentifier.trim(),
        password: newPassword.trim(),
        name: newName.trim(),
      })
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
      const uid = deleteTarget._id || deleteTarget.id
      await adminDeleteUser(uid)
      refresh()
      setDeleteTarget(null)
    } catch {}
    finally { setDeleteLoading(false) }
  }

  /* ── Edit user ──────────────────────────────────────────────────────────── */
  const openEdit = (u) => {
    setEditTarget(u)
    setEditName(u.name || '')
    setEditRole((u.role || 'user').toLowerCase())
    setEditPassword('')
    setEditError('')
  }
  const closeEdit = () => { if (!editLoading) setEditTarget(null) }

  const handleEditUser = async () => {
    if (!editTarget) return
    if (!editName.trim()) {
      setEditError('Name is required')
      return
    }
    setEditError(''); setEditLoading(true)
    try {
      const uid = editTarget._id || editTarget.id
      const payload = { name: editName.trim(), role: editRole }
      // Only send a new password if the admin actually typed one.
      if (editPassword.trim()) payload.password = editPassword.trim()
      await adminUpdateUser(uid, payload)
      refresh()
      setEditTarget(null)
    } catch (err) {
      setEditError(err.message || 'Failed to update user')
    } finally {
      setEditLoading(false)
    }
  }

  /* ── Unbind device from user grid ───────────────────────────────────────── */
  const handleUnbindDevice = async () => {
    if (!unbindTarget) return
    setUnbindLoading(true)
    try {
      await unbindDevice(unbindTarget.sn)
      refreshDevices()
      setUnbindTarget(null)
    } catch {}
    finally { setUnbindLoading(false) }
  }

  /* ── Admin gate ─────────────────────────────────────────────────────────── */
  if (!isAdmin) {
    return (
      <div style={{ ...panel, padding: '64px 20px', textAlign: 'center' }}>
        <Shield style={{ width: 42, height: 42, color: '#A72C32', margin: '0 auto 14px' }} />
        <p style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', margin: '0 0 8px' }}>Admin access required</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Only admins can view the user list.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserCog style={{ width: 22, height: 22, color: '#C44E54', flexShrink: 0 }} />
            Users
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.38)', marginTop: 5, marginBottom: 0 }}>
            {users.length} registered account{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastFetched && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: 'var(--font-mono)' }}>
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

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'rgba(255,255,255,0.28)', pointerEvents: 'none' }} />
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
              background: '#18181b', border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 10, color: '#FFFFFF', fontSize: 12, outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(167,44,50,0.50)' }}
            onBlur={e  => { e.target.style.borderColor = 'rgba(255,255,255,0.10)' }}
          />
          {query && (
            <button onClick={() => handleSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 2, display: 'flex', alignItems: 'center' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>

        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginLeft: 'auto' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      {error ? (
        <div style={{ ...panel, padding: '32px 20px', textAlign: 'center', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      ) : loading && users.length === 0 ? (
        <TPLLoader label="Loading users…" />
      ) : (
        <div style={{ ...panel, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.22)' }}>
                  {['User', 'Email', 'Role', 'Last Active', 'Devices', 'Actions'].map(col => (
                    <th key={col} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.32)', fontSize: 13 }}>
                      {debouncedQ ? `No users matching "${debouncedQ}"` : 'No users found'}
                    </td>
                  </tr>
                ) : (
                  paged.map((u, i) => {
                    const uid = String(u._id || u.id || '')
                    const bound = devicesByUser[uid] || []
                    return (
                      <UserRow
                        key={uid || i}
                        u={u}
                        idx={i}
                        isAdmin={isAdmin}
                        onDelete={setDeleteTarget}
                        onEdit={openEdit}
                        expanded={expanded.has(uid)}
                        onToggle={() => toggleExpand(uid)}
                        boundDevices={bound}
                        navigate={navigate}
                        onUnbindDevice={setUnbindTarget}
                      />
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.35 : 1 }}
                >‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => Math.max(1, Math.min(safePage - 2, totalPages - 4)) + i)
                  .filter(p => p <= totalPages)
                  .map(p => (
                    <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: p === safePage ? 700 : 400, border: `1px solid ${p === safePage ? '#A72C32' : 'rgba(255,255,255,0.10)'}`, background: p === safePage ? 'rgba(167,44,50,0.15)' : 'transparent', color: p === safePage ? '#C44E54' : 'rgba(255,255,255,0.45)' }}>
                      {p}
                    </button>
                  ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'rgba(255,255,255,0.45)', fontSize: 11, cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.35 : 1 }}
                >›</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Create User Modal ────────────────────────────────────────────────── */}
      {showCreate && (
        <ModalPortal>
        <div onClick={closeCreate} style={modalOverlay}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...modalPanel, width: '100%', maxWidth: 440, margin: 'auto' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, background: 'rgba(167,44,50,0.14)', borderRadius: 8, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
                  <Plus style={{ width: 14, height: 14, color: '#C86068' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Create User</span>
              </div>
              <button onClick={closeCreate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 4, display: 'flex', borderRadius: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {createError && (
                <div style={{ padding: '8px 12px', background: 'rgba(127,29,29,0.20)', border: '1px solid rgba(127,29,29,0.40)', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
                  {createError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                  Full Name <span style={{ color: '#C86068' }}>*</span>
                </label>
                <input
                  type="text" placeholder="e.g. Ahmed Khan"
                  name="cu-fullname" autoComplete="off"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                  Email or Phone Number <span style={{ color: '#C86068' }}>*</span>
                </label>
                <input
                  type="text" placeholder="Email or phone number"
                  value={newIdentifier} onChange={e => setNewIdentifier(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                  Password <span style={{ color: '#C86068' }}>*</span>
                </label>
                <input
                  type="password" placeholder="Minimum 8 characters"
                  name="cu-password" autoComplete="new-password"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={closeCreate} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>Cancel</button>
              <button
                onClick={handleCreate}
                disabled={createLoading || !newIdentifier.trim() || !newName.trim() || !newPassword.trim()}
                style={{
                  padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: (createLoading || !newIdentifier.trim() || !newName.trim() || !newPassword.trim()) ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                  border: '1px solid rgba(167,44,50,0.40)', color: '#fff',
                  opacity: (createLoading || !newIdentifier.trim() || !newName.trim() || !newPassword.trim()) ? 0.50 : 1,
                  transition: 'opacity 0.15s',
                }}
              >{createLoading ? 'Creating…' : 'Create User'}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Edit User Modal ──────────────────────────────────────────────────── */}
      {editTarget && (
        <ModalPortal>
        <div onClick={closeEdit} style={modalOverlay}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...modalPanel, width: '100%', maxWidth: 440, margin: 'auto' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, background: 'rgba(167,44,50,0.14)', borderRadius: 8, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
                  <Pencil style={{ width: 14, height: 14, color: '#C86068' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Edit User</span>
              </div>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 4, display: 'flex', borderRadius: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {editError && (
                <div style={{ padding: '8px 12px', background: 'rgba(127,29,29,0.20)', border: '1px solid rgba(127,29,29,0.40)', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
                  {editError}
                </div>
              )}

              {/* Email (read-only — backend does not change email) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>Email</label>
                <input
                  type="email" value={editTarget.email || ''} disabled
                  style={{ ...inputStyle, opacity: 0.55, cursor: 'not-allowed' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                  Full Name <span style={{ color: '#C86068' }}>*</span>
                </label>
                <input
                  type="text" placeholder="e.g. Ahmed Khan"
                  name="eu-fullname" autoComplete="off"
                  value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEditUser()}
                  autoFocus style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>Role</label>
                <select
                  value={editRole} onChange={e => setEditRole(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="user">User</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                  New Password <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.32)' }}>(leave blank to keep current)</span>
                </label>
                <input
                  type="password" placeholder="Minimum 8 characters"
                  name="eu-password" autoComplete="new-password"
                  value={editPassword} onChange={e => setEditPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEditUser()}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button onClick={closeEdit} disabled={editLoading} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>Cancel</button>
              <button
                onClick={handleEditUser}
                disabled={editLoading || !editName.trim()}
                style={{
                  padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: (editLoading || !editName.trim()) ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                  border: '1px solid rgba(167,44,50,0.40)', color: '#fff',
                  opacity: (editLoading || !editName.trim()) ? 0.50 : 1,
                  transition: 'opacity 0.15s',
                }}
              >{editLoading ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Delete User Confirm Modal ─────────────────────────────────────────── */}
      {deleteTarget && (
        <div
          onClick={() => !deleteLoading && setDeleteTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, width: '100%', maxWidth: 380, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.72)' }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>Delete User</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.52)', marginBottom: 20 }}>
              Permanently delete{' '}
              <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{deleteTarget.name || displayContact(deleteTarget)}</span>?{' '}
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}
              >Cancel</button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                  border: '1px solid rgba(127,29,29,0.40)', color: '#fca5a5',
                  opacity: deleteLoading ? 0.55 : 1,
                }}
              >{deleteLoading ? 'Deleting…' : 'Delete User'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unbind Device Confirm Modal ───────────────────────────────────────── */}
      {unbindTarget && (
        <div
          onClick={() => !unbindLoading && setUnbindTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#000000', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, width: '100%', maxWidth: 380, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.72)' }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>Unbind Device</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.52)', marginBottom: 20 }}>
              Remove binding for{' '}
              <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{unbindTarget.sn}</span>
              {unbindTarget.assigned_user_name ? ` from ${unbindTarget.assigned_user_name}` : ''}?{' '}
              This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setUnbindTarget(null)}
                disabled={unbindLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}
              >Cancel</button>
              <button
                onClick={handleUnbindDevice}
                disabled={unbindLoading}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: unbindLoading ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                  border: '1px solid rgba(127,29,29,0.40)', color: '#fca5a5',
                  opacity: unbindLoading ? 0.55 : 1,
                }}
              >{unbindLoading ? 'Removing…' : 'Unbind'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
