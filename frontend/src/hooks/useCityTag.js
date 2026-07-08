// frontend/src/hooks/useCityTag.js

import { useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const API_BASE_URL = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE_URL || "");

// Helper to convert naive PKT strings (e.g. "2026-07-08T00:00:00") into valid UTC ISO strings.
// The backend treats naive strings as UTC, causing a 5-hour shift. This ensures exact PKT boundaries.
const toIsoPKT = (val) => {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string' && val.length <= 19 && !val.includes('Z') && !val.includes('+')) {
    const d = new Date(val + "Z");
    if (!isNaN(d.getTime())) {
      return new Date(d.getTime() - 5 * 3600 * 1000).toISOString();
    }
  }
  return val;
};

// In-flight GET request cache — if the same URL is already being fetched,
// return the existing promise instead of firing a second network request.
// This eliminates redundant concurrent calls from multiple context providers.
const _inflight = new Map();

/** Drop in-flight GET dedupe entries (call on logout). */
export function clearInflightApiCache() {
  _inflight.clear();
}

async function apiFetch(path, { method = "GET", body } = {}, accessToken, onUnauthorized) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const url = `${API_BASE_URL}${path}`;

  // Deduplicate concurrent GET requests for the same URL + token
  if (method === "GET" && !body) {
    const key = `${accessToken}|${url}`;
    if (_inflight.has(key)) return _inflight.get(key);
    const promise = _doFetch(url, method, headers, body, onUnauthorized)
      .finally(() => _inflight.delete(key));
    _inflight.set(key, promise);
    return promise;
  }

  return _doFetch(url, method, headers, body, onUnauthorized);
}

