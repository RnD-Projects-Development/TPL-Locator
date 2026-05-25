import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { readPersistedPage, saveLocatorPageState } from "../utils/locatorPageState.js";
import { useCityTag } from "./useCityTag.js";

const DEFAULT_LIMIT = 20;
const BULK_DEVICE_LIMIT = 100;
const BULK_TTL_MS = 5 * 60 * 1000;
const MODULE_TTL_MS = 60_000;

const pageDataCache = new Map();
const inflightRequests = new Map();
const bulkDeviceCache = new Map();
const moduleCache = new Map();

function normalizePageResponse(payload, fallbackPage, fallbackLimit) {
  const devices = Array.isArray(payload) ? payload : payload?.devices ?? [];
  const limit = Number(payload?.limit ?? fallbackLimit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT;
  const requestedPage = Math.max(1, Number(fallbackPage) || 1);
  const page = Math.max(1, Number(payload?.page ?? requestedPage) || requestedPage);
  const normalizedPage = page === requestedPage ? page : requestedPage;
  const total = Number(payload?.total ?? devices.length) || 0;
  const totalPages = Number(
    payload?.total_pages ??
    payload?.totalPages ??
    Math.max(1, Math.ceil(total / Math.max(limit, 1)))
  );

  return {
    devices,
    page: normalizedPage,
    limit,
    total,
    totalPages,
    hasNextPage: normalizedPage < totalPages,
    hasPreviousPage: normalizedPage > 1,
  };
}

function filtersKey(search, status, deviceType, searchScope) {
  return `${(search || "").trim()}:${status || "all"}:${deviceType ?? ""}:${searchScope ?? ""}`;
}

function pageCacheKey(page, limit, search, status, deviceType, searchScope) {
  return `${page}:${limit}:${(search || "").trim()}:${status || "all"}:${deviceType ?? ""}:${searchScope ?? ""}`;
}

function sliceBulkPage(bulkEntry, targetPage, pageLimit) {
  const offset = (targetPage - 1) * pageLimit;
  const devices = bulkEntry.devices.slice(offset, offset + pageLimit);
  const total = bulkEntry.total;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageLimit, 1)));

  return {
    devices,
    page: targetPage,
    limit: pageLimit,
    total,
    totalPages,
    hasNextPage: targetPage < totalPages,
    hasPreviousPage: targetPage > 1,
  };
}

function seedPageCacheFromBulk(bulkEntry, search, status, deviceType, pageLimit = DEFAULT_LIMIT, searchScope = null) {
  const maxPageFromBulk = Math.min(
    Math.ceil(bulkEntry.devices.length / pageLimit),
    Math.ceil(bulkEntry.total / pageLimit),
  );

  for (let p = 1; p <= maxPageFromBulk; p += 1) {
    const snapshot = sliceBulkPage(bulkEntry, p, pageLimit);
    const key = pageCacheKey(p, pageLimit, search, status, deviceType, searchScope);
    pageDataCache.set(key, snapshot);
    moduleCache.set(key, { snapshot, fetchedAt: Date.now() });
  }
}

function getModuleCached(key) {
  const entry = moduleCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MODULE_TTL_MS) {
    moduleCache.delete(key);
    return null;
  }
  return entry.snapshot;
}

function setModuleCached(key, snapshot) {
  moduleCache.set(key, { snapshot, fetchedAt: Date.now() });
}

function getValidBulkEntry(search, status, deviceType, searchScope = null) {
  const key = filtersKey(search, status, deviceType, searchScope);
  const entry = bulkDeviceCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > BULK_TTL_MS) {
    bulkDeviceCache.delete(key);
    return null;
  }
  return entry;
}

function clearCachesForFilters(search, status, deviceType, searchScope = null) {
  const suffix = `:${(search || "").trim()}:${status || "all"}:${deviceType ?? ""}:${searchScope ?? ""}`;
  for (const key of [...pageDataCache.keys()]) {
    if (key.endsWith(suffix)) pageDataCache.delete(key);
  }
  for (const key of [...moduleCache.keys()]) {
    if (key.endsWith(suffix)) moduleCache.delete(key);
  }
  bulkDeviceCache.delete(filtersKey(search, status, deviceType, searchScope));
}

/** Call after bind/unbind/edit so list pages refetch. */
export function invalidatePaginatedCache() {
  pageDataCache.clear();
  inflightRequests.clear();
  bulkDeviceCache.clear();
  moduleCache.clear();
}

