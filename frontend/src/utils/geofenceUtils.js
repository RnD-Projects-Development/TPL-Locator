// Shared geofence utilities — used by FencePage and HomePage

export function pointInPolygon([lat, lng], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInArea(point, coords) {
  if (!coords?.length) return false;
  if (Array.isArray(coords[0][0])) return coords.some((poly) => pointInPolygon(point, poly));
  return pointInPolygon(point, coords);
}


