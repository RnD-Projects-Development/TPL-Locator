/* ─────────────────────────────────────────────────────────────────────────────
   Breadcrumb trail model
   ───────────────────────
   A breadcrumb "crumb" is { label, url } where `url` is a full path+query used
   both to navigate back AND (for list pages) to restore that page's filter
   state.

   The active navigation trail is carried in React Router's `location.state.trail`
   (an array of ANCESTOR crumbs — everything above the current page). It is
   mirrored into sessionStorage keyed by destination URL so the trail survives a
   hard refresh / direct re-render where `location.state` is momentarily absent.

   The CURRENT page contributes its own crumb(s) via `selfCrumbs()`, appended to
   the trail at render time (Header) and at navigation time (useTrailNav).
────────────────────────────────────────────────────────────────────────────── */

const DEVICE_TAB_LABELS = { locator: 'Locators', sticker: 'Smart Stickers' }

// ── selfCrumbs: the crumb(s) that REPRESENT a page as a trail segment ──────────
// No section headers here (those only appear in the static fallback). Some pages
// contribute two crumbs (e.g. Devices + the active type tab).
export function selfCrumbs(pathname, search = '') {
  const sp = new URLSearchParams(search || '')

  if (pathname === '/dashboard')   return [{ label: 'Dashboard',   url: '/dashboard' }]
  if (pathname === '/field-staff') return [{ label: 'Field Staff', url: '/field-staff' }]
  if (pathname === '/alerts')      return [{ label: 'Alerts',      url: '/alerts' }]
  if (pathname === '/fence')       return [{ label: 'Fence',       url: '/fence' }]
  if (pathname === '/users')       return [{ label: 'Users',       url: '/users' }]
  if (pathname === '/reports')     return [{ label: 'Reports',     url: '/reports' + (search || '') }]
  if (pathname === '/map')         return [{ label: 'Map View',    url: '/map' + (search || '') }]
  if (pathname === '/playback')    return [{ label: 'Playback',    url: '/playback' + (search || '') }]

  if (pathname === '/devices') {
    const tab = sp.get('tab')
    if (tab === 'locator' || tab === 'sticker') {
      // Parent "Devices" jumps to the unified All view; the tab crumb restores
      // the exact filtered view the user was on (tab + status + …).
      return [
        { label: 'Devices',                url: '/devices?tab=all' },
        { label: DEVICE_TAB_LABELS[tab],   url: '/devices' + (search || `?tab=${tab}`) },
      ]
    }
    return [{ label: 'Devices', url: '/devices' + (search || '?tab=all') }]
  }

  if (pathname.startsWith('/locators/')) return [{ label: pathname.split('/')[2], url: pathname }]
  if (pathname.startsWith('/stickers/')) return [{ label: pathname.split('/')[2], url: pathname }]

  // Fallback: single crumb from the last path segment.
  const seg = pathname.replace(/^\//, '') || 'Home'
  return [{ label: seg, url: pathname + (search || '') }]
}

/* ── sessionStorage trail mirror ──────────────────────────────────────────────
   Stored as a small { [url]: trail } map so several open chains coexist and a
   refresh on any of them recovers the right trail. */
const STORE_KEY = 'bc:trails'
const MAX_ENTRIES = 40

function readStore() {
  try { return JSON.parse(sessionStorage.getItem(STORE_KEY)) || {} }
  catch { return {} }
}
function writeStore(map) {
  try {
    const keys = Object.keys(map)
    if (keys.length > MAX_ENTRIES) {
      // Drop oldest-inserted entries (object key order is insertion order).
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete map[k]
    }
    sessionStorage.setItem(STORE_KEY, JSON.stringify(map))
  } catch { /* storage full / unavailable — trail still works via location.state */ }
}

export function saveTrail(url, trail) {
  const map = readStore()
  delete map[url]           // re-insert at end to keep it "freshest"
  map[url] = trail
  writeStore(map)
}
export function loadTrail(url) {
  return readStore()[url] || null
}

/* ── Static fallback (no trail) ───────────────────────────────────────────────
   Preserves the original section-aware breadcrumbs for direct navigation /
   fresh visits where there is no captured path. */
const STATIC = {
  '/dashboard':   ['Dashboard'],
  '/search':      ['Search'],
  '/map':         ['Intelligence', 'Map View'],
  '/playback':    ['Intelligence', 'Playback'],
  '/fence':       ['Intelligence', 'Fence'],
  '/alerts':      ['Alerts'],
  '/reports':     ['Reports & Admin', 'Reports'],
  '/field-staff': ['Dashboard', 'Field Staff'],
  '/users':       ['Reports & Admin', 'Users'],
}
const LABEL_ROUTE = {
  'Dashboard':       '/dashboard',
  'Devices':         '/devices?tab=all',
  'Locators':        '/devices?tab=locator',
  'Smart Stickers':  '/devices?tab=sticker',
  'Offline Devices': '/devices?status=offline',
  'Map View':        '/map',
  'Playback':        '/playback',
  'Fence':           '/fence',
  'Alerts':          '/alerts',
  'Reports':         '/reports',
  'Field Staff':     '/field-staff',
  'Users':           '/users',
  'Search':          '/search',
}

function staticCrumbs(pathname, search) {
  // Devices + detail pages get the same tab-aware segmentation used in trails.
  if (pathname === '/devices') return markCurrent(selfCrumbs(pathname, search))
  if (pathname.startsWith('/locators/'))
    return markCurrent([{ label: 'Devices', url: LABEL_ROUTE['Devices'] }, { label: 'Locators', url: LABEL_ROUTE['Locators'] }, { label: pathname.split('/')[2], url: pathname }])
  if (pathname.startsWith('/stickers/'))
    return markCurrent([{ label: 'Devices', url: LABEL_ROUTE['Devices'] }, { label: 'Smart Stickers', url: LABEL_ROUTE['Smart Stickers'] }, { label: pathname.split('/')[2], url: pathname }])

  const labels = STATIC[pathname]
  if (labels) {
    return markCurrent(labels.map(l => ({ label: l, url: LABEL_ROUTE[l] || null })))
  }
  return markCurrent(selfCrumbs(pathname, search))
}

function markCurrent(list) {
  return list.map((c, i) => ({ ...c, isCurrent: i === list.length - 1 }))
}

/* ── buildCrumbs: the render list for the Header ───────────────────────────────
   Returns [{ label, url, isCurrent }]. `url` is null for non-navigable segments
   (section headers, the current page). */
export function buildCrumbs(pathname, search = '', state = null) {
  const url = pathname + (search || '')
  const trail = (state?.trail && state.trail.length ? state.trail : loadTrail(url)) || null

  if (trail && trail.length) {
    const all = [...trail, ...selfCrumbs(pathname, search)]
    // De-dupe accidental consecutive repeats (e.g. re-entering the same page).
    const deduped = all.filter((c, i) => i === 0 || c.url !== all[i - 1].url)
    return markCurrent(deduped)
  }

  return staticCrumbs(pathname, search)
}
