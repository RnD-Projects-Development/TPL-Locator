import React, { useState, useRef, useEffect, useContext, useCallback, useMemo } from 'react'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import { createPortal } from 'react-dom'
import { useSearchParams, useLocation } from 'react-router-dom'
import { Layers, Radio, Tag, Search, X, ChevronRight, ChevronDown, Plus, Download, Link2, Trash2, Pencil } from 'lucide-react'
import MissingDevices from './MissingDevices.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useBindCache } from '../context/BindCacheContext.jsx'
import { exportDevicesCsv } from '../utils/exportDevicesCsv.js'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { useDashboardChrome } from '../context/DashboardChromeContext.jsx'
import { deviceDisplayName } from '../utils/deviceDisplayName.js'
import { BIND_CATS, STICKER_CATS } from '../utils/deviceCategories.js'
import {
  fetchFleetDevices,
  getFleetCache,
  invalidateFleetCache,
  isFleetCacheValid,
} from '../utils/fleetCache.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import TPLLoader from '../components/TPLLoader.jsx'
import { useDeviceUpdates, emitDevicesUpdated } from '../utils/deviceEvents.js'
import ModalPortal from '../components/common/ModalPortal.jsx'
import SearchHistoryDropdown from '../components/common/SearchHistoryDropdown.jsx'
import { useSearchHistory } from '../hooks/useSearchHistory.js'
import { APP_CACHE_STORAGE_KEYS } from '../utils/clearAppCaches.js'
import { useTrailNav } from '../hooks/useBreadcrumbTrail.js'
import SwirlPin from '../components/common/SwirlPin.jsx'

// Premium NFC-card typeface for the device tiles (Inter, loaded in index.html).
const CARD_FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

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

const AnimatedStatusTabs = ({ tabs, activeTab, onChange, isLight }) => {
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 3, width: 0 });
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const activeIndex = tabs.indexOf(activeTab);
    if (activeIndex === -1) return;
    
    // The first child is the absolute positioned background indicator
    const btn = containerRef.current.children[activeIndex + 1];
    if (btn) {
      setIndicatorStyle({
        left: btn.offsetLeft,
        width: btn.offsetWidth
      });
    }
  }, [activeTab, tabs]);

  const showIndicator = indicatorStyle.width > 0;
  const inactiveColor = isLight ? '#4b5563' : '#94a3b8';

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: 36, padding: 3, borderRadius: 8, background: isLight ? '#ECECEC' : 'rgba(255,255,255,0.04)', border: isLight ? '1px solid #C9C9C9' : '1px solid #2a2a2a', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: indicatorStyle.left, width: indicatorStyle.width || 63, height: 'calc(100% - 6px)', borderRadius: 6, background: '#A72C32', border: '1px solid rgba(255, 255, 255, 0.10)', transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s cubic-bezier(0.4, 0, 0.2, 1)', pointerEvents: 'none', opacity: showIndicator ? 1 : 0 }} />
      {tabs.map(s => {
        const active = activeTab === s;
        return (
          <button key={s} onClick={() => onChange(s)}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = isLight ? '#111111' : '#FFFFFF' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = inactiveColor }}
            style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 7, padding: '0 13px', height: '100%', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: active ? 'rgb(255, 255, 255)' : inactiveColor, fontSize: 13, fontWeight: active ? 600 : 500, whiteSpace: 'nowrap', letterSpacing: '0.01em', transition: 'color 0.2s' }}>
            {s}
          </button>
        )
      })}
    </div>
  );
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

// Remembers the All-Devices list view (search + page) so returning via the
// breadcrumb restores it. Tab + status already round-trip through the URL.
const DEV_VIEW_KEY = 'bc:devview'
function loadDevView() {
  try { return JSON.parse(sessionStorage.getItem(DEV_VIEW_KEY)) || null } catch { return null }
}
function saveDevView(v) {
  try { sessionStorage.setItem(DEV_VIEW_KEY, JSON.stringify(v)) } catch { /* ignore */ }
}

