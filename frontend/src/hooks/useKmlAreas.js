import { useZoneCache } from '../context/ZoneCacheContext.jsx';

export function useKmlAreas() {
  const { areas, loading } = useZoneCache();
  return { areas, kmlLoading: loading };
}
