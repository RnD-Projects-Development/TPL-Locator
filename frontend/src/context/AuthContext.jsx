// frontend/src/context/AuthContext.jsx

import React, { createContext, useContext, useMemo, useState } from "react";
import { clearAppCaches } from "../utils/clearAppCaches.js";
import { displayContact } from "../utils/userContact.js";

const AuthContext = createContext(null);

const STORAGE_KEY = "citytag_dashboard_auth";

function normalizeUserForClient(user) {
  if (!user) return null;
  const contact = displayContact(user);
  if (!contact) return user;
  return { ...user, email: contact };
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.role === undefined) data.role = "user";
    if (data.user) data.user = normalizeUserForClient(data.user);
    return data;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const stored = loadStored();
  const [user, setUser] = useState(stored?.user ?? null);
  const [accessToken, setAccessToken] = useState(stored?.accessToken ?? null);

  const [role, setRole] = useState(stored?.role ?? null);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      role: role ?? stored?.role,
      isAdmin: (role ?? stored?.role) === "admin",
      isAuthed: Boolean(accessToken),
      loginSuccess: ({ user: newUser, accessToken: token, role: newRole }) => {
        const normalized = normalizeUserForClient(newUser);
        setUser(normalized);
        setAccessToken(token);
        setRole(newRole ?? "user");
        const payload = { user: normalized, accessToken: token, role: newRole ?? "user" };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      },
      logout: () => {
        clearAppCaches();
        setUser(null);
        setAccessToken(null);
        setRole(null);
        localStorage.removeItem(STORAGE_KEY);
      },
    }),
    [user, accessToken, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

