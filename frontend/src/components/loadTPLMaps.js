/**
 * loadTPLMaps(onReady, onError) — loads the TPL Maps SDK once and calls onReady
 * when ready. If the SDK script fails to load or the globals never appear within
 * the timeout, onError(reason) is invoked instead (e.g. the TPL Maps host is
 * unreachable). Returns a cancel function: call it in useEffect cleanup to
 * prevent callbacks from firing after the component unmounts.
 *
 * Verbose diagnostics are emitted under the [TPLMaps] prefix so map-loading
 * problems can be traced from the browser console without code changes. Each
 * log line carries an elapsed-ms stamp relative to this load attempt.
 */
const SDK_URL =
  'https://api.tplmaps.com/js-api-v2/assets/tplmaps.js?api_key=$2a$10$RNdeMDBGrOwbnh81N3RzTDGUxKVId3cLscU3V3HkGdRLKhwI0oOQe';

const SDK_HOST = 'api.tplmaps.com';

// Total budget for the "script already in DOM but globals not ready" poll path.
const READY_TIMEOUT_MS = 30000;
// After onload fires, allow a brief grace window for the globals to attach
// (some builds assign window.* a tick after the script finishes executing).
const ONLOAD_GRACE_MS = 1500;

let attemptCounter = 0;

function snapshotGlobals() {
  const TPL = typeof window !== 'undefined' ? window.TPLMaps : undefined;
  return {
    TPLMaps: !!TPL,
    'TPLMaps.map': !!(TPL && TPL.map),
    'TPLMaps.map.initMap': !!(TPL && TPL.map && typeof TPL.map.initMap === 'function'),
    L: typeof window !== 'undefined' ? !!window.L : false,
    'L.version': (typeof window !== 'undefined' && window.L && window.L.version) || null,
  };
}

const loadTPLMaps = (onReady, onError) => {
  let cancelled = false;
  const attempt = ++attemptCounter;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ms = () => Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  const log = (...a) => console.log(`[TPLMaps #${attempt} +${ms()}ms]`, ...a);
  const err = (...a) => console.error(`[TPLMaps #${attempt} +${ms()}ms]`, ...a);

  const ready = (via) => {
    if (cancelled) { log('ready() suppressed — attempt cancelled'); return; }
    log(`✅ SDK ready via ${via}`, snapshotGlobals());
    if (onReady) onReady();
  };
  const fail = (reason) => {
    if (cancelled) { err('fail() suppressed — attempt cancelled:', reason); return; }
    err(`❌ ${reason}`, { url: SDK_URL, host: SDK_HOST, globals: snapshotGlobals() });
    err(
      `❌ Hint: a "script failed to load" / timeout almost always means ${SDK_HOST} ` +
      `is unreachable from this machine (VPN/firewall/DNS or the map server is down). ` +
      `Test from a terminal: curl -I https://${SDK_HOST}/`
    );
    if (onError) onError(reason);
  };

  log('load requested', { online: typeof navigator !== 'undefined' ? navigator.onLine : 'n/a', globals: snapshotGlobals() });

  const existingScript = document.getElementById('tplmaps-js');

  // ── Path A: SDK already fully ready ─────────────────────────────────────
  if (existingScript && window.TPLMaps && window.L) {
    log('script already in DOM and globals present');
    ready('already-loaded');
    return () => { cancelled = true; };
  }

  // ── Path B: fresh injection ─────────────────────────────────────────────
  if (!existingScript) {
    log('injecting SDK <script> →', SDK_URL);
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.id = 'tplmaps-js';
    script.async = true;

    script.onerror = (e) => {
      try { script.remove(); } catch {}
      err('script onerror fired', e && (e.message || e.type || e));
      fail('Map provider unreachable (script failed to load)');
    };

    script.onload = () => {
      log('script onload fired', snapshotGlobals());
      if (window.TPLMaps && window.L) { ready('onload'); return; }
      // Grace re-poll: globals sometimes attach a tick after onload.
      log(`globals not present at onload — grace re-poll up to ${ONLOAD_GRACE_MS}ms`);
      const graceStart = ms();
      const grace = setInterval(() => {
        if (cancelled) { clearInterval(grace); return; }
        if (window.TPLMaps && window.L) { clearInterval(grace); ready('onload+grace'); }
        else if (ms() - graceStart > ONLOAD_GRACE_MS) {
          clearInterval(grace);
          fail('Map SDK script loaded but window.TPLMaps/window.L never appeared');
        }
      }, 50);
    };

    document.body.appendChild(script);
    return () => { cancelled = true; log('attempt cancelled (cleanup)'); };
  }

  // ── Path C: script tag present but globals not ready — poll w/ timeout ──
  log('script in DOM but globals not ready — polling', snapshotGlobals());
  const poll = setInterval(() => {
    if (cancelled) { clearInterval(poll); return; }
    if (window.TPLMaps && window.L) {
      clearInterval(poll);
      ready('poll');
    } else if (ms() > READY_TIMEOUT_MS) {
      clearInterval(poll);
      fail(`Map provider unreachable (timed out after ${READY_TIMEOUT_MS}ms waiting for SDK)`);
    }
  }, 50);

  return () => {
    cancelled = true;
    clearInterval(poll);
    log('attempt cancelled (cleanup)');
  };
};

export default loadTPLMaps;