export function usePaginatedDevices(initialLimit = DEFAULT_LIMIT, options = {}) {
  const { search = "", status = "all", device_type = null, search_scope = null, initialPage } = options;
  const { getDevices } = useCityTag();
  const { user } = useAuth();

  const resolveInitialPage = () => {
    const fromOption = Number(initialPage);
    if (Number.isFinite(fromOption) && fromOption >= 1) return Math.floor(fromOption);
    return readPersistedPage(
      (search || "").trim(),
      status || "all",
      device_type ?? null,
    );
  };

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(resolveInitialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const getDevicesRef = useRef(getDevices);
  const loadPageRef = useRef(null);
  const ensureBulkRef = useRef(null);
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const appliedInitialPageRef = useRef(false);
  const searchRef = useRef(search);
  const statusRef = useRef(status);
  const deviceTypeRef = useRef(device_type);
  const searchScopeRef = useRef(search_scope);

  useEffect(() => {
    getDevicesRef.current = getDevices;
  }, [getDevices]);

  useEffect(() => {
    searchRef.current = search;
    statusRef.current = status;
    deviceTypeRef.current = device_type;
    searchScopeRef.current = search_scope;
  }, [search, status, device_type, search_scope]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applySnapshot = useCallback((snapshot, shouldUpdateState = true) => {
    if (!shouldUpdateState || !mountedRef.current) return snapshot;
    setPage(snapshot.page);
    setLimit(snapshot.limit);
    setDevices(snapshot.devices);
    setTotal(snapshot.total);
    setTotalPages(snapshot.totalPages);
    setError("");
    saveLocatorPageState(
      {
        searchTerm: (searchRef.current || "").trim(),
        filterStatus: statusRef.current || "all",
        viewMode: "devices",
        page: snapshot.page,
      },
      { deviceType: deviceTypeRef.current ?? null },
    );
    return snapshot;
  }, []);

  const ensureBulkCache = useCallback(async (searchTerm, statusFilter, devType, scope, { force = false } = {}) => {
    if (!user) return null;

    const key = filtersKey(searchTerm, statusFilter, devType, scope);
    if (!force) {
      const existing = getValidBulkEntry(searchTerm, statusFilter, devType, scope);
      if (existing) return existing;
    }

    const inflightKey = `bulk:${key}`;
    if (!force && inflightRequests.has(inflightKey)) {
      return inflightRequests.get(inflightKey);
    }

    const request = (async () => {
      const payload = await getDevicesRef.current({
        page: 1,
        limit: BULK_DEVICE_LIMIT,
        search: searchTerm,
        status: statusFilter,
        device_type: devType,
        search_scope: scope,
      });
      const list = Array.isArray(payload) ? payload : payload?.devices ?? [];
      const entry = {
        devices: list,
        total: Number(payload?.total ?? list.length) || list.length,
        fetchedAt: Date.now(),
      };
      bulkDeviceCache.set(key, entry);
      seedPageCacheFromBulk(entry, searchTerm, statusFilter, devType, initialLimit, scope);
      return entry;
    })();

    inflightRequests.set(inflightKey, request);
    try {
      return await request;
    } finally {
      inflightRequests.delete(inflightKey);
    }
  }, [initialLimit, user]);

  useEffect(() => {
    ensureBulkRef.current = ensureBulkCache;
  }, [ensureBulkCache]);

  const loadPage = useCallback(async (targetPage = 1, targetLimit = limit, loadOptions = {}) => {
    if (!user) return null;

    const generation = loadGenerationRef.current;
    const force = Boolean(loadOptions.force);
    const silent = Boolean(loadOptions.silent);
    const safePage = Math.max(1, Number(targetPage) || 1);
    const safeLimit = Math.max(1, Number(targetLimit) || initialLimit || DEFAULT_LIMIT);
    const searchTerm = loadOptions.search ?? searchRef.current ?? "";
    const statusFilter = loadOptions.status ?? statusRef.current ?? "all";
    const devType = loadOptions.device_type ?? deviceTypeRef.current ?? null;
    const scope = loadOptions.search_scope ?? searchScopeRef.current ?? null;
    const cacheKey = pageCacheKey(safePage, safeLimit, searchTerm, statusFilter, devType, scope);

    if (!force) {
      const modCached = getModuleCached(cacheKey);
      if (modCached) {
        pageDataCache.set(cacheKey, modCached);
        if (generation === loadGenerationRef.current) {
          return applySnapshot(modCached, !silent);
        }
        return modCached;
      }
      if (pageDataCache.has(cacheKey)) {
        const cached = pageDataCache.get(cacheKey);
        setModuleCached(cacheKey, cached);
        if (generation === loadGenerationRef.current) {
          return applySnapshot(cached, !silent);
        }
        return cached;
      }
    }

    const bulkEntry = !force ? getValidBulkEntry(searchTerm, statusFilter, devType, scope) : null;
    const bulkOffset = (safePage - 1) * safeLimit;
    if (
      bulkEntry &&
      bulkOffset < bulkEntry.devices.length &&
      bulkOffset + safeLimit <= bulkEntry.devices.length
    ) {
      const snapshot = sliceBulkPage(bulkEntry, safePage, safeLimit);
      pageDataCache.set(cacheKey, snapshot);
      setModuleCached(cacheKey, snapshot);
      if (generation === loadGenerationRef.current) {
        return applySnapshot(snapshot, !silent);
      }
      return snapshot;
    }

    if (!force && inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey);
    }

    const request = (async () => {
      if (!silent && mountedRef.current) {
        setLoading(true);
        setError("");
      }

      const payload = await getDevicesRef.current({
        page: safePage,
        limit: safeLimit,
        search: searchTerm,
        status: statusFilter,
        device_type: devType,
        search_scope: scope,
      });
      const snapshot = normalizePageResponse(payload, safePage, safeLimit);
      pageDataCache.set(cacheKey, snapshot);
      setModuleCached(cacheKey, snapshot);
      if (generation === loadGenerationRef.current) {
        applySnapshot(snapshot, !silent);
      }

      if (!silent && snapshot.hasNextPage && loadPageRef.current) {
        const nextKey = pageCacheKey(snapshot.page + 1, snapshot.limit, searchTerm, statusFilter, devType, scope);
        if (!getModuleCached(nextKey) && !inflightRequests.has(nextKey)) {
          void loadPageRef.current(snapshot.page + 1, snapshot.limit, {
            silent: true,
            search: searchTerm,
            status: statusFilter,
            device_type: devType,
            search_scope: scope,
          });
        }
      }

      return snapshot;
    })();

    inflightRequests.set(cacheKey, request);
    try {
      return await request;
    } catch (err) {
      if (!silent && mountedRef.current) {
        setError(err.message || "Failed to load devices");
      }
      throw err;
    } finally {
      inflightRequests.delete(cacheKey);
      if (!silent && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [applySnapshot, initialLimit, limit, user]);

  useEffect(() => {
    loadPageRef.current = loadPage;
  }, [loadPage]);

  useEffect(() => {
    if (!user) {
      pageDataCache.clear();
      inflightRequests.clear();
      bulkDeviceCache.clear();
      moduleCache.clear();
      setDevices([]);
      setLoading(false);
      setError("");
      setPage(1);
      setLimit(initialLimit);
      setTotal(0);
      setTotalPages(1);
      return;
    }

    loadGenerationRef.current += 1;

    const searchTerm = (search || "").trim();
    const statusFilter = status || "all";
    const devType = device_type ?? null;
    const scope = search_scope ?? null;
    let targetPage = readPersistedPage(searchTerm, statusFilter, devType);
    if (!appliedInitialPageRef.current) {
      const fromOption = Number(initialPage);
      if (Number.isFinite(fromOption) && fromOption >= 1) {
        targetPage = Math.floor(fromOption);
      }
      appliedInitialPageRef.current = true;
    }
    setPage(targetPage);
    const cacheKey = pageCacheKey(targetPage, initialLimit, searchTerm, statusFilter, devType, scope);
    const hasCache = Boolean(getModuleCached(cacheKey) || pageDataCache.has(cacheKey) || getValidBulkEntry(searchTerm, statusFilter, devType, scope));

    void loadPageRef.current?.(targetPage, initialLimit, {
      force: !hasCache,
      search: searchTerm,
      status: statusFilter,
      device_type: devType,
      search_scope: scope,
    });

    void ensureBulkRef.current?.(searchTerm, statusFilter, devType, scope, {
      force: !getValidBulkEntry(searchTerm, statusFilter, devType, scope),
    });
  }, [initialLimit, user, search, status, device_type, search_scope]);

  const goToPage = useCallback((nextPage) => {
    if (!loadPageRef.current) return;
    return loadPageRef.current(nextPage, limit, {
      search: searchRef.current,
      status: statusRef.current,
      device_type: deviceTypeRef.current,
      search_scope: searchScopeRef.current,
    });
  }, [limit]);

  const refresh = useCallback(() => {
    if (!loadPageRef.current) return;
    clearCachesForFilters(
      searchRef.current,
      statusRef.current,
      deviceTypeRef.current,
      searchScopeRef.current,
    );
    void ensureBulkRef.current?.(
      searchRef.current,
      statusRef.current,
      deviceTypeRef.current,
      searchScopeRef.current,
      { force: true },
    );
    return loadPageRef.current(page, limit, {
      force: true,
      search: searchRef.current,
      status: statusRef.current,
      device_type: deviceTypeRef.current,
      search_scope: searchScopeRef.current,
    });
  }, [limit, page]);

  return {
    devices,
    loading,
    error,
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    goToPage,
    refresh,
  };
}
