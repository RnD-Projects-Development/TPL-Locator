import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { selfCrumbs, saveTrail, loadTrail } from '../utils/breadcrumbs.js'

/* ─────────────────────────────────────────────────────────────────────────────
   useTrailNav — navigate onward while accumulating the breadcrumb trail.

   pushTrail(to, opts?) navigates to `to` with a `trail` in location.state equal
   to:  [...ancestors-of-current-page, ...this-page's-own-crumbs].

   opts:
     - selfCrumbs : override the crumb(s) representing the current page
                    (e.g. a device detail page supplying its display name).
     - state      : extra location.state to merge alongside `trail`.
     - replace    : passthrough to navigate().
────────────────────────────────────────────────────────────────────────────── */
export function useTrailNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return useCallback((to, opts = {}) => {
    const curUrl = location.pathname + (location.search || '')
    const parentTrail = location.state?.trail || loadTrail(curUrl) || []
    const mine = opts.selfCrumbs || selfCrumbs(location.pathname, location.search)
    const trail = [...parentTrail, ...mine]

    saveTrail(to, trail)
    navigate(to, {
      replace: !!opts.replace,
      state: { ...(opts.state || {}), trail },
    })
  }, [location.pathname, location.search, location.state, navigate])
}

/* Convenience: the immediate parent crumb (for a page's own "Back" button). */
export function useBackTarget(fallback = '/dashboard') {
  const location = useLocation()
  const curUrl = location.pathname + (location.search || '')
  const trail = location.state?.trail || loadTrail(curUrl) || []
  if (trail.length) return trail[trail.length - 1].url
  return location.state?.from || fallback
}