// ── Search + dropdown combo for bind modal ────────────────────────────────────
function SearchSelect({ items, selectedValue, onSelect, labelOf, keyOf, placeholder, emptyMsg, allowFreeText = false, onFreeTextChange }) {
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const found = items.find(it => keyOf(it) === selectedValue)
  const inputVal = open ? q : (allowFreeText ? (selectedValue || '') : (found ? labelOf(found) : ''))
  const matches = q.trim()
    ? items.filter(it => labelOf(it).toLowerCase().includes(q.toLowerCase())).slice(0, 20)
    : items.slice(0, 20)

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
          {items.length > 20 && q.trim() === '' && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.28)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              Showing top 20 — type to filter {items.length} total
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

function ActionsDropdown({ isLight, onEdit, onUnbind, isAdmin }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ top: 0, left: 0 })
  const btnRef  = useRef(null)
  const menuRef = useRef(null)

  const toggle = (e) => {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const r = btnRef.current.getBoundingClientRect()
    const menuH = isAdmin ? 88 : 44 // 1 or 2 items + padding
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
    display: 'flex', alignItems: 'center', gap: 6,
    width: '100%', padding: '6px 12px', background: 'none', border: 'none',
    fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
    textAlign: 'left'
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 10, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
          background: open ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#ECECEC',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
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
          {isAdmin && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onUnbind() }}
              style={{ ...itemBase, borderRadius: 7, color: '#DC2626' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <Trash2 style={{ width: 12, height: 12 }} /> Unbind
            </button>
          )}
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
                    color: isSel ? '#C86A6A' : '#f4f4f5', transition: 'background 0.12s',
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
function AllDevices({ deviceType = 'all', externalStatus, isLight, T, refreshSignal, onBind, bindLabel, statusTabsNode }) {
  const location = useLocation()
  const pushTrail = useTrailNav()
  const { getDevices, unbindDevice, updateDevice, adminAssignDeviceToUser, getCategories } = useCityTag()
  const { user, isAdmin } = useAuth()
  const { users, loading: usersLoading } = useUserCache()
  const [categories, setCategories] = useState([]);
    useEffect(() => {
      let cancelled = false;
      getCategories()
        .then((data) => { if (!cancelled) setCategories(Array.isArray(data) ? data : []); })
        .catch(() => { if (!cancelled) setCategories([]); });
      return () => { cancelled = true; };
    }, [getCategories]);

  const cacheValid = () => isFleetCacheValid()

  const savedView = useRef(loadDevView()).current
  const [allDevices,   setAllDevices]   = useState(() => getFleetCache() ?? [])
  const [fetching,     setFetching]     = useState(() => !cacheValid())
  const [rawQ,         setRawQ]         = useState(savedView?.q || '')
  const [debQ,         setDebQ]         = useState(savedView?.q || '')
  const [page,         setPage]         = useState(savedView?.page || 1)
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

  const PAGE_SIZE  = 16
  const debRef       = useRef(null)
  const prevSignal   = useRef(refreshSignal)
  const isSilentRef  = useRef(false)
  const gridScrollRef = useRef(null)

  // Search-history dropdown (recent device searches, separate from the Users
  // page). Recorded on Enter / on pick; the store is wiped on logout.
  const { history, record: recordSearch, remove: removeSearch, clearAll: clearSearchHistory } =
    useSearchHistory(APP_CACHE_STORAGE_KEYS.SEARCH_HISTORY_DEVICES)
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

  // Debounce search
  useEffect(() => {
    clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setDebQ(rawQ.trim()), 350)
    return () => clearTimeout(debRef.current)
  }, [rawQ])

  // Reset page on filter/search change — but NOT on the initial mount, so a
  // page restored from the saved view survives.
  const skipPageReset = useRef(true)
  useEffect(() => {
    if (skipPageReset.current) { skipPageReset.current = false; return }
    setPage(1)
  }, [deviceType, externalStatus, debQ])

  // Persist search + page so returning to this list via the breadcrumb restores it.
  useEffect(() => { saveDevView({ q: debQ, page }) }, [debQ, page])

  // Reset the grid scroll to the top on any tab / filter / search / page change
  useEffect(() => {
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0
  }, [deviceType, externalStatus, debQ, page])

  // Listen for global updates
  useDeviceUpdates(() => {
    isSilentRef.current = true
    invalidateFleetCache(false)
    setLocalRefresh(k => k + 1)
  })

  // Auto-refresh every 60s when Online filter is active — silently (no loader)
  useEffect(() => {
    if (externalStatus !== 'online') return
    const id = setInterval(() => emitDevicesUpdated(), 60_000)
    return () => clearInterval(id)
  }, [externalStatus])

  // Silent auto-refresh every 15 min — mirrors the Dashboard and detail pages.
  // Runs on every tab/filter; keeps the current tab, search and page in place
  // (no loader) while the fleet is refetched in the background.
  useEffect(() => {
    const id = setInterval(() => emitDevicesUpdated(), 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Fetch all devices — one call; re-fetches on refreshSignal or localRefresh change
  useEffect(() => {
    if (!user) return

    const forced = prevSignal.current !== refreshSignal
    prevSignal.current = refreshSignal

    if (!forced && cacheValid()) {
      setAllDevices(getFleetCache() ?? [])
      setFetching(false)
      return
    }

    if (forced) {
      invalidateFleetCache()
    }

    const silent = isSilentRef.current
    isSilentRef.current = false
    if (!silent) setFetching(true)
    ;(async () => {
      try {
        const all = await fetchFleetDevices(getDevices, { force: forced })
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
      invalidateFleetCache()
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
      invalidateFleetCache()
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

    // Non-admins only ever see their own assigned devices — guards against a
    // stale fleet cache from a previous (admin) session leaking through.
    if (!isAdmin && user?.id) {
      list = list.filter(d => String(d.assigned_user_id) === String(user.id))
    }

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
  }, [allDevices, deviceType, externalStatus, debQ, isAdmin, user])

  const total       = filtered.length
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage    = Math.min(Math.max(1, page), totalPages)
  const pageDevices = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const hasPrev     = safePage > 1
  const hasNext     = safePage < totalPages

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* Search + count + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0, width: '100%' }}>
        <div ref={searchWrapRef} style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3, pointerEvents: 'none' }} />
          <input
            value={rawQ}
            onChange={e => setRawQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { setHistOpen(false) }
              else if (e.key === 'Escape') setHistOpen(false)
            }}
            placeholder="Search devices…"
            style={{
              background: T.inputBg, border: `1px solid ${T.inputBorder}`,
              borderRadius: 10, padding: '8px 12px 8px 32px', fontSize: 12,
              color: isLight ? '#000000' : 'rgba(255,255,255,0.70)', outline: 'none', width: 220,
              boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            }}
            onFocus={e => { setHistOpen(true); e.target.style.borderColor = '#A72C32'; e.target.style.boxShadow = '0 0 0 3px rgba(167,44,50,0.12)' }}
            onBlur={e  => { e.target.style.borderColor = T.inputBorder; e.target.style.boxShadow = isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none' }}
          />
          {rawQ && (
            <button onClick={() => setRawQ('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.txt3, padding: 2, display: 'flex', alignItems: 'center' }}>
              <X style={{ width: 12, height: 12 }} />
            </button>
          )}
          {histOpen && (
            <SearchHistoryDropdown
              items={history}
              query={rawQ}
              onPick={term => { setRawQ(term); recordSearch(term); setHistOpen(false) }}
              onRemove={removeSearch}
              onClearAll={() => { clearSearchHistory(); setHistOpen(false) }}
              isLight={isLight}
              width={220}
            />
          )}
        </div>
        <span style={{ fontSize: 11, color: T.txt3, fontWeight: isLight ? 500 : 400 }}>
          {fetching ? 'Loading…' : `${total} device${total !== 1 ? 's' : ''}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {statusTabsNode}
          {onBind && (
            <button onClick={onBind}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', flexShrink: 0,
              background: isLight ? '#A72C32' : 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
              border: isLight ? '1px solid #8B2328' : '1px solid rgba(167,44,50,0.45)',
              color: '#fff', fontSize: 13, fontWeight: 700,
              boxShadow: isLight ? '0 2px 8px rgba(167,44,50,0.25)' : '0 4px 14px rgba(167,44,50,0.28)',
              transition: 'box-shadow 0.2s, transform 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = isLight ? '0 4px 16px rgba(167,44,50,0.35)' : '0 0 44px rgba(167,44,50,0.52), 0 6px 22px rgba(0,0,0,0.40)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = isLight ? '0 2px 8px rgba(167,44,50,0.25)' : '0 4px 14px rgba(167,44,50,0.28)' }}
          >
            <Plus style={{ width: 14, height: 14 }} /> {bindLabel}
          </button>
        )}
      </div>
    </div>

      {/* Device grid — fills remaining height, fixed 4 col × 4 row.
          Always render exactly PAGE_SIZE slots so gridTemplateRows distributes space correctly. */}
      {fetching ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TPLLoader label="Loading devices…" />
        </div>
      ) : (
        <div ref={gridScrollRef} className="scalable-container" style={{
          flex: 1, minHeight: 0, overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(14.3em, 1fr))',
          gridTemplateRows: 'repeat(4, minmax(6.3em, 1fr))',
          gap: '0.7em',
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
              const isActive   = d.status === 'online'
              const dotColor   = isActive ? '#23D160' : '#DC2626'
              const dotGlow    = isActive ? 'rgba(35,209,96,0.55)' : 'rgba(220,38,38,0.50)'
              const name       = deviceDisplayName(d)
              const lastSeen   = fmtLastSeen(d)
              return (
                <div
                  key={d.sn}
                  onClick={() => { recordSearch(rawQ); pushTrail(isSticker ? `/stickers/${d.sn}` : `/locators/${d.sn}`, { state: { from: location.pathname + (location.search || '') } }) }}
                  style={{
                    position: 'relative', overflow: 'hidden', height: '100%',
                    borderRadius: 16, cursor: 'pointer', boxSizing: 'border-box',
                    // Charcoal NFC-card face (not pure black) with a soft top-down
                    // gradient; the red locator swirl is drawn on top (SwirlPin).
                    background: 'linear-gradient(155deg, #333333 0%, #292929 100%)',
                    boxShadow: '0 6px 22px rgba(0,0,0,0.45)',
                    transition: 'box-shadow 0.24s ease',
                  }}
                  // Matte premium hover — soft shadow + faint inset ring + brighter
                  // chevron. No glow, no translate, so the grid never clips the tile.
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = '0 12px 34px rgba(0,0,0,0.58), inset 0 0 0 1px rgba(255,255,255,0.10)'
                    const chev = e.currentTarget.querySelector('[data-chev]')
                    if (chev) chev.style.color = 'rgba(255,255,255,0.80)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = '0 6px 22px rgba(0,0,0,0.45)'
                    const chev = e.currentTarget.querySelector('[data-chev]')
                    if (chev) chev.style.color = 'rgba(255,255,255,0.35)'
                  }}
                >
                  {/* Redrawn TPL locator swirl — vector-traced from the physical card.
                      Sized to the tile height so the whole pin (eye, body, point) shows,
                      with a whisper of top bleed. It's tall, so on these wide tiles it
                      naturally occupies the left ~third. */}
                  <SwirlPin style={{ position: 'absolute', left: '0%', top: '-3%', height: '100%', width: 'auto', zIndex: 0, pointerEvents: 'none' }} />
                  {/* Device info. It sits after a spacer that mirrors the swirl's
                      footprint — the pin is height:100% width:auto, so it occupies
                      cardHeight × the artwork's 1052:1481 ratio. The old left:44%
                      was a share of card *width* while the pin scales with card
                      *height*, so the space between them ballooned on wider tiles
                      (13px at 240px wide, 55px at 400px). The spacer keeps that gap
                      at a constant ~13px whatever the tile size. */}
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 1,
                    display: 'flex', alignItems: 'stretch', minWidth: 0,
                  }}>
                  <div aria-hidden="true" style={{ height: '100%', aspectRatio: '1052 / 1481', flexShrink: 0 }} />
                  <div style={{
                    flex: 1, minWidth: 0, margin: '0.55em 1em 2.1em 0.85em',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.22em',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', minWidth: 0 }}>
                      <span style={{ width: '0.5em', height: '0.5em', borderRadius: '50%', flexShrink: 0, background: dotColor, boxShadow: `0 0 5px ${dotGlow}` }} />
                      <span style={{ fontFamily: CARD_FONT, fontSize: '0.95em', fontWeight: 700, color: '#F7F7F7', letterSpacing: '0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    </div>
                    <div style={{ fontFamily: CARD_FONT, fontSize: '0.7em', fontWeight: 500, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.sn}
                    </div>
                    {lastSeen ? (
                      <div style={{ fontFamily: CARD_FONT, fontSize: '0.72em', fontWeight: 500, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Last seen: {lastSeen}
                      </div>
                    ) : (
                      <div style={{ fontFamily: CARD_FONT, fontSize: '0.72em', fontWeight: 500, color: 'rgba(255,255,255,0.40)', fontStyle: 'italic' }}>
                        No last report
                      </div>
                    )}
                  </div>
                  </div>

                  {/* Actions + chevron, bottom-right */}
                  <div style={{ position: 'absolute', zIndex: 2, right: '0.9em', bottom: '0.6em', display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                    {externalStatus === 'all' && isBound(d) && (
                      <ActionsDropdown
                        isLight={isLight}
                        isAdmin={isAdmin}
                        onEdit={() => openEdit(d)}
                        onUnbind={() => { setUnbindError(''); setUnbindTarget(d) }}
                      />
                    )}
                    <ChevronRight data-chev strokeWidth={1.5} style={{ width: '1.05em', height: '1.05em', color: 'rgba(255,255,255,0.35)', transition: 'color 0.2s ease' }} />
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
                sx={{ '& .MuiPaginationItem-root': { fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: isLight ? '#000000' : 'rgba(255,255,255,0.70)', border: 'none', '&:hover': { background: isLight ? 'rgba(167,44,50,0.08)' : 'rgba(255,255,255,0.08)' }, '&.Mui-selected': { background: '#A72C32', color: '#ffffff', fontWeight: 700, border: 'none', '&:hover': { background: '#8B2328' } }, '&.MuiPaginationItem-ellipsis': { color: isLight ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.30)' } } }}
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
                    <Pencil style={{ width: 16, height: 16, color: '#C86A6A' }} />
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

                {isAdmin && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                      Assigned To
                      {editUserChanged && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#C86A6A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>will be reassigned</span>}
                    </label>
                    <UserSelect
                      users={users}
                      loading={usersLoading}
                      valueId={editUserId}
                      fallbackName={editTarget.assigned_user_name}
                      onChange={u => setEditUserId(String(u.id))}
                    />
                  </div>
                )}

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
                    {categories.map(cat => <option key={cat.id} value={cat.slug} style={SELECT_OPT}>{cat.name}</option>)}
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
                  style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: unbindLoading ? 'wait' : 'pointer', background: '#A72C32', border: '1px solid rgba(167,44,50,0.40)', color: '#fff', opacity: unbindLoading ? 0.7 : 1 }}>
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
  const chrome = useDashboardChrome()
  const { bindDevice, adminAssignDeviceToUser, checkDeviceAvailability, getDevices, getLatestLocationsBatch, getCategories } = useCityTag()
  const { devices: cacheDevices } = useDeviceCache()
  const { recordBind } = useBindCache()
  const { users } = useUserCache()
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    let cancelled = false;
    getCategories()
      .then((data) => { if (!cancelled) setCategories(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setCategories([]); });
    return () => { cancelled = true; };
  }, [getCategories]);

  // ── Bind modal state ───────────────────────────────────────────────────────
  const [showBindModal,    setShowBindModal]     = useState(false)
  const [bindDeviceType,   setBindDeviceType]    = useState('locator')
  const [bindSn,           setBindSn]            = useState('')
  const [bindName,         setBindName]          = useState('')
  const [bindClient,       setBindClient]        = useState('')
  const [bindCategory,     setBindCategory]      = useState('')
  const [bindUserId,       setBindUserId]        = useState('')
  const [bindLoading,      setBindLoading]       = useState(false)
  const [bindError,        setBindError]         = useState('')
  const [exporting,        setExporting]         = useState(false)

  // ── SN availability check (non-admin bind flow: typed SN, no dropdown) ────
  const [snCheck, setSnCheck] = useState({ status: 'idle', name: null }) // idle | checking | available | taken | notfound
  const snCheckRef = useRef(null)

  useEffect(() => {
    if (isAdmin) return
    const sn = bindSn.trim()
    clearTimeout(snCheckRef.current)
    if (!sn) { setSnCheck({ status: 'idle', name: null }); return }
    setSnCheck({ status: 'checking', name: null })
    snCheckRef.current = setTimeout(() => {
      checkDeviceAvailability(sn)
        .then(res => {
          if (!res.exists) setSnCheck({ status: 'notfound', name: null })
          else if (!res.available) setSnCheck({ status: 'taken', name: null })
          else setSnCheck({ status: 'available', name: res.name || null })
        })
        .catch(() => setSnCheck({ status: 'notfound', name: null }))
    }, 350)
    return () => clearTimeout(snCheckRef.current)
  }, [bindSn, isAdmin, checkDeviceAvailability])

  const unboundDevices = (cacheDevices || []).filter(d => !d.assigned_user_name && !d.user_id)

  // Non-admins only get the Locators/Stickers differentiator once they've
  // bound at least one of each type — otherwise it's a single unified list.
  const hasLocatorDevice = (cacheDevices || []).some(d => isBound(d) && !isStickerSN(d.sn))
  const hasStickerDevice = (cacheDevices || []).some(d => isBound(d) && isStickerSN(d.sn))
  const showTypeTabs = isAdmin || (hasLocatorDevice && hasStickerDevice)
  const visibleTypeTabs = showTypeTabs ? TYPE_TABS : [{ key: 'all', label: 'Devices', icon: Layers }]
  const visibleStatusTabs = isAdmin ? STATUS_FILTER_TABS : STATUS_FILTER_TABS.filter(s => s !== 'Assigned' && s !== 'Unassigned')

  const openBindModal = (type = 'locator') => {
    setBindDeviceType(type)
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
        invalidateFleetCache()
        setRefreshKey(k => k + 1)
        closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind device.') }
      finally { setBindLoading(false) }
    } else {
      if (!bindSn.trim() || !bindCategory) { setBindError('Please enter a device SN and a category.'); return }
      if (snCheck.status !== 'available') { setBindError('Enter a valid, unassigned device SN before binding.'); return }
      setBindError('')
      setBindLoading(true)
      try {
        await bindDevice({ sn: bindSn.trim(), label: bindName.trim() || undefined, category: bindCategory })
        recordBind(bindSn.trim())
        invalidateFleetCache()
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

  // Register Export CSV in the topbar (Header) while the Devices page is mounted
  const exportRef = useRef(handleExportCSV)
  exportRef.current = handleExportCSV
  const registerExport     = chrome?.registerExport
  const setChromeExporting  = chrome?.setExporting
  useEffect(() => {
    if (!registerExport) return
    registerExport({ run: () => exportRef.current?.(), label: 'Export CSV', icon: Download })
    return () => registerExport(null)
  }, [registerExport])
  useEffect(() => {
    setChromeExporting?.(exporting)
  }, [exporting, setChromeExporting])

  const setTab = (key) => setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', key); return p }, { replace: true })

  // If the Locators/Stickers split disappears (e.g. the user unbinds their
  // only device of one type), snap back to the unified "Devices" view.
  useEffect(() => {
    if (!showTypeTabs && activeTab !== 'all') setTab('all')
  }, [showTypeTabs, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register the All/Locators/Stickers switcher in the topbar (Header),
  // same slot the Dashboard/Field Staff switcher uses, instead of an inline
  // row on the page. Only registered when there's actually a choice to make
  // (showTypeTabs) — a unified single-tab view falls back to the plain
  // "Devices" breadcrumb.
  const setTabRef = useRef(setTab)
  setTabRef.current = setTab
  useEffect(() => {
    if (!chrome?.registerTabSwitcher) return
    if (!showTypeTabs) { chrome.registerTabSwitcher(null); return undefined }
    chrome.registerTabSwitcher({
      tabs: visibleTypeTabs,
      activeKey: activeTab,
      onSelect: (key) => setTabRef.current(key),
    })
    return () => chrome.registerTabSwitcher(null)
  }, [chrome, showTypeTabs, visibleTypeTabs, activeTab])

  const setStatus = (s) => {
    setStatusTab(s)
    setSearchParams(prev => { const p = new URLSearchParams(prev); if (s === 'All') p.delete('status'); else p.set('status', s.toLowerCase()); return p }, { replace: true })
  }

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
  const isOfflineView = statusTab === 'Offline'

  // In the unified (no type-tabs) view, binding isn't tied to a locator/sticker
  // tab — the SN itself determines the type once typed.
  const bindLabel = showTypeTabs ? (activeTab === 'sticker' ? 'Bind Sticker' : 'Bind Locator') : 'Bind Device'
  const canBind   = !isOfflineView && (showTypeTabs ? (activeTab === 'locator' || activeTab === 'sticker') : true)
  const effectiveBindType = showTypeTabs ? bindDeviceType : (isStickerSN(bindSn.trim()) ? 'sticker' : 'locator')

  const statusTabsNode = (
    <AnimatedStatusTabs 
      tabs={visibleStatusTabs} 
      activeTab={statusTab} 
      onChange={setStatus} 
      isLight={isLight} 
    />
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 16px' }}>

      {/* ── Content — fills remaining height ─────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, position: 'relative' }}>
        {/* Offline tab — kept mounted (hidden) so data loads before the tab is opened */}
        <div style={{
          height: '100%',
          display: statusTab === 'Offline' ? 'flex' : 'none',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
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
            <div style={{ marginLeft: 'auto' }}>
              {statusTabsNode}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            <MissingDevices embedded deviceType={offlineDeviceType} externalSearch={offlineSearch} />
          </div>
        </div>

        <div style={{ height: '100%', display: statusTab !== 'Offline' ? 'block' : 'none' }}>
          <AllDevices
            deviceType={activeTab}
            externalStatus={externalStatus}
            isLight={isLight}
            T={T}
            refreshSignal={refreshKey}
            onBind={canBind ? () => openBindModal(showTypeTabs ? activeTab : 'locator') : undefined}
            bindLabel={bindLabel}
            statusTabsNode={statusTabsNode}
          />
        </div>
      </div>

      {/* ── Bind Device modal ────────────────────────────────────────────── */}
      {showBindModal && (
        <ModalPortal>
          <div onClick={closeBindModal} style={modalOverlay}>
            <div onClick={e => e.stopPropagation()} style={{ ...modalPanel, width: '100%', maxWidth: 420, padding: 24, marginTop: 40 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(167,44,50,0.14)', border: '1px solid rgba(167,44,50,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Link2 style={{ width: 16, height: 16, color: '#C86A6A' }} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>{showTypeTabs ? (bindDeviceType === 'sticker' ? 'Bind Sticker' : 'Bind Locator') : 'Bind Device'}</div>
                </div>
                <button onClick={closeBindModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: 4, display: 'flex' }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                    Device SN <span style={{ color: '#C86A6A' }}>*</span>
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
                    <>
                      <input
                        value={bindSn}
                        onChange={e => setBindSn(e.target.value)}
                        placeholder="Type or scan the device serial number…"
                        autoComplete="off"
                        style={{ ...SELECT_STYLE, appearance: 'none', WebkitAppearance: 'none', backgroundImage: 'none', cursor: 'text' }}
                      />
                      {snCheck.status !== 'idle' && (
                        <p style={{
                          margin: '6px 0 0', fontSize: 12,
                          color: snCheck.status === 'available' ? '#86efac'
                               : snCheck.status === 'checking'  ? 'rgba(255,255,255,0.45)'
                               : '#fca5a5',
                        }}>
                          {snCheck.status === 'checking'  && 'Checking…'}
                          {snCheck.status === 'available' && `Device found${snCheck.name ? ` — ${snCheck.name}` : ''}, ready to bind.`}
                          {snCheck.status === 'taken'      && 'This device is already bound to another user.'}
                          {snCheck.status === 'notfound'   && 'No device found with this SN.'}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {isAdmin && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                      Assign to User <span style={{ color: '#C86A6A' }}>*</span>
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
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 6 }}>
                    Category <span style={{ color: '#C86A6A' }}>*</span>
                  </label>
                  <select value={bindCategory} onChange={e => setBindCategory(e.target.value)} style={SELECT_STYLE}>
                    <option value="" disabled style={SELECT_OPT}>Select a category…</option>
                    {categories
                        .filter(cat => !cat.device_type || cat.device_type === effectiveBindType)
                        .map(cat => <option key={cat.id} value={cat.slug} style={SELECT_OPT}>{cat.name}</option>)}
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
