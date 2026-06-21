import { resetMapCache } from '../components/MapView.jsx';
import { clearInflightApiCache } from '../hooks/useCityTag.js';
import { invalidatePaginatedCache } from '../hooks/usePaginatedDevices.js';
import { invalidateFleetCache } from './fleetCache.js';
import { clearLocatorPageState } from './locatorPageState.js';
import { clearSidebarPageState } from './sidebarPageState.js';

export const APP_CACHE_STORAGE_KEYS = {
  BIND: 'tpl_bind_cache_v2',
  ALERTS_READ: 'tpl_alert_read_ids',
  SIDEBAR_RECENT: 'tpl_sidebar_recent_devices',
  RECENT_SEARCHES: 'tpl_recent_searches',
  LAST_LOGIN: 'citytag_last_login',
};

const resetListeners = new Set();

/** Register in-memory cache reset (context providers). Returns unsubscribe. */
export function registerCacheResetListener(fn) {
  resetListeners.add(fn);
  return () => resetListeners.delete(fn);
}

/** Clear all session/user caches. Call on logout before clearing auth. */
export function clearAppCaches() {
  invalidatePaginatedCache();
  invalidateFleetCache();
  clearInflightApiCache();
  clearLocatorPageState();
  clearSidebarPageState();
  resetMapCache();

  try {
    Object.values(APP_CACHE_STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch {
    /* ignore */
  }

  resetListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
