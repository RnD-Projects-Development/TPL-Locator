export const LOCATOR_PAGE_STATE_KEY = "tpl_locator_page_state";

const FALLBACK = { searchTerm: "", filterStatus: "all", viewMode: "devices", page: 1 };

export function loadLocatorPageState() {
  try {
    const raw = sessionStorage.getItem(LOCATOR_PAGE_STATE_KEY);
    if (!raw) return { ...FALLBACK };

    const parsed = JSON.parse(raw);
    return {
      searchTerm: typeof parsed.searchTerm === "string" ? parsed.searchTerm : FALLBACK.searchTerm,
      filterStatus: ["all", "online", "offline"].includes(parsed.filterStatus)
        ? parsed.filterStatus
        : FALLBACK.filterStatus,
      viewMode: parsed.viewMode === "users" ? "users" : "devices",
      page: Math.max(1, Number(parsed.page) || 1),
    };
  } catch {
    return { ...FALLBACK };
  }
}

export function saveLocatorPageState(state) {
  try {
    sessionStorage.setItem(LOCATOR_PAGE_STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function readPersistedPage(search, status) {
  try {
    const raw = sessionStorage.getItem(LOCATOR_PAGE_STATE_KEY);
    if (!raw) return 1;

    const parsed = JSON.parse(raw);
    const storedSearch = typeof parsed.searchTerm === "string" ? parsed.searchTerm.trim() : "";
    const storedStatus = ["all", "online", "offline"].includes(parsed.filterStatus)
      ? parsed.filterStatus
      : "all";

    if (storedSearch === (search || "").trim() && storedStatus === (status || "all")) {
      return Math.max(1, Number(parsed.page) || 1);
    }
  } catch {
    /* ignore */
  }
  return 1;
}
