import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "./AuthContext.jsx";
import { registerCacheResetListener } from "../utils/clearAppCaches.js";

/* ──────────────────────────────────────────────────────────────────
   ProfileCacheContext

   Fetches /me/profile once the account is authenticated, rather than when the
   Profile Settings dialog opens. The dialog then renders populated on first
   paint instead of showing a skeleton on every open.

   Prefetching on accessToken covers both paths — a fresh login and a page
   reload that restores a stored session.
   ────────────────────────────────────────────────────────────────── */
const ProfileCacheContext = createContext(null);

export function ProfileCacheProvider({ children }) {
  const { getMyProfile } = useCityTag();
  const { accessToken } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const getMyProfileRef = useRef(getMyProfile);
  useEffect(() => { getMyProfileRef.current = getMyProfile; }, [getMyProfile]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMyProfileRef.current();
      setProfile(data || null);
      return data;
    } catch (err) {
      setError(err.message || "Unable to load profile");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** Merge the server's response after a save so the cache never goes stale. */
  const applyProfile = useCallback((data) => {
    if (data) setProfile((prev) => ({ ...(prev || {}), ...data }));
  }, []);

  const resetProfileCache = useCallback(() => {
    setProfile(null);
    setLoading(false);
    setError("");
  }, []);

  useEffect(() => registerCacheResetListener(resetProfileCache), [resetProfileCache]);

  // Prefetch as soon as the account is authenticated; clear on logout.
  useEffect(() => {
    if (accessToken) fetchProfile();
    else resetProfileCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  return (
    <ProfileCacheContext.Provider
      value={{ profile, loading, error, refresh: fetchProfile, applyProfile }}
    >
      {children}
    </ProfileCacheContext.Provider>
  );
}

export function useProfileCache() {
  const ctx = useContext(ProfileCacheContext);
  if (!ctx) throw new Error("useProfileCache must be used inside ProfileCacheProvider");
  return ctx;
}
