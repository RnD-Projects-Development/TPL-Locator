import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const AUTO_REFRESH_MS = 10 * 60 * 1000; // 10 minutes
import { useCityTag } from '../hooks/useCityTag.js';
import { useBindCache } from './BindCacheContext.jsx';
import { parseKMLText } from '../utils/geofenceUtils.js';

// ── Utilities (duplicated from HomePage to keep context self-contained) ────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function deviceSignature(devices) {
  return (devices || [])
    .map(d => d?.sn ?? '')
    .filter(Boolean)
    .sort()
    .join('|');
}

// Pakistan Time (PKT) offset: UTC+5, so subtract 5 hours to align queries with stored data
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function dayRange(dateStr, isLive) {
  // Subtract 5 hours to convert from UTC to Pakistan time for database alignment
  const startUtc = new Date(`${dateStr}T00:00:00.000Z`);
  const start = new Date(startUtc.getTime() - PKT_OFFSET_MS);
  
  let end;
  if (isLive) {
    end = new Date(Date.now() + 2 * 3600 * 1000);
  } else {
    const endUtc = new Date(`${dateStr}T23:59:59.999Z`);
    end = new Date(endUtc.getTime() - PKT_OFFSET_MS);
  }
  return { start, end };
}

// ── Context ───────────────────────────────────────────────────────────────────
const HomePageCacheContext = createContext(null);

export function HomePageCacheProvider({ children }) {
  const { getDevices, getLatestLocationsBatch, getPlaybackBatch } = useCityTag();
  const { updateFromDevices } = useBindCache();

  const [filters, setFilters]           = useState({ region: 'all', area: 'all', areaId: null, date: todayStr() });
  const [devices, setDevices]           = useState([]);
  const [devLoading, setDevLoading]     = useState(false);
  const [locations, setLocations]       = useState({});
  const [locSync, setLocSync]           = useState(null);
  const [activityData, setActivityData] = useState({});
  const [chartLoading, setChartLoading] = useState(false);
  const [kmlAreas, setKmlAreas]         = useState([]);

  // Stable refs so callbacks don't need devices/filters in their dep arrays
  const devicesRef = useRef([]);
  const filtersRef = useRef(filters);
  useEffect(() => { devicesRef.current = devices; },  [devices]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const deviceCacheRef = useRef({ key: '', fetchedAt: 0, data: [] });
  const locationCacheRef = useRef({ key: '', fetchedAt: 0, data: {} });
  const activityCacheRef = useRef(new Map());

  const locationRequestRef = useRef(0);
  const activityRequestRef = useRef(0);

  const fetchDevices = useCallback(async ({ force = false } = {}) => {
    const cacheKey = 'devices';
    const cacheAgeMs = Date.now() - deviceCacheRef.current.fetchedAt;
    if (!force && deviceCacheRef.current.key === cacheKey && cacheAgeMs < 5 * 60 * 1000 && deviceCacheRef.current.data.length) {
      setDevices(deviceCacheRef.current.data);
      updateFromDevices(deviceCacheRef.current.data);
      return deviceCacheRef.current.data;
    }

    setDevLoading(true);
    try {
      // Cap at 500 — sufficient for field staff map; avoids loading 10 000+ docs
      const res = await getDevices({ page: 1, limit: 500 });
      const list = Array.isArray(res) ? res : (res?.devices ?? []);
      setDevices(list);
      updateFromDevices(list);
      deviceCacheRef.current = { key: cacheKey, fetchedAt: Date.now(), data: list };
      return list;
    } catch {
      return deviceCacheRef.current.data;
    } finally {
      setDevLoading(false);
    }
  }, [getDevices, updateFromDevices]);

  // ── Fetch devices + KML once on mount ─────────────────────────────────────
  useEffect(() => {
    void refreshAll({ force: true });

    fetch('/areas.kml')
      .then(r => r.text())
      .then(text => setKmlAreas(parseKMLText(text)))
      .catch(() => {});
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
  const fetchActivity = useCallback(async (dateStr, live, { force = false, deviceList = null } = {}) => {
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
    setChartLoading(true);
    try {
      const res = await getPlaybackBatch(sns, start, end);
      if (requestId !== activityRequestRef.current) return cache?.data ?? {};
      const map = res?.activityData ?? res ?? {};
      setActivityData(map);
      activityCacheRef.current.set(sig, { fetchedAt: Date.now(), data: map });
      return map;
    } finally {
      if (requestId === activityRequestRef.current) {
        setChartLoading(false);
      }
    }
  }, [getPlaybackBatch]);

  // ── refreshAll — single entry point for both manual button and auto-refresh
  const refreshAll = useCallback(async ({ force = true } = {}) => {
    const f = filtersRef.current;
    const deviceList = await fetchDevices({ force });
    await Promise.all([
      fetchLocations({ force, deviceList }),
      fetchActivity(f.date, f.date === todayStr(), { force, deviceList }),
    ]);
  }, [fetchDevices, fetchLocations, fetchActivity]);

  // ── Auto-refresh every 10 minutes — only while on live date ──────────────
  useEffect(() => {
    const id = setInterval(() => {
      const f = filtersRef.current;
      if (f.date !== todayStr()) return; // skip if user is on a historical date
      refreshAll({ force: true });
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshAll]);

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
