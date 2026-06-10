export const SIDEBAR_PAGE_STATE_KEY = "tpl_sidebar_page_state";

const VALID_FILTERS = [null, "locator", "sticker"];

const FALLBACK = {
  deviceTypeFilter: null,
  page: 1,
  searchTerm: "",
  selectedSn: "",
  selectedSns: [],
  deviceLocations: {},
  locationsFetchedAt: 0,
};

function readRawStore() {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_PAGE_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeScopeEntry(parsed = {}) {
  const filter = parsed.deviceTypeFilter ?? null;
  return {
    deviceTypeFilter: VALID_FILTERS.includes(filter) ? filter : null,
    page: Math.max(1, Number(parsed.page) || 1),
    searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : FALLBACK.searchTerm,
    selectedSn: typeof parsed.selectedSn === "string" ? parsed.selectedSn : FALLBACK.selectedSn,
    selectedSns: Array.isArray(parsed.selectedSns)
      ? parsed.selectedSns.filter(Boolean)
      : FALLBACK.selectedSns,
    deviceLocations:
      parsed.deviceLocations && typeof parsed.deviceLocations === "object"
        ? parsed.deviceLocations
        : FALLBACK.deviceLocations,
    locationsFetchedAt: Number(parsed.locationsFetchedAt) || 0,
  };
}

export function loadSidebarScopeState(scope) {
  const store = readRawStore();
  return normalizeScopeEntry(store[scope] || {});
}

export function saveSidebarScopeState(scope, patch, { merge = true } = {}) {
  if (!scope) return;
  try {
    const store = readRawStore();
    const prev = normalizeScopeEntry(store[scope] || {});
    const next = merge ? { ...prev, ...patch } : { ...prev, ...patch };
    store[scope] = next;
    sessionStorage.setItem(SIDEBAR_PAGE_STATE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function clearSidebarPageState() {
  try {
    sessionStorage.removeItem(SIDEBAR_PAGE_STATE_KEY);
  } catch {
    /* ignore */
  }
}
