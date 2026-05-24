import React, { useState, useEffect, useRef } from 'react'
import { Search as SearchIcon, Radio, Tag, MapPin, Clock, Battery, ChevronRight, X, TrendingUp, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Badge from '../components/common/Badge.jsx'
import { usePaginatedDevices } from '../hooks/usePaginatedDevices.js'

const panel = {
  background: 'rgba(18,18,18,0.90)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: '16px',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}

const RECENT_KEY = 'tpl_recent_searches'
const MAX_RECENT  = 8

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function saveRecent(list) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

export default function Search() {
  const navigate  = useNavigate()
  const [query, setQuery]         = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [focused, setFocused]     = useState(false)
  const [recentSearches, setRecentSearches] = useState(loadRecent)
  const inputRef   = useRef(null)
  const debounceRef = useRef(null)

  // Debounce search → server-side via usePaginatedDevices
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query.trim()), 350)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const { devices: searchDocs, loading: searchLoading, total } = usePaginatedDevices(20, {
    search: debouncedQuery,
  })

  // Map API shape → unified display shape (shared by search results AND recently active)
  const mappedDocs = searchDocs.map(d => {
    const lastSeen    = d.dataRetrievalTime || null
    const hoursAgo    = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) / 3600000 : 99
    const isStickerSN = /^\d+$/.test(String(d.sn ?? ''))
    const displayName = d.assigned_user_name || d.name || d.sn || '—'
    return {
      id:           d.sn || d.local_id,
      userName:     isStickerSN ? null      : displayName,
      cargoName:    isStickerSN ? displayName : null,
      category:     d.category || '',
      lastLocation: d.lastLocation || '',
      hoursAgo,
      battery:      typeof d.battery === 'number' ? d.battery : null,
      status:       (d.status === 'offline' && hoursAgo > 24) ? 'Missing'
                  : (d.status === 'offline' && hoursAgo > 12) ? 'At Risk'
                  : 'Active',
      type:         isStickerSN ? 'sticker' : 'locator',
      route:        isStickerSN ? `/stickers/${d.sn}` : `/locators/${d.sn}`,
    }
  })

  // When a query is active → show filtered results split by type
  // When idle → the same first-20 devices become the "Recently Active" list
  const searchResults = debouncedQuery ? mappedDocs : []
  const locators      = searchResults.filter(r => r.type === 'locator')
  const stickers      = searchResults.filter(r => r.type === 'sticker')
  const recentDevices = !debouncedQuery ? mappedDocs : []

  const suggestions = []  // suggestions removed — server-side search replaces client-side

  function commitSearch(term) {
    const t = term.trim()
    if (!t) return
    setRecentSearches(prev => {
      const next = [t, ...prev.filter(s => s.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT)
      saveRecent(next)
      return next
    })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') commitSearch(query)
  }

  function pickSuggestion(s) {
    setQuery(s)
    commitSearch(s)
  }

  function clearRecent(term, e) {
    e.stopPropagation()
    setRecentSearches(prev => {
      const next = prev.filter(s => s !== term)
      saveRecent(next)
      return next
    })
  }

  useEffect(() => { inputRef.current?.focus() }, [])


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '820px', margin: '0 auto' }}>

      {/* Page heading */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '10px',
            background: 'rgba(164,44,50,0.15)', border: '1px solid rgba(164,44,50,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SearchIcon style={{ width: '15px', height: '15px', color: '#C44E54' }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.03em', margin: 0 }}>Search</h1>
        </div>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', margin: 0, paddingLeft: '42px' }}>
          Find any device, shipment, owner, or location
        </p>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative' }}>
        {/* Glow ring when focused */}
        {focused && (
          <div style={{
            position: 'absolute', inset: '-2px', borderRadius: '50px',
            background: 'transparent',
            border: '1px solid rgba(164,44,50,0.50)',
            boxShadow: '0 0 24px rgba(164,44,50,0.20)',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
        )}
        <div style={{
          position: 'relative', zIndex: 1,
          background: focused ? 'rgba(22,6,6,0.95)' : 'rgba(18,18,18,0.90)',
          border: `1px solid ${focused ? 'rgba(164,44,50,0.45)' : 'rgba(255,255,255,0.09)'}`,
          borderRadius: '50px',
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '0 18px',
          transition: 'background 0.2s, border-color 0.2s',
        }}>
          <SearchIcon style={{ width: '18px', height: '18px', color: focused ? '#C44E54' : 'rgba(255,255,255,0.30)', flexShrink: 0, transition: 'color 0.2s' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); commitSearch(query) }}
            placeholder="Search by name, device ID, shipment, location..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: '14px', color: '#FFFFFF', padding: '14px 0',
              fontFamily: 'inherit', letterSpacing: '-0.01em',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            >
              <X style={{ width: '12px', height: '12px' }} />
            </button>
          )}
        </div>
      </div>

      {/* ── EMPTY STATE (no query) ── */}
      {!query && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Suggestion chips */}
          <div style={{ ...panel, padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <TrendingUp style={{ width: '14px', height: '14px', color: '#C44E54' }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Suggested Searches</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => pickSuggestion(s)}
                  style={{
                    padding: '7px 14px', borderRadius: '20px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
                    color: 'rgba(255,255,255,0.55)', fontSize: '12px', fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(164,44,50,0.12)'
                    e.currentTarget.style.borderColor = 'rgba(164,44,50,0.35)'
                    e.currentTarget.style.color = '#C44E54'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.55)'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.25)' }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent Searches</span>
                  </div>
                  <button
                    onClick={() => { setRecentSearches([]); saveRecent([]) }}
                    style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#C44E54'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}
                  >
                    Clear all
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {recentSearches.map(r => (
                    <button
                      key={r}
                      onClick={() => pickSuggestion(r)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 10px', borderRadius: '8px',
                        background: 'transparent', border: 'none',
                        color: 'rgba(255,255,255,0.45)', fontSize: '13px',
                        cursor: 'pointer', transition: 'background 0.12s', fontFamily: 'inherit',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Clock style={{ width: '12px', height: '12px', flexShrink: 0, color: 'rgba(255,255,255,0.20)' }} />
                      <span style={{ flex: 1 }}>{r}</span>
                      <span
                        onClick={(e) => clearRecent(r, e)}
                        style={{ padding: '2px 4px', color: 'rgba(255,255,255,0.18)', fontSize: '11px', lineHeight: 1 }}
                        onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.color = '#f87171' }}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.18)'}
                      >
                        <X style={{ width: '10px', height: '10px' }} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recently active devices — shown when search bar is idle */}
          {!debouncedQuery && (
          <div style={{ ...panel, padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap style={{ width: '14px', height: '14px', color: '#C44E54' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recently Active Devices</span>
              </div>
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{total} total</span>
            </div>
            {searchLoading && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', padding: '12px 0' }}>Loading…</div>
            )}
            {!searchLoading && recentDevices.length === 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', padding: '12px 0' }}>No devices found</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {recentDevices.map((d, i) => {
                const isLocator = !!d.userName
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(isLocator ? `/locators/${d.id}` : `/stickers/${d.id}`)}
                    style={{
                      display: 'grid', gridTemplateColumns: '28px 1fr auto',
                      alignItems: 'center', gap: '12px',
                      padding: '10px 10px', borderRadius: '10px',
                      background: 'transparent', border: 'none',
                      cursor: 'pointer', transition: 'background 0.12s', fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(164,44,50,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: isLocator ? 'rgba(164,44,50,0.12)' : 'rgba(124,58,237,0.12)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isLocator
                        ? <Radio style={{ width: '13px', height: '13px', color: '#C44E54' }} />
                        : <Tag style={{ width: '13px', height: '13px', color: '#A78BFA' }} />
                      }
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.80)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isLocator ? d.userName : d.cargoName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.30)', fontFamily: 'monospace' }}>{d.id}</div>
                    </div>
                    <div style={{
                      fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px',
                      background: d.status === 'Active' || d.status === 'In Transit' ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.10)',
                      color: d.status === 'Active' || d.status === 'In Transit' ? '#4ade80' : '#f87171',
                      border: `1px solid ${d.status === 'Active' || d.status === 'In Transit' ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.22)'}`,
                      whiteSpace: 'nowrap',
                    }}>
                      {d.status}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          )}

        </div>
      )}

      {/* ── NO RESULTS ── */}
      {query && total === 0 && (
        <div style={{ ...panel, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <SearchIcon style={{ width: '22px', height: '22px', color: 'rgba(255,255,255,0.18)' }} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.60)', marginBottom: '6px' }}>No results found</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.28)' }}>No matches for <span style={{ color: '#C44E54' }}>"{query}"</span> — try a device ID, owner name, or location</div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.30)', fontWeight: 600 }}>
            <span style={{ color: '#C44E54', fontWeight: 700 }}>{total}</span> result{total !== 1 ? 's' : ''} for <span style={{ color: 'rgba(255,255,255,0.50)' }}>"{query}"</span>
          </div>

          {/* Locator results */}
          {locators.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                <Radio style={{ width: '13px', height: '13px', color: '#C44E54' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>BLE Locators ({locators.length})</span>
              </div>
              {locators.map(l => (
                <div
                  key={l.id}
                  onClick={() => navigate(`/locators/${l.id}`)}
                  style={{
                    ...panel,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(164,44,50,0.35)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(164,44,50,0.12)', border: '1px solid rgba(164,44,50,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Radio style={{ width: '16px', height: '16px', color: '#C44E54' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>{l.userName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#C44E54', fontWeight: 600 }}>{l.id}</span>
                          <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: '10px' }}>·</span>
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{l.category}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Badge status={l.status} size="xs" />
                      <ChevronRight style={{ width: '15px', height: '15px', color: 'rgba(255,255,255,0.20)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                      <MapPin style={{ width: '11px', height: '11px' }} />{l.lastLocation}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: l.battery <= 20 ? '#F59E0B' : 'rgba(255,255,255,0.35)' }}>
                      <Battery style={{ width: '11px', height: '11px' }} />{l.battery}%
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                      <Clock style={{ width: '11px', height: '11px' }} />
                      {l.hoursAgo < 1 ? `${Math.round(l.hoursAgo * 60)}m ago` : `${l.hoursAgo}h ago`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sticker results */}
          {stickers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '2px' }}>
                <Tag style={{ width: '13px', height: '13px', color: '#A78BFA' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Smart Devices ({stickers.length})</span>
              </div>
              {stickers.map(s => (
                <div
                  key={s.id}
                  onClick={() => navigate(`/stickers/${s.id}`)}
                  style={{
                    ...panel,
                    padding: '16px 18px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, transform 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Tag style={{ width: '16px', height: '16px', color: '#A78BFA' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>{s.cargoName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#A78BFA', fontWeight: 600 }}>{s.id}</span>
                          {s.shipmentId && (
                            <>
                              <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: '10px' }}>·</span>
                              <span style={{ fontSize: '11px', color: '#C44E54', fontWeight: 600 }}>{s.shipmentId}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Badge status={s.status} size="xs" />
                      <ChevronRight style={{ width: '15px', height: '15px', color: 'rgba(255,255,255,0.20)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                      <MapPin style={{ width: '11px', height: '11px' }} />{s.lastLocation}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: s.battery <= 20 ? '#F59E0B' : 'rgba(255,255,255,0.35)' }}>
                      <Battery style={{ width: '11px', height: '11px' }} />{s.battery}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
