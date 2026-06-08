/**
 * exportDevicesCsv — fetch the FULL device fleet (all pages) for a device type,
 * enrich each row with its latest location (coords + battery), and download as CSV.
 *
 * The backend caps `limit` at 500 per request, so we page through the whole set.
 */

function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function fmtDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

const num = (...vals) => {
  for (const v of vals) {
    if (v != null && v !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return '';
};

/**
 * @param {Function} getDevices              useCityTag().getDevices
 * @param {Function} getLatestLocationsBatch useCityTag().getLatestLocationsBatch
 * @param {Object}   opts  { deviceType: 'locator'|'sticker'|null, filename: string }
 * @returns {Promise<number>} number of devices exported
 */
export async function exportDevicesCsv(getDevices, getLatestLocationsBatch, { deviceType = null, filename = 'devices.csv' } = {}) {
  const PAGE = 500;
  const MAX_PAGES = 60; // safety bound → up to 30k devices

  // 1) Page through every device of this type
  const first = await getDevices({ page: 1, limit: PAGE, device_type: deviceType });
  let devices = Array.isArray(first) ? first : (first?.devices ?? []);
  const total = Number(first?.total) || devices.length;
  const pages = Math.min(MAX_PAGES, Math.ceil(total / Math.max(PAGE, 1)));
  for (let p = 2; p <= pages; p += 1) {
    const res = await getDevices({ page: p, limit: PAGE, device_type: deviceType });
    const more = Array.isArray(res) ? res : (res?.devices ?? []);
    if (!more.length) break;
    devices = devices.concat(more);
  }

  // 2) Enrich with latest location (coords + battery) — best effort, never blocks export
  let locMap = {};
  try {
    const sns = devices.map(d => d.sn).filter(Boolean);
    if (sns.length) {
      const res = await getLatestLocationsBatch(sns);
      locMap = res?.locations ?? res ?? {};
    }
  } catch { /* coordinates simply stay blank if this fails */ }

  // 3) Build CSV
  const headers = [
    'Device Name', 'Serial Number', 'Type', 'Status', 'Category', 'Client',
    'Owner / Bound To', 'Bound At', 'Last Reported', 'Detections (datapoints)',
    'Latitude', 'Longitude', 'Battery %', 'Region', 'Zone',
  ];

  const rows = devices.map(d => {
    const loc = locMap[d.sn] || {};
    const isSticker = /^\d+$/.test(String(d.sn ?? ''));
    return [
      d.name || d.assigned_name || d.sn || '',
      d.sn || '',
      isSticker ? 'Sticker' : 'Locator',
      d.status === 'online' ? 'Active' : 'Offline',
      d.category || '',
      d.client || '',
      d.assigned_user_name || d.assignedUser || '',     // binding user / owner
      fmtDateTime(d.bindTime),                          // bound_at
      fmtDateTime(d.dataRetrievalTime || d.last_seen),  // last location time
      d.datapoint_count ?? 0,                           // detections
      num(loc.lat, loc.latitude, loc.gpsLat, loc.wgLat),
      num(loc.lng, loc.lon, loc.longitude, loc.gpsLng, loc.wgLng),
      num(loc.batteryStatus, loc.battery, d.battery),
      d.region || '',
      d.zone || '',
    ];
  });

  const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM → Excel opens UTF-8 cleanly
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  });
  a.click();
  URL.revokeObjectURL(a.href);
  return devices.length;
}
