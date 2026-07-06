import { create } from 'zustand';
import * as turf from '@turf/turf';

export const SPEEDS = [
  { label: "0.5×",  value: 0.5 },
  { label: "1×",    value: 1   },
  { label: "1.5×",  value: 1.5 },
  { label: "2×",    value: 2   },
  { label: "4×",    value: 4   },
  { label: "8×",    value: 8   },
];

// Above this many points, the per-frame turf.along/bearing/lineSliceAlong
// cost of animating over the FULL-resolution line starts eating the frame
// budget (roughly linear in vertex count). Build a lighter simplified line
// for animation/interpolation only — rawPoints/cumulativeDistances stay
// full-resolution so the visit log and progress tracking stay exact.
const SIMPLIFY_POINT_THRESHOLD = 1000;
const SIMPLIFY_TOLERANCE = 0.0001; // degrees, ~11m — collapses near-duplicate/collinear points

function tsOrInfinity(p) {
  const t = p?.timestamp ? new Date(p.timestamp).getTime() : NaN;
  // Missing/unparseable timestamps sort to the end, not the start — sorting
  // them to time-0 would splice them into the very first frame of playback,
  // which is far more visually disruptive than trailing off at the end.
  return Number.isFinite(t) ? t : Infinity;
}

const EMPTY_TRAJECTORY_STATE = {
  geoJson: null,
  animGeoJson: null,
  animDistScale: 1,
  totalDistance: 0,
  cumulativeDistances: [],
  currentDistance: 0,
  isPlaying: false,
  baseSpeed: 0,
};

export const usePlaybackStore = create((set, get) => ({
  // Raw data
  rawPoints: [],
  geoJson: null,

  // Animation geometry — same as geoJson for small trajectories; a
  // turf.simplify'd stand-in for large ones (see SIMPLIFY_POINT_THRESHOLD).
  // animDistScale maps a real-world `currentDistance` (km, from the
  // full-resolution line) onto the simplified line's own (slightly
  // shorter) length, so interpolated position stays in sync.
  animGeoJson: null,
  animDistScale: 1,

  // Computed path stats
  totalDistance: 0, // in kilometers
  baseSpeed: 0, // km per second at 1x
  cumulativeDistances: [], // array of distances for each rawPoint

  // Playback state
  currentDistance: 0,
  isPlaying: false,
  speedMultiplier: 1,

  speeds: SPEEDS,

  loadTrajectory: (points) => {
    if (!points || points.length < 2) {
      set({ rawPoints: points || [], ...EMPTY_TRAJECTORY_STATE });
      return;
    }

    // Sort by timestamp if available (though they usually are sorted from backend)
    const sorted = [...points].sort((a, b) => tsOrInfinity(a) - tsOrInfinity(b));

    // Remove consecutive duplicates
    const unique = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        unique.push(sorted[i]);
      } else {
        const prev = unique[unique.length - 1];
        const curr = sorted[i];
        if (prev.lat !== curr.lat || prev.lng !== curr.lng) {
          unique.push(curr);
        }
      }
    }

    if (unique.length < 2) {
      set({ rawPoints: unique, ...EMPTY_TRAJECTORY_STATE });
      return;
    }

    // Build GeoJSON LineString
    const coords = unique.map(p => [p.lng, p.lat]);
    const line = turf.lineString(coords);

    // Compute total distance
    const totalDist = turf.length(line, { units: 'kilometers' });

    // Target 60 seconds for 1x playback
    const baseSpeed = totalDist / 60;

    // Compute cumulative distances to easily map distance back to points
    let currentLen = 0;
    const cumulativeDistances = [0];
    for (let i = 1; i < coords.length; i++) {
      const seg = turf.lineString([coords[i - 1], coords[i]]);
      currentLen += turf.length(seg, { units: 'kilometers' });
      cumulativeDistances.push(currentLen);
    }

    let animGeoJson = line;
    let animDistScale = 1;
    if (unique.length > SIMPLIFY_POINT_THRESHOLD) {
      try {
        const simplified = turf.simplify(line, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false });
        const simplifiedDist = turf.length(simplified, { units: 'kilometers' });
        if (simplifiedDist > 0) {
          animGeoJson = simplified;
          animDistScale = simplifiedDist / totalDist;
        }
      } catch {
        // Fall back to the full-resolution line if simplify ever throws.
      }
    }

    set({
      rawPoints: unique,
      geoJson: line,
      animGeoJson,
      animDistScale,
      totalDistance: totalDist,
      cumulativeDistances,
      currentDistance: 0,
      isPlaying: false,
      baseSpeed: baseSpeed
    });
  },

  play: () => set((state) => {
    if (!state.geoJson) return {};
    // If at the end, restart
    if (state.currentDistance >= state.totalDistance) {
      return { isPlaying: true, currentDistance: 0 };
    }
    return { isPlaying: true };
  }),

  pause: () => set({ isPlaying: false }),

  togglePlay: () => set((state) => {
    if (!state.geoJson) return {};
    if (!state.isPlaying && state.currentDistance >= state.totalDistance) {
      return { isPlaying: true, currentDistance: 0 };
    }
    return { isPlaying: !state.isPlaying };
  }),

  setSpeedMultiplier: (val) => set({ speedMultiplier: val }),

  seek: (distance) => set({ currentDistance: Math.max(0, Math.min(distance, get().totalDistance)) }),

  reset: () => set({ currentDistance: 0, isPlaying: false }),

  clear: () => set({ rawPoints: [], ...EMPTY_TRAJECTORY_STATE }),

  tick: (deltaMs) => {
    const state = get();
    if (!state.isPlaying || !state.geoJson) return;

    const deltaSec = deltaMs / 1000;
    const addedDist = deltaSec * state.baseSpeed * state.speedMultiplier;
    const newDist = state.currentDistance + addedDist;

    if (newDist >= state.totalDistance) {
      set({ currentDistance: state.totalDistance, isPlaying: false });
    } else {
      set({ currentDistance: newDist });
    }
  }
}));
