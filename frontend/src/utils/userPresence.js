// Presence semantics: a user is online from login until they explicitly log
// out. "Last active" for an offline user is the time elapsed since logout
// (falling back to the login time for legacy accounts with no logout stamp).

export function parseTs(ts) {
  if (!ts) return 0
  // Backend timestamps are UTC; tolerate legacy strings missing the offset.
  const t = typeof ts === 'string' && !ts.includes('+') && !ts.endsWith('Z') ? ts + 'Z' : ts
  const ms = new Date(t).getTime()
  return isNaN(ms) ? 0 : ms
}

export function isUserOnline(u) {
  if (!u) return false
  const loginTs = parseTs(u.last_logged_in || u.last_login || u.lastLogin)
  const logoutTs = parseTs(u.last_logged_out)
  const isRecentLogin = loginTs > 0 && (Date.now() - loginTs < 86_400_000)
  return isRecentLogin && loginTs > logoutTs
}

/** Most recent session boundary — logout if recorded, else login. */
export function lastActiveTs(u) {
  if (!u) return 0
  return Math.max(
    parseTs(u.last_logged_out),
    parseTs(u.last_logged_in || u.last_login || u.lastLogin),
  )
}

/** The timestamp to display as "last active" for an offline user. */
export function lastActiveStamp(u) {
  return u?.last_logged_out || u?.last_logged_in || u?.last_login || u?.lastLogin || null
}
