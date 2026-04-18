const loadTPLMaps = (callback) => {
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
      if (callback) callback();
    };
    return;
  }

  // Script tag exists — but window.TPLMaps may not be ready yet if the
  // script is still executing (e.g. pre-load from main.jsx fired first).
  // Poll until the SDK globals are available before firing the callback.
  if (window.TPLMaps && window.L) {
    console.log('[loadTPLMaps] Script already in DOM and SDK ready — firing callback');
    if (callback) callback();
    return;
  }
  console.log('[loadTPLMaps] Script in DOM but SDK not ready yet — waiting...');
  const poll = setInterval(() => {
    if (window.TPLMaps && window.L) {
      clearInterval(poll);
      console.log('[loadTPLMaps] ✅ SDK now ready — firing callback');
      if (callback) callback();
    }
  }, 50);
};

export default loadTPLMaps;