async function _doFetch(url, method, headers, body, onUnauthorized) {
  let res;
  try {
    res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (networkErr) {
    throw new Error(networkErr.message === "Failed to fetch"
      ? "Network error. Start the backend (e.g. uvicorn app.main:app --reload --port 8000)"
      : networkErr.message);
  }

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    // Token expired or invalid — log out immediately so the user isn't stuck
    if (res.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    // Normalize common FastAPI/Pydantic error shapes so Error.message becomes readable
    let message;
    if (typeof payload === "string") {
      message = payload;
    } else if (Array.isArray(payload?.detail)) {
      // Pydantic validation errors: [{loc,msg,type}, ...]
      message = payload.detail.map(e => (e?.msg || e?.message || JSON.stringify(e))).join("; ");
    } else {
      message = payload?.detail || payload?.error || "Request failed";
    }
    // Sanitize noisy server/database connectivity errors → friendly, user-safe text.
    // (The raw pymongo topology dump should never reach the UI.) Raw detail is kept on err.payload.
    if (res.status >= 500 &&
        /ServerSelectionTimeoutError|ReplicaSetNoPrimary|No replica set members|SSL handshake|pymongo|Topology/i.test(String(message))) {
      message = "The server is temporarily unable to reach the database. Please try again in a moment.";
    }
    const err = new Error(message);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

export function useCityTag() {
  const { accessToken, logout } = useAuth();

  const login = useCallback(
    async ({ identifier, password, otp, login_token }) =>
      apiFetch(
        "/api/login",
        {
          method: "POST",
          body: {
            identifier,
            ...(password ? { password } : {}),
            ...(otp && login_token ? { otp, login_token } : {}),
          },
        },
        null
      ),
    []
  );

  const requestLoginOtp = useCallback(
    async ({ identifier }) =>
      apiFetch("/api/login/send-verification", { method: "POST", body: { identifier } }, null),
    []
  );

  const adminLogin = useCallback(
    async ({ email, password }) =>
      apiFetch("/api/login", { method: "POST", body: { identifier: email, password, uid: "" } }, null), []
  );

  const signup = useCallback(
    async ({ email, phone, password, name, verification_token, otp }) =>
      apiFetch(
        "/api/register",
        {
          method: "POST",
          body: { email, phone, password, name: name || "", verification_token, otp },
        },
        null
      ),
    []
  );

  const requestSignupVerification = useCallback(
    async ({ email, phone }) =>
      apiFetch(
        "/api/register/send-verification",
        { method: "POST", body: { email, phone } },
        null
      ),
    []
  );

  const requestPasswordReset = useCallback(
    async ({ email }) =>
      apiFetch("/api/forgot-password/request", { method: "POST", body: { email } }, null),
    []
  );

  const resetPasswordWithOtp = useCallback(
    async ({ reset_token, otp, new_password }) =>
      apiFetch("/api/forgot-password/reset", { method: "POST", body: { reset_token, otp, new_password } }, null),
    []
  );

  const getMyProfile = useCallback(
    async () => apiFetch("/api/me/profile", {}, accessToken, logout),
    [accessToken, logout]
  );

  const updateMyProfile = useCallback(
    async ({
      name,
      cnic,
      cnic_expiry,
      driving_license_no,
      license_expiry,
      emergency_contact,
      address,
      profile_image,
    } = {}) => {
      if (!accessToken) throw new Error("Not authenticated");

      const form = new FormData();
      const appendIfDefined = (key, value) => {
        if (value !== undefined) form.append(key, value ?? "");
      };
      appendIfDefined("name", name);
      appendIfDefined("cnic", cnic);
      appendIfDefined("cnic_expiry", cnic_expiry);
      appendIfDefined("driving_license_no", driving_license_no);
      appendIfDefined("license_expiry", license_expiry);
      appendIfDefined("emergency_contact", emergency_contact);
      appendIfDefined("address", address);
      if (profile_image instanceof File) {
        form.append("profile_image", profile_image);
      }

      const res = await fetch(`${API_BASE_URL}/api/me/profile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });

      let payload = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      if (!res.ok) {
        if (res.status === 401) logout?.();
        throw new Error(payload?.detail || "Unable to update profile");
      }
      return payload;
    },
    [accessToken, logout]
  );

  const getDevices = useCallback(
    async ({ page, limit, search, status, device_type, search_scope } = {}) => {
      const params = new URLSearchParams();
      if (page != null) params.set("page", String(page));
      if (limit != null) params.set("limit", String(limit));
      if (search != null && String(search).trim()) params.set("search", String(search).trim());
      if (status != null && status !== "all") params.set("status", String(status));
      if (device_type != null) params.set("device_type", String(device_type));
      if (search_scope != null) params.set("search_scope", String(search_scope));
      const query = params.toString();
      return apiFetch(query ? `/api/devices?${query}` : "/api/devices", {}, accessToken, logout);
    },
    [accessToken, logout]
  );

  const getDevicesSummary = useCallback(
    async () => apiFetch("/api/devices/summary", {}, accessToken, logout),
    [accessToken, logout]
  );

  const getDeviceBySn = useCallback(
    async (sn) => apiFetch(`/api/devices/${encodeURIComponent(sn)}`, {}, accessToken, logout),
    [accessToken, logout]
  );

  const getAvailableDevices = useCallback(
    async () => apiFetch("/api/devices/available", {}, accessToken, logout),
    [accessToken, logout]
  );

  // Lightweight single-SN lookup for the user bind flow's search-by-SN input.
  const checkDeviceAvailability = useCallback(
    async (sn) => apiFetch(`/api/devices/${encodeURIComponent(sn)}/check`, {}, accessToken, logout),
    [accessToken, logout]
  );

  // User bind — hits /api/devices (user endpoint)
  const bindDevice = useCallback(
    async ({ sn, label, client, category }) =>
      apiFetch("/api/devices", { method: "POST", body: { sn, name: label, client: client || "", category: category || undefined } }, accessToken, logout),
    [accessToken, logout]
  );

  const bindDeviceByIdentifier = useCallback(
    async ({ sn, identifier, name = "", client = "", category }) =>
      apiFetch(
        "/api/devices",
        { method: "POST", body: { sn, identifier: identifier || undefined, user_id: undefined, name, client, category: category || undefined } },
        accessToken, logout
      ),
    [accessToken, logout]
  );

  const unbindDevice = useCallback(
    async (sn) => apiFetch(`/api/devices/${encodeURIComponent(sn)}`, { method: "DELETE" }, accessToken, logout),
    [accessToken, logout]
  );

  const adminUnbindDevice = useCallback(
    async (sn) => apiFetch(`/api/devices/${encodeURIComponent(sn)}`, { method: "DELETE" }, accessToken, logout),
    [accessToken, logout]
  );

  const getUsers = useCallback(
    async () => apiFetch("/api/users", {}, accessToken, logout), [accessToken, logout]
  );

  const adminGetUsers = useCallback(
    async () => apiFetch("/api/admin/users", {}, accessToken, logout), [accessToken, logout]
  );

  const adminCreateUser = useCallback(
    async ({ identifier, password, name }) =>
      apiFetch("/api/admin/users", { method: "POST", body: { identifier, password, name } }, accessToken, logout),
    [accessToken, logout]
  );

  // Admin assigns a device to a user via unified endpoint.
  const adminAssignDeviceToUser = useCallback(
    async (userId, sn, { name = "", client = "", category } = {}) =>
      apiFetch(
        "/api/devices",
        { method: "POST", body: { sn, user_id: userId, name, client, category: category || undefined } },
        accessToken, logout
      ),
    [accessToken, logout]
  );

  // Admin unassigns by SN via unified endpoint.
  const adminUnassignDeviceFromUser = useCallback(
    async (_userId, sn) =>
      apiFetch(`/api/devices/${encodeURIComponent(sn)}`, { method: "DELETE" }, accessToken, logout),
    [accessToken, logout]
  );

  // Admin deletes a user (also unassigns all their devices via backend)
  const adminDeleteUser = useCallback(
    async (userId) =>
      apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" }, accessToken, logout),
    [accessToken, logout]
  );

  const adminUpdateUser = useCallback(
    async (userId, { name, password, role } = {}) => {
      // Only include fields that were actually provided — backend treats
      // null/undefined as "leave unchanged".
      const body = {};
      if (name !== undefined)     body.name = name;
      if (password !== undefined) body.password = password;
      if (role !== undefined)     body.role = role;
      return apiFetch(
        `/api/admin/users/${encodeURIComponent(userId)}`,
        { method: "PUT", body },
        accessToken, logout
      );
    },
    [accessToken, logout]
  );

  const adminUpdateDevice = useCallback(
    async (sn, { name, client, region, category } = {}) =>
      apiFetch(
        `/api/devices/${encodeURIComponent(sn)}`,
        { method: "PUT", body: { name, client, region, category } },
        accessToken, logout
      ),
    [accessToken, logout]
  );

  const updateDevice = useCallback(
    async (sn, { name, client, category } = {}) =>
      apiFetch(
        `/api/devices/${encodeURIComponent(sn)}`,
        { method: "PUT", body: { name, client, category } },
        accessToken, logout
      ),
    [accessToken, logout]
  );

  const searchDevice = useCallback(
    async (sn) => apiFetch(`/api/admin/devices/search/${encodeURIComponent(sn)}`, {}, accessToken, logout),
    [accessToken, logout]
  );

  const getLatestLocation = useCallback(
    async (sn) => apiFetch(`/api/location/${encodeURIComponent(sn)}`, {}, accessToken, logout),
    [accessToken, logout]
  );

  const getLatestLocationsBatch = useCallback(
    async (sns) => apiFetch(
      "/api/location/latest-batch",
      { method: "POST", body: { sns: Array.isArray(sns) ? sns : [] } },
      accessToken,
      logout,
    ),
    [accessToken, logout]
  );

  const getTrajectory = useCallback(
    async (sn, start, end) => {
      const params = new URLSearchParams({
        start: toIsoPKT(start),
        end:   toIsoPKT(end),
      });
      return apiFetch(`/api/devices/${encodeURIComponent(sn)}/trajectory?${params}`, {}, accessToken, logout);
    }, [accessToken, logout]
  );

  const getPlayback = useCallback(
    async (sn, start, end) => {
      const params = new URLSearchParams({
        start: toIsoPKT(start),
        end:   toIsoPKT(end),
      });
      return apiFetch(`/api/devices/${encodeURIComponent(sn)}/playback?${params}`, {}, accessToken, logout);
    }, [accessToken, logout]
  );

  const getGeocode = useCallback(
    async (lat, lng) => {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
      return apiFetch(`/api/geocode?${params}`, {}, accessToken, logout);
    },
    [accessToken, logout]
  );

  const getPlaybackBatch = useCallback(
    async (sns, start, end) => apiFetch(
      "/api/devices/playback-batch",
      {
        method: "POST",
        body: {
          sns: Array.isArray(sns) ? sns : [],
          start: toIsoPKT(start),
          end: toIsoPKT(end),
        },
      },
      accessToken,
      logout,
    ),
    [accessToken, logout]
  );

  const getCategories = useCallback(
    async (deviceType) => {
      const params = new URLSearchParams();
      if (deviceType != null && deviceType !== "all") params.set("device_type", String(deviceType));
      const query = params.toString();
      return apiFetch(query ? `/api/categories?${query}` : "/api/categories", {}, accessToken, logout);
    },
    [accessToken, logout]
  );

  const createCategory = useCallback(
    async ({ name, device_type }) =>
      apiFetch("/api/categories", { method: "POST", body: { name, device_type: device_type || undefined } }, accessToken, logout),
    [accessToken, logout]
  );

  const getFieldStaffLiveDevices = useCallback(
    async ({ page, limit, search, zoneId, lastSeenFrom, lastSeenTo } = {}) => {
      const params = new URLSearchParams();
      if (page != null) params.set("page", String(page));
      if (limit != null) params.set("limit", String(limit));
      if (search != null && String(search).trim()) params.set("search", String(search).trim());
      if (zoneId) params.set("zone_id", String(zoneId));
      if (lastSeenFrom) params.set("last_seen_from", lastSeenFrom);
      if (lastSeenTo) params.set("last_seen_to", lastSeenTo);
      const query = params.toString();
      return apiFetch(
        query ? `/api/field-staff/live-devices?${query}` : "/api/field-staff/live-devices",
        {},
        accessToken,
        logout,
      );
    },
    [accessToken, logout]
  );

  return {
    login, requestLoginOtp, adminLogin, signup, requestSignupVerification, requestPasswordReset, resetPasswordWithOtp,
    getMyProfile, updateMyProfile,
    getDevices, getDevicesSummary, getDeviceBySn, getAvailableDevices, checkDeviceAvailability, getUsers, adminGetUsers, adminCreateUser,
    adminAssignDeviceToUser, adminUnassignDeviceFromUser, adminDeleteUser, adminUpdateUser,
    adminUpdateDevice, updateDevice,
    bindDevice, bindDeviceByIdentifier, unbindDevice, adminUnbindDevice,
    searchDevice, getLatestLocation, getTrajectory, getPlayback, getGeocode,
    getLatestLocationsBatch, getPlaybackBatch,
    getFieldStaffLiveDevices,
    getCategories, createCategory,
  };
}