import React, { useState, useRef, useEffect, useContext, useCallback, useMemo } from 'react'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Layers, Radio, Tag, Search, X, ChevronRight, ChevronDown, Plus, Download, Link2, Trash2, Pencil } from 'lucide-react'
import MissingDevices from './MissingDevices.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useBindCache } from '../context/BindCacheContext.jsx'
import { exportDevicesCsv } from '../utils/exportDevicesCsv.js'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { deviceDisplayName } from '../utils/deviceDisplayName.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'
import ModalPortal from '../components/common/ModalPortal.jsx'

const TYPE_TABS = [
  { key: 'all',     label: 'All',           icon: Layers },
  { key: 'locator', label: 'Locators',       icon: Radio  },
  { key: 'sticker', label: 'Smart Stickers', icon: Tag    },
]

const STATUS_FILTER_TABS = ['All', 'Online', 'Offline', 'Assigned', 'Unassigned']
const STATUS_TO_FILTER = {
  All: 'all',
  Online: 'online',
  Offline: 'offline',
  Assigned: 'assigned',
  Unassigned: 'unassigned',
}

const modalPanel = {
  background: '#000000',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 16,
  boxShadow: '0 24px 64px rgba(0,0,0,0.72)',
}
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  zIndex: 9999, padding: 24, overflowY: 'auto',
}
const SELECT_STYLE = {
  width: '100%', background: '#18181b', border: '1px solid #3f3f46',
  borderRadius: 8, padding: '10px 12px', color: '#f4f4f5', fontSize: 13,
  outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='%2371717a'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 36,
}
const SELECT_OPT = { background: '#27272a', color: '#f4f4f5' }
const BIND_CATS = [
  'wallet','bag','purse','car','motorcycle','bicycle','van','truck','bus',
  'laptop','phone','keys','pet tracker','child tracker','asset','luggage','backpack',
  'pallet','carton','container','parcel','equipment','other',
]

