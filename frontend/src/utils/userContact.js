const SYNTHETIC_SUFFIXES = ["@phone.tpllocator.local", "@accounts.tpllocator.com"];

export function isSyntheticEmail(email) {
  const e = (email || "").trim().toLowerCase();
  return SYNTHETIC_SUFFIXES.some((s) => e.endsWith(s));
}

export function isValidPakistaniPhone(raw) {
  const p = (raw || "").replace(/[\s\-()]/g, "");
  return /^03\d{9}$/.test(p) || /^\+92\d{10}$/.test(p);
}

export function isValidIdentifier(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return false;
  if (trimmed.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return isValidPakistaniPhone(trimmed);
}

/** What to show in the UI — phone only for phone signups, never the internal placeholder email. */
export function displayContact(userOrEmail, phone) {
  if (userOrEmail && typeof userOrEmail === "object") {
    const u = userOrEmail;
    return displayContact(u.email, u.phone);
  }
  const email = (userOrEmail || "").trim();
  const ph = (phone || "").trim();
  if (isSyntheticEmail(email)) {
    if (ph) return ph;
    const local = email.split("@")[0];
    return local.startsWith("p") ? local.slice(1) : local;
  }
  return email || ph;
}

export function contactLabel(user) {
  const value = displayContact(user);
  if (!value) return "Email or Phone";
  return value.includes("@") ? "Email Address" : "Phone Number";
}
