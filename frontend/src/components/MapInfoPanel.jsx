import React, { useEffect, useRef, useState } from "react";
import { landmarkDisplayFromPoint, googleReverseGeocode } from "../utils/landmark.js";
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

/* One device's details — plain fields, no icons, no card chrome. */
function DeviceSection({ device, detectionsLabel, focused, onFocus }) {
  const { sn, label, latest: point, detections = 0, color } = device;
  const coords = extractCoords(point);
  const [geo, setGeo] = useState(() => landmarkDisplayFromPoint(point));
  const sectionRef = useRef(null);

  useEffect(() => {
    const stored = landmarkDisplayFromPoint(point);
    if (stored) { setGeo(stored); return; }
    if (!coords) { setGeo(null); return; }
    let cancelled = false;
    googleReverseGeocode(coords.lat, coords.lng).then(result => {
      if (!cancelled) setGeo(result ?? null);
    });
    return () => { cancelled = true; };
  }, [point, coords?.lat, coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a marker is clicked on the map, bring this device's section into view.
  useEffect(() => {
    if (focused) sectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);

  const ts     = getTs(point);
  const rel    = fmtRelative(ts);
  const title  = label || sn;
  const online = point != null;

  return (
    <div
      ref={sectionRef}
      className={`mip-device${focused ? " focused" : ""}${onFocus ? " clickable" : ""}`}
      style={color ? { "--dev-color": color } : undefined}
      onClick={onFocus ? () => onFocus(sn) : undefined}
    >
      <div className="mip-dev-head">
        {color && <span className="mip-dev-dot" />}
        <div className="mip-head-text">
          <div className="mip-name" title={title}>{title}</div>
          {title !== sn && <div className="mip-sn">{sn}</div>}
        </div>
        <span className={`mip-dev-status ${online ? "on" : "off"}`}>{online ? "Live" : "No fix"}</span>
      </div>

      <div className="mip-stat">
        <div className="mip-stat-head">
          <div className="mip-stat-num">{detections}</div>
          <div className="mip-stat-label">{detectionsLabel}</div>
        </div>
        {coords && (
          <div className="mip-coords">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div>
        )}
      </div>

      <div className="mip-field">
        <div className="mip-row-label">Last seen</div>
        <div className="mip-row-val">{fmtFull(ts)}</div>
        {rel && <div className="mip-row-meta">{rel}</div>}
      </div>

      <div className="mip-field">
        <div className="mip-row-label">Last location</div>
        {geo?.primary ? (
          <>
            <div className="mip-row-val">{geo.isSpecific ? geo.primary : `Near ${geo.primary}`}</div>
            {geo.secondary && <div className="mip-row-meta">{geo.secondary}</div>}
          </>
        ) : (
          <div className="mip-row-val mip-muted">
            {coords ? "No landmark yet" : "No GPS fix yet"}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Right-side device info panel for map pages.
 *
 * Multi-device mode (Map View): pass `devices` — every selected device gets
 * its own section, separated by prominent dividers; `focusedSn` highlights
 * one and `onFocus` is called when a section is clicked.
 *
 * Single-device mode (Trajectory): the legacy `sn`/`deviceName`/`point`/
 * `detections` props still work and render one section.
 */
export default function MapInfoPanel({
  devices = null,
  focusedSn = null,
  onFocus = null,
  // Legacy single-device props (TrajectoryPage)
  sn,
  deviceName,
  point,
  detections = 0,
  detectionsLabel = "Detections",
  emptyHint = "Select a device to view its live details",
  width,
}) {
  const list = devices ?? (sn ? [{ sn, label: deviceName, latest: point, detections }] : []);
  const style = width ? { width, flex: `0 0 ${width}px` } : undefined;

  if (list.length === 0) {
    return (
      <aside className="mip-panel" style={style}>
        <div className="mip-empty">
          <div className="mip-empty-title">No device focused</div>
          <div className="mip-empty-text">{emptyHint}</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="mip-panel" style={style}>
      {list.length > 1 && (
        <div className="mip-panel-head">{list.length} devices selected</div>
      )}
      <div className="mip-scroll">
        {list.map((d, i) => (
          <React.Fragment key={d.sn}>
            {i > 0 && <div className="mip-divider" />}
            <DeviceSection
              device={d}
              detectionsLabel={detectionsLabel}
              focused={list.length > 1 && d.sn === focusedSn}
              onFocus={list.length > 1 ? onFocus : null}
            />
          </React.Fragment>
        ))}
      </div>
    </aside>
  );
}
