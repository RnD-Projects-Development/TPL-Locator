/**
 * Zone alert derivation — the single definition of what counts as an alert for
 * a staff member relative to a zone. Used by the field staff dashboard (from
 * live status) and by AlertsContext (from /api/geofence/status), so the banner
 * on the page and the bell in the header can never disagree.
 *
 * The model is deliberately two-state: a staff member is either **in zone** or
 * **out of zone**. Individual crossings are not alerts here — on a live monitor
 * they're noise, and the fence page already keeps the event log.
 *
 * Two kinds, in descending severity:
 *
 *   MISSING   out of zone for more than 16 hours, or never reported inside it.
 *   NO_SHOW   was inside the zone within the last 16h, but not once during
 *             today's window — i.e. hasn't turned up yet today.
 *
 * MISSING and NO_SHOW are mutually exclusive by construction: MISSING is
 * evaluated first and NO_SHOW can only apply when the last in-zone report is
 * recent, so a device never raises both.
 */

/** Out of zone for longer than this ⇒ flagged as missing. */
export const MISSING_THRESHOLD_MS = 16 * 60 * 60 * 1000;

/** Separate, and deliberately shorter: "is the tracker reporting at all". */
export const ONLINE_THRESHOLD_MS = 12 * 60 * 60 * 1000;   // matches the backend's online rule

export const ALERT_KIND = {
  MISSING: 'MISSING',
  NO_SHOW: 'NO_SHOW',
};

/** shadcn Alert variant per kind. */
export const ALERT_VARIANT = {
  MISSING: 'destructive',
  NO_SHOW: 'warning',
};

export const ALERT_SEVERITY = {
  MISSING: 'critical',
  NO_SHOW: 'high',
};

function ms(ts) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

export function humanDuration(fromMs, toMs = Date.now()) {
  const diff = Math.max(0, toMs - fromMs);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Stable ids so read-state and dismissals survive a refresh. */
export function alertId(kind, zoneId, sn, stamp = '') {
  return `${kind}-${zoneId}-${sn}${stamp ? `-${stamp}` : ''}`;
}

/**
 * Absence alerts for one staff member.
 *
 * @param {object}  p
 * @param {string}  p.sn
 * @param {string}  p.staffName    display name
 * @param {string}  p.zoneId
 * @param {string}  p.zoneName
 * @param {string?} p.lastInZoneAt ISO timestamp of the newest in-zone report, if any
 * @param {string}  p.dayKey       YYYY-MM-DD of the window being viewed
 * @param {number}  p.dayStartMs   start of that window
 * @param {number}  p.nowMs
 * @returns {object|null} at most one alert
 */
export function absenceAlert({ sn, staffName, zoneId, zoneName, lastInZoneAt, dayKey, dayStartMs, nowMs = Date.now() }) {
  const lastMs = ms(lastInZoneAt);
  const name = staffName || sn;

  if (lastMs === null || nowMs - lastMs > MISSING_THRESHOLD_MS) {
    const forLabel = lastMs === null ? null : humanDuration(lastMs, nowMs);
    return {
      id: alertId(ALERT_KIND.MISSING, zoneId, sn),
      kind: ALERT_KIND.MISSING,
      variant: ALERT_VARIANT.MISSING,
      severity: ALERT_SEVERITY.MISSING,
      sn,
      staffName: name,
      zoneId,
      zoneName,
      title: `${name} flagged as missing`,
      description: forLabel
        ? `No report inside ${zoneName} for ${forLabel}. Last seen in zone at ${new Date(lastMs).toLocaleString()}.`
        : `Has never reported inside ${zoneName}.`,
      timestamp: lastInZoneAt || new Date(nowMs).toISOString(),
    };
  }

  if (lastMs < dayStartMs) {
    return {
      id: alertId(ALERT_KIND.NO_SHOW, zoneId, sn, dayKey),
      kind: ALERT_KIND.NO_SHOW,
      variant: ALERT_VARIANT.NO_SHOW,
      severity: ALERT_SEVERITY.NO_SHOW,
      sn,
      staffName: name,
      zoneId,
      zoneName,
      title: `${name} hasn't shown up`,
      description: `No visit to ${zoneName} yet on ${dayKey}. Last in zone ${humanDuration(lastMs, nowMs)} ago.`,
      timestamp: lastInZoneAt,
    };
  }

  return null;
}

/** Newest first, and within the same instant the more severe one wins. */
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => {
    const sev = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
    if (sev !== 0) return sev;
    return (ms(b.timestamp) ?? 0) - (ms(a.timestamp) ?? 0);
  });
}
