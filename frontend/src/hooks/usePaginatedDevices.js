import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { readPersistedPage } from "../utils/locatorPageState.js";
import { useCityTag } from "./useCityTag.js";

const DEFAULT_LIMIT = 20;
const BULK_DEVICE_LIMIT = 100;
const BULK_TTL_MS = 5 * 60 * 1000;

/** In-memory caches survive leaving the Locators route. */
const pageDataCache = new Map();
const inflightRequests = new Map();
const bulkDeviceCache = new Map();

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

function filtersKey(search, status) {
  return `${(search || "").trim()}:${status || "all"}`;
}

function pageCacheKey(page, limit, search, status) {
  return `${page}:${limit}:${(search || "").trim()}:${status || "all"}`;
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

function seedPageCacheFromBulk(bulkEntry, search, status, pageLimit = DEFAULT_LIMIT) {
  const maxPageFromBulk = Math.min(
    Math.ceil(bulkEntry.devices.length / pageLimit),
    Math.ceil(bulkEntry.total / pageLimit),
  );

  for (let p = 1; p <= maxPageFromBulk; p += 1) {
    const snapshot = sliceBulkPage(bulkEntry, p, pageLimit);
    pageDataCache.set(pageCacheKey(p, pageLimit, search, status), snapshot);
  }
}

function getValidBulkEntry(search, status) {
  const key = filtersKey(search, status);
  const entry = bulkDeviceCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > BULK_TTL_MS) {
    bulkDeviceCache.delete(key);
    return null;
  }
  return entry;
}

function clearCachesForFilters(search, status) {
  const suffix = `:${(search || "").trim()}:${status || "all"}`;
  for (const key of [...pageDataCache.keys()]) {
    if (key.endsWith(suffix)) pageDataCache.delete(key);
  }
  bulkDeviceCache.delete(filtersKey(search, status));
}

export function usePaginatedDevices(initialLimit = DEFAULT_LIMIT, options = {}) {
  const { search = "", status = "all" } = options;
  const { getDevices } = useCityTag();
  const { user } = useAuth();

  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const getDevicesRef = useRef(getDevices);
  const loadPageRef = useRef(null);
  const ensureBulkRef = useRef(null);
  const mountedRef = useRef(true);
  const searchRef = useRef(search);
  const statusRef = useRef(status);

  useEffect(() => {
    getDevicesRef.current = getDevices;
  }, [getDevices]);

  useEffect(() => {
    searchRef.current = search;
    statusRef.current = status;
  }, [search, status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applySnapshot = useCallback((snapshot, shouldUpdateState = true) => {
    if (!shouldUpdateState || !mountedRef.current) {
      return snapshot;
    }

    setPage(snapshot.page);
    setLimit(snapshot.limit);
    setDevices(snapshot.devices);
    setTotal(snapshot.total);
    setTotalPages(snapshot.totalPages);
    setError("");
    return snapshot;
  }, []);

  const ensureBulkCache = useCallback(async (searchTerm, statusFilter, { force = false, silent = true } = {}) => {
    if (!user) return null;

    const key = filtersKey(searchTerm, statusFilter);
    if (!force) {
      const existing = getValidBulkEntry(searchTerm, statusFilter);
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
      });
      const list = Array.isArray(payload) ? payload : payload?.devices ?? [];
      const entry = {
        devices: list,
        total: Number(payload?.total ?? list.length) || list.length,
        fetchedAt: Date.now(),
      };
      bulkDeviceCache.set(key, entry);
      seedPageCacheFromBulk(entry, searchTerm, statusFilter, initialLimit);
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
    if (!user) {
      return null;
    }

    const force = Boolean(loadOptions.force);
    const silent = Boolean(loadOptions.silent);
    const safePage = Math.max(1, Number(targetPage) || 1);
    const safeLimit = Math.max(1, Number(targetLimit) || initialLimit || DEFAULT_LIMIT);
    const searchTerm = loadOptions.search ?? searchRef.current ?? "";
    const statusFilter = loadOptions.status ?? statusRef.current ?? "all";
    const cacheKey = pageCacheKey(safePage, safeLimit, searchTerm, statusFilter);

    if (!force && pageDataCache.has(cacheKey)) {
      const cached = pageDataCache.get(cacheKey);
      return applySnapshot(cached, !silent);
    }

    const bulkEntry = !force ? getValidBulkEntry(searchTerm, statusFilter) : null;
    const bulkOffset = (safePage - 1) * safeLimit;
    if (
      bulkEntry &&
      bulkOffset < bulkEntry.devices.length &&
      bulkOffset + safeLimit <= bulkEntry.devices.length
    ) {
      const snapshot = sliceBulkPage(bulkEntry, safePage, safeLimit);
      pageDataCache.set(cacheKey, snapshot);
      return applySnapshot(snapshot, !silent);
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
      });
      const snapshot = normalizePageResponse(payload, safePage, safeLimit);
      pageDataCache.set(cacheKey, snapshot);
      applySnapshot(snapshot, !silent);

      if (!silent && snapshot.hasNextPage && loadPageRef.current) {
        const nextKey = pageCacheKey(snapshot.page + 1, snapshot.limit, searchTerm, statusFilter);
        if (!pageDataCache.has(nextKey) && !inflightRequests.has(nextKey)) {
          void loadPageRef.current(snapshot.page + 1, snapshot.limit, {
            silent: true,
            search: searchTerm,
            status: statusFilter,
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
      setDevices([]);
      setLoading(false);
      setError("");
      setPage(1);
      setLimit(initialLimit);
      setTotal(0);
      setTotalPages(1);
      return;
    }

    const searchTerm = (search || "").trim();
    const statusFilter = status || "all";
    const targetPage = readPersistedPage(searchTerm, statusFilter);
    const cacheKey = pageCacheKey(targetPage, initialLimit, searchTerm, statusFilter);
    const hasPageCache = pageDataCache.has(cacheKey);
    const bulkEntry = getValidBulkEntry(searchTerm, statusFilter);

    if (hasPageCache || bulkEntry) {
      void loadPageRef.current?.(targetPage, initialLimit, {
        force: false,
        search: searchTerm,
        status: statusFilter,
      });
    } else {
      void loadPageRef.current?.(targetPage, initialLimit, {
        force: true,
        search: searchTerm,
        status: statusFilter,
      });
    }

    void ensureBulkRef.current?.(searchTerm, statusFilter, { force: !bulkEntry, silent: true });
  }, [initialLimit, user, search, status]);

  const goToPage = useCallback((nextPage) => {
    if (!loadPageRef.current) return;
    return loadPageRef.current(nextPage, limit, {
      search: searchRef.current,
      status: statusRef.current,
    });
  }, [limit]);

  const refresh = useCallback(() => {
    if (!loadPageRef.current) return;

    clearCachesForFilters(searchRef.current, statusRef.current);

    void ensureBulkRef.current?.(searchRef.current, statusRef.current, { force: true, silent: true });

    return loadPageRef.current(page, limit, {
      force: true,
      search: searchRef.current,
      status: statusRef.current,
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