// ── Search + dropdown combo for bind modal ────────────────────────────────────
function SearchSelect({ items, selectedValue, onSelect, labelOf, keyOf, placeholder, emptyMsg, allowFreeText = false, onFreeTextChange }) {
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const found = items.find(it => keyOf(it) === selectedValue)
  const inputVal = open ? q : (allowFreeText ? (selectedValue || '') : (found ? labelOf(found) : ''))
  const matches = q.trim()
    ? items.filter(it => labelOf(it).toLowerCase().includes(q.toLowerCase())).slice(0, 10)
    : items.slice(0, 10)

  const toggleOpen = () => {
    if (open) { setOpen(false); setQ('') }
    else { setQ(allowFreeText ? (selectedValue || '') : ''); setOpen(true) }
  }

  const inputSt = {
    width: '100%', background: '#18181b', border: open ? '1px solid rgba(167,44,50,0.60)' : '1px solid #3f3f46',
    borderRadius: 8, padding: '10px 12px', color: '#f4f4f5', fontSize: 13,
    outline: 'none', cursor: 'text', boxSizing: 'border-box',
    paddingLeft: 34, paddingRight: 34, transition: 'border-color 0.15s',
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:13, height:13, color: open ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.32)', pointerEvents:'none', transition:'color 0.15s' }} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
        </svg>
        <input
          value={inputVal}
          onChange={e => { setQ(e.target.value); setOpen(true); if (allowFreeText && onFreeTextChange) onFreeTextChange(e.target.value) }}
          onFocus={() => { setQ(allowFreeText ? (selectedValue || '') : ''); setOpen(true) }}
          onBlur={() => setTimeout(() => { setOpen(false); if (!allowFreeText) setQ('') }, 160)}
          placeholder={placeholder}
          autoComplete="off"
          style={inputSt}
        />
        <svg
          onMouseDown={e => { e.preventDefault(); toggleOpen() }}
          style={{ position:'absolute', right:10, top:'50%', transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)', width:13, height:13, color: open ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)', cursor:'pointer', transition:'transform 0.2s, color 0.15s' }}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </div>
      {open && (
        <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.55)', marginTop: 4 }}>
          {matches.length === 0
            ? <div style={{ padding: '10px 12px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{emptyMsg || 'No matches'}</div>
            : matches.map(it => (
                <div key={keyOf(it)}
                  onMouseDown={e => { e.preventDefault(); onSelect(keyOf(it)); setOpen(false); setQ('') }}
                  style={{ padding: '9px 12px', fontSize: 13, cursor: 'pointer', color: keyOf(it) === selectedValue ? '#fff' : '#d4d4d8', background: keyOf(it) === selectedValue ? 'rgba(167,44,50,0.22)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = keyOf(it) === selectedValue ? 'rgba(167,44,50,0.22)' : 'transparent'}
                >
                  {labelOf(it)}
                </div>
              ))
          }
          {items.length > 10 && q.trim() === '' && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.28)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              Showing top 10 — type to filter {items.length} total
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Module-level fleet cache — survives remounts, invalidated on bind/unbind ──
let _fleetCache     = null
let _fleetFetchedAt = null
const FLEET_TTL     = 5 * 60 * 1000   // 5 min

function fmtLastSeen(device) {
  const raw = device.dataRetrievalTime ?? device.last_seen ?? device.lastSeen ?? null
  if (!raw) return null
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return null
    return d.toLocaleString(undefined, {
      month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  } catch { return null }
}

function isStickerSN(sn) { return /^\d+$/.test(String(sn ?? '')) }
const isBound = d => !!(d.user_id || d.assigned_user_name)

/* ─────────────────────────────────────────────────────────────────────────────
   ActionsDropdown — "Actions ▼" trigger + portal-rendered menu.
   Portaled to document.body so it is never clipped by the grid's overflow:hidden.
────────────────────────────────────────────────────────────────────────────── */
const MENU_W = 150

function ActionsDropdown({ isLight, onEdit, onUnbind }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0 })
  const btnRef  = useRef(null)
  const menuRef = useRef(null)

  const toggle = (e) => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const r = btnRef.current.getBoundingClientRect()
    const menuH = 88 // 2 items + padding
    const openUp = r.bottom + menuH + 8 > window.innerHeight
    setPos({
      top:  openUp ? r.top - menuH - 6 : r.bottom + 6,
      left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
    })
    setOpen(true)
  }

  // Close on outside click, Escape, scroll or resize (anchor position goes stale)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey    = (e) => { if (e.key === 'Escape') setOpen(false) }
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

  const itemBase = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '8px 12px', background: 'none', border: 'none',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.12s',
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
          fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
          background: open
            ? (isLight ? '#DCDCDC' : 'rgba(255,255,255,0.12)')
            : (isLight ? '#ECECEC' : 'rgba(255,255,255,0.06)'),
          border: isLight ? '1px solid #C9C9C9' : '1px solid rgba(255,255,255,0.12)',
          color: isLight ? '#333333' : 'rgba(255,255,255,0.70)',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = isLight ? '#DCDCDC' : 'rgba(255,255,255,0.12)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = isLight ? '#ECECEC' : 'rgba(255,255,255,0.06)' }}
      >
        Actions
        <ChevronDown style={{ width: 11, height: 11, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: MENU_W,
            zIndex: 10000, padding: 4, borderRadius: 10,
            background: isLight ? '#FFFFFF' : '#1C1C1E',
            border: isLight ? '1px solid #C9C9C9' : '1px solid rgba(255,255,255,0.10)',
            boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.14)' : '0 12px 36px rgba(0,0,0,0.65)',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit() }}
            style={{ ...itemBase, borderRadius: 7, color: isLight ? '#333333' : 'rgba(255,255,255,0.75)' }}
            onMouseEnter={e => { e.currentTarget.style.background = isLight ? '#F3F4F6' : 'rgba(255,255,255,0.07)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            <Pencil style={{ width: 12, height: 12 }} /> Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onUnbind() }}
            style={{ ...itemBase, borderRadius: 7, color: '#DC2626' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.10)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            <Trash2 style={{ width: 12, height: 12 }} /> Unbind
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   UserSelect — searchable user combobox for the Edit modal (dark theme).
   Typing only filters; the value changes exclusively by picking an option,
   so free-text/invalid entries are impossible.
────────────────────────────────────────────────────────────────────────────── */
function UserSelect({ users, loading, valueId, fallbackName, onChange }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  const selected = users.find(u => String(u.id) === String(valueId))
  const display  = selected ? (selected.name || selected.email) : (fallbackName || '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      (u.name  || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    )
  }, [users, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) { setOpen(false); setQuery('') } }
    const onKey  = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const pick = (u) => {
    onChange(u)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={open ? query : display}
        placeholder={open ? 'Search user…' : 'Select user…'}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { setOpen(true); setQuery('') }}
        onKeyDown={e => {
          if (e.key === 'Enter' && open && filtered.length > 0) { e.preventDefault(); pick(filtered[0]) }
        }}
        style={{ ...SELECT_STYLE, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'none', cursor: open ? 'text' : 'pointer', paddingRight: 32 }}
      />
      <ChevronDown style={{
        position: 'absolute', right: 12, top: '50%', transform: `translateY(-50%)${open ? ' rotate(180deg)' : ''}`,
        width: 13, height: 13, color: '#71717a', pointerEvents: 'none', transition: 'transform 0.15s',
      }} />

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 30,
          maxHeight: 200, overflowY: 'auto', borderRadius: 8, padding: 4,
          background: '#18181b', border: '1px solid #3f3f46',
          boxShadow: '0 12px 36px rgba(0,0,0,0.65)',
        }}>
          {loading ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#71717a' }}>Loading users…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#71717a' }}>No users found</div>
          ) : (
            filtered.map(u => {
              const isSel = String(u.id) === String(valueId)
              return (
                <button
                  key={u.id}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => pick(u)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    width: '100%', padding: '8px 10px', borderRadius: 6, border: 'none',
                    background: isSel ? 'rgba(167,44,50,0.16)' : 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: isSel ? 700 : 500, textAlign: 'left',
                    color: isSel ? '#C86068' : '#f4f4f5', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSel ? 'rgba(167,44,50,0.16)' : 'none' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.name || u.email}
                  </span>
                  {u.name && u.email && (
                    <span style={{ fontSize: 10, color: '#71717a', flexShrink: 0, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.email}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   AllDevices: fixed 4×5 grid for All / Locators / Stickers tabs.
   Fetches the full fleet ONCE; tab + status switches are pure client-side.
────────────────────────────────────────────────────────────────────────────── */
function AllDevices({ deviceType = 'all', externalStatus, isLight, T, refreshSignal }) {
  const navigate = useNavigate()
  const { getDevices, unbindDevice, updateDevice, adminAssignDeviceToUser } = useCityTag()
  const { user, isAdmin } = useAuth()
  const { users, loading: usersLoading } = useUserCache()

  const cacheValid = () =>
    Boolean(_fleetCache && _fleetFetchedAt && Date.now() - _fleetFetchedAt < FLEET_TTL)

  const [allDevices,   setAllDevices]   = useState(() => cacheValid() ? _fleetCache : [])
  const [fetching,     setFetching]     = useState(() => !cacheValid())
  const [rawQ,         setRawQ]         = useState('')
  const [debQ,         setDebQ]         = useState('')
  const [page,         setPage]         = useState(1)
  const [localRefresh, setLocalRefresh] = useState(0)

  const muiTheme = useMemo(() => createTheme({
    palette: { mode: isLight ? 'light' : 'dark', primary: { main: '#A72C32', contrastText: '#FFFFFF' } },
  }), [isLight])

  // Unbind state
  const [unbindTarget,  setUnbindTarget]  = useState(null)
  const [unbindLoading, setUnbindLoading] = useState(false)
  const [unbindError,   setUnbindError]   = useState('')

  // Edit state — reuses the bind-modal form layout, writes via PUT /api/devices/{sn}
  const [editTarget,   setEditTarget]   = useState(null)
  const [editName,     setEditName]     = useState('')
  const [editClient,   setEditClient]   = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editUserId,   setEditUserId]   = useState('')
  const [editLoading,  setEditLoading]  = useState(false)
  const [editError,    setEditError]    = useState('')

  // Transient success toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const PAGE_SIZE  = 20
  const debRef      = useRef(null)
  const prevSignal  = useRef(refreshSignal)
  const isSilentRef = useRef(false)

  // Debounce search
  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setDebQ(rawQ.trim()), 350)
    return () => clearTimeout(debRef.current)
  }, [rawQ])

  // Reset page on filter/search change
  useEffect(() => { setPage(1) }, [deviceType, externalStatus, debQ])

  // Auto-refresh every 60s when Online filter is active — silently (no loader)
  useEffect(() => {
    if (externalStatus !== 'online') return
    const id = setInterval(() => {
      isSilentRef.current = true
      _fleetCache = null
      _fleetFetchedAt = null
      setLocalRefresh(k => k + 1)
    }, 60_000)
    return () => clearInterval(id)
  }, [externalStatus])

  // Fetch all devices — one call; re-fetches on refreshSignal or localRefresh change
  useEffect(() => {
    if (!user) return

    const forced = prevSignal.current !== refreshSignal
    prevSignal.current = refreshSignal

    if (!forced && cacheValid()) {
      setAllDevices(_fleetCache)
      setFetching(false)
      return
    }

    if (forced) {
      _fleetCache     = null
      _fleetFetchedAt = null
    }

    const silent = isSilentRef.current
    isSilentRef.current = false
    if (!silent) setFetching(true)
    ;(async () => {
      try {
        const FETCH_LIMIT = 200
        let all = [], p = 1
        while (true) {
          const data  = await getDevices({ page: p, limit: FETCH_LIMIT, status: 'all' })
          const list  = Array.isArray(data) ? data : data?.devices ?? []
          const total = Number(data?.total ?? list.length) || 0
          all = [...all, ...list]
          if (all.length >= total || list.length < FETCH_LIMIT || p >= 10) break
          p++
        }
        // Deduplicate by SN (API can return duplicates across pages)
        const seen = new Set()
        all = all.filter(d => { const k = String(d.sn); if (seen.has(k)) return false; seen.add(k); return true })
        _fleetCache     = all
        _fleetFetchedAt = Date.now()
        setAllDevices(all)
      } catch (err) {
        console.error('Fleet fetch failed:', err)
      } finally {
        if (!silent) setFetching(false)
      }
    })()
  }, [user, getDevices, refreshSignal, localRefresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUnbind = async () => {
    if (!unbindTarget || unbindLoading) return
    setUnbindError('')
    setUnbindLoading(true)
    try {
      await unbindDevice(unbindTarget.sn)
      _fleetCache     = null
      _fleetFetchedAt = null
      setUnbindTarget(null)
      setPage(1)
      setLocalRefresh(k => k + 1)
    } catch (err) {
      setUnbindError(err?.message || 'Failed to unbind device.')
    } finally {
      setUnbindLoading(false)
    }
  }

  const openEdit = (d) => {
    setEditError('')
    setEditName(d.name || '')
    setEditClient(d.client || '')
    setEditCategory(d.category || '')
    setEditUserId(d.assigned_user_id ? String(d.assigned_user_id) : '')
    setEditTarget(d)
  }

  const closeEdit = () => {
    setEditTarget(null)
    setEditError('')
  }

  // Change detection — Save stays disabled (and no API call fires) when nothing changed
  const editDetailsChanged = !!editTarget && (
    editName.trim()      !== (editTarget.name     || '') ||
    editClient.trim()    !== (editTarget.client   || '') ||
    (editCategory || '') !== (editTarget.category || '')
  )
  const editUserChanged = !!editTarget && !!editUserId &&
    String(editUserId) !== String(editTarget.assigned_user_id || '')
  const editHasChanges = editDetailsChanged || editUserChanged

  const handleEditSave = async () => {
    if (!editTarget || editLoading || !editHasChanges) return
    setEditError('')
    setEditLoading(true)
    try {
      if (editDetailsChanged) {
        await updateDevice(editTarget.sn, {
          name:     editName.trim(),
          client:   editClient.trim(),
          category: editCategory || undefined,
        })
      }
      if (editUserChanged) {
        // Admin reassignment — backend releases the device from its current
        // user and binds it to the new one in a single request.
        await adminAssignDeviceToUser(editUserId, editTarget.sn)
      }
      _fleetCache     = null
      _fleetFetchedAt = null
      const newUser = users.find(u => String(u.id) === String(editUserId))
      setEditTarget(null)
      setLocalRefresh(k => k + 1)
      showToast(editUserChanged
        ? `Device reassigned to ${newUser?.name || newUser?.email || 'new user'}`
        : 'Device updated')
    } catch (err) {
      setEditError(err?.message || 'Failed to update device.')
    } finally {
      setEditLoading(false)
    }
  }

  // Client-side filter: type → status → search → bound-first sort
  const filtered = useMemo(() => {
    let list = allDevices

    if      (deviceType === 'locator') list = list.filter(d => !isStickerSN(d.sn))
    else if (deviceType === 'sticker') list = list.filter(d =>  isStickerSN(d.sn))

    if (externalStatus === 'online') list = list.filter(d => d.status === 'online')
    else if (externalStatus === 'offline') list = list.filter(d => d.status === 'offline')
    else if (externalStatus === 'assigned') list = list.filter(d => isBound(d))
    else if (externalStatus === 'unassigned') list = list.filter(d => !isBound(d))

    if (debQ) {
      const q = debQ.toLowerCase()
      list = list.filter(d => {
        const name = deviceDisplayName(d).toLowerCase()
        const sn   = String(d.sn ?? '').toLowerCase()
        return name.includes(q) || sn.includes(q)
      })
    }

    // Sort: bound+online → bound+offline → unbound+online → unbound+offline
    list = list.slice().sort((a, b) => {
      const rank = d => {
        const bound  = isBound(d)
        const online = d.status === 'online'
        if (bound  && online)  return 0
        if (bound  && !online) return 1
        if (!bound && online)  return 2
        return 3
      }
      return rank(a) - rank(b)
    })

    return list
  }, [allDevices, deviceType, externalStatus, debQ])

  const total       = filtered.length
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage    = Math.min(Math.max(1, page), totalPages)
  const pageDevices = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const hasPrev     = safePage > 1
  const hasNext     = safePage < totalPages

  const panel = isLight
    ? { background: 'linear-gradient(145deg, #FFFFFF 0%, #F0F0F0 50%, #DCDCDC 100%)', border: '1px solid #C9C9C9', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: '#242323', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Search + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3, pointerEvents: 'none' }} />
          <input
            value={rawQ}
            onChange={e => setRawQ(e.target.value)}
            placeholder="Search devices…"
            style={{
              background: T.inputBg, border: `1px solid ${T.inputBorder}`,
              borderRadius: 10, padding: '8px 12px 8px 32px', fontSize: 12,
              color: isLight ? '#000000' : 'rgba(255,255,255,0.70)', outline: 'none', width: 220,
              boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            }}
            onFocus={e => { e.target.style.borderColor = '#A72C32'; e.target.style.boxShadow = '0 0 0 3px rgba(167,44,50,0.12)' }}
            onBlur={e  => { e.target.style.borderColor = T.inputBorder; e.target.style.boxShadow = isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none' }}
          />
          {rawQ && (
            <button onClick={() => setRawQ('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 2, display: 'flex', alignItems: 'center' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: T.txt3, fontWeight: isLight ? 500 : 400 }}>
          {fetching ? 'Loading…' : `${total} device${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Device grid — fills remaining height, fixed 4 col × 5 row.
          Always render exactly PAGE_SIZE slots so gridTemplateRows distributes space correctly. */}
      {fetching ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TPLLoader label="Loading devices…" />
        </div>
      ) : (
        <div style={{
          flex: 1, minHeight: 0, overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'repeat(5, minmax(0, 1fr))',
          gap: 10,
        }}>
          {pageDevices.length === 0 ? (
            /* No results — single cell spanning full grid */
            <div style={{ gridColumn: '1 / -1', gridRow: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: T.txt3, fontSize: 13 }}>
              No devices match your filters
            </div>
          ) : (
            /* Always render exactly PAGE_SIZE slots so row heights stay consistent */
            Array.from({ length: PAGE_SIZE }, (_, idx) => {
              const d = pageDevices[idx] ?? null
              if (!d) return <div key={`_ph_${idx}`} aria-hidden="true" />
              const isSticker  = isStickerSN(d.sn)
              const DeviceIcon = isSticker ? Tag : Radio
              const isActive   = d.status === 'online'
              const dotColor   = isActive ? '#059669' : '#DC2626'
              const dotGlow    = isActive ? 'rgba(5,150,105,0.55)' : 'rgba(220,38,38,0.55)'
              const name       = deviceDisplayName(d)
              const lastSeen   = fmtLastSeen(d)
              return (
                <div
                  key={d.sn}
                  onClick={() => navigate(isSticker ? `/stickers/${d.sn}` : `/locators/${d.sn}`)}
                  style={{
                    ...panel, height: '100%', padding: '12px 14px', cursor: 'pointer', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    transition: 'box-shadow 0.22s ease, transform 0.22s ease',
                    ...(isLight ? { borderLeft: '3px solid #A72C32' } : {}),
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = isLight
                      ? '0 4px 16px rgba(167,44,50,0.14), 0 12px 32px rgba(0,0,0,0.08)'
                      : '0 0 44px rgba(167,44,50,0.52), 0 12px 40px rgba(0,0,0,0.55)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = panel.boxShadow
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      <DeviceIcon style={{ width: 11, height: 11, color: T.txt3, flexShrink: 0 }} />
                      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: dotColor, boxShadow: `0 0 4px ${dotGlow}` }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.txt1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.txt3, marginTop: 3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 19 }}>
                      {d.sn}
                    </div>
                    {lastSeen ? (
                      <div style={{ fontSize: 9.5, color: T.txt1, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 19 }}>
                        Last seen: {lastSeen}
                      </div>
                    ) : (
                      <div style={{ fontSize: 9.5, color: '#6b7280', marginTop: 2, paddingLeft: 19, fontStyle: 'italic' }}>
                        No last report
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {/* Actions only when Status filter = All; device-type tabs never affect this.
                        Only bound devices get the menu. */}
                    {externalStatus === 'all' && isAdmin && isBound(d) && (
                      <ActionsDropdown
                        isLight={isLight}
                        onEdit={() => openEdit(d)}
                        onUnbind={() => { setUnbindError(''); setUnbindTarget(d) }}
                      />
                    )}
                    <ChevronRight style={{ width: 14, height: 14, color: T.txt3 }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && !fetching && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, padding: '4px 2px', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.txt3, marginRight: 4, fontWeight: isLight ? 500 : 400 }}>
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, total)} of {total}
          </span>
          <ThemeProvider theme={muiTheme}>
            <Stack>
              <Pagination
                count={totalPages} page={safePage}
                onChange={(_, p) => setPage(p)}
                color="primary" shape="rounded" size="medium"
                sx={{ '& .MuiPaginationItem-root': { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: isLight ? '#000000' : 'rgba(255,255,255,0.70)', border: 'none', '&:hover': { background: isLight ? 'rgba(167,44,50,0.08)' : 'rgba(255,255,255,0.08)' }, '&.Mui-selected': { background: isLight ? '#A72C32' : '#3d3d3d', color: '#ffffff', fontWeight: 700, border: 'none', '&:hover': { background: isLight ? '#8B2328' : '#4a4a4a' } }, '&.MuiPaginationItem-ellipsis': { color: isLight ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.30)' } } }}
              />
            </Stack>
          </ThemeProvider>
        </div>
      )}

      {/* Edit device modal — same layout as the Bind modal, SN locked */}
      {editTarget && (
        <ModalPortal>
          <div onClick={closeEdit} style={modalOverlay}>
            <div onClick={e => e.stopPropagation()} style={{ ...modalPanel, width: '100%', maxWidth: 420, padding: 24, marginTop: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Pencil style={{ width: 16, height: 16, color: '#C86068' }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Edit Device</div>
                </div>
                <button onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 4, display: 'flex' }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>Device SN</label>
                  <div style={{ ...SELECT_STYLE, backgroundImage: 'none', cursor: 'default', color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>
                    {editTarget.sn}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                    Assigned To
                    {editUserChanged && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#C86068', textTransform: 'uppercase', letterSpacing: '0.04em' }}>will be reassigned</span>}
                  </label>
                  <UserSelect
                    users={users}
                    loading={usersLoading}
                    valueId={editUserId}
                    fallbackName={editTarget.assigned_user_name}
                    onChange={u => setEditUserId(String(u.id))}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                    Display Name <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Office Locator"
                    style={{ ...SELECT_STYLE, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'none', cursor: 'text' }} />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>Category</label>
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value)} style={SELECT_STYLE}>
                    <option value="" disabled style={SELECT_OPT}>Select a category…</option>
                    {BIND_CATS.map(c => <option key={c} value={c} style={SELECT_OPT}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                    Client <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input value={editClient} onChange={e => setEditClient(e.target.value)} placeholder="e.g. Acme Corp"
                    style={{ ...SELECT_STYLE, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'none', cursor: 'text' }} />
                </div>

                {editError && (
                  <div style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 8, padding: '8px 12px' }}>
                    {editError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <button onClick={closeEdit}
                    style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>
                    Cancel
                  </button>
                  <button onClick={handleEditSave} disabled={editLoading || !editHasChanges}
                    style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                      cursor: editLoading ? 'wait' : !editHasChanges ? 'not-allowed' : 'pointer',
                      background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                      border: '1px solid rgba(167,44,50,0.40)', color: '#fff',
                      opacity: editLoading || !editHasChanges ? 0.55 : 1, transition: 'opacity 0.15s' }}>
                    {editLoading ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Unbind confirmation modal */}
      {unbindTarget && (
        <ModalPortal>
          <div onClick={() => { setUnbindTarget(null); setUnbindError('') }} style={modalOverlay}>
            <div onClick={e => e.stopPropagation()} style={{ ...modalPanel, width: '100%', maxWidth: 380, padding: 24, marginTop: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(220,38,38,0.14)', border: '1px solid rgba(220,38,38,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Trash2 style={{ width: 16, height: 16, color: '#DC2626' }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Unbind Device</div>
                </div>
                <button onClick={() => { setUnbindTarget(null); setUnbindError('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 4, display: 'flex' }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6 }}>
                Remove binding for <strong style={{ color: '#FFFFFF' }}>{deviceDisplayName(unbindTarget)}</strong>?
                This will unassign the device from its user.
              </div>
              {unbindError && (
                <div style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                  {unbindError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => { setUnbindTarget(null); setUnbindError('') }}
                  style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>
                  Cancel
                </button>
                <button onClick={handleUnbind} disabled={unbindLoading}
                  style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: unbindLoading ? 'wait' : 'pointer', background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)', border: '1px solid rgba(220,38,38,0.40)', color: '#fff', opacity: unbindLoading ? 0.7 : 1 }}>
                  {unbindLoading ? 'Unbinding…' : 'Unbind'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Success toast — bare portal (ModalPortal would lock body scroll) */}
      {toast && createPortal(
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 10001,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 10,
          background: isLight ? '#ECFDF5' : 'rgba(6,38,27,0.96)',
          border: `1px solid ${isLight ? '#A7F3D0' : 'rgba(5,150,105,0.40)'}`,
          boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          fontSize: 12.5, fontWeight: 600,
          color: isLight ? '#047857' : '#6ee7b7',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
          {toast}
        </div>,
        document.body
      )}
    </div>
  )
}

/* ── Main Devices page ──────────────────────────────────────────────────────── */
export default function Devices() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab    = searchParams.get('tab')
  const activeTab = (['all', 'locator', 'sticker'].includes(rawTab)) ? rawTab : 'all'

  const [statusTab, setStatusTab] = useState(() => {
    const s = searchParams.get('status')
    if (s === 'active' || s === 'online') return 'Online'
    if (s === 'offline') return 'Offline'
    if (s === 'assigned') return 'Assigned'
    if (s === 'unassigned') return 'Unassigned'
    return 'All'
  })
  const [refreshKey,    setRefreshKey]    = useState(0)
  const [offlineRaw,    setOfflineRaw]    = useState('')
  const [offlineSearch, setOfflineSearch] = useState('')
  const offlineDebRef = useRef(null)

  useEffect(() => {
    clearTimeout(offlineDebRef.current)
    offlineDebRef.current = setTimeout(() => setOfflineSearch(offlineRaw.trim()), 350)
    return () => clearTimeout(offlineDebRef.current)
  }, [offlineRaw])

  const pageTheme = useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  const muiTheme = useMemo(() => createTheme({
    palette: { mode: isLight ? 'light' : 'dark', primary: { main: '#A72C32', contrastText: '#FFFFFF' } },
  }), [isLight])

  const { isAdmin } = useAuth()
  const { bindDevice, adminAssignDeviceToUser, getAvailableDevices, getDevices, getLatestLocationsBatch } = useCityTag()
  const { devices: cacheDevices } = useDeviceCache()
  const { recordBind } = useBindCache()
  const { users } = useUserCache()

  // ── Bind modal state ───────────────────────────────────────────────────────
  const [availableDevices, setAvailableDevices] = useState([])
  const [showBindModal,    setShowBindModal]     = useState(false)
  const [bindSn,           setBindSn]            = useState('')
  const [bindName,         setBindName]          = useState('')
  const [bindClient,       setBindClient]        = useState('')
  const [bindCategory,     setBindCategory]      = useState('')
  const [bindUserId,       setBindUserId]        = useState('')
  const [bindLoading,      setBindLoading]       = useState(false)
  const [bindError,        setBindError]         = useState('')
  const [exporting,        setExporting]         = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      getAvailableDevices().then(setAvailableDevices).catch(() => setAvailableDevices([]))
    }
  }, [isAdmin, getAvailableDevices])

  const unboundDevices = (cacheDevices || []).filter(d => !d.assigned_user_name && !d.user_id)

  const openBindModal = () => {
    setBindError('')
    setBindClient('')
    setBindName('')
    setBindCategory('')
    setBindSn('')
    setBindUserId('')
    setShowBindModal(true)
  }

  const closeBindModal = () => {
    setShowBindModal(false)
    setBindSn('')
    setBindName('')
    setBindClient('')
    setBindCategory('')
    setBindUserId('')
    setBindError('')
  }

  const handleBind = async () => {
    if (isAdmin) {
      if (!bindSn || !bindUserId || !bindCategory) { setBindError('Please select a device, a user, and a category.'); return }
      setBindError('')
      setBindLoading(true)
      try {
        await adminAssignDeviceToUser(bindUserId, bindSn, { name: bindName.trim(), client: bindClient.trim(), category: bindCategory })
        recordBind(bindSn)
        _fleetCache = null; _fleetFetchedAt = null
        setRefreshKey(k => k + 1)
        closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind device.') }
      finally { setBindLoading(false) }
    } else {
      if (!bindSn.trim() || !bindCategory) { setBindError('Please select a device and a category.'); return }
      setBindError('')
      setBindLoading(true)
      try {
        await bindDevice({ sn: bindSn.trim(), label: bindName.trim() || undefined, category: bindCategory })
        recordBind(bindSn.trim())
        getAvailableDevices().then(setAvailableDevices).catch(() => {})
        _fleetCache = null; _fleetFetchedAt = null
        setRefreshKey(k => k + 1)
        closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind device.') }
      finally { setBindLoading(false) }
    }
  }

  const handleExportCSV = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      await exportDevicesCsv(getDevices, getLatestLocationsBatch, { filename: 'all-devices.csv' })
    } catch (err) { console.error('CSV export failed', err) }
    finally { setExporting(false) }
  }, [exporting, getDevices, getLatestLocationsBatch])

  const setTab = (key) => setSearchParams({ tab: key }, { replace: true })

  const T = {
    tabBg:       isLight ? '#DCDCDC' : 'rgba(255,255,255,0.05)',
    tabBorder:   isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    txt1:        isLight ? '#000000' : '#f4f4f5',
    txt2:        isLight ? '#333333' : 'rgba(255,255,255,0.50)',
    txt3:        isLight ? '#555555' : 'rgba(255,255,255,0.32)',
    inputBg:     isLight ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
    inputBorder: isLight ? '#C9C9C9' : 'rgba(255,255,255,0.10)',
  }

  const externalStatus = STATUS_TO_FILTER[statusTab] ?? 'all'
  const offlineDeviceType = activeTab !== 'all' ? activeTab : undefined
  const showActionButtons = activeTab === 'all' && statusTab !== 'Offline'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px' }}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isLight ? 12 : 10 }}>
          {isLight ? (
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#A72C32', border: '1px solid #8B2328', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers style={{ width: 20, height: 20, color: '#FFFFFF' }} />
            </div>
          ) : (
            <div style={{ padding: 9, background: 'rgba(167,44,50,0.14)', borderRadius: 12, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
              <Layers style={{ width: 18, height: 18, color: '#C86068' }} />
            </div>
          )}
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txt1, margin: 0, letterSpacing: isLight ? '-0.02em' : '-0.03em' }}>
            Devices
          </h1>
        </div>

        {showActionButtons && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isLight ? (
              <button onClick={openBindModal}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, cursor: 'pointer', background: '#A72C32', border: '1px solid #8B2328', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 8px rgba(167,44,50,0.25)', transition: 'background 0.15s, box-shadow 0.15s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#8B2328'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(167,44,50,0.35)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#A72C32'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(167,44,50,0.25)' }}
              ><Plus style={{ width: 15, height: 15 }} /> Bind Device</button>
            ) : (
              <button onClick={openBindModal}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10, cursor: 'pointer', background: 'linear-gradient(135deg, #BF3840 0%, #8B2328 100%)', border: '1px solid rgba(167,44,50,0.45)', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 4px 14px rgba(167,44,50,0.28)', transition: 'box-shadow 0.2s, transform 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 44px rgba(167,44,50,0.52), 0 6px 22px rgba(0,0,0,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(167,44,50,0.28)'; e.currentTarget.style.transform = 'translateY(0)' }}
              ><Plus style={{ width: 14, height: 14 }} /> Bind Device</button>
            )}
            <button onClick={handleExportCSV} disabled={exporting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, cursor: exporting ? 'wait' : 'pointer', background: isLight ? '#ECECEC' : 'rgba(255,255,255,0.06)', border: isLight ? '1px solid #C9C9C9' : '1px solid rgba(255,255,255,0.12)', color: isLight ? '#333333' : 'rgba(255,255,255,0.70)', fontSize: 13, fontWeight: 600, opacity: exporting ? 0.6 : 1, transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!exporting) { e.currentTarget.style.background = isLight ? '#DCDCDC' : 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = isLight ? '#000' : '#FFFFFF' }}}
              onMouseLeave={e => { e.currentTarget.style.background = isLight ? '#ECECEC' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = isLight ? '#333333' : 'rgba(255,255,255,0.70)' }}
            ><Download style={{ width: 13, height: 13 }} /> {exporting ? 'Exporting…' : 'Export CSV'}</button>
          </div>
        )}
      </div>

      {/* ── Type tabs (left) + status filters (right), single row ────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: T.tabBg, border: `1px solid ${T.tabBorder}`, borderRadius: 12, width: 'fit-content' }}>
          {TYPE_TABS.map(({ key, label, icon: Icon }) => {
            const active = activeTab === key
            return (
              <button key={key} onClick={() => setTab(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                  background: active ? '#A72C32' : 'transparent',
                  color:      active ? '#FFFFFF' : T.txt2,
                  boxShadow:  active ? '0 2px 8px rgba(167,44,50,0.30)' : 'none',
                }}>
                <Icon style={{ width: 14, height: 14 }} />{label}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: 4, background: T.tabBg, border: `1px solid ${T.tabBorder}`, borderRadius: 10, flexWrap: 'wrap', width: 'fit-content' }}>
          {STATUS_FILTER_TABS.map(s => {
            const active = statusTab === s
            return (
              <button key={s} onClick={() => setStatusTab(s)}
                style={{ padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                  background: active ? '#A72C32' : 'transparent',
                  color:      active ? '#FFFFFF' : T.txt2,
                }}>
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Content — fills remaining height ─────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {statusTab === 'Offline' ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3, pointerEvents: 'none' }} />
                <input
                  value={offlineRaw}
                  onChange={e => setOfflineRaw(e.target.value)}
                  placeholder="Search offline devices…"
                  style={{ background: T.inputBg, border: `1px solid ${T.inputBorder}`, borderRadius: 10, padding: '8px 12px 8px 32px', fontSize: 12, color: isLight ? '#000000' : 'rgba(255,255,255,0.70)', outline: 'none', width: 220, boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none' }}
                  onFocus={e => { e.target.style.borderColor = '#A72C32'; e.target.style.boxShadow = '0 0 0 3px rgba(167,44,50,0.12)' }}
                  onBlur={e  => { e.target.style.borderColor = T.inputBorder; e.target.style.boxShadow = isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none' }}
                />
                {offlineRaw && (
                  <button onClick={() => setOfflineRaw('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 2, display: 'flex', alignItems: 'center' }}>
                    <X style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              <MissingDevices embedded deviceType={offlineDeviceType} externalSearch={offlineSearch} />
            </div>
          </div>
        ) : (
          <AllDevices
            deviceType={activeTab}
            externalStatus={externalStatus}
            isLight={isLight}
            T={T}
            refreshSignal={refreshKey}
          />
        )}
      </div>

      {/* ── Bind Device modal ────────────────────────────────────────────── */}
      {showBindModal && (
        <ModalPortal>
          <div onClick={closeBindModal} style={modalOverlay}>
            <div onClick={e => e.stopPropagation()} style={{ ...modalPanel, width: '100%', maxWidth: 420, padding: 24, marginTop: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Link2 style={{ width: 16, height: 16, color: '#C86068' }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Bind Device</div>
                </div>
                <button onClick={closeBindModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 4, display: 'flex' }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                    Device SN <span style={{ color: '#C86068' }}>*</span>
                  </label>
                  {isAdmin ? (
                    unboundDevices.length === 0
                      ? <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>No unbound devices available</p>
                      : <SearchSelect
                          items={unboundDevices}
                          selectedValue={bindSn}
                          onSelect={setBindSn}
                          labelOf={d => d.sn + (d.client ? ` — ${d.client}` : '')}
                          keyOf={d => d.sn}
                          placeholder="Type to search or select a device…"
                          emptyMsg="No matching devices"
                        />
                  ) : (
                    <SearchSelect
                      items={availableDevices}
                      selectedValue={bindSn}
                      onSelect={setBindSn}
                      labelOf={d => d.sn + ((d.name || d.client) ? ` — ${d.name || d.client}` : '')}
                      keyOf={d => d.sn}
                      placeholder="Type to search or enter device SN…"
                      emptyMsg="No matching devices"
                      allowFreeText
                      onFreeTextChange={setBindSn}
                    />
                  )}
                </div>

                {isAdmin && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                      Assign to User <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    {(!users || users.length === 0)
                      ? <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>No users available</p>
                      : <SearchSelect
                          items={users}
                          selectedValue={bindUserId}
                          onSelect={setBindUserId}
                          labelOf={u => u.email + (u.name ? ` (${u.name})` : '')}
                          keyOf={u => u.id}
                          placeholder="Type to search or select a user…"
                          emptyMsg="No matching users"
                        />
                    }
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                    Display Name <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input value={bindName} onChange={e => setBindName(e.target.value)} placeholder="e.g. Office Locator"
                    style={{ ...SELECT_STYLE, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'none', cursor: 'text' }} />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>Category</label>
                  <select value={bindCategory} onChange={e => setBindCategory(e.target.value)} style={SELECT_STYLE}>
                    <option value="" disabled style={SELECT_OPT}>Select a category…</option>
                    {BIND_CATS.map(c => <option key={c} value={c} style={SELECT_OPT}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>

                {isAdmin && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                      Client <span style={{ color: 'rgba(255,255,255,0.30)', fontWeight: 400 }}>(optional)</span>
                    </label>
                    <input value={bindClient} onChange={e => setBindClient(e.target.value)} placeholder="e.g. Acme Corp"
                      style={{ ...SELECT_STYLE, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'none', cursor: 'text' }} />
                  </div>
                )}

                {bindError && (
                  <div style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.22)', borderRadius: 8, padding: '8px 12px' }}>
                    {bindError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <button onClick={closeBindModal}
                    style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}>
                    Cancel
                  </button>
                  <button onClick={handleBind} disabled={bindLoading}
                    style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: bindLoading ? 'wait' : 'pointer', background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)', border: '1px solid rgba(167,44,50,0.40)', color: '#fff', opacity: bindLoading ? 0.7 : 1 }}>
                    {bindLoading ? 'Binding…' : 'Bind'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
