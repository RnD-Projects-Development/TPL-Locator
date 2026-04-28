// Single source of truth for fence zones, shared across FencePage sidebar and AreaSelector.
// Geocoding runs once here; any consumer gets the cached result immediately.
import { createContext, useContext, useState, useEffect } from 'react';
import { UC_ZONE } from '../data/kmlZones.js';
import { tplGeocode } from '../utils/tplGeocode.js';

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
  const [zones,   setZones]   = useState(SOURCE_ZONES);
  const [areas,   setAreas]   = useState(() => SOURCE_ZONES.map(_toArea));
  const [loading, setLoading] = useState(true);

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
        setZones(enriched);
        setAreas(enriched.map(_toArea));
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

  return (
    <ZoneCacheContext.Provider value={{ zones, areas, loading }}>
      {children}
    </ZoneCacheContext.Provider>
  );
}

export function useZoneCache() {
  const ctx = useContext(ZoneCacheContext);
  if (!ctx) throw new Error('useZoneCache must be used inside ZoneCacheProvider');
  return ctx;
}
