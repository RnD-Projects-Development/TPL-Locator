/** Read landmark stored by backend geocoding on location points. */

export function landmarkFromPoint(point) {
  if (!point) return null;
  const raw = point.landmark;
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

/** Split backend landmark string into popup / panel display parts. */
export function parseLandmarkDisplay(landmark) {
  if (!landmark) return null;
  const idx = landmark.indexOf(" — ");
  if (idx === -1) {
    return { primary: landmark, secondary: null, isSpecific: true };
  }
  return {
    primary: landmark.slice(0, idx),
    secondary: landmark.slice(idx + 3) || null,
    isSpecific: true,
  };
}

export function landmarkDisplayFromPoint(point) {
  return parseLandmarkDisplay(landmarkFromPoint(point));
}
