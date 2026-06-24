// Single source of truth for fence zones, shared across FencePage sidebar and AreaSelector.
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext.jsx';
import { registerCacheResetListener } from '../utils/clearAppCaches.js';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

function _toArea(zone) {
  const rawCoords = zone.polygons
    ? zone.polygons.flat()
    : (zone.polygon || []);
  return {
    id:     zone.zone_id,
    name:   zone.name,
    tehsil: zone.tehsil,
    ucNo:   zone.uc_no,
    coords: rawCoords.map(p => [p.lat, p.lng]),
  };
}

const ZoneCacheContext = createContext(null);

export function ZoneCacheProvider({ children }) {
  const { accessToken } = useAuth();
  const [userZones, setUserZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  const accessTokenRef = useRef(accessToken);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  const resetZoneCache = useCallback(() => {
    setUserZones([]);
    setZonesLoading(false);
  }, []);

  useEffect(() => registerCacheResetListener(resetZoneCache), [resetZoneCache]);

  const refreshZones = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) return;
    setZonesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/zones`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setUserZones(Array.isArray(data) ? data : []);
    } catch {}
    finally { setZonesLoading(false); }
  }, []);

  useEffect(() => {
    if (accessToken) refreshZones();
  }, [accessToken, refreshZones]);

  const zones = userZones;
  const areas = zones.map(_toArea);

  return (
    <ZoneCacheContext.Provider value={{ zones, areas, loading: zonesLoading, zonesLoading, refreshZones }}>
      {children}
    </ZoneCacheContext.Provider>
  );
}

export function useZoneCache() {
  const ctx = useContext(ZoneCacheContext);
  if (!ctx) throw new Error('useZoneCache must be used inside ZoneCacheProvider');
  return ctx;
}
