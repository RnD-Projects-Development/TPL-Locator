import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Pagination from '@mui/material/Pagination'
import Stack from '@mui/material/Stack'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import {
  Tag, Search, Package, ChevronRight,
  Plus, X, Link2, Trash2, Download,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useCityTag } from '../hooks/useCityTag.js'
import { useDeviceCache } from '../context/DeviceCacheContext.jsx'
import { useBindCache } from '../context/BindCacheContext.jsx'
import { exportDevicesCsv } from '../utils/exportDevicesCsv.js'
import { useUserCache } from '../context/Usercachecontext.jsx'
import { usePaginatedDevices } from '../hooks/usePaginatedDevices.js'
import { deviceDisplayName } from '../utils/deviceDisplayName.js'
import { ThemeContext } from '../components/layout/Layout.jsx'
import ModalPortal from '../components/common/ModalPortal.jsx'
import TPLLoader from '../components/TPLLoader.jsx'

/* ── Modal keeps dark styling ALWAYS (overlay UI) ────────────────────── */
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

const SELECT_STYLE = {
  width: '100%',
  background: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#f4f4f5',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 20 20' fill='%2371717a'%3E%3Cpath fill-rule='evenodd' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z' clip-rule='evenodd'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
}

const SELECT_OPT = { background: '#27272a', color: '#f4f4f5' }

const PAGE_SIZE = 20

const DEVICE_FILTER_TABS = ['All', 'Online', 'Offline', 'Assigned', 'Unassigned']
const FILTER_TO_SERVER = {
  All: 'all',
  Online: 'online',
  Offline: 'offline',
  Assigned: 'assigned',
  Unassigned: 'unassigned',
}

const STATUSES = ['All', 'Active', 'At Risk', 'Missing']
const CATS     = ['All', 'Pallet', 'Carton', 'Container', 'Asset', 'Other']

const BIND_CATS = [
  'electronics', 'handheld device', 'bottle', 'remote', 'keys',
  'wallet', 'medication', 'documents', 'jewelry', 'tools',
  'clothing', 'sports equipment', 'toy', 'bag', 'luggage', 'other',
]

function SearchSelect({ items, selectedValue, onSelect, labelOf, keyOf, placeholder, emptyMsg, inputSt, allowFreeText = false, onFreeTextChange }) {
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

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {/* Search icon — left */}
        <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:13, height:13, color: open ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.35)', pointerEvents:'none', transition:'color 0.15s' }} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
        </svg>
        <input
          value={inputVal}
          onChange={e => { setQ(e.target.value); setOpen(true); if (allowFreeText && onFreeTextChange) onFreeTextChange(e.target.value) }}
          onFocus={() => { setQ(allowFreeText ? (selectedValue || '') : ''); setOpen(true) }}
          onBlur={() => setTimeout(() => { setOpen(false); if (!allowFreeText) setQ('') }, 160)}
          placeholder={placeholder}
          autoComplete="off"
          style={{
            ...inputSt,
            paddingLeft: 32,
            paddingRight: 32,
            border: open
              ? '1px solid rgba(167,44,50,0.60)'
              : (inputSt?.border || '1px solid rgba(255,255,255,0.08)'),
            transition: 'border-color 0.15s',
          }}
        />
        {/* Chevron — right, rotates when open */}
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

