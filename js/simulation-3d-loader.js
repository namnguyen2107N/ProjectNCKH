/**
 * Lazy loader for the optional Three.js renderer.
 * Keeps the 2D canvas path working if WebGL or the module is unavailable.
 */
(function () {
  'use strict';

  // Capture script location synchronously during parsing
  const currentScriptEl = typeof document !== 'undefined' ? document.currentScript : null;
  const scriptBaseUrl = currentScriptEl && currentScriptEl.src ? currentScriptEl.src : null;

  const params = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : new URLSearchParams();
  let storedMode = null;
  try {
    storedMode = localStorage.getItem('rml_sim_mode');
  } catch (_) { /* private mode */ }

  const mode = String(params.get('sim') || storedMode || '3d').toLowerCase();
  const enabled = mode !== '2d';

  const state = {
    promise: null,
    engine: null,
    failed: false,
    error: null,
  };

  function supportsWebGL() {
    try {
      // Three.js r163+ requires WebGL2. Devices with only WebGL1 use the 2D
      // canvas renderer instead of failing halfway through scene creation.
      if (typeof WebGL2RenderingContext === 'undefined') return false;
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (_) {
      return false;
    }
  }

  function resolveBundleUrls() {
    const urls = [];
    // 1. Relative to this loader script file (e.g. /js/simulation-3d-loader.js -> /js/simulation-3d.bundle.js)
    if (scriptBaseUrl) {
      try {
        urls.push(new URL('simulation-3d.bundle.js', scriptBaseUrl).href);
      } catch (_) {}
    }
    // 2. Locate loader script element if document.currentScript was null (e.g. async/deferred)
    if (typeof document !== 'undefined') {
      const el = document.querySelector('script[src*="simulation-3d-loader"]');
      if (el && el.src) {
        try {
          const u = new URL('simulation-3d.bundle.js', el.src).href;
          if (!urls.includes(u)) urls.push(u);
        } catch (_) {}
      }
      // 3. Document base with explicit /js/ subpath
      try {
        const u = new URL('./js/simulation-3d.bundle.js', document.baseURI || window.location.href).href;
        if (!urls.includes(u)) urls.push(u);
      } catch (_) {}
      try {
        const u = new URL('js/simulation-3d.bundle.js', document.baseURI || window.location.href).href;
        if (!urls.includes(u)) urls.push(u);
      } catch (_) {}
    }
    // 4. Relative fallbacks
    urls.push('./js/simulation-3d.bundle.js');
    urls.push('./simulation-3d.bundle.js');
    return urls;
  }

  async function importBundle() {
    const candidates = resolveBundleUrls();
    let lastError = null;

    for (const url of candidates) {
      try {
        const module = await import(url);
        const Engine = module.Simulation3DEngine || (typeof window !== 'undefined' ? window.Simulation3DEngine : null);
        if (Engine) return Engine;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Could not load simulation-3d.bundle.js from any candidate path');
  }

  function load() {
    if (state.engine) return Promise.resolve(state.engine);
    if (!enabled) return Promise.reject(new Error('3D mode disabled by ?sim=2d'));
    if (!supportsWebGL()) return Promise.reject(new Error('WebGL is not available'));
    if (state.failed) return Promise.reject(state.error || new Error('3D module failed'));
    if (state.promise) return state.promise;

    state.promise = importBundle()
      .then((Engine) => {
        state.engine = Engine;
        if (typeof window !== 'undefined') {
          window.Simulation3DEngine = Engine;
        }
        return Engine;
      })
      .catch((error) => {
        state.failed = true;
        state.error = error;
        state.promise = null;
        throw error;
      });

    return state.promise;
  }

  window.RML3D = {
    enabled,
    mode,
    supportsWebGL,
    load,
    get engine() { return state.engine; },
    get failed() { return state.failed; },
  };
})();
