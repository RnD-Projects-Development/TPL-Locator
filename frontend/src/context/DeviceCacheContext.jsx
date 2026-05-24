import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "./AuthContext.jsx";

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

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Load first 100 devices — used only for the bind modal's unbound device list
      const data = await getDevicesRef.current({ page: 1, limit: 100 });
      const list = Array.isArray(data) ? data : data?.devices ?? [];
      setDevices(list);
      setLastFetched(Date.now());
    } catch (err) {
      setError(err.message || "Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on demand when user is authenticated (for bind modals); clear on logout.
  // Does NOT auto-load on mount — pages use usePaginatedDevices instead.
  useEffect(() => {
    if (user) fetchDevices();
    else { setDevices([]); setLastFetched(null); setError(""); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user]);

  return (
    <DeviceCacheContext.Provider value={{ devices, loading, error, refresh: fetchDevices, lastFetched }}>
      {children}
    </DeviceCacheContext.Provider>
  );
}

export function useDeviceCache() {
  const ctx = useContext(DeviceCacheContext);
  if (!ctx) throw new Error("useDeviceCache must be used inside DeviceCacheProvider");
  return ctx;
}