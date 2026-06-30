import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "./AuthContext.jsx";
import { registerCacheResetListener } from "../utils/clearAppCaches.js";
import { loadSidebarScopeState, saveSidebarScopeState } from "../utils/sidebarPageState.js";

const DEFAULT_LIMIT  = 20;
const SEARCH_LIMIT   = 50;
const RECENT_MAX = 8;
const STORAGE_KEY = "tpl_sidebar_recent_devices";
const LIST_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_TTL_MS = 60_000;

const SidebarDevicesContext = createContext(null);

const isSticker = (sn) => /^\d+$/.test(String(sn ?? ""));

function normalizeList(payload) {
  return Array.isArray(payload) ? payload : payload?.devices ?? [];
}

function filterKey(deviceTypeFilter) {
  return deviceTypeFilter ?? "all";
}

function listCacheKey(deviceTypeFilter, targetPage) {
  return `${filterKey(deviceTypeFilter)}:${targetPage}`;
}

function searchCacheKey(deviceTypeFilter, term) {
  return `${filterKey(deviceTypeFilter)}:${term}`;
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

  const [defaultDevices, setDefaultDevices]   = useState([]);
  const [searchResults, setSearchResults]     = useState([]);
  const [searchTerm, setSearchTerm]           = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [recentSns, setRecentSns]             = useState(loadRecentSns);
  const [total, setTotal]                     = useState(0);
  const [totalPages, setTotalPages]           = useState(1);
  const [page, setPage]                       = useState(1);
  const [loading, setLoading]                 = useState(false);
  const [searchLoading, setSearchLoading]     = useState(false);
  const [error, setError]                     = useState("");
  const [registryTick, setRegistryTick]       = useState(0);
  const [deviceTypeFilter, setDeviceTypeFilterState] = useState(null);
  const [activeScope, setActiveScope]         = useState(null);

  const registryRef = useRef(new Map());
  const getDevicesRef = useRef(getDevices);
  const activeScopeRef = useRef(null);
  const listCacheRef = useRef(new Map());
  const searchCacheRef = useRef(new Map());
  const deviceTypeFilterRef = useRef(null);
  const pageRef = useRef(1);
  const searchTermRef = useRef("");

  useEffect(() => {
    getDevicesRef.current = getDevices;
  }, [getDevices]);

  useEffect(() => {
    deviceTypeFilterRef.current = deviceTypeFilter;
  }, [deviceTypeFilter]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);

  const persistActiveScopeMeta = useCallback(() => {
    const scope = activeScopeRef.current;
    if (!scope) return;
    saveSidebarScopeState(scope, {
      deviceTypeFilter: deviceTypeFilterRef.current,
      page: pageRef.current,
      searchTerm: searchTermRef.current,
    });
  }, []);

  const getValidListCache = useCallback((typeFilter, targetPage) => {
    const key = listCacheKey(typeFilter, targetPage);
    const entry = listCacheRef.current.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > LIST_CACHE_TTL_MS) {
      listCacheRef.current.delete(key);
      return null;
    }
    return entry;
  }, []);

  const setListCache = useCallback((typeFilter, targetPage, snapshot) => {
    listCacheRef.current.set(listCacheKey(typeFilter, targetPage), {
      ...snapshot,
      fetchedAt: Date.now(),
    });
  }, []);

  const getValidSearchCache = useCallback((typeFilter, term) => {
    const key = searchCacheKey(typeFilter, term);
    const entry = searchCacheRef.current.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > SEARCH_CACHE_TTL_MS) {
      searchCacheRef.current.delete(key);
      return null;
    }
    return entry;
  }, []);

  const setSearchCache = useCallback((typeFilter, term, list) => {
    searchCacheRef.current.set(searchCacheKey(typeFilter, term), {
      list,
      fetchedAt: Date.now(),
    });
  }, []);

  const registerDevices = useCallback((list) => {
    let changed = false;
    for (const device of list) {
      if (!device?.sn) continue;
      registryRef.current.set(device.sn, device);
      changed = true;
    }
    if (changed) setRegistryTick((n) => n + 1);
  }, []);

  const applyListSnapshot = useCallback((snapshot, targetPage) => {
    registerDevices(snapshot.list);
    setDefaultDevices(snapshot.list);
    setTotal(snapshot.total);
    setTotalPages(snapshot.totalPages);
    setPage(targetPage);
    setError("");
  }, [registerDevices]);

  const loadDefault = useCallback(async (targetPage = 1, options = {}) => {
    if (!user) return;

    const typeFilter = options.deviceTypeFilter ?? deviceTypeFilterRef.current;
    const force = Boolean(options.force);

    if (!force) {
      const cached = getValidListCache(typeFilter, targetPage);
      if (cached) {
        applyListSnapshot(cached, targetPage);
        return;
      }
    }

    setLoading(true);
    setError("");
    try {
      const params = { page: targetPage, limit: DEFAULT_LIMIT };
      if (typeFilter) params.device_type = typeFilter;
      const payload = await getDevicesRef.current(params);
      const list    = normalizeList(payload);
      const t  = Number(payload?.total ?? list.length) || list.length;
      const tp = Number(payload?.total_pages ?? payload?.totalPages ?? Math.max(1, Math.ceil(t / DEFAULT_LIMIT)));
      const snapshot = { list, total: t, totalPages: tp };
      setListCache(typeFilter, targetPage, snapshot);
      applyListSnapshot(snapshot, targetPage);
      if (activeScopeRef.current) {
        saveSidebarScopeState(activeScopeRef.current, { page: targetPage });
      }
    } catch (err) {
      setError(err.message || "Failed to load devices");
      setDefaultDevices([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [user, getValidListCache, applyListSnapshot, setListCache, registerDevices]);

  const runSearch = useCallback(async (term, options = {}) => {
    if (!user || !term) {
      setSearchResults([]);
      return;
    }

    const typeFilter = options.deviceTypeFilter ?? deviceTypeFilterRef.current;
    const force = Boolean(options.force);

    if (!force) {
      const cached = getValidSearchCache(typeFilter, term);
      if (cached) {
        registerDevices(cached.list);
        setSearchResults(cached.list);
        setError("");
        return;
      }
    }

    setSearchLoading(true);
    setError("");
    try {
      const searchParams = { page: 1, limit: SEARCH_LIMIT, search: term };
      if (typeFilter) searchParams.device_type = typeFilter;
      const payload = await getDevicesRef.current(searchParams);
      const list = normalizeList(payload);
      setSearchCache(typeFilter, term, list);
      registerDevices(list);
      setSearchResults(list);
    } catch (err) {
      setError(err.message || "Search failed");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [user, getValidSearchCache, setSearchCache, registerDevices]);

  const activateScope = useCallback((scope) => {
    if (!scope || !user) return;

    if (activeScopeRef.current && activeScopeRef.current !== scope) {
      persistActiveScopeMeta();
    }

    activeScopeRef.current = scope;
    setActiveScope(scope);

    const saved = loadSidebarScopeState(scope);
    const filter = saved.deviceTypeFilter ?? null;
    const targetPage = saved.page ?? 1;
    const term = saved.searchTerm ?? "";

    setDeviceTypeFilterState(filter);
    setSearchTerm(term);
    setDebouncedSearch(term.trim());
    setSearchResults([]);

    const cached = getValidListCache(filter, targetPage);
    if (cached && !term.trim()) {
      applyListSnapshot(cached, targetPage);
      return;
    }

    void loadDefault(targetPage, { deviceTypeFilter: filter });
    if (term.trim()) {
      void runSearch(term.trim(), { deviceTypeFilter: filter });
    }
  }, [user, persistActiveScopeMeta, getValidListCache, applyListSnapshot, loadDefault, runSearch]);

  const setDeviceTypeFilter = useCallback((filter) => {
    setDeviceTypeFilterState(filter);
    setPage(1);
    setSearchResults([]);

    if (activeScopeRef.current) {
      saveSidebarScopeState(activeScopeRef.current, {
        deviceTypeFilter: filter,
        page: 1,
      });
    }

    const term = searchTermRef.current.trim();
    if (term) {
      const cached = getValidSearchCache(filter, term);
      if (cached) {
        registerDevices(cached.list);
        setSearchResults(cached.list);
      } else {
        void runSearch(term, { deviceTypeFilter: filter });
      }
      return;
    }

    const cached = getValidListCache(filter, 1);
    if (cached) {
      applyListSnapshot(cached, 1);
      return;
    }

    void loadDefault(1, { deviceTypeFilter: filter });
  }, [getValidListCache, getValidSearchCache, applyListSnapshot, loadDefault, runSearch, registerDevices]);

  const setSearchTermScoped = useCallback((term) => {
    setSearchTerm(term);
    if (activeScopeRef.current) {
      saveSidebarScopeState(activeScopeRef.current, { searchTerm: term });
    }
  }, []);

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
    setDeviceTypeFilterState(null);
    setActiveScope(null);
    activeScopeRef.current = null;
    registryRef.current.clear();
    listCacheRef.current.clear();
    searchCacheRef.current.clear();
  }, []);

  useEffect(() => registerCacheResetListener(resetSidebarCache), [resetSidebarCache]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!user) {
      setDefaultDevices([]);
      setSearchResults([]);
      setTotal(0);
      setError("");
      registryRef.current.clear();
      listCacheRef.current.clear();
      searchCacheRef.current.clear();
      activeScopeRef.current = null;
      setActiveScope(null);
    }
  }, [user]);

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
    const list = recentSns.map((sn) => registryRef.current.get(sn)).filter(Boolean);
    if (deviceTypeFilter === "sticker") {
      return list.filter((d) => isSticker(d.sn));
    }
    if (deviceTypeFilter === "locator") {
      return list.filter((d) => !isSticker(d.sn));
    }
    return list;
  }, [recentSns, registryTick, deviceTypeFilter]);

  const displayDevices = useMemo(() => {
    if (debouncedSearch) return searchResults;
    const defaultSnSet = new Set(defaultDevices.map((d) => d.sn));
    const recentNotInDefault = recentDevices.filter((d) => !defaultSnSet.has(d.sn));
    return dedupeBySn([...recentNotInDefault, ...defaultDevices]);
  }, [debouncedSearch, searchResults, recentDevices, defaultDevices]);

  const goToPage = useCallback((targetPage) => {
    const p = Math.max(1, Number(targetPage) || 1);
    if (activeScopeRef.current) {
      saveSidebarScopeState(activeScopeRef.current, { page: p });
    }
    void loadDefault(p);
  }, [loadDefault]);

  const refresh = useCallback(async () => {
    await loadDefault(page, { force: true });
    if (debouncedSearch) await runSearch(debouncedSearch, { force: true });
  }, [loadDefault, runSearch, debouncedSearch, page]);

  const online = displayDevices.filter((d) => d.status === "online").length;
  const offline = displayDevices.length - online;

  const value = useMemo(() => ({
    displayDevices,
    recentDevices,
    defaultDevices,
    searchTerm,
    setSearchTerm: setSearchTermScoped,
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
    deviceTypeFilter,
    setDeviceTypeFilter,
    activateScope,
    activeScope,
  }), [
    displayDevices,
    recentDevices,
    defaultDevices,
    searchTerm,
    setSearchTermScoped,
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
    deviceTypeFilter,
    setDeviceTypeFilter,
    activateScope,
    activeScope,
  ]);

  return (
    <SidebarDevicesContext.Provider value={value}>
      {children}
    </SidebarDevicesContext.Provider>
  );
}

export function useSidebarDevices(scope = null) {
  const ctx = useContext(SidebarDevicesContext);
  if (!ctx) {
    throw new Error("useSidebarDevices must be used inside SidebarDevicesProvider");
  }

  const activateScopeRef = useRef(ctx.activateScope);
  activateScopeRef.current = ctx.activateScope;

  useEffect(() => {
    if (scope) activateScopeRef.current(scope);
  }, [scope]);

  return ctx;
}
