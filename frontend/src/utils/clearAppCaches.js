import { resetMapCache } from '../components/MapView.jsx';
import { invalidatePaginatedCache } from '../hooks/usePaginatedDevices.js';
import { clearLocatorPageState } from './locatorPageState.js';
import { resetTplGeocodeCache } from './tplGeocode.js';

export const APP_CACHE_STORAGE_KEYS = {
  BIND: 'tpl_bind_cache_v2',
  ALERTS_READ: 'tpl_alert_read_ids',
  SIDEBAR_RECENT: 'tpl_sidebar_recent_devices',
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
  clearLocatorPageState();
  resetTplGeocodeCache();
  resetMapCache();

  try {
    localStorage.removeItem(APP_CACHE_STORAGE_KEYS.BIND);
    localStorage.removeItem(APP_CACHE_STORAGE_KEYS.ALERTS_READ);
    localStorage.removeItem(APP_CACHE_STORAGE_KEYS.SIDEBAR_RECENT);
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
