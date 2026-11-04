/**
 * Lazy loader for the optional Three.js renderer.
 * Keeps the 2D canvas path working if WebGL or the module is unavailable.
 */
(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
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

  function load() {
    if (state.engine) return Promise.resolve(state.engine);
    if (!enabled) return Promise.reject(new Error('3D mode disabled by ?sim=2d'));
    if (!supportsWebGL()) return Promise.reject(new Error('WebGL is not available'));
    if (state.failed) return Promise.reject(state.error || new Error('3D module failed'));
    if (state.promise) return state.promise;

    state.promise = import('./simulation-3d.bundle.js')
      .then((module) => {
        const Engine = module.Simulation3DEngine || window.Simulation3DEngine;
        if (!Engine) throw new Error('Simulation3DEngine export missing');
        state.engine = Engine;
        window.Simulation3DEngine = Engine;
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
