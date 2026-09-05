import { emitDevicesUpdated } from './deviceEvents.js';

const FLEET_TTL = 5 * 60 * 1000;

let _fleetCache = null;
let _fleetFetchedAt = null;
let _fleetInflight = null;

export function isFleetCacheValid() {
  return Boolean(_fleetCache && _fleetFetchedAt && Date.now() - _fleetFetchedAt < FLEET_TTL);
}

export function getFleetCache() {
  return isFleetCacheValid() ? _fleetCache : null;
}

export function invalidateFleetCache(emit = true) {
  _fleetCache = null;
  _fleetFetchedAt = null;
  _fleetInflight = null;
  if (emit) {
    emitDevicesUpdated();
  }
}

export async function fetchFleetDevices(getDevices, { force = false } = {}) {
  if (!getDevices) return [];

  if (!force && isFleetCacheValid()) {
    return _fleetCache;
  }

  if (!force && _fleetInflight) {
    return _fleetInflight;
  }

  _fleetInflight = (async () => {
    const FETCH_LIMIT = 200;
    let all = [];
    let page = 1;

    while (true) {
      const data = await getDevices({ page, limit: FETCH_LIMIT, status: "all" });
      const list = Array.isArray(data) ? data : data?.devices ?? [];
      const total = Number(data?.total ?? list.length) || 0;
      all = [...all, ...list];
      if (all.length >= total || list.length < FETCH_LIMIT || page >= 10) break;
      page += 1;
    }

    const seen = new Set();
    all = all.filter((d) => {
      const key = String(d.sn);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    _fleetCache = all;
    _fleetFetchedAt = Date.now();
    return all;
  })();

  try {
    return await _fleetInflight;
  } finally {
    _fleetInflight = null;
  }
}

/** Warm the fleet cache in the background after login. */
export function prefetchFleetDevices(getDevices) {
  if (!getDevices || isFleetCacheValid() || _fleetInflight) return;
  void fetchFleetDevices(getDevices).catch(() => { });
}
