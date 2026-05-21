import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useCityTag } from "./useCityTag.js";

const DEFAULT_LIMIT = 20;

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
  const cacheRef = useRef(new Map());
  const inflightRef = useRef(new Map());
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
    const cacheKey = `${safePage}:${safeLimit}:${searchTerm}:${statusFilter}`;

    if (!force && cacheRef.current.has(cacheKey)) {
      const cached = cacheRef.current.get(cacheKey);
      return applySnapshot(cached, !silent);
    }

    if (!force && inflightRef.current.has(cacheKey)) {
      return inflightRef.current.get(cacheKey);
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
      cacheRef.current.set(cacheKey, snapshot);
      applySnapshot(snapshot, !silent);

      if (!silent && snapshot.hasNextPage && loadPageRef.current) {
        const nextKey = `${snapshot.page + 1}:${snapshot.limit}:${searchTerm}:${statusFilter}`;
        if (!cacheRef.current.has(nextKey) && !inflightRef.current.has(nextKey)) {
          void loadPageRef.current(snapshot.page + 1, snapshot.limit, {
            silent: true,
            search: searchTerm,
            status: statusFilter,
          });
        }
      }

      return snapshot;
    })();

    inflightRef.current.set(cacheKey, request);

    try {
      return await request;
    } catch (err) {
      if (!silent && mountedRef.current) {
        setError(err.message || "Failed to load devices");
      }
      throw err;
    } finally {
      inflightRef.current.delete(cacheKey);
      if (!silent && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [applySnapshot, initialLimit, limit, user]);

  useEffect(() => {
    loadPageRef.current = loadPage;
  }, [loadPage]);

  useEffect(() => {
    cacheRef.current.clear();
    inflightRef.current.clear();

    if (!user) {
      setDevices([]);
      setLoading(false);
      setError("");
      setPage(1);
      setLimit(initialLimit);
      setTotal(0);
      setTotalPages(1);
      return;
    }

    void loadPageRef.current?.(1, initialLimit, {
      force: true,
      search,
      status,
    });
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
    cacheRef.current.clear();
    inflightRef.current.clear();
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
