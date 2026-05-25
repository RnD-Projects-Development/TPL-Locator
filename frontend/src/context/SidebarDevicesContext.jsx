import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "./AuthContext.jsx";
import { registerCacheResetListener } from "../utils/clearAppCaches.js";

const DEFAULT_LIMIT  = 20;
const SEARCH_LIMIT   = 50;
const RECENT_MAX = 8;
const STORAGE_KEY = "tpl_sidebar_recent_devices";

const SidebarDevicesContext = createContext(null);

function normalizeList(payload) {
  return Array.isArray(payload) ? payload : payload?.devices ?? [];
}

function loadRecentSns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecentSns(sns) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sns.slice(0, RECENT_MAX)));
  } catch {
    /* ignore */
  }
}

function dedupeBySn(list) {
  const seen = new Set();
  return list.filter((d) => {
    const sn = d?.sn;
    if (!sn || seen.has(sn)) return false;
    seen.add(sn);
    return true;
  });
}

export function SidebarDevicesProvider({ children }) {
  const { getDevices } = useCityTag();
  const { user } = useAuth();

  const [defaultDevices, setDefaultDevices] = useState([]);
  const [searchResults, setSearchResults]   = useState([]);
  const [searchTerm, setSearchTerm]         = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [recentSns, setRecentSns]           = useState(loadRecentSns);
  const [total, setTotal]                   = useState(0);
  const [totalPages, setTotalPages]         = useState(1);
  const [page, setPage]                     = useState(1);
  const [loading, setLoading]               = useState(false);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [error, setError]                   = useState("");
  const [registryTick, setRegistryTick]     = useState(0);

  const registryRef = useRef(new Map());
  const getDevicesRef = useRef(getDevices);

  useEffect(() => {
    getDevicesRef.current = getDevices;
  }, [getDevices]);

  const resetSidebarCache = useCallback(() => {
    setDefaultDevices([]);
    setSearchResults([]);
    setSearchTerm("");
    setDebouncedSearch("");
    setRecentSns([]);
    setTotal(0);
    setTotalPages(1);
    setPage(1);
    setLoading(false);
    setSearchLoading(false);
    setError("");
    registryRef.current.clear();
  }, []);

  useEffect(() => registerCacheResetListener(resetSidebarCache), [resetSidebarCache]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const registerDevices = useCallback((list) => {
    let changed = false;
    for (const device of list) {
      if (!device?.sn) continue;
      registryRef.current.set(device.sn, device);
      changed = true;
    }
    if (changed) setRegistryTick((n) => n + 1);
  }, []);

  const loadDefault = useCallback(async (targetPage = 1) => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const payload = await getDevicesRef.current({ page: targetPage, limit: DEFAULT_LIMIT });
      const list    = normalizeList(payload);
      registerDevices(list);
      setDefaultDevices(list);
      const t  = Number(payload?.total ?? list.length) || list.length;
      const tp = Number(payload?.total_pages ?? payload?.totalPages ?? Math.max(1, Math.ceil(t / DEFAULT_LIMIT)));
      setTotal(t);
      setTotalPages(tp);
      setPage(targetPage);
    } catch (err) {
      setError(err.message || "Failed to load locators");
      setDefaultDevices([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [registerDevices, user]);

  const runSearch = useCallback(async (term) => {
    if (!user || !term) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setError("");
    try {
      const payload = await getDevicesRef.current({
        page: 1,
        limit: SEARCH_LIMIT,
        search: term,
      });
      const list = normalizeList(payload);
      registerDevices(list);
      setSearchResults(list);
    } catch (err) {
      setError(err.message || "Search failed");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [registerDevices, user]);

  useEffect(() => {
    if (!user) {
      setDefaultDevices([]);
      setSearchResults([]);
      setTotal(0);
      setError("");
      registryRef.current.clear();
      return;
    }
    void loadDefault();
  }, [user, loadDefault]);

  useEffect(() => {
    if (!debouncedSearch) {
      setSearchResults([]);
      return;
    }
    void runSearch(debouncedSearch);
  }, [debouncedSearch, runSearch]);

  const recordRecent = useCallback((device) => {
    const sn = device?.sn;
    if (!sn) return;
    registerDevices([device]);
    setRecentSns((prev) => {
      const next = [sn, ...prev.filter((s) => s !== sn)].slice(0, RECENT_MAX);
      saveRecentSns(next);
      return next;
    });
  }, [registerDevices]);

  const getDevice = useCallback((sn) => {
    if (!sn) return null;
    void registryTick;
    return registryRef.current.get(sn) ?? null;
  }, [registryTick]);

  const ensureDevice = useCallback(async (sn) => {
    if (!sn) return null;
    const cached = registryRef.current.get(sn);
    if (cached) return cached;

    try {
      const payload = await getDevicesRef.current({ page: 1, limit: SEARCH_LIMIT, search: sn });
      const list = normalizeList(payload);
      const match = list.find((d) => d.sn === sn) ?? list[0] ?? null;
      if (match) {
        registerDevices([match]);
        setRecentSns((prev) => {
          const next = [sn, ...prev.filter((s) => s !== sn)].slice(0, RECENT_MAX);
          saveRecentSns(next);
          return next;
        });
      }
      return match;
    } catch {
      return null;
    }
  }, [registerDevices]);

  useEffect(() => {
    if (!user || loading || defaultDevices.length === 0) return;
    const defaultSnSet = new Set(defaultDevices.map((d) => d.sn));
    for (const sn of recentSns) {
      if (!defaultSnSet.has(sn) && !registryRef.current.has(sn)) {
        void ensureDevice(sn);
      }
    }
  }, [user, loading, defaultDevices, recentSns, ensureDevice]);

  const recentDevices = useMemo(() => {
    void registryTick;
    return recentSns.map((sn) => registryRef.current.get(sn)).filter(Boolean);
  }, [recentSns, registryTick]);

  const displayDevices = useMemo(() => {
    if (debouncedSearch) return searchResults;
    const defaultSnSet = new Set(defaultDevices.map((d) => d.sn));
    const recentNotInDefault = recentDevices.filter((d) => !defaultSnSet.has(d.sn));
    return dedupeBySn([...recentNotInDefault, ...defaultDevices]);
  }, [debouncedSearch, searchResults, recentDevices, defaultDevices]);

  const goToPage = useCallback((targetPage) => {
    const p = Math.max(1, Number(targetPage) || 1);
    void loadDefault(p);
  }, [loadDefault]);

  const refresh = useCallback(async () => {
    await loadDefault(page);
    if (debouncedSearch) await runSearch(debouncedSearch);
  }, [loadDefault, runSearch, debouncedSearch, page]);

  const online = displayDevices.filter((d) => d.status === "online").length;
  const offline = displayDevices.length - online;

  const value = useMemo(() => ({
    displayDevices,
    recentDevices,
    defaultDevices,
    searchTerm,
    setSearchTerm,
    debouncedSearch,
    isSearching: Boolean(debouncedSearch),
    loading: loading || searchLoading,
    error,
    total,
    page,
    totalPages,
    hasNextPage:     !debouncedSearch && page < totalPages,
    hasPreviousPage: !debouncedSearch && page > 1,
    goToPage,
    online,
    offline,
    refresh,
    recordRecent,
    getDevice,
    ensureDevice,
  }), [
    displayDevices,
    recentDevices,
    defaultDevices,
    searchTerm,
    debouncedSearch,
    loading,
    searchLoading,
    error,
    total,
    page,
    totalPages,
    goToPage,
    online,
    offline,
    refresh,
    recordRecent,
    getDevice,
    ensureDevice,
  ]);

  return (
    <SidebarDevicesContext.Provider value={value}>
      {children}
    </SidebarDevicesContext.Provider>
  );
}

export function useSidebarDevices() {
  const ctx = useContext(SidebarDevicesContext);
  if (!ctx) {
    throw new Error("useSidebarDevices must be used inside SidebarDevicesProvider");
  }
  return ctx;
}
