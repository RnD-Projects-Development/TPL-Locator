// ZoneToolbox — floating panel for creating or editing zones.
// Rendered via a React Portal into document.body so it is never clipped by any
// ancestor's overflow:hidden or covered by Leaflet's internal z-index layers.
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const PRESET_COLORS = [
  '#C1121F', '#2563EB', '#059669', '#D97706',
  '#7C3AED', '#0891B2', '#DB2777', '#64748B',
];

function circleToPolygon(center, radiusMeters, numPoints = 64) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const latRad = toRad(center.lat);
  const R = 6371000;
  const pts = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    pts.push({
      lat: center.lat + toDeg((radiusMeters / R) * Math.cos(angle)),
      lng: center.lng + toDeg((radiusMeters / (R * Math.cos(latRad))) * Math.sin(angle)),
    });
  }
  return pts;
}

export default function ZoneToolbox({
  mode,           // 'create' | 'edit'
  initialZone,    // zone object when editing
  mapRef,
  onSave,         // async (data) => void
  onCancel,
  isSaving = false,
}) {
  const [tool,         setTool]         = useState(initialZone?.shape || 'polygon');
  const [color,        setColor]        = useState(initialZone?.color || PRESET_COLORS[0]);
  const [name,         setName]         = useState(initialZone?.name  || '');
  const [drawnShape,   setDrawnShape]   = useState(null);
  const [isDrawing,    setIsDrawing]    = useState(false);
  // Name popup — shown after drawing in create mode
  const [pendingShape,   setPendingShape]   = useState(null);
  const [nameInput,      setNameInput]      = useState('');
  const [companyInput,   setCompanyInput]   = useState('');
  const [company,        setCompany]        = useState('');
  const [error,          setError]          = useState('');

  const drawerRef     = useRef(null);
  const drawnLayerRef = useRef(null);
  // Keep latest name accessible inside the draw:created closure
  const nameRef = useRef(name);
  nameRef.current = name;

  // ── draw:created listener ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function onDrawCreated(e) {
      if (drawnLayerRef.current) { try { map.removeLayer(drawnLayerRef.current); } catch {} }
      drawnLayerRef.current = e.layer;
      e.layer.addTo(map);

      let shape;
      if (e.layerType === 'circle') {
        const c = e.layer.getLatLng();
        const r = e.layer.getRadius();
        shape = {
          shape: 'circle',
          center: { lat: c.lat, lng: c.lng },
          radius: r,
          coordinates: circleToPolygon({ lat: c.lat, lng: c.lng }, r),
        };
      } else {
        const gj = e.layer.toGeoJSON();
        const coords = gj.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
        shape = { shape: 'polygon', coordinates: coords, center: null, radius: null };
      }

      setIsDrawing(false);

      if (mode === 'edit') {
        setDrawnShape(shape);
      } else {
        setPendingShape(shape);
        setNameInput(nameRef.current);
      }
    }

    map.on('draw:created', onDrawCreated);
    return () => {
      map.off('draw:created', onDrawCreated);
      drawerRef.current?.disable();
      if (drawnLayerRef.current) { try { map.removeLayer(drawnLayerRef.current); } catch {} drawnLayerRef.current = null; }
    };
  }, [mapRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edit mode — render existing polygon ─────────────────────────────────────
  useEffect(() => {
    if (mode !== 'edit' || !initialZone?.polygon?.length || !mapRef.current) return;
    const map = mapRef.current;
    if (drawnLayerRef.current) { try { map.removeLayer(drawnLayerRef.current); } catch {} }
    const coords = initialZone.polygon.map(({ lat, lng }) => [lat, lng]);
    const layer = window.L.polygon(coords, { color: initialZone.color || color, weight: 2, fillOpacity: 0.2 });
    layer.addTo(map);
    drawnLayerRef.current = layer;
    setDrawnShape({
      shape: initialZone.shape || 'polygon',
      coordinates: initialZone.polygon,
      center: initialZone.center,
      radius: initialZone.radius,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Measure fp-sidebar right edge + topbar bottom for fixed positioning ──────
  const [topOffset,  setTopOffset]  = useState(50);
  const [leftOffset, setLeftOffset] = useState(320);
  useLayoutEffect(() => {
    const bar     = document.querySelector('.fp-topbar');
    const sidebar = document.querySelector('.fp-sidebar');
    if (bar)     setTopOffset(Math.ceil(bar.getBoundingClientRect().bottom));
    if (sidebar) setLeftOffset(Math.ceil(sidebar.getBoundingClientRect().right));
  }, []);

  // ── Reset all drawing state (used when tool or colour changes mid-draw) ───────
  function resetAll() {
    drawerRef.current?.disable();
    drawerRef.current = null;
    const map = mapRef.current;
    if (drawnLayerRef.current) { try { map?.removeLayer(drawnLayerRef.current); } catch {} drawnLayerRef.current = null; }
    setIsDrawing(false);
    setDrawnShape(null);
    setPendingShape(null);
    setNameInput('');
    setError('');
  }

  function handleToolChange(newTool) {
    if (newTool === tool) return;
    resetAll();
    setTool(newTool);
  }

  function handleColorChange(newColor) {
    if (newColor === color) return;
    if (isDrawing || drawnShape || pendingShape) resetAll();
    setColor(newColor);
  }

  // ── Drawing controls ─────────────────────────────────────────────────────────
  function startDrawing() {
    const map = mapRef.current;
    if (!map) return;
    drawerRef.current?.disable();
    if (drawnLayerRef.current) { try { map.removeLayer(drawnLayerRef.current); } catch {} drawnLayerRef.current = null; }
    setDrawnShape(null);
    setPendingShape(null);

    const opts = { shapeOptions: { color, weight: 2, fillOpacity: 0.18 } };
    drawerRef.current = tool === 'circle'
      ? new window.L.Draw.Circle(map, opts)
      : new window.L.Draw.Polygon(map, opts);
    drawerRef.current.enable();
    setIsDrawing(true);
  }

  function cancelDrawing() {
    drawerRef.current?.disable();
    if (drawnLayerRef.current) { try { mapRef.current?.removeLayer(drawnLayerRef.current); } catch {} drawnLayerRef.current = null; }
    setIsDrawing(false);
    setDrawnShape(null);
  }

  // ── Name popup handlers ───────────────────────────────────────────────────────
  function confirmName() {
    if (!nameInput.trim()) return;
    setName(nameInput.trim());
    setCompany(companyInput.trim());
    setDrawnShape(pendingShape);
    setPendingShape(null);
    setNameInput('');
    setCompanyInput('');
  }

  function cancelNamePopup() {
    const map = mapRef.current;
    if (drawnLayerRef.current) { try { map?.removeLayer(drawnLayerRef.current); } catch {} drawnLayerRef.current = null; }
    setPendingShape(null);
    setNameInput('');
    setCompanyInput('');
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim())  { setError('Enter a zone name first');          return; }
    if (!drawnShape)   { setError('Draw a boundary on the map first'); return; }
    setError('');
    try {
      await onSave({
        name:        name.trim(),
        company:     company.trim() || undefined,
        color,
        shape:       drawnShape.shape,
        coordinates: drawnShape.coordinates,
        center:      drawnShape.center,
        radius:      drawnShape.radius,
      });
    } catch (e) {
      setError(e?.message || 'Save failed');
    }
  }

  const canSave = !!name.trim() && !!drawnShape;

  // ── Render — portal into document.body bypasses all ancestor stacking issues ─
  return createPortal(
    <div className="zt-panel" style={{ top: topOffset, left: leftOffset, height: `calc(100vh - ${topOffset}px)` }}>

      {/* ── Header ── */}
      <div className="zt-header">
        <span className="zt-title">{mode === 'edit' ? 'Edit Zone' : 'Create Zone'}</span>
        <button className="zt-close" onClick={onCancel} title="Close">✕</button>
      </div>

      {/* ── Draw tool ── */}
      <div className="zt-section">
        <div className="zt-label">Draw tool</div>
        <div className="zt-tool-row">
          <button className={`zt-tool-btn${tool === 'polygon' ? ' active' : ''}`} onClick={() => handleToolChange('polygon')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polygon points="12 2 22 20 2 20"/></svg>
            Polygon
          </button>
          <button className={`zt-tool-btn${tool === 'circle' ? ' active' : ''}`} onClick={() => handleToolChange('circle')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/></svg>
            Circle
          </button>
        </div>
      </div>

      {/* ── Colour ── */}
      <div className="zt-section">
        <div className="zt-label">Colour</div>
        <div className="zt-color-row">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              className={`zt-color-swatch${color === c ? ' selected' : ''}`}
              style={{ background: c }}
              onClick={() => handleColorChange(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* ── Boundary ── */}
      <div className="zt-section">
        <div className="zt-label">Boundary</div>
        {!drawnShape ? (
          <>
            <button
              className={`zt-draw-btn${isDrawing ? ' active' : ''}`}
              onClick={isDrawing ? cancelDrawing : startDrawing}
            >
              {isDrawing ? '✕ Cancel drawing' : `⬡ Draw ${tool} on map`}
            </button>
            {isDrawing && (
              <p className="zt-hint">Click on the map to place points. Double-click to finish.</p>
            )}
          </>
        ) : (
          <div className="zt-drawn-row">
            <span className="zt-drawn-ok">
              ✓ {name ? `"${name}"` : (drawnShape.shape === 'circle' ? 'Circle' : 'Polygon')} drawn
            </span>
            <button className="zt-redo" onClick={startDrawing}>Redo</button>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && <p className="zt-error">{error}</p>}

      {/* ── Actions ── */}
      <div className="zt-actions">
        <button className="zt-cancel-btn" onClick={onCancel} disabled={isSaving}>Cancel</button>
        <button className="zt-save-btn" onClick={handleSave} disabled={isSaving || !canSave}>
          {isSaving ? 'Saving…' : mode === 'edit' ? 'Update Zone' : 'Save Zone'}
        </button>
      </div>

      {/* ── Zone name popup (shown after drawing in create mode) ── */}
      {pendingShape && (
        <div className="zt-name-overlay">
          <div className="zt-name-popup">
            <p className="zt-name-popup-title">Name this zone</p>
            <input
              className="zt-input"
              placeholder="e.g. Beat Zone A"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && nameInput.trim()) confirmName(); if (e.key === 'Escape') cancelNamePopup(); }}
              autoFocus
            />
            <input
              className="zt-input"
              placeholder="Company (optional)"
              value={companyInput}
              onChange={e => setCompanyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && nameInput.trim()) confirmName(); if (e.key === 'Escape') cancelNamePopup(); }}
            />
            <div className="zt-name-popup-actions">
              <button className="zt-cancel-btn" onClick={cancelNamePopup}>Cancel</button>
              <button
                className="zt-save-btn"
                onClick={confirmName}
                disabled={!nameInput.trim()}
              >Confirm</button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  );
}
