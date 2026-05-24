/**
 * loadTPLMaps(callback) — loads the TPL Maps SDK once and calls callback when ready.
 * Returns a cancel function: call it in useEffect cleanup to prevent the callback
 * from firing after the component unmounts (prevents stale initMap calls on dead DOM).
 */
const loadTPLMaps = (callback) => {
  let cancelled = false;

  const safeCallback = () => {
    if (!cancelled && callback) callback();
  };

  const existingScript = document.getElementById('tplmaps-js');

  if (!existingScript) {
    console.log('[loadTPLMaps] No existing script — injecting SDK...');
    const script = document.createElement('script');
    script.src = 'https://api.tplmaps.com/js-api-v2/assets/tplmaps.js?api_key=$2a$10$RNdeMDBGrOwbnh81N3RzTDGUxKVId3cLscU3V3HkGdRLKhwI0oOQe';
    script.id = 'tplmaps-js';
    script.onerror = () => console.error('[loadTPLMaps] ❌ Script failed to load');
    document.body.appendChild(script);
    script.onload = () => {
      console.log('[loadTPLMaps] ✅ Script loaded — window.TPLMaps:', !!window.TPLMaps, '| window.L:', !!window.L);
      safeCallback();
    };
    return () => { cancelled = true; };
  }

  if (window.TPLMaps && window.L) {
    console.log('[loadTPLMaps] Script already in DOM and SDK ready — firing callback');
    safeCallback();
    return () => { cancelled = true; };
  }

  console.log('[loadTPLMaps] Script in DOM but SDK not ready yet — waiting...');
  const poll = setInterval(() => {
    if (window.TPLMaps && window.L) {
      clearInterval(poll);
      console.log('[loadTPLMaps] ✅ SDK now ready — firing callback');
      safeCallback();
    }
  }, 50);

  return () => {
    cancelled = true;
    clearInterval(poll);
  };
};

export default loadTPLMaps;
