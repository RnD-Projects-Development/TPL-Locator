import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const AUTO_REFRESH_MS = 10 * 60 * 1000; // 10 minutes
import { useCityTag } from '../hooks/useCityTag.js';
import { useBindCache } from './BindCacheContext.jsx';
import { parseKMLText } from '../utils/geofenceUtils.js';

// ── Utilities (duplicated from HomePage to keep context self-contained) ────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

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

async function pLimit(tasks, limit = 5) {
  const results = new Array(tasks.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      try { results[i] = await tasks[i](); } catch { results[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const FETCH_CONCURRENCY = 10;

// ── Context ───────────────────────────────────────────────────────────────────
const HomePageCacheContext = createContext(null);

export function HomePageCacheProvider({ children }) {
  const { getDevices, getLatestLocation, getPlayback } = useCityTag();
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

  const locAbortRef  = useRef(null);
  const trajAbortRef = useRef(null);

  // Guards to ensure we only auto-fetch once
  const initDoneRef     = useRef(false);
  const locInitDoneRef  = useRef(false);
  const actInitDoneRef  = useRef(false);

  // ── Fetch devices + KML once on mount ─────────────────────────────────────
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    setDevLoading(true);
    getDevices()
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.devices ?? []);
        setDevices(list);
        updateFromDevices(list);
      })
      .catch(() => {})
      .finally(() => setDevLoading(false));

    fetch('/areas.kml')
      .then(r => r.text())
      .then(text => setKmlAreas(parseKMLText(text)))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Internal: fetch locations only ───────────────────────────────────────
  const fetchLocations = useCallback(async () => {
    const devs = devicesRef.current;
    if (!devs.length) return;
    locAbortRef.current?.abort();
    const ctrl = new AbortController();
    locAbortRef.current = ctrl;
    const tasks = devs.map(d => {
      const sn = d.sn ?? d.serialNumber ?? '';
      if (!sn) return Promise.resolve(null);
      return getLatestLocation(sn)
        .then(res => ({ sn, point: res?.latest ?? res ?? null }))
        .catch(() => null);
    });
    const settled = await Promise.allSettled(tasks);
    if (ctrl.signal.aborted) return;
    const results = settled.map(r => r.status === 'fulfilled' ? r.value : null);
    setLocations(prev => {
      const next = { ...prev };
      results.forEach(r => { if (r) next[r.sn] = r.point; });
      return next;
    });
    setLocSync(new Date());
  }, [getLatestLocation]);

  // ── Internal: fetch activity only ─────────────────────────────────────────
  const fetchActivity = useCallback(async (dateStr, live) => {
    const devs = devicesRef.current;
    if (!devs.length) return;
    trajAbortRef.current?.abort();
    const ctrl = new AbortController();
    trajAbortRef.current = ctrl;
    const { start, end } = dayRange(dateStr, live);
    setChartLoading(true);
    setActivityData({});
    const fetch1 = (sn) => getPlayback(sn, start, end)
      .then(res => ({ sn, pts: Array.isArray(res?.points) ? res.points : Array.isArray(res) ? res : [] }))
      .catch(() => null);
    const results = await pLimit(devs.map(d => () => fetch1(d.sn ?? '')), FETCH_CONCURRENCY);
    if (ctrl.signal.aborted) return;
    const map = {};
    results.forEach(r => { if (r?.pts?.length) map[r.sn] = r.pts; });
    setActivityData(map);
    setChartLoading(false);
  }, [getPlayback]);

  // ── refreshAll — single entry point for both manual button and auto-refresh
  const refreshAll = useCallback(async () => {
    const f = filtersRef.current;
    await Promise.all([
      fetchLocations(),
      fetchActivity(f.date, f.date === todayStr()),
    ]);
  }, [fetchLocations, fetchActivity]);

  // ── After devices first load: do initial fetch of locations + activity ────
  useEffect(() => {
    if (!devices.length) return;
    if (!locInitDoneRef.current) {
      locInitDoneRef.current = true;
      actInitDoneRef.current = true;
      refreshAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.length]);

  // ── Auto-refresh every 10 minutes — only while on live date ──────────────
  useEffect(() => {
    const id = setInterval(() => {
      const f = filtersRef.current;
      if (f.date !== todayStr()) return; // skip if user is on a historical date
      refreshAll();
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
    fetchActivity(filters.date, filters.date === todayStr());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.date]);

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
