import { useState, useEffect } from 'react';
import { KML_ZONES } from '../data/kmlZones.js';
import { tplGeocode } from '../utils/tplGeocode.js';

function _toArea(zone, name) {
  return {
    id:     zone.zone_id,
    name:   name || zone.name,
    tehsil: zone.tehsil,
    ucNo:   zone.uc_no,
    coords: zone.polygon.map(p => [p.lat, p.lng]),
  };
}

export function useKmlAreas() {
  const [areas, setAreas] = useState(() => KML_ZONES.map(z => _toArea(z, z.name)));

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;

    async function geocodeAll() {
      const names = await Promise.all(
        KML_ZONES.map(async (zone) => {
          try {
            const geo = await tplGeocode(zone.center.lat, zone.center.lng);
            return geo?.area || geo?.roadOnly || geo?.city || zone.name;
          } catch {
            return zone.name;
          }
        })
      );
      if (!cancelled) {
        setAreas(KML_ZONES.map((z, i) => _toArea(z, names[i])));
      }
    }

    function tryGeocode() {
      if (window.TPLMaps?.api?.reverseGeoCode) {
        geocodeAll();
      } else {
        retryTimer = setTimeout(tryGeocode, 1000);
      }
    }

    tryGeocode();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  return { areas, kmlLoading: false };
}
