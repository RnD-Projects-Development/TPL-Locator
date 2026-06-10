export const LOCATOR_PAGE_STATE_KEY = "tpl_locator_page_state";

const FALLBACK = {
  searchTerm: "",
  filterStatus: "all",
  viewMode: "devices",
  page: 1,
};

function scopeKey(deviceType) {
  if (deviceType === "locator") return "locator";
  if (deviceType === "sticker") return "sticker";
  return "default";
}

function readRawStore() {
  try {
    const raw = sessionStorage.getItem(LOCATOR_PAGE_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeScopeEntry(parsed = {}) {
  return {
    searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : FALLBACK.searchTerm,
    filterStatus: ["all", "online", "offline", "assigned", "unassigned"].includes(parsed.filterStatus)
      ? parsed.filterStatus
      : FALLBACK.filterStatus,
    viewMode: parsed.viewMode === "users" ? "users" : "devices",
    page: Math.max(1, Number(parsed.page) || 1),
  };
}

/** Migrate legacy single-blob storage into per-device-type scopes. */
function toScopedStore(parsed) {
  if (!parsed || typeof parsed !== "object") return {};
  if (parsed.locator || parsed.sticker || parsed.default) return parsed;

  const legacyType = parsed.deviceType ?? parsed.device_type ?? null;
  const key = scopeKey(legacyType);
  return {
    [key]: {
      searchTerm: parsed.searchTerm,
      filterStatus: parsed.filterStatus,
      viewMode: parsed.viewMode,
      page: parsed.page,
    },
  };
}

function readScopedStore() {
  return toScopedStore(readRawStore() || {});
}

export function loadLocatorPageState(deviceType = null) {
  const store = readScopedStore();
  const entry = store[scopeKey(deviceType)] ?? {};
  const normalized = normalizeScopeEntry(entry);
  return {
    ...normalized,
    deviceType: deviceType ?? null,
  };
}

export function clearLocatorPageState() {
  try {
    sessionStorage.removeItem(LOCATOR_PAGE_STATE_KEY);
  } catch {
    /* ignore */
  }
}

export function saveLocatorPageState(state, { merge = false, deviceType: scopeType } = {}) {
  try {
    const type = scopeType ?? state.deviceType ?? state.device_type ?? null;
    const key = scopeKey(type);
    const store = readScopedStore();
    const prev = normalizeScopeEntry(store[key] || {});

    const { deviceType, device_type, ...rest } = state;
    const next = merge ? { ...prev, ...rest } : { ...prev, ...rest };

    store[key] = next;
    sessionStorage.setItem(LOCATOR_PAGE_STATE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function readPersistedPage(search, status, deviceType = null) {
  const entry = loadLocatorPageState(deviceType);
  const storedSearch = entry.searchTerm.trim();
  const storedStatus = entry.filterStatus;

  if (
    storedSearch === (search || "").trim() &&
    storedStatus === (status || "all")
  ) {
    return entry.page;
  }
  return 1;
}
