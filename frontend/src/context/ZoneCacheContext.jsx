// Single source of truth for fence zones, shared across FencePage sidebar and AreaSelector.
// Geocoding runs once here; any consumer gets the cached result immediately.
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { UC_ZONE } from '../data/kmlZones.js';
import { tplGeocode } from '../utils/tplGeocode.js';
import { useAuth } from './AuthContext.jsx';

const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE_URL || '');

// ── Add new zones here when additional KML files are loaded ──────────────────
const SOURCE_ZONES = [UC_ZONE];

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
  const [kmlZones,  setKmlZones]  = useState(SOURCE_ZONES);
  const [userZones, setUserZones] = useState([]);
  const [loading,   setLoading]   = useState(true);

  // Keep a ref so refreshZones callback can read the latest token without needing
  // to be recreated every time the token object reference changes.
  const accessTokenRef = useRef(accessToken);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  const [userZonesLoading, setUserZonesLoading] = useState(false);

  // ── Fetch user zones from MongoDB ─────────────────────────────────────────────
  const refreshZones = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) return;
    setUserZonesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/zones`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setUserZones(Array.isArray(data) ? data : []);
    } catch {}
    finally { setUserZonesLoading(false); }
  }, []);

  // ── KML geocoding — runs once on mount ───────────────────────────────────────
  useEffect(() => {
    let cancelled  = false;
    let retryTimer = null;

    async function geocodeAll() {
      const names = await Promise.all(
        SOURCE_ZONES.map(async (zone) => {
          try {
            const geo = await tplGeocode(zone.center.lat, zone.center.lng);
            return geo?.area || geo?.roadOnly || geo?.city || zone.name;
          } catch {
            return zone.name;
          }
        })
      );
      if (!cancelled) {
        const enriched = SOURCE_ZONES.map((z, i) => ({ ...z, name: names[i] }));
        setKmlZones(enriched);
        setLoading(false);
      }
    }

    function tryGeocode() {
      if (window.TPLMaps?.api?.reverseGeoCode) {
        geocodeAll();
      } else {
        retryTimer = setTimeout(tryGeocode, 1_000);
      }
    }

    tryGeocode();
    return () => { cancelled = true; clearTimeout(retryTimer); };
  }, []);

  // ── Fetch user zones once the auth token is available ────────────────────────
  useEffect(() => {
    if (accessToken) refreshZones();
  }, [accessToken, refreshZones]);

  // KML zones first, then user-created zones so they appear below in the sidebar
  const zones = [...kmlZones, ...userZones];
  const areas = zones.map(_toArea);

  return (
    <ZoneCacheContext.Provider value={{ zones, areas, loading, zonesLoading: loading || userZonesLoading, refreshZones }}>
      {children}
    </ZoneCacheContext.Provider>
  );
}

export function useZoneCache() {
  const ctx = useContext(ZoneCacheContext);
  if (!ctx) throw new Error('useZoneCache must be used inside ZoneCacheProvider');
  return ctx;
}
