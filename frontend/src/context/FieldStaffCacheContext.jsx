import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useCityTag } from '../hooks/useCityTag.js';

const DEFAULT_LIMIT = 20;

const FieldStaffCacheContext = createContext(null);

function normalizeResponse(payload, fallbackPage, fallbackLimit) {
  const devices = Array.isArray(payload) ? payload : payload?.devices ?? [];
  const limit = Number(payload?.limit ?? fallbackLimit) || DEFAULT_LIMIT;
  const page = Number(payload?.page ?? fallbackPage) || 1;
  const total = Number(payload?.total ?? devices.length) || 0;
  const totalPages = Number(
    payload?.total_pages ?? Math.max(1, Math.ceil(total / Math.max(limit, 1)))
  );
  const onlineCount = Number(payload?.online_count ?? 0);
  return { devices, page, limit, total, totalPages, onlineCount };
}

export function FieldStaffCacheProvider({ children }) {
  const { getFieldStaffLiveDevices } = useCityTag();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [locationCache, setLocationCache] = useState({});
  const [lastFetched, setLastFetched] = useState(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [onlineCount, setOnlineCount] = useState(0);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [zoneId, setZoneId] = useState(null);

  const getDevicesRef = useRef(getFieldStaffLiveDevices);
  const filtersRef = useRef({ search: '', dateFrom: '', dateTo: '', zoneId: null });

  useEffect(() => {
    getDevicesRef.current = getFieldStaffLiveDevices;
  }, [getFieldStaffLiveDevices]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    filtersRef.current = { search: debouncedSearch, dateFrom, dateTo, zoneId };
  }, [debouncedSearch, dateFrom, dateTo, zoneId]);

  const fetchPage = useCallback(async (targetPage = 1, options = {}) => {
    const force = Boolean(options.force);
    const f = filtersRef.current;

    setLoading(true);
    setError(null);
    try {
      const payload = await getDevicesRef.current({
        page: targetPage,
        limit: DEFAULT_LIMIT,
        search: f.search || undefined,
        lastSeenFrom: f.dateFrom || undefined,
        lastSeenTo: f.dateTo || undefined,
        zoneId: f.zoneId || undefined,
      });
      const snapshot = normalizeResponse(payload, targetPage, DEFAULT_LIMIT);
      setDevices(snapshot.devices);
      setPage(snapshot.page);
      setLimit(snapshot.limit);
      setTotal(snapshot.total);
      setTotalPages(snapshot.totalPages);
      setOnlineCount(snapshot.onlineCount);
      setLastFetched(Date.now());
      return snapshot;
    } catch (err) {
      if (!force) {
        setError(err.message || 'Failed to load field staff data');
      } else {
        setError(err.message || 'Failed to load field staff data');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    void fetchPage(1, { force: true });
  }, [debouncedSearch, dateFrom, dateTo, fetchPage]);

  const goToPage = useCallback((nextPage) => {
    const safe = Math.max(1, Math.min(nextPage, totalPages));
    return fetchPage(safe);
  }, [fetchPage, totalPages]);

  const refresh = useCallback(async () => {
    return fetchPage(page, { force: true });
  }, [fetchPage, page]);

  const updateLocationCache = useCallback((sn, label) => {
    setLocationCache(prev => ({ ...prev, [sn]: label }));
  }, []);

  return (
    <FieldStaffCacheContext.Provider value={{
      devices,
      loading,
      error,
      locationCache,
      lastFetched,
      page,
      limit,
      total,
      totalPages,
      onlineCount,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      search,
      setSearch,
      dateFrom,
      setDateFrom,
      dateTo,
      setDateTo,
      zoneId,
      setZoneId,
      goToPage,
      refresh,
      updateLocationCache,
    }}>
      {children}
    </FieldStaffCacheContext.Provider>
  );
}

export function useFieldStaffCache() {
  const ctx = useContext(FieldStaffCacheContext);
  if (!ctx) throw new Error('useFieldStaffCache must be used inside FieldStaffCacheProvider');
  return ctx;
}
