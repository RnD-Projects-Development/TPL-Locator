/** Basic email format check for forms (not a full RFC validator). */
export function isValidEmail(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

export function normalizeEmail(raw) {
  return String(raw || "").trim().toLowerCase();
}
