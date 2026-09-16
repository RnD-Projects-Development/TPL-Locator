import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useCityTag } from "../hooks/useCityTag.js";
import { useDeviceCache } from "../context/DeviceCacheContext.jsx";
import { useZoneCache } from "../context/ZoneCacheContext.jsx";
import { useUserCache } from "../context/Usercachecontext.jsx";
import { useHomePageCache } from "../context/HomePageCacheContext.jsx";
import { fetchFleetDevices, isFleetCacheValid } from "../utils/fleetCache.js";
import { prefetchAllPaginatedDeviceCaches } from "../hooks/usePaginatedDevices.js";

/**
 * Orchestrates the master 4-pillar boot upon login or hard reload:
 * 1) Fences (/api/zones)
 * 2) Devices (/api/devices)
 * 3) Users (/api/admin/users)
 * 4) Dashboard (summary metrics, locations, activity)
 *
 * Runs strictly once upon authentication, populating shared in-memory caches so that
 * navigating between any page is instant with zero network calls and zero loaders.
 */
export default function AppCachePrefetch() {
  const { user, isAdmin, isSuperUser } = useAuth();
  const { getDevices } = useCityTag();
  const { refresh: refreshDevices } = useDeviceCache();
  const { refreshZones } = useZoneCache();
  const { refresh: refreshUsers } = useUserCache();
  const { refreshAll: refreshDashboard } = useHomePageCache();

  const getDevicesRef = useRef(getDevices);
  useEffect(() => {
    getDevicesRef.current = getDevices;
  }, [getDevices]);

  const bootedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      bootedRef.current = false;
      return;
    }
    if (bootedRef.current) return;
    bootedRef.current = true;

    const canManageUsers = isAdmin || isSuperUser;
    const fetchDevicesFn = (opts) => getDevicesRef.current(opts);

    // 1) Fences: load user zones once
    refreshZones().catch(() => {});

    // 2) Devices: load complete fleet once into shared memory cache
    fetchFleetDevices(fetchDevicesFn)
      .then(() => {
        refreshDevices().catch(() => {});
        prefetchAllPaginatedDeviceCaches(fetchDevicesFn);
        // 4) Dashboard: once fleet is cached, warm dashboard in background (reuses fleet in 0ms)
        refreshDashboard({ force: false, silent: true }).catch(() => {});
      })
      .catch(() => {
        refreshDashboard({ force: false, silent: true }).catch(() => {});
      });

    // 3) Users: load admin user list once
    if (canManageUsers) {
      refreshUsers(false).catch(() => {});
    }
  }, [user, isAdmin, isSuperUser, refreshZones, refreshDevices, refreshUsers, refreshDashboard]);

  return null;
}
