/**
 * frameBounds – snap-to-integer-zoom replacement for map.fitBounds()
 *
 * fitBounds() animates to a fractional zoom (e.g. 13.99, 7.22) which leaves
 * the TPL canvas basemap slightly misaligned with Leaflet's marker pane until
 * the next manual zoom action forces a full re-render.
 *
 * This helper computes the same center/zoom that fitBounds would, floors the
 * zoom to an integer, and calls setView (no animation) — the same code path
 * that a manual zoom uses, so tiles and markers stay perfectly aligned.
 *
 * @param {L.Map}          map      – Leaflet map instance
 * @param {L.LatLngBounds} bounds   – bounds to frame
 * @param {Object}         [opts]
 * @param {number[]}       [opts.padding=[50,50]]  – [top/bottom, left/right] px
 * @param {number}         [opts.maxZoom]           – ceiling zoom level
 */
export function frameBounds(map, bounds, opts = {}) {
  if (!map || !bounds || !bounds.isValid()) return;

  const padding = opts.padding || [50, 50];
  const maxZoom = opts.maxZoom ?? map.getMaxZoom();

  // getBoundsZoom returns the fractional zoom that would exactly fit the
  // bounds inside the container at the given padding — floor it so the TPL
  // tile grid lands on a clean integer boundary.
  const rawZoom = map.getBoundsZoom(bounds, false, padding);
  const zoom    = Math.min(Math.floor(rawZoom), maxZoom);

  map.setView(bounds.getCenter(), zoom, { animate: false });
}
