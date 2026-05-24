import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useCityTag } from "./useCityTag.js";

const DEFAULT_LIMIT = 20;

// ─── Module-level persistent cache ───────────────────────────────────────────
// Survives React component unmount/remount (i.e. page navigations).
// Keyed by "page:limit:search:status:device_type". TTL = 60 s.
const _moduleCache = new Map();
const _MODULE_TTL  = 60_000;

function _getModuleCache(key) {
  const entry = _moduleCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > _MODULE_TTL) {
    _moduleCache.delete(key);
    return null;
  }
  return entry.snapshot;
}

function _setModuleCache(key, snapshot) {
  _moduleCache.set(key, { snapshot, fetchedAt: Date.now() });
}

/** Call this after a successful bind/unbind/edit so stale pages are evicted. */
export function invalidatePaginatedCache() {
  _moduleCache.clear();
}
// ─────────────────────────────────────────────────────────────────────────────

function normalizePageResponse(payload, fallbackPage, fallbackLimit) {
  const devices = Array.isArray(payload) ? payload : payload?.devices ?? [];
  const limit = Number(payload?.limit ?? fallbackLimit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
  const page = Number(payload?.page ?? fallbackPage ?? 1) || 1;
  const total = Number(payload?.total ?? devices.length) || 0;
  const totalPages = Number(
    payload?.total_pages ??
    payload?.totalPages ??
    Math.max(1, Math.ceil(total / Math.max(limit, 1)))
  );

  return {
    devices,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function usePaginatedDevices(initialLimit = DEFAULT_LIMIT, options = {}) {
  const { search = "", status = "all", device_type = null } = options;
  const { getDevices } = useCityTag();
  const { user } = useAuth();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const getDevicesRef  = useRef(getDevices);
  const loadPageRef    = useRef(null);
  const componentCache = useRef(new Map()); // component-level (fast dedup within session)
  const inflightRef    = useRef(new Map());
  const mountedRef     = useRef(true);
  const searchRef      = useRef(search);
  const statusRef      = useRef(status);
  const deviceTypeRef  = useRef(device_type);

  useEffect(() => { getDevicesRef.current = getDevices; }, [getDevices]);

  useEffect(() => {
    searchRef.current     = search;
    statusRef.current     = status;
    deviceTypeRef.current = device_type;
  }, [search, status, device_type]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const applySnapshot = useCallback((snapshot, shouldUpdateState = true) => {
    if (!shouldUpdateState || !mountedRef.current) return snapshot;
    setPage(snapshot.page);
    setLimit(snapshot.limit);
    setDevices(snapshot.devices);
    setTotal(snapshot.total);
    setTotalPages(snapshot.totalPages);
    setError("");
    return snapshot;
  }, []);

  const loadPage = useCallback(async (targetPage = 1, targetLimit = limit, loadOptions = {}) => {
    if (!user) return null;

    const force      = Boolean(loadOptions.force);
    const silent     = Boolean(loadOptions.silent);
    const safePage   = Math.max(1, Number(targetPage)  || 1);
    const safeLimit  = Math.max(1, Number(targetLimit) || initialLimit || DEFAULT_LIMIT);
    const searchTerm   = loadOptions.search      ?? searchRef.current      ?? "";
    const statusFilter = loadOptions.status      ?? statusRef.current      ?? "all";
    const devType      = loadOptions.device_type ?? deviceTypeRef.current  ?? null;
    const cacheKey     = `${safePage}:${safeLimit}:${searchTerm}:${statusFilter}:${devType ?? ""}`;

    // 1. Check module-level cache first (survives navigation)
    if (!force) {
      const modCached = _getModuleCache(cacheKey);
      if (modCached) {
        componentCache.current.set(cacheKey, modCached);
        return applySnapshot(modCached, !silent);
      }
    }

    // 2. Check component-level cache (in-flight dedup)
    if (!force && componentCache.current.has(cacheKey)) {
      return applySnapshot(componentCache.current.get(cacheKey), !silent);
    }

    // 3. Deduplicate in-flight requests
    if (!force && inflightRef.current.has(cacheKey)) {
      return inflightRef.current.get(cacheKey);
    }

    const request = (async () => {
      if (!silent && mountedRef.current) { setLoading(true); setError(""); }

      const payload  = await getDevicesRef.current({
        page: safePage, limit: safeLimit,
        search: searchTerm, status: statusFilter, device_type: devType,
      });
      const snapshot = normalizePageResponse(payload, safePage, safeLimit);

      // Store in both caches
      _setModuleCache(cacheKey, snapshot);
      componentCache.current.set(cacheKey, snapshot);
      applySnapshot(snapshot, !silent);

      // Prefetch next page silently
      if (!silent && snapshot.hasNextPage && loadPageRef.current) {
        const nextKey = `${snapshot.page + 1}:${snapshot.limit}:${searchTerm}:${statusFilter}:${devType ?? ""}`;
        if (!_getModuleCache(nextKey) && !inflightRef.current.has(nextKey)) {
          void loadPageRef.current(snapshot.page + 1, snapshot.limit, {
            silent: true, search: searchTerm, status: statusFilter, device_type: devType,
          });
        }
      }

      return snapshot;
    })();

    inflightRef.current.set(cacheKey, request);
    try {
      return await request;
    } catch (err) {
      if (!silent && mountedRef.current) setError(err.message || "Failed to load devices");
      throw err;
    } finally {
      inflightRef.current.delete(cacheKey);
      if (!silent && mountedRef.current) setLoading(false);
    }
  }, [applySnapshot, initialLimit, limit, user]);

  useEffect(() => { loadPageRef.current = loadPage; }, [loadPage]);

  // Re-run on filter/user change — clear component cache but not module cache
  // (module cache still saves network if user returns to same filters quickly)
  useEffect(() => {
    componentCache.current.clear();
    inflightRef.current.clear();

    if (!user) {
      setDevices([]); setLoading(false); setError("");
      setPage(1); setLimit(initialLimit); setTotal(0); setTotalPages(1);
      return;
    }

    void loadPageRef.current?.(1, initialLimit, { force: false, search, status, device_type });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLimit, user, search, status, device_type]);

  const goToPage = useCallback((nextPage) => {
    if (!loadPageRef.current) return;
    return loadPageRef.current(nextPage, limit, {
      search: searchRef.current, status: statusRef.current, device_type: deviceTypeRef.current,
    });
  }, [limit]);

  const refresh = useCallback(() => {
    if (!loadPageRef.current) return;
    // Evict module cache entries for current params so refresh forces a real fetch
    const cacheKey = `${page}:${limit}:${searchRef.current}:${statusRef.current}:${deviceTypeRef.current ?? ""}`;
    _moduleCache.delete(cacheKey);
    componentCache.current.clear();
    inflightRef.current.clear();
    return loadPageRef.current(page, limit, {
      force: true,
      search: searchRef.current, status: statusRef.current, device_type: deviceTypeRef.current,
    });
  }, [limit, page]);

  return {
    devices, loading, error,
    page, limit, total, totalPages,
    hasNextPage:     page < totalPages,
    hasPreviousPage: page > 1,
    goToPage, refresh,
  };
}
