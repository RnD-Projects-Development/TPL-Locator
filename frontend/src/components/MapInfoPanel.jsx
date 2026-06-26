import React, { useEffect, useState } from "react";
import { landmarkDisplayFromPoint, mapboxReverseGeocode } from "../utils/landmark.js";
import "./MapInfoPanel.css";

function extractCoords(point) {
  if (!point || typeof point !== "object") return null;
  const lat = point.lat ?? point.latitude ?? point.gpsLat ?? point.wgLat;
  const lng = point.lng ?? point.lon ?? point.longitude ?? point.gpsLng ?? point.wgLng;
  const latN = Number(lat), lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
  return { lat: latN, lng: lngN };
}

function getTs(point) {
  return point?.timestamp ?? point?.time ?? point?.locTime ?? null;
}

function fmtFull(ts) {
  if (!ts) return "—";
  try { const d = new Date(ts); return isNaN(d.getTime()) ? String(ts) : d.toLocaleString(); }
  catch { return "—"; }
}

function fmtRelative(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

/* Icons */
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconPin = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
  </svg>
);
const IconRadio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
    <circle cx="12" cy="12" r="2" /><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
  </svg>
);

export default function MapInfoPanel({
  deviceName,
  sn,
  point,
  detections = 0,
  online = null,
  detectionsLabel = "Detections",
  emptyHint = "Select a device to view its live details",
}) {
  const coords = extractCoords(point);
  const [geo, setGeo] = useState(() => landmarkDisplayFromPoint(point));

  useEffect(() => {
    const stored = landmarkDisplayFromPoint(point);
    if (stored) { setGeo(stored); return; }
    if (!coords) { setGeo(null); return; }
    let cancelled = false;
    mapboxReverseGeocode(coords.lat, coords.lng).then(result => {
      if (!cancelled) setGeo(result ?? null);
    });
    return () => { cancelled = true; };
  }, [point, coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sn) {
    return (
      <aside className="mip-panel">
        <div className="mip-empty">
          <div className="mip-empty-title">No device focused</div>
          <div className="mip-empty-text">{emptyHint}</div>
        </div>
      </aside>
    );
  }

  const ts        = getTs(point);
  const rel       = fmtRelative(ts);
  const primary   = geo?.primary ?? null;
  const secondary = geo?.secondary ?? null;
  const isSpecific = geo?.isSpecific ?? false;
  const title     = deviceName || sn;
  const showSub   = title !== sn;

  return (
    <aside className="mip-panel">
      <div className="mip-card">
        {/* Header */}
        <div className="mip-header">
          <div className="mip-avatar"><IconRadio /></div>
          <div className="mip-head-text">
            <div className="mip-name" title={title}>{title}</div>
            {showSub && <div className="mip-sn">{sn}</div>}
          </div>
        </div>

        {/* Detections */}
        <div className="mip-stat">
          <div className="mip-stat-head">
            <div className="mip-stat-num">{detections}</div>
            <div className="mip-stat-label">{detectionsLabel}</div>
          </div>
          {coords && (
            <div className="mip-coords">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div>
          )}
        </div>

        {/* Last seen */}
        <div className="mip-row">
          <div className="mip-row-icon"><IconClock /></div>
          <div className="mip-row-body">
            <div className="mip-row-label">Last seen</div>
            <div className="mip-row-val">{fmtFull(ts)}</div>
            {rel && <div className="mip-row-meta">{rel}</div>}
          </div>
        </div>

        {/* Last location */}
        <div className="mip-row">
          <div className="mip-row-icon"><IconPin /></div>
          <div className="mip-row-body">
            <div className="mip-row-label">Last location</div>
            {primary ? (
              <>
                <div className="mip-row-val">{isSpecific ? primary : `Near ${primary}`}</div>
                {secondary && <div className="mip-row-meta">{secondary}</div>}
              </>
            ) : (
              <div className="mip-row-val mip-muted">
                {coords ? "No landmark yet" : "No GPS fix yet"}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
