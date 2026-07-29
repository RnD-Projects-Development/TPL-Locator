import { useCallback, useState } from 'react'

// Most-recent-first search history backed by localStorage. `key` must be one of
// the SEARCH_HISTORY_* entries in APP_CACHE_STORAGE_KEYS so clearAppCaches()
// wipes it on logout. Terms are recorded explicitly (on Enter / on pick), never
// while typing, so the list stays free of half-typed fragments.
const MAX = 8

function load(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

function persist(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* ignore */ }
}

export function useSearchHistory(key) {
  const [history, setHistory] = useState(() => load(key))

  // Push a term to the top, de-duped case-insensitively, capped at MAX.
  const record = useCallback((term) => {
    const t = (term || '').trim()
    if (!t) return
    setHistory(prev => {
      const next = [t, ...prev.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX)
      persist(key, next)
      return next
    })
  }, [key])

  const remove = useCallback((term) => {
    setHistory(prev => {
      const next = prev.filter(x => x !== term)
      persist(key, next)
      return next
    })
  }, [key])

  const clearAll = useCallback(() => {
    setHistory([])
    persist(key, [])
  }, [key])

  return { history, record, remove, clearAll }
}
