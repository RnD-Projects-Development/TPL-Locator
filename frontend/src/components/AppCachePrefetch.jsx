import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useCityTag } from "../hooks/useCityTag.js";
import { prefetchFleetDevices } from "../utils/fleetCache.js";
import { prefetchAllPaginatedDeviceCaches } from "../hooks/usePaginatedDevices.js";

/**
 * Starts background cache warming as soon as the user is authenticated,
 * so pages like Devices open instantly without waiting for a fresh fetch.
 */
export default function AppCachePrefetch() {
  const { user } = useAuth();
  const { getDevices } = useCityTag();
  const getDevicesRef = useRef(getDevices);

  useEffect(() => {
    getDevicesRef.current = getDevices;
  }, [getDevices]);

  useEffect(() => {
    if (!user) return;

    const fetchDevices = (opts) => getDevicesRef.current(opts);
    prefetchFleetDevices(fetchDevices);
    prefetchAllPaginatedDeviceCaches(fetchDevices);
  }, [user]);

  return null;
}