function BattBar({ v, isLight }) {
  if (v == null || v === 0) return null
  const color = v > 40 ? '#059669' : v > 20 ? '#D97706' : '#DC2626'
  const trackBg = isLight ? '#CACACA' : 'rgba(255,255,255,0.08)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 44, height: 4, borderRadius: 3, background: trackBg }}>
        <div style={{ height: 4, borderRadius: 3, width: `${v}%`, background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{v}%</span>
    </div>
  )
}

function StatusBadge({ status, isLight }) {
  const mapLight = {
    Active:    { bg: '#ECFDF5', border: '#A7F3D0', color: '#059669' },
    Offline:   { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
    'At Risk': { bg: '#FFFBEB', border: '#FDE68A', color: '#D97706' },
    Missing:   { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
    Lost:      { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
  }
  const mapDark = {
    Active:    { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.25)',  color: '#6ee7b7' },
    Offline:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   color: '#fca5a5' },
    'At Risk': { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  color: '#fbbf24' },
    Missing:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   color: '#fca5a5' },
    Lost:      { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)',   color: '#fca5a5' },
  }
  const map = isLight ? mapLight : mapDark
  const s = map[status] || (isLight ? mapLight.Active : mapDark.Active)
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}

export default function Stickers({ embedded = false, externalStatus = undefined }) {
  const { isAdmin } = useAuth()
  const navigate  = useNavigate()
  const { bindDevice, adminAssignDeviceToUser, unbindDevice, getAvailableDevices, getDevices, getLatestLocationsBatch } = useCityTag()
  const { devices: cacheDevices, refresh: refreshDeviceCache } = useDeviceCache()
  const { recordBind } = useBindCache()
  const { users } = useUserCache()

  const pageTheme = React.useContext(ThemeContext)
  const isLight   = pageTheme === 'light'

  const muiTheme = useMemo(() => createTheme({
    palette: { mode: isLight ? 'light' : 'dark', primary: { main: '#A72C32', contrastText: '#FFFFFF' } },
  }), [isLight])

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const panel = isLight
    ? { background: 'linear-gradient(145deg, #FFFFFF 0%, #F0F0F0 50%, #DCDCDC 100%)', border: '1px solid #C9C9C9', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)' }
    : { background: '#242323', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '18px', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }

  const T = {
    txt1:        isLight ? '#000000' : '#f4f4f5',
    txt2:        isLight ? '#333333' : 'rgba(255,255,255,0.50)',
    txt3:        isLight ? '#333333' : 'rgba(255,255,255,0.32)',
    inputBg:     isLight ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
    inputBorder: isLight ? '#C9C9C9' : 'rgba(255,255,255,0.10)',
    tabBg:       isLight ? '#DCDCDC' : 'rgba(255,255,255,0.05)',
    tabBorder:   isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    redBg:       isLight ? '#FEF2F2' : 'rgba(220,38,38,0.12)',
    redBorder:   isLight ? '#FECACA' : 'rgba(220,38,38,0.22)',
    unbindBg:    isLight ? '#FEF2F2' : 'rgba(220,38,38,0.10)',
    unbindBorder: isLight ? '#FECACA' : 'rgba(220,38,38,0.20)',
    paginBg:     isLight ? '#ECECEC' : 'rgba(255,255,255,0.05)',
    paginBorder: isLight ? '#C9C9C9' : 'rgba(255,255,255,0.08)',
    paginColor:  isLight ? '#333333' : 'rgba(255,255,255,0.68)',
    paginDisabled: isLight ? '#D1D5DB' : 'rgba(255,255,255,0.20)',
  }

  const [rawQuery,  setRawQuery]  = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusF,   setStatusF]   = useState('All')
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(rawQuery), 350)
    return () => clearTimeout(debounceRef.current)
  }, [rawQuery])

  const serverFilter = FILTER_TO_SERVER[statusF] ?? 'all'

  const {
    devices: stickers, page, totalPages, total, loading,
    hasNextPage, hasPreviousPage, goToPage, refresh: refreshList,
  } = usePaginatedDevices(20, {
    search: debouncedQuery,
    status: serverFilter,
    device_type: 'sticker',
    search_scope: 'sn_name',
    initialPage: 1,
  })

  const refreshDevices = useCallback(() => {
    refreshList()
    refreshDeviceCache()
  }, [refreshList, refreshDeviceCache])

  // ── Smooth pagination queue ───────────────────────────────────────────────
  const pendingPageRef = useRef(null)
  const loadingRef     = useRef(loading)
  useEffect(() => { loadingRef.current = loading }, [loading])

  useEffect(() => {
    if (!loading && pendingPageRef.current !== null) {
      const p = pendingPageRef.current
      pendingPageRef.current = null
      goToPage(Math.max(1, p))
    }
  }, [loading, goToPage])

  const goToPagePersisted = useCallback((nextPage) => {
    const safePage = Math.max(1, Number(nextPage) || 1)
    if (loadingRef.current) {
      pendingPageRef.current = safePage
      return
    }
    return goToPage(safePage)
  }, [goToPage])

  /* ── Bind modal state ──────────────────────────────────────────────── */
  const [availableDevices, setAvailableDevices] = useState([])
  const [showBindModal,    setShowBindModal]     = useState(false)
  const [bindSn,           setBindSn]            = useState('')
  const [bindName,         setBindName]          = useState('')
  const [bindClient,       setBindClient]        = useState('')
  const [bindCategory,     setBindCategory]      = useState('')
  const [bindUserId,       setBindUserId]        = useState('')
  const [bindLoading,      setBindLoading]       = useState(false)
  const [bindError,        setBindError]         = useState('')

  /* ── Delete confirm state ──────────────────────────────────────────── */
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      getAvailableDevices()
        .then(list => setAvailableDevices((list || []).filter(d => /^\d+$/.test(String(d.sn ?? '')))))
        .catch(() => setAvailableDevices([]))
    }
  }, [isAdmin, getAvailableDevices])

  const unboundStickers = (cacheDevices || []).filter(d =>
    /^\d+$/.test(String(d.sn ?? '')) && !d.assigned_user_name && !d.user_id
  )

  const openBindModal = (sn = '') => {
    setBindError(''); setBindClient(''); setBindName(''); setBindCategory('')
    setBindSn(sn || '')
    setBindUserId('')
    setShowBindModal(true)
  }

  const closeBindModal = () => {
    setShowBindModal(false)
    setBindSn(''); setBindName(''); setBindClient(''); setBindCategory(''); setBindUserId(''); setBindError('')
  }

  const handleBind = async () => {
    // 5.1 — best-effort client guard against duplicate names among loaded devices.
    const trimmedName = bindName.trim()
    if (trimmedName) {
      const dup = [...(cacheDevices || []), ...(stickers || [])].find(
        d => d.sn !== bindSn && (d.name || '').trim().toLowerCase() === trimmedName.toLowerCase()
      )
      if (dup) { setBindError(`A device named "${trimmedName}" already exists. Names must be unique.`); return }
    }
    if (isAdmin) {
      if (!bindSn || !bindUserId || !bindCategory) {
        setBindError('Please select a sticker, a user, and a category'); return
      }
      setBindError(''); setBindLoading(true)
      try {
        await adminAssignDeviceToUser(bindUserId, bindSn, { name: bindName.trim(), client: bindClient.trim(), category: bindCategory })
        recordBind(bindSn)            // persist bind history immediately
        refreshDevices(); closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind sticker') }
      finally { setBindLoading(false) }
    } else {
      if (!bindSn.trim() || !bindCategory) {
        setBindError('Please select a sticker and a category'); return
      }
      setBindError(''); setBindLoading(true)
      try {
        await bindDevice({ sn: bindSn.trim(), label: bindName.trim() || undefined, category: bindCategory })
        recordBind(bindSn.trim())     // persist bind history immediately
        refreshDevices()
        getAvailableDevices()
          .then(list => setAvailableDevices((list || []).filter(d => /^\d+$/.test(String(d.sn ?? '')))))
          .catch(() => {})
        closeBindModal()
      } catch (err) { setBindError(err.message || 'Failed to bind sticker') }
      finally { setBindLoading(false) }
    }
  }

  const handleUnbind = async (sn, e) => {
    e.stopPropagation()
    if (isAdmin) {
      const device = [...(cacheDevices || []), ...(stickers || [])].find(d => d.sn === sn)
      setDeleteTarget(device || { sn })
    } else {
      if (!window.confirm(`Remove binding for ${sn}?`)) return
      try { await unbindDevice(sn); refreshDevices() } catch {}
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try { await unbindDevice(deleteTarget.sn); refreshDevices(); setDeleteTarget(null) } catch {}
    finally { setDeleteLoading(false) }
  }

  /* ── Map API shape → display rows ─────────────────────────────── */
  const stickerRows = useMemo(() => (stickers || []).map(d => {
    const lastSeen = d.dataRetrievalTime || null
    const hoursAgo = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 99
    const status = hoursAgo < 12 ? 'Active' : 'Offline'
    return {
      id: d.sn || d.local_id,
      displayName: deviceDisplayName(d),
      category: d.category || '',
      company:  d.client || '',
      status,
      hoursAgo,
      battery: typeof d.battery === 'number' ? d.battery : null,
      lastLocation: d.lastLocation || '',
      bindTime: d.bindTime,
      fence_zone_ids: d.fence_zone_ids || [],
      detections: d.detections ?? 0,
    }
  }), [stickers])

  // CSV export — pulls the FULL sticker fleet from the DB (all pages) with
  // owner, bound-at, last location, detections, battery, etc.
  const [exporting, setExporting] = useState(false)
  const exportCSV = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    try {
      await exportDevicesCsv(getDevices, getLatestLocationsBatch, { deviceType: 'sticker', filename: 'stickers.csv' })
    } catch (err) {
      console.error('CSV export failed', err)
    } finally {
      setExporting(false)
    }
  }, [exporting, getDevices, getLatestLocationsBatch])

  // Dark modal input style
  const inputStyle = {
    width: '100%', padding: '10px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, color: '#f4f4f5', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {/* When embedded, the row is lifted to the top-right so the action buttons
          sit alongside the parent Devices page heading instead of in a row of their own. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: embedded ? 'flex-end' : 'space-between', flexWrap: 'wrap', gap: 12 }}>
        {/* Title hidden when embedded in the unified Devices page (avoids a duplicate heading) */}
        {embedded ? null : (
        <div style={{ display: 'flex', alignItems: 'center', gap: isLight ? 12 : 10 }}>
          {isLight ? (
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#A72C32', border: '1px solid #8B2328', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tag style={{ width: 20, height: 20, color: '#FFFFFF' }} />
            </div>
          ) : (
            <div style={{ padding: 9, background: 'rgba(167,44,50,0.14)', borderRadius: 12, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
              <Tag style={{ width: 18, height: 18, color: '#C86068' }} />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.txt1, margin: 0, letterSpacing: isLight ? '-0.02em' : '-0.03em' }}>Smart Stickers</h1>
          </div>
        </div>
        )}

        {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isLight ? (
            <button
              onClick={() => openBindModal()}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                background: '#A72C32', border: '1px solid #8B2328',
                color: '#fff', fontSize: 13, fontWeight: 700,
                boxShadow: '0 2px 8px rgba(167,44,50,0.25)',
                transition: 'background 0.15s, box-shadow 0.15s, transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#8B2328'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(167,44,50,0.35)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#A72C32'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(167,44,50,0.25)' }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              Bind Sticker
            </button>
          ) : (
            <button
              onClick={() => openBindModal()}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                background: 'linear-gradient(135deg, #BF3840 0%, #8B2328 100%)',
                border: '1px solid rgba(167,44,50,0.45)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                boxShadow: '0 4px 14px rgba(167,44,50,0.28)',
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 44px rgba(167,44,50,0.52), 0 6px 22px rgba(0,0,0,0.40)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(167,44,50,0.28)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Bind Sticker
            </button>
          )}
          {/* Export CSV button — full fleet from DB */}
          <button
            onClick={exportCSV}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10, cursor: exporting ? 'wait' : 'pointer',
              background: isLight ? '#ECECEC' : 'rgba(255,255,255,0.06)',
              border: isLight ? '1px solid #C9C9C9' : '1px solid rgba(255,255,255,0.12)',
              color: isLight ? '#333333' : 'rgba(255,255,255,0.70)',
              fontSize: 13, fontWeight: 600,
              opacity: exporting ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!exporting) { e.currentTarget.style.background = isLight ? '#DCDCDC' : 'rgba(255,255,255,0.10)'; e.currentTarget.style.color = isLight ? '#000' : '#FFFFFF' }}}
            onMouseLeave={e => { e.currentTarget.style.background = isLight ? '#ECECEC' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = isLight ? '#333333' : 'rgba(255,255,255,0.70)' }}
          >
            <Download style={{ width: 13, height: 13 }} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        )}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.txt3 }} />
          <input
            value={rawQuery}
            onChange={e => setRawQuery(e.target.value)}
            placeholder="Search by SN or sticker name…"
            style={{
              background: T.inputBg, border: `1px solid ${T.inputBorder}`,
              borderRadius: 10, padding: '8px 12px 8px 32px', fontSize: 12,
              color: isLight ? '#000000' : 'rgba(255,255,255,0.70)', outline: 'none', width: 200,
              boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            }}
            onFocus={e => { if (isLight) { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.08)' } }}
            onBlur={e  => { if (isLight) { e.target.style.borderColor = T.inputBorder; e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' } }}
          />
        </div>

        <div style={{ display: 'flex', gap: 3, padding: 4, background: T.tabBg, border: `1px solid ${T.tabBorder}`, borderRadius: 10, flexWrap: 'wrap' }}>
          {DEVICE_FILTER_TABS.map(s => {
            const active = statusF === s
            const activeStyle = { background: '#A72C32', color: '#fff', border: 'none' }
            const defaultStyle = { background: 'transparent', color: T.txt2, border: 'none' }
            return (
              <button key={s} onClick={() => setStatusF(s)}
                style={{ padding: isLight ? '5px 12px' : '5px 11px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  ...(active ? activeStyle : defaultStyle) }}>
                {s}
              </button>
            )
          })}
        </div>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: isLight ? '#333333' : T.txt3, fontWeight: isLight ? 500 : 400 }}>
          {loading ? 'Loading…' : `${total} sticker${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* ── Card grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: isLight ? 12 : 14 }}>
        {/* Loader — shown on any loading state (search, pagination, first load) */}
        {loading && (
          <div style={{ gridColumn: '1 / -1' }}>
            <TPLLoader label={debouncedQuery ? 'Searching…' : 'Loading stickers…'} />
          </div>
        )}

        {/* LIGHT */}
        {!loading && isLight && stickerRows.map(s => {
          const isActive = s.status === 'Active'
          const dotColor = isActive ? '#059669' : '#DC2626'
          const dotGlow  = isActive ? 'rgba(5,150,105,0.55)' : 'rgba(220,38,38,0.55)'
          return (
            <div key={s.id} onClick={() => navigate(`/stickers/${s.id}`)}
              style={{ ...panel, borderLeft: '3px solid #A72C32', padding: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 4px 16px rgba(167,44,50,0.14), 0 12px 32px rgba(0,0,0,0.08)'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.borderColor='#A72C32' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow=panel.boxShadow; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor='#C9C9C9'; e.currentTarget.style.borderLeftColor='#A72C32' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotColor, boxShadow: `0 0 5px ${dotGlow}` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#000000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayName}</span>
                </div>
                <div style={{ fontSize: 10, color: '#555555', marginTop: 3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 13 }}>{s.id}</div>
              </div>
              <ChevronRight style={{ width: 14, height: 14, color: '#333333', flexShrink: 0 }} />
              {isAdmin && (
                <button onClick={e => handleUnbind(s.id, e)}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#FFFFFF',
                    background: '#A72C32', border: '1px solid #8B2328', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#8B2328' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#A72C32' }}>
                  <Trash2 style={{ width: 10, height: 10 }} /> Unbind
                </button>
              )}
            </div>
          )
        })}

        {/* DARK */}
        {!loading && !isLight && stickerRows.map(s => {
          const isActive = s.status === 'Active'
          const dotColor = isActive ? '#059669' : '#DC2626'
          const dotGlow  = isActive ? 'rgba(5,150,105,0.55)' : 'rgba(220,38,38,0.55)'
          return (
            <div key={s.id} onClick={() => navigate(`/stickers/${s.id}`)}
              style={{ ...panel, padding: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                transition: 'box-shadow 0.22s ease, transform 0.22s ease' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow='0 0 44px rgba(167,44,50,0.40), 0 12px 40px rgba(0,0,0,0.55)'; e.currentTarget.style.transform='translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow=panel.boxShadow; e.currentTarget.style.transform='translateY(0)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: dotColor, boxShadow: `0 0 5px ${dotGlow}` }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.displayName}</span>
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 13 }}>{s.id}</div>
              </div>
              <ChevronRight style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
              {isAdmin && (
                <button onClick={e => handleUnbind(s.id, e)}
                  style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#fff',
                    background: '#A72C32', border: '1px solid rgba(167,44,50,0.60)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#8B2328' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#A72C32' }}>
                  <Trash2 style={{ width: 10, height: 10 }} /> Unbind
                </button>
              )}
            </div>
          )
        })}

        {!loading && stickerRows.length === 0 && (
          <div style={{ gridColumn: '1 / -1', ...panel, padding: '60px 22px', textAlign: 'center', color: T.txt3, fontSize: 13 }}>
            No stickers match your filters
          </div>
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, padding: '4px 2px', opacity: loading ? 0.45 : 1, pointerEvents: loading ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
          <span style={{ fontSize: 11, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)', marginRight: 4, fontWeight: 500 }}>
            {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
            {pendingPageRef.current && <span style={{ marginLeft: 6, color: '#C86068', fontStyle: 'italic' }}>→ pg {pendingPageRef.current}</span>}
          </span>
          <ThemeProvider theme={muiTheme}>
            <Stack>
              <Pagination
                count={totalPages} page={page}
                onChange={(_, p) => goToPagePersisted(p)}
                color="primary" variant="outlined" shape="rounded" size="small"
                sx={{ '& .MuiPaginationItem-root': { fontFamily: 'inherit', fontSize: 11, fontWeight: 600, color: isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)', borderColor: isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)', '&:hover': { background: 'rgba(167,44,50,0.08)', borderColor: 'rgba(167,44,50,0.40)' }, '&.Mui-selected': { background: isLight ? 'rgba(167,44,50,0.12)' : 'rgba(167,44,50,0.25)', color: isLight ? '#A72C32' : '#E87178', borderColor: isLight ? 'rgba(167,44,50,0.40)' : 'rgba(167,44,50,0.55)', fontWeight: 700, '&:hover': { background: isLight ? 'rgba(167,44,50,0.18)' : 'rgba(167,44,50,0.35)' } }, '&.MuiPaginationItem-ellipsis': { border: 'none', color: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.30)' } } }}
              />
            </Stack>
          </ThemeProvider>
        </div>
      )}

      {/* ── Bind Modal (ALWAYS dark overlay) ─────────────────────────────────────── */}
      {showBindModal && (
        <ModalPortal>
        <div onClick={closeBindModal} style={modalOverlay}>
          <div onClick={e => e.stopPropagation()} style={{ ...modalPanel, width: '100%', maxWidth: 440, margin: 'auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, background: 'rgba(167,44,50,0.14)', borderRadius: 8, border: '1px solid rgba(167,44,50,0.24)', display: 'flex' }}>
                  <Link2 style={{ width: 14, height: 14, color: '#C86068' }} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF' }}>Bind Sticker</span>
              </div>
              <button onClick={closeBindModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.38)', padding: 4, display: 'flex', borderRadius: 6 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {bindError && (
                <div style={{ padding: '8px 12px', background: 'rgba(127,29,29,0.20)', border: '1px solid rgba(127,29,29,0.40)', borderRadius: 6, color: '#fca5a5', fontSize: 12 }}>
                  {bindError}
                </div>
              )}

              {isAdmin ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Serial Number <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    {unboundStickers.length === 0
                      ? <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>No unbound stickers available</p>
                      : (
                        <SearchSelect
                          items={unboundStickers}
                          selectedValue={bindSn}
                          onSelect={setBindSn}
                          labelOf={it => it.sn + (it.client ? ` — ${it.client}` : ' — No client')}
                          keyOf={it => it.sn}
                          placeholder="Type or select a serial number…"
                          emptyMsg="No matching stickers"
                          inputSt={inputStyle}
                        />
                      )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Assign to User <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    {(!users || users.length === 0)
                      ? <p style={{ color: 'rgba(255,255,255,0.32)', fontSize: 12, margin: 0 }}>No users available</p>
                      : (
                        <SearchSelect
                          items={users}
                          selectedValue={bindUserId}
                          onSelect={setBindUserId}
                          labelOf={it => it.email + (it.name ? ` (${it.name})` : '')}
                          keyOf={it => it.id}
                          placeholder="Type or select a user…"
                          emptyMsg="No matching users"
                          inputSt={inputStyle}
                        />
                      )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Sticker Label <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input type="text" placeholder="e.g. Pallet A12, Shipment 001…" value={bindName} onChange={e => setBindName(e.target.value)} style={inputStyle} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Category <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    <select value={bindCategory} onChange={e => setBindCategory(e.target.value)} style={SELECT_STYLE}>
                      <option value="" disabled style={SELECT_OPT}>— Select category —</option>
                      {BIND_CATS.map(c => (
                        <option key={c} value={c} style={SELECT_OPT}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Client <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input type="text" placeholder="e.g. TPL Trakker" value={bindClient} onChange={e => setBindClient(e.target.value)} style={inputStyle} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Sticker Serial Number <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    <SearchSelect
                      items={availableDevices}
                      selectedValue={bindSn}
                      onSelect={setBindSn}
                      labelOf={it => it.sn + ((it.name || it.client) ? ` — ${it.name || it.client}` : '')}
                      keyOf={it => it.sn}
                      placeholder="Type or select a serial number…"
                      emptyMsg="No matching stickers"
                      inputSt={{ ...inputStyle, border: `1px solid ${bindError ? 'rgba(127,29,29,0.60)' : 'rgba(255,255,255,0.08)'}` }}
                      allowFreeText
                      onFreeTextChange={setBindSn}
                    />
                    <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.26)' }}>
                      {availableDevices.length > 0
                        ? `${availableDevices.length} sticker${availableDevices.length !== 1 ? 's' : ''} available — click to browse or type to search`
                        : 'Enter the serial number printed on your sticker.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Sticker Label <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)' }}>(optional)</span>
                    </label>
                    <input
                      type="text" placeholder="e.g. Pallet A12, Shipment 001…"
                      value={bindName} onChange={e => setBindName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleBind()}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.58)' }}>
                      Category <span style={{ color: '#C86068' }}>*</span>
                    </label>
                    <select value={bindCategory} onChange={e => setBindCategory(e.target.value)} style={SELECT_STYLE}>
                      <option value="" disabled style={SELECT_OPT}>— Select category —</option>
                      {BIND_CATS.map(c => (
                        <option key={c} value={c} style={SELECT_OPT}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <button
                onClick={closeBindModal}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}
              >Cancel</button>
              <button
                onClick={handleBind}
                disabled={bindLoading || (isAdmin ? (!bindSn || !bindUserId || !bindCategory) : (!bindSn.trim() || !bindCategory))}
                style={{
                  padding: '9px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: (bindLoading || (isAdmin ? !bindSn || !bindUserId || !bindCategory : !bindSn.trim() || !bindCategory)) ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #A72C32 0%, #8B2328 100%)',
                  border: '1px solid rgba(167,44,50,0.40)', color: '#fff',
                  opacity: (bindLoading || (isAdmin ? (!bindSn || !bindUserId || !bindCategory) : (!bindSn.trim() || !bindCategory))) ? 0.50 : 1,
                  transition: 'opacity 0.15s',
                }}
              >{bindLoading ? 'Saving…' : 'Bind Sticker'}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Unbind Confirm Modal (ALWAYS dark) ──────────────────────────────── */}
      {deleteTarget && (
        <ModalPortal>
        <div onClick={() => !deleteLoading && setDeleteTarget(null)} style={modalOverlay}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ ...modalPanel, width: '100%', maxWidth: 380, padding: 22, margin: 'auto' }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', marginBottom: 8 }}>Unbind Sticker</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.52)', marginBottom: 20 }}>
              You are about to permanently remove the binding for device{' '}
              <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{deleteTarget.sn}</span>
              {deleteTarget.assigned_user_name ? ` from ${deleteTarget.assigned_user_name}` : ''}.{' '}
              This will disconnect the device from its owner and cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.68)' }}
              >Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                  border: '1px solid rgba(127,29,29,0.40)', color: '#fca5a5',
                  opacity: deleteLoading ? 0.55 : 1,
                }}
              >{deleteLoading ? 'Removing…' : 'Unbind'}</button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
