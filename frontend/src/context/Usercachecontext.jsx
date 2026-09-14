import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useCityTag } from "../hooks/useCityTag.js";
import { useAuth } from "./AuthContext.jsx";
import { registerCacheResetListener } from "../utils/clearAppCaches.js";

const UserCacheContext = createContext(null);

export function UserCacheProvider({ children }) {
  const { adminGetUsers } = useCityTag();
  const { user, isAdmin, isSuperUser } = useAuth();
  const canManageUsers = isAdmin || isSuperUser;

  const [users, setUsers]             = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [lastFetched, setLastFetched] = useState(null);
  const usersRef = useRef([]);
  const lastFetchedRef = useRef(null);

  const adminGetUsersRef = useRef(adminGetUsers);
  useEffect(() => { adminGetUsersRef.current = adminGetUsers; }, [adminGetUsers]);

  const fetchUsers = useCallback(async (force = false) => {
    if (!force && usersRef.current.length > 0 && lastFetchedRef.current && (Date.now() - lastFetchedRef.current < 120_000)) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await adminGetUsersRef.current();
      const list = Array.isArray(data) ? data : [];
      usersRef.current = list;
      lastFetchedRef.current = Date.now();
      setUsers(list);
      setLastFetched(lastFetchedRef.current);
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  // Silent variant — updates data without touching the loading flag so the UI
  // doesn't flash a spinner during background auto-refresh.
  const silentRefresh = useCallback(async () => {
    try {
      const data = await adminGetUsersRef.current();
      const list = Array.isArray(data) ? data : [];
      usersRef.current = list;
      lastFetchedRef.current = Date.now();
      setUsers(list);
      setLastFetched(lastFetchedRef.current);
    } catch {}
  }, []);

  const resetUserCache = useCallback(() => {
    usersRef.current = [];
    lastFetchedRef.current = null;
    setUsers([]);
    setLoading(false);
    setError("");
    setLastFetched(null);
  }, []);

  useEffect(() => registerCacheResetListener(resetUserCache), [resetUserCache]);

  // Prefetch as soon as admin is authenticated; clear on logout
  useEffect(() => {
    if (user && canManageUsers) fetchUsers();
    else resetUserCache();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user, canManageUsers]);

  return (
    <UserCacheContext.Provider value={{ users, loading, error, refresh: fetchUsers, silentRefresh, lastFetched }}>
      {children}
    </UserCacheContext.Provider>
  );
}

export function useUserCache() {
  const ctx = useContext(UserCacheContext);
  if (!ctx) throw new Error("useUserCache must be used inside UserCacheProvider");
  return ctx;
}