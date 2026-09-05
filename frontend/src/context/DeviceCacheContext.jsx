import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "./AuthContext.jsx";
import { registerCacheResetListener } from "../utils/clearAppCaches.js";
import { fetchFleetDevices, getFleetCache, invalidateFleetCache, isFleetCacheValid } from "../utils/fleetCache.js";
import { useDeviceUpdates } from '../utils/deviceEvents.js';

const DeviceCacheContext = createContext(null);

export function DeviceCacheProvider({ children }) {
  const { getDevices } = useCityTag();
  const { user } = useAuth();
  const [devices, setDevices]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [lastFetched, setLastFetched] = useState(null);

  const getDevicesRef = useRef(getDevices);
  useEffect(() => { getDevicesRef.current = getDevices; }, [getDevices]);

  const resetDeviceCache = useCallback(() => {
    setDevices([]);
    setLoading(false);
    setError("");
    setLastFetched(null);
  }, []);

  useEffect(() => registerCacheResetListener(resetDeviceCache), [resetDeviceCache]);

  const fetchDevices = useCallback(async () => {
    if (isFleetCacheValid()) {
      setDevices(getFleetCache());
      setLastFetched(Date.now());
      return;
    }
    setLoading(true);
    setError("");
    try {
      const list = await fetchFleetDevices(getDevicesRef.current);
      setDevices(list);
      setLastFetched(Date.now());
    } catch (err) {
      setError(err.message || "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  const silentRefresh = useCallback(async () => {
    try {
      invalidateFleetCache();
      const list = await fetchFleetDevices(getDevicesRef.current, { force: true });
      setDevices(list);
      setLastFetched(Date.now());
    } catch {}
  }, []);

  // Load on demand when user is authenticated (for bind modals); clear on logout.
  useEffect(() => {
    if (user) fetchDevices();
    else resetDeviceCache();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user]);

  useDeviceUpdates(() => {
    fetchFleetDevices(getDevicesRef.current, { force: true })
      .then(list => {
        setDevices(list);
        setLastFetched(Date.now());
      })
      .catch(() => {});
  });

  return (
    <DeviceCacheContext.Provider value={{ devices, loading, error, refresh: fetchDevices, silentRefresh, lastFetched }}>
      {children}
    </DeviceCacheContext.Provider>
  );
}

export function useDeviceCache() {
  const ctx = useContext(DeviceCacheContext);
  if (!ctx) throw new Error("useDeviceCache must be used inside DeviceCacheProvider");
  return ctx;
}