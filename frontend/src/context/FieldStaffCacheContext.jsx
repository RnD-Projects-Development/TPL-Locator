import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useCityTag } from '../hooks/useCityTag.js';

const FieldStaffCacheContext = createContext(null);

export function FieldStaffCacheProvider({ children }) {
  const { getFieldStaffLiveDevices } = useCityTag();

  const [devices,     setDevices]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [locationCache, setLocationCache] = useState({});
  const [lastFetched, setLastFetched] = useState(null);

  const initDoneRef = useRef(false);

  // ── Fetch once on mount ───────────────────────────────────────────────────
  useEffect(() => {
    if (initDoneRef.current) return;
    initDoneRef.current = true;
    fetchDevices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchDevices() {
    try {
      setLoading(true);
      setError(null);
      const data = await getFieldStaffLiveDevices();
      setDevices(data);
      setLastFetched(Date.now());
    } catch (err) {
      setError(err.message || 'Failed to load field staff data');
    } finally {
      setLoading(false);
    }
  }

  // Manual refresh — re-fetches devices but preserves locationCache
  const refresh = useCallback(async () => {
    await fetchDevices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getFieldStaffLiveDevices]);

  // Called by the dashboard to persist reverse-geocode results across navigations
  const updateLocationCache = useCallback((sn, label) => {
    setLocationCache(prev => ({ ...prev, [sn]: label }));
  }, []);

  return (
    <FieldStaffCacheContext.Provider value={{
      devices, loading, error, locationCache, lastFetched,
      refresh, updateLocationCache,
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
