import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useCityTag } from '../hooks/useCityTag.js';
import { useBindCache } from './BindCacheContext.jsx';
import { parseKMLText } from '../utils/geofenceUtils.js';
import { registerCacheResetListener } from '../utils/clearAppCaches.js';

const SUMMARY_CACHE_MS = 5 * 60 * 1000; // 5 minutes — matches device list cache

const EMPTY_SUMMARY = {
  total: 0,
  assigned: 0,
  locators: 0,
  stickers: 0,
  online: 0,
  offline: 0,
  weekly_new_locators: 0,
  weekly_new_stickers: 0,
};

// ── Utilities (duplicated from HomePage to keep context self-contained) ────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function deviceSignature(devices) {
  return (devices || [])
    .map(d => d?.sn ?? '')
    .filter(Boolean)
    .sort()
    .join('|');
}

// Stored timestamps are PKT wall-clock and the backend matches query bounds
// directly, so emit the day's naive PKT wall-clock with no offset.
const pad2 = (n) => String(n).padStart(2, "0");
function naiveLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
         `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function dayRange(dateStr, isLive) {
  const start = `${dateStr}T00:00:00`;
  // Live: extend ~2h past now (PKT wall-clock) so the newest fixes are included.
  const end = isLive
    ? naiveLocal(new Date(Date.now() + 2 * 3600 * 1000))
    : `${dateStr}T23:59:59`;
  return { start, end };
}

// ── Context ───────────────────────────────────────────────────────────────────
const HomePageCacheContext = createContext(null);

export function HomePageCacheProvider({ children }) {
  const { getDevices, getDevicesSummary, getLatestLocationsBatch, getPlaybackBatch } = useCityTag();
  const { updateFromDevices } = useBindCache();

  const [filters, setFilters] = useState({ region: 'all', area: 'all', areaId: null, date: todayStr() });
  const [devices, setDevices] = useState([]);
  const [devLoading, setDevLoading] = useState(false);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [locations, setLocations] = useState({});
  const [locSync, setLocSync] = useState(null);
  const [activityData, setActivityData] = useState({});
  const [chartLoading, setChartLoading] = useState(false);
  const [kmlAreas, setKmlAreas] = useState([]);

  // Stable refs so callbacks don't need devices/filters in their dep arrays
  const devicesRef = useRef([]);
  const filtersRef = useRef(filters);
  useEffect(() => { devicesRef.current = devices; }, [devices]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const deviceCacheRef = useRef({ key: '', fetchedAt: 0, data: [] });
  const summaryCacheRef = useRef({ fetchedAt: 0, data: EMPTY_SUMMARY });
  const locationCacheRef = useRef({ key: '', fetchedAt: 0, data: {} });
  const activityCacheRef = useRef(new Map());

  const locationRequestRef = useRef(0);
  const activityRequestRef = useRef(0);

  const resetInMemoryCache = useCallback(() => {
    deviceCacheRef.current = { key: '', fetchedAt: 0, data: [] };
    summaryCacheRef.current = { fetchedAt: 0, data: EMPTY_SUMMARY };
    locationCacheRef.current = { key: '', fetchedAt: 0, data: {} };
    activityCacheRef.current = new Map();
    locationRequestRef.current = 0;
    activityRequestRef.current = 0;
    setFilters({ region: 'all', area: 'all', areaId: null, date: todayStr() });
    setDevices([]);
    setDevLoading(false);
    setSummary(EMPTY_SUMMARY);
    setSummaryLoading(false);
    setLocations({});
    setLocSync(null);
    setActivityData({});
    setChartLoading(false);
  }, []);

  useEffect(() => registerCacheResetListener(resetInMemoryCache), [resetInMemoryCache]);

  const fetchDevices = useCallback(async ({ force = false, silent = false } = {}) => {
    const cacheKey = 'devices';
    const cacheAgeMs = Date.now() - deviceCacheRef.current.fetchedAt;
    if (!force && deviceCacheRef.current.key === cacheKey && cacheAgeMs < 5 * 60 * 1000 && deviceCacheRef.current.data.length) {
      setDevices(deviceCacheRef.current.data);
      updateFromDevices(deviceCacheRef.current.data);
      return deviceCacheRef.current.data;
    }

    if (!silent) setDevLoading(true);
    try {
      // Backend hard-caps `limit` at 500 per request, so page through the rest
      // to load the whole fleet — dashboard counts (unassigned, per-user, top
      // devices) must reflect ALL devices, not just the first page.
      const PAGE = 500;
      const MAX_PAGES = 6; // safety bound: up to 3000 devices
      const first = await getDevices({ page: 1, limit: PAGE });
      let list = Array.isArray(first) ? first : (first?.devices ?? []);
      const total = Number(first?.total) || list.length;
      const pages = Math.min(MAX_PAGES, Math.ceil(total / PAGE));
      
      if (pages > 1) {
        const promises = [];
        for (let p = 2; p <= pages; p += 1) {
          promises.push(getDevices({ page: p, limit: PAGE }));
        }
        const results = await Promise.all(promises);
        for (const res of results) {
          const more = Array.isArray(res) ? res : (res?.devices ?? []);
          list = list.concat(more);
        }
      }
      setDevices(list);
      updateFromDevices(list);
      deviceCacheRef.current = { key: cacheKey, fetchedAt: Date.now(), data: list };
      return list;
    } catch {
      return deviceCacheRef.current.data;
    } finally {
      if (!silent) setDevLoading(false);
    }
  }, [getDevices, updateFromDevices]);

  const fetchSummary = useCallback(async ({ force = false, silent = false } = {}) => {
    const cacheAgeMs = Date.now() - summaryCacheRef.current.fetchedAt;
    if (
      !force &&
      summaryCacheRef.current.fetchedAt > 0 &&
      cacheAgeMs < SUMMARY_CACHE_MS
    ) {
      setSummary(summaryCacheRef.current.data);
      return summaryCacheRef.current.data;
    }

    if (!silent) setSummaryLoading(true);
    try {
      const res = await getDevicesSummary();
      const data =
        res && typeof res === 'object'
          ? { ...EMPTY_SUMMARY, ...res }
          : EMPTY_SUMMARY;
      summaryCacheRef.current = { fetchedAt: Date.now(), data };
      setSummary(data);
      return data;
    } catch {
      return summaryCacheRef.current.data;
    } finally {
      if (!silent) setSummaryLoading(false);
    }
  }, [getDevicesSummary]);

  // ── Fetch devices + KML once on mount ─────────────────────────────────────
  useEffect(() => {
    void refreshAll({ force: true });

    fetch('/areas.kml')
      .then(r => r.text())
      .then(text => setKmlAreas(parseKMLText(text)))
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Internal: fetch locations only ───────────────────────────────────────
  const fetchLocations = useCallback(async ({ force = false, deviceList = null } = {}) => {
    const devs = (deviceList || devicesRef.current).slice();
    const sns = devs.map(d => d.sn ?? d.serialNumber ?? '').filter(Boolean);
    if (!sns.length) {
      setLocations({});
      return {};
    }

    const sig = deviceSignature(devs);
    const cache = locationCacheRef.current;
    const isFresh = cache.key === sig && (Date.now() - cache.fetchedAt) < 60_000;
    if (!force && isFresh) {
      setLocations(cache.data);
      return cache.data;
    }

    const requestId = ++locationRequestRef.current;
    const res = await getLatestLocationsBatch(sns);
    if (requestId !== locationRequestRef.current) return cache.data;

    const nextMap = res?.locations ?? res ?? {};
    setLocations(nextMap);
    setLocSync(new Date());
    locationCacheRef.current = { key: sig, fetchedAt: Date.now(), data: nextMap };
    return nextMap;
  }, [getLatestLocationsBatch]);

  // ── Internal: fetch activity only ─────────────────────────────────────────
  const fetchActivity = useCallback(async (dateStr, live, { force = false, deviceList = null, silent = false } = {}) => {
    const devs = (deviceList || devicesRef.current).slice();
    const sns = devs.map(d => d.sn ?? d.serialNumber ?? '').filter(Boolean);
    if (!sns.length) {
      setActivityData({});
      return {};
    }

    const sig = `${deviceSignature(devs)}|${dateStr}|${live ? 'live' : 'hist'}`;
    const cache = activityCacheRef.current.get(sig);
    const ttl = live ? 60_000 : Number.POSITIVE_INFINITY;
    const cacheFresh = cache && (ttl === Number.POSITIVE_INFINITY || (Date.now() - cache.fetchedAt) < ttl);
    if (!force && cacheFresh) {
      setActivityData(cache.data);
      return cache.data;
    }

    const requestId = ++activityRequestRef.current;
    const { start, end } = dayRange(dateStr, live);
    if (!silent) setChartLoading(true);
    try {
      const res = await getPlaybackBatch(sns, start, end);
      if (requestId !== activityRequestRef.current) return cache?.data ?? {};
      const map = res?.activityData ?? res ?? {};
      setActivityData(map);
      activityCacheRef.current.set(sig, { fetchedAt: Date.now(), data: map });
      return map;
    } finally {
      if (requestId === activityRequestRef.current && !silent) {
        setChartLoading(false);
      }
    }
  }, [getPlaybackBatch]);

  // ── refreshAll — single entry point for both manual button and auto-refresh
  const refreshAll = useCallback(async ({ force = true, silent = false } = {}) => {
    const f = filtersRef.current;
    if (silent) {
      // Background auto-refresh: run calls sequentially (not Promise.all) to
      // avoid a request / CPU spike, and keep loaders off so old data stays.
      const deviceList = await fetchDevices({ force, silent });
      await fetchSummary({ force, silent });
      await fetchLocations({ force, deviceList });
      await fetchActivity(f.date, f.date === todayStr(), { force, silent, deviceList });
      return;
    }
    const [deviceList] = await Promise.all([
      fetchDevices({ force }),
      fetchSummary({ force }),
    ]);
    await Promise.all([
      fetchLocations({ force, deviceList }),
      fetchActivity(f.date, f.date === todayStr(), { force, deviceList }),
    ]);
  }, [fetchDevices, fetchSummary, fetchLocations, fetchActivity]);

  // ── When user changes the date filter, re-fetch activity ─────────────────
  const prevDateRef = useRef(null);
  useEffect(() => {
    if (prevDateRef.current === null) {
      prevDateRef.current = filters.date;
      return;
    }
    if (prevDateRef.current === filters.date) return;
    prevDateRef.current = filters.date;
    if (!devicesRef.current.length) return;
    fetchActivity(filters.date, filters.date === todayStr(), { force: false });
  }, [filters.date, fetchActivity]);

  return (
    <HomePageCacheContext.Provider value={{
      filters, setFilters,
      devices, devLoading,
      summary, summaryLoading, fetchSummary,
      locations, locSync,
      activityData, chartLoading,
      kmlAreas,
      refreshAll,
    }}>
      {children}
    </HomePageCacheContext.Provider>
  );
}

export function useHomePageCache() {
  const ctx = useContext(HomePageCacheContext);
  if (!ctx) throw new Error('useHomePageCache must be used inside HomePageCacheProvider');
  return ctx;
}
