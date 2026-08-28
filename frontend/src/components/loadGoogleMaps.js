/**
 * loadGoogleMaps() — loads the Google Maps JavaScript API once (with Places
 * library for nearby POI search). Returns a Promise that resolves to
 * window.google.maps. Safe to call multiple times; subsequent calls reuse
 * the same in-flight load.
 */
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '';

let loadPromise = null;

export default function loadGoogleMaps() {
  if (typeof window !== 'undefined' && window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_KEY) {
      reject(new Error('VITE_GOOGLE_MAPS_KEY is not set'));
      return;
    }

    const existing = document.getElementById('google-maps-js');
    if (existing) {
      const poll = setInterval(() => {
        if (window.google?.maps) { clearInterval(poll); resolve(window.google.maps); }
      }, 50);
      setTimeout(() => { clearInterval(poll); reject(new Error('Google Maps SDK timed out')); }, 15000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-js';
    script.async = true;
    script.defer = true;
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&libraries=places`;
    script.onload = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps SDK loaded but google.maps is missing'));
    };
    script.onerror = () => reject(new Error('Google Maps SDK failed to load'));
    document.head.appendChild(script);
  }).catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

export { GOOGLE_MAPS_KEY };
