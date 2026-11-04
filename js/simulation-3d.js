/**
 * ROBOT MATH LAB - 3D SIMULATION RENDERER
 * "Sparky's Space Lab" — a low-poly Three.js renderer for the Virtual Robot Track.
 *
 * Design notes:
 * - The math lives in KinematicsModel (js/kinematics-model.js); this class only maps
 *   position (in task units) to world coordinates and draws the scene.
 * - No textures/GLB assets are required: the robot, track, planets and labels are
 *   generated procedurally so the scene stays small and fast on school tablets.
 * - The existing HUD (speed / distance / time / result card) remains in the DOM.
 */

import * as THREE from 'three';

const TRACK_WORLD_LENGTH = 44;
const TRACK_WORLD_EXTRA = 6;
const LANE_WIDTH = 5.2;
const ROBOT_WHEEL_RADIUS = 0.28;

const PALETTE = {
  skyTop: '#07091c',
  skyMid: '#141a3f',
  skyBottom: '#0b2340',
  runway: '#18233f',
  runwayTop: '#223257',
  edge: '#22d3ee',
  edgePink: '#f472b6',
  start: '#34d399',
  target: '#fbbf24',
  targetPink: '#fb7185',
  robot: '#6366f1',
  robotLight: '#a5b4fc',
  visor: '#070b1a',
  eye: '#67e8f9',
  planetPink: '#c084fc',
  planetCyan: '#67e8f9',
  white: '#f8fafc',
};

function seededRandom(seed = 42) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(1)));
}

class Simulation3DEngine {
  static is3D = true;

  constructor(containerId, options = {}) {
    if (!window.KinematicsModel) {
      throw new Error('KinematicsModel is not loaded.');
    }

    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Simulation3D container not found: ${containerId}`);

    this.options = Object.assign({
      trackLengthUnits: 100,
      unitLabel: 'm',
      timeScale: 1,
      mode: 'single',
      targetDistance: null,
      quality: 'auto',
    }, options);

    if (!this.options.targetDistance) {
      this.options.targetDistance = this.options.trackLengthUnits;
    }

    this.model = new window.KinematicsModel({
      trackLengthUnits: this.options.trackLengthUnits,
      mode: this.options.mode,
    });

    this.isRunning = false;
    this.is3D = true;
    this.cameraMode = 'overview';
    this.onTick = null;
    this.onFinish = null;
    this.onResize = null;
    this.onFatal = null;

    this._destroyed = false;
    this._lastTimestamp = performance.now();
    this._lastRenderTimestamp = 0;
    this._animTime = 0;
    this._cameraMoving = false;
    this._effects = [];
    this._quality = this._detectQuality();
    this._renderScale = 1;
    this._fpsSamples = 0;
    this._fpsElapsed = 0;
    this._qualityLocked = false;
    this._reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    this.canvas2D = document.getElementById('robot-canvas');
    this.flagEl = document.getElementById('destination-flag');
    if (this.canvas2D) this.canvas2D.style.display = 'none';
    if (this.flagEl) this.flagEl.style.display = 'none';

    this._createRenderer();
    this._createScene();
    this._createEnvironment();
    this._createTrack();
    this._bindEvents();

    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
    this.resizeCanvas();
  }

  /* ------------------------------------------------------------------ */
  /* Public API (mirrors SimulationEngine where task-engine expects it) */
  /* ------------------------------------------------------------------ */

  get robots() {
    return this.model ? this.model.robots : [];
  }

  get elapsedSimTime() {
    return this.model ? this.model.elapsedSimTime : 0;
  }

  get isFinished() {
    return this.model ? this.model.isFinished : false;
  }

  setRobots(configs = []) {
    this.model.setRobots(configs);
    this._rebuildRobotViews();
    this.reset();
  }

  start() {
    if (this.isRunning) return;
    if (this.isFinished) this.reset();
    this.isRunning = true;
    this._lastTimestamp = performance.now();
    this._lastRenderTimestamp = 0;
  }

  pause() {
    this.isRunning = false;
    this.render();
  }

  reset() {
    this.isRunning = false;
    this.model.reset();
    this._syncRobotViews(0);
    this._updateCamera(0, true);
    this.render();
    if (this.onTick) this.onTick(this.elapsedSimTime, this.robots);
    if (typeof Telemetry !== 'undefined') {
      Telemetry.logEvent(null, Telemetry.EVENT_TYPES?.SIMULATION_RESET || 'SIMULATION_RESET', {});
    }
  }

  step(stepSeconds = 0.5) {
    this.pause();
    const wasFinished = this.model.isFinished;
    this.model.update(stepSeconds);
    this._syncRobotViews(stepSeconds);
    this._updateCamera(stepSeconds);
    this.render();
    if (this.onTick) this.onTick(this.elapsedSimTime, this.robots);
    if (!wasFinished && this.model.isFinished && this.onFinish) {
      this.onFinish(this.elapsedSimTime, this.robots);
    }
  }

  setCameraMode(mode) {
    const next = mode === 'follow' ? 'follow' : 'overview';
    if (this.cameraMode === next) return;
    this.cameraMode = next;
    this._cameraMoving = true;
    this._lastRenderTimestamp = 0;
    this._applyCameraLabelVisibility();
  }

  render() {
    if (!this.renderer || !this.scene || !this.camera) return;
    if (this.container && this.container.offsetParent !== null) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resizeCanvas() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    this.width = rect.width;
    this.height = rect.height;
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this._overviewDistance = this._computeOverviewDistance();
    this.render();
    if (this.onResize) {
      try { this.onResize(); } catch (_) { /* noop */ }
    }
  }

  /**
   * Compatibility helper for the 2D destination flag. The 3D scene renders its
   * own target beacon, so TaskEngine hides the DOM flag; this method is only a
   * fallback for future HUD projections.
   */
  unitsToPixels(units) {
    const projected = this.projectUnitsToScreen(units);
    return projected.x;
  }

  projectUnitsToScreen(units) {
    if (!this.camera) return { x: 0, y: 0, visible: false };
    const world = this._worldPositionForUnits(units, 1.2);
    const projected = world.project(this.camera);
    return {
      x: (projected.x * 0.5 + 0.5) * this.width,
      y: (-projected.y * 0.5 + 0.5) * this.height,
      visible: projected.z > -1 && projected.z < 1,
    };
  }

  celebrate() {
    if (this._reduceMotion) return;
    const count = this._quality === 'low' ? 30 : 70;
    const positions = new Float32Array(count * 3);
    const velocities = [];
    const random = seededRandom(99);

    for (let i = 0; i < count; i += 1) {
      const robot = this.robots[0];
      const x = robot ? this._laneX(0) : 0;
      const z = robot ? this._zForUnits(robot.position) : 0;
      positions[i * 3] = x + (random() - 0.5) * 1.2;
      positions[i * 3 + 1] = 1.4 + random() * 0.8;
      positions[i * 3 + 2] = z + (random() - 0.5) * 1.2;
      velocities.push(new THREE.Vector3(
        (random() - 0.5) * 4,
        2 + random() * 4,
        (random() - 0.5) * 4
      ));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.12,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.scene.add(points);
    this._effects.push({ type: 'confetti', points, velocities, life: 0, maxLife: 2.2 });
  }

  destroy() {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;

    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (this._visibilityHandler) document.removeEventListener('visibilitychange', this._visibilityHandler);
    if (this.renderer?.domElement?._contextLostHandler) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this.renderer.domElement._contextLostHandler);
    }

    this._disposeObject(this.scene);
    if (this.scene && this.scene.background && this.scene.background.dispose) {
      this.scene.background.dispose();
      this.scene.background = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
      if (this.renderer.domElement?.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }

    if (this.canvas2D) this.canvas2D.style.display = '';
    if (this.flagEl) this.flagEl.style.display = '';
    this.onTick = null;
    this.onFinish = null;
    this.onResize = null;
    this.onFatal = null;
  }

  /* ------------------------------------------------------------------ */
  /* Renderer / scene setup                                             */
  /* ------------------------------------------------------------------ */

  _detectQuality() {
    if (this.options.quality && this.options.quality !== 'auto') return this.options.quality;
    const memory = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    const mobile = window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    if (memory <= 3 || cores <= 4) return 'low';
    return mobile ? 'medium' : 'high';
  }

  _pixelRatio() {
    const device = window.devicePixelRatio || 1;
    const cap = this._quality === 'low' ? 1.15 : this._quality === 'medium' ? 1.5 : 1.75;
    return Math.min(device, cap) * this._renderScale;
  }

  /**
   * Dynamic resolution guard for older tablets. We only measure while the robot
   * is running (idle scenes are intentionally throttled to 30fps), then reduce
   * the render scale one step at a time if frames are consistently slow.
   */
  _adaptResolution(delta) {
    if (this._qualityLocked || !this.isRunning || document.hidden) return;
    this._fpsElapsed += delta;
    this._fpsSamples += 1;
    if (this._fpsElapsed < 1.5) return;

    const fps = this._fpsSamples / this._fpsElapsed;
    this._fpsElapsed = 0;
    this._fpsSamples = 0;

    if (fps < 42 && this._renderScale > 0.72) {
      this._renderScale = Math.max(0.72, Number((this._renderScale - 0.18).toFixed(2)));
      this.resizeCanvas();
      if (this._renderScale <= 0.72) this._qualityLocked = true;
    } else if (fps >= 52) {
      this._qualityLocked = true;
    }
  }

  _createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: this._quality !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setClearColor(0x07091c, 1);

    const canvas = this.renderer.domElement;
    canvas.className = 'sim-3d-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.outline = 'none';
    this.container.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 220);
    this.camera.position.set(0, 18, 48);
    this._lookTarget = new THREE.Vector3(0, 0.8, -2);
    this.camera.lookAt(this._lookTarget);
    this._overviewDistance = this._computeOverviewDistance();
  }

  _createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = this._makeSkyTexture();
    this.scene.fog = new THREE.FogExp2(0x07091c, 0.0075);

    this.scene.add(new THREE.HemisphereLight(0xa5c8ff, 0x1a1333, 2.1));
    const keyLight = new THREE.DirectionalLight(0xfff2d6, 2.35);
    keyLight.position.set(10, 22, 12);
    this.scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x67e8f9, 1.2);
    rimLight.position.set(-14, 10, -18);
    this.scene.add(rimLight);

    this.trackGroup = new THREE.Group();
    this.scene.add(this.trackGroup);
    this._robotViews = [];
  }

  _makeSkyTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);

    // Soft nebula glows.
    const glow = ctx.createRadialGradient(360, 150, 10, 360, 150, 220);
    glow.addColorStop(0, 'rgba(236,72,153,0.18)');
    glow.addColorStop(1, 'rgba(236,72,153,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 512, 512);

    const glow2 = ctx.createRadialGradient(120, 330, 10, 120, 330, 200);
    glow2.addColorStop(0, 'rgba(34,211,238,0.14)');
    glow2.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, 512, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  _createEnvironment() {
    const random = seededRandom(7);
    const starCount = this._quality === 'low' ? 180 : this._quality === 'medium' ? 380 : 650;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const radius = 48 + random() * 70;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.abs(Math.cos(phi)) * 0.55 + 2;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xbfdbfe,
      size: this._quality === 'low' ? 0.12 : 0.09,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.starField = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starField);

    // Low-poly planets in the distance.
    this.planets = new THREE.Group();
    this.planets.add(this._makePlanet(-27, 11, -34, 3.4, PALETTE.planetPink, 0x7c3aed));
    this.planets.add(this._makePlanet(29, 15, -39, 2.2, PALETTE.planetCyan, 0x0e7490));
    this.scene.add(this.planets);

    // Floating asteroid platform.
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(29, 27, 1.4, 48),
      new THREE.MeshStandardMaterial({
        color: 0x111a36,
        roughness: 0.9,
        metalness: 0.05,
        flatShading: true,
      })
    );
    platform.position.y = -0.9;
    this.scene.add(platform);

    const edgeRing = new THREE.Mesh(
      new THREE.TorusGeometry(28.6, 0.09, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7 })
    );
    edgeRing.rotation.x = Math.PI / 2;
    edgeRing.position.y = -0.14;
    this.scene.add(edgeRing);

    // Small floating crystals to give the platform depth.
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      roughness: 0.45,
      metalness: 0.1,
      flatShading: true,
    });
    const crystals = [
      [-19, -0.2, 8, 0.9], [18, -0.1, -7, 0.65], [-22, 0.1, -12, 0.55],
      [23, -0.2, 9, 0.75], [13, 0.1, 15, 0.45], [-11, 0, -18, 0.5],
    ];
    crystals.forEach(([x, y, z, scale], index) => {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(scale, 0), crystalMaterial);
      crystal.position.set(x, y + 0.4, z);
      crystal.rotation.set(index * 0.7, index * 0.4, 0);
      this.scene.add(crystal);
    });

    // A few low-poly rocks below the platform.
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x27345c,
      roughness: 0.95,
      flatShading: true,
    });
    for (let i = 0; i < 5; i += 1) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + random() * 1.1, 0), rockMaterial);
      rock.position.set((random() - 0.5) * 34, -2.2 - random() * 2, (random() - 0.5) * 30);
      rock.rotation.set(random() * 2, random() * 2, random() * 2);
      this.scene.add(rock);
    }
  }

  _makePlanet(x, y, z, radius, color, emissive) {
    const planet = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 2),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.28,
        roughness: 0.8,
        metalness: 0,
        flatShading: true,
      })
    );
    planet.position.set(x, y, z);
    return planet;
  }

  /* ------------------------------------------------------------------ */
  /* Track / labels                                                     */
  /* ------------------------------------------------------------------ */

  _createTrack() {
    const trackLength = this.options.trackLengthUnits;
    const runwayDepth = TRACK_WORLD_LENGTH + TRACK_WORLD_EXTRA * 2;

    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH + 2.2, 0.26, runwayDepth),
      new THREE.MeshStandardMaterial({
        color: PALETTE.runway,
        roughness: 0.72,
        metalness: 0.08,
      })
    );
    runway.position.y = 0;
    this.trackGroup.add(runway);

    const runwayTop = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH, 0.03, TRACK_WORLD_LENGTH + 3),
      new THREE.MeshStandardMaterial({
        color: PALETTE.runwayTop,
        roughness: 0.8,
        metalness: 0.02,
      })
    );
    runwayTop.position.y = 0.15;
    this.trackGroup.add(runwayTop);

    // Neon edge rails.
    const railMaterial = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    [-1, 1].forEach((side) => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.06, TRACK_WORLD_LENGTH + 3),
        railMaterial
      );
      rail.position.set(side * (LANE_WIDTH / 2), 0.18, 0);
      this.trackGroup.add(rail);
    });

    // Dashed center line, one instanced draw call.
    const dashCount = 42;
    const dashGeometry = new THREE.BoxGeometry(0.055, 0.02, 0.46);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.55 });
    const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < dashCount; i += 1) {
      const z = -TRACK_WORLD_LENGTH / 2 + (i + 0.5) * (TRACK_WORLD_LENGTH / dashCount);
      dummy.position.set(0, 0.19, z);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    this.trackGroup.add(dashes);

    // Distance ticks and labels. Long tracks use a wider label stride so the
    // perspective view stays readable instead of stacking dozens of signs.
    const majorStep = this._majorStep(trackLength);
    const minorStep = Math.max(1, majorStep / 5);
    const labelStep = majorStep * 2;
    const tickPositions = [];
    for (let units = 0; units <= trackLength + 0.001; units += minorStep) {
      const z = this._zForUnits(units);
      tickPositions.push(-LANE_WIDTH / 2, 0.205, z, LANE_WIDTH / 2, 0.205, z);
    }
    const tickGeometry = new THREE.BufferGeometry();
    tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3));
    const tickMaterial = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.65 });
    this.trackGroup.add(new THREE.LineSegments(tickGeometry, tickMaterial));

    this._distanceLabels = [];
    for (let units = 0; units <= trackLength + 0.001; units += labelStep) {
      const isTargetNear = Math.abs(units - this.options.targetDistance) < labelStep * 0.35;
      if (isTargetNear) continue;
      const sprite = this._makeLabelSprite(
        `${formatNumber(units)}${this.options.unitLabel}`,
        { color: '#dbeafe', bg: 'rgba(15,23,42,0.72)', border: 'rgba(147,197,253,0.65)' }
      );
      sprite.position.set(-LANE_WIDTH / 2 - 1.65, 1.5, this._zForUnits(units));
      sprite.scale.set(2.6, 0.65, 1);
      this.trackGroup.add(sprite);
      this._distanceLabels.push(sprite);
    }

    this._createStartGate();
    this._createTargetBeacon();
    this._createFinishMarker();
    this._applyCameraLabelVisibility();
  }

  _majorStep(totalUnits) {
    if (totalUnits <= 60) return 5;
    if (totalUnits <= 120) return 10;
    if (totalUnits <= 600) return 50;
    if (totalUnits <= 2000) return 200;
    return Math.pow(10, Math.floor(Math.log10(totalUnits))) / 2;
  }

  _createStartGate() {
    const z = this._zForUnits(0);
    const gateMaterial = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      emissive: 0x34d399,
      emissiveIntensity: 0.55,
      roughness: 0.55,
    });
    const postGeometry = new THREE.BoxGeometry(0.2, 3.2, 0.2);
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(postGeometry, gateMaterial);
      post.position.set(side * (LANE_WIDTH / 2 + 0.75), 1.6, z);
      this.trackGroup.add(post);
    });
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH + 1.7, 0.22, 0.22),
      gateMaterial
    );
    top.position.set(0, 3.18, z);
    this.trackGroup.add(top);

    const label = this._makeLabelSprite('START', {
      color: '#ecfdf5',
      bg: 'rgba(6,95,70,0.9)',
      border: 'rgba(52,211,153,0.95)',
      font: '800 56px "Baloo 2", Arial, sans-serif',
    });
    label.position.set(0, 3.85, z);
    label.scale.set(2.8, 0.9, 1);
    this.trackGroup.add(label);
    this._startLabel = label;
  }

  _createTargetBeacon() {
    const z = this._zForUnits(this.options.targetDistance);
    this._targetZ = z;

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.target, transparent: true, opacity: 0.55 })
    );
    beam.position.set(0, 2.1, z);
    this.trackGroup.add(beam);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.target,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.09, 8, 40), ringMaterial);
    ring.position.set(0, 1.55, z);
    this.trackGroup.add(ring);
    this._targetRing = ring;

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.045, 8, 36), ringMaterial.clone());
    ring2.material.opacity = 0.55;
    ring2.position.set(0, 1.55, z);
    this.trackGroup.add(ring2);
    this._targetRing2 = ring2;

    const groundRing = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.8, 36),
      new THREE.MeshBasicMaterial({
        color: PALETTE.target,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      })
    );
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.set(0, 0.2, z);
    this.trackGroup.add(groundRing);

    const label = this._makeLabelSprite(
      `${window.I18N?.isVietnamese?.() ? 'ĐÍCH' : 'TARGET'}  ${formatNumber(this.options.targetDistance)}${this.options.unitLabel}`,
      { color: '#fffbeb', bg: 'rgba(146,64,14,0.92)', border: 'rgba(251,191,36,0.95)', font: '800 52px "Baloo 2", Arial, sans-serif' }
    );
    label.position.set(0, 3.75, z);
    label.scale.set(4.6, 1.35, 1);
    this.trackGroup.add(label);
    this._targetLabel = label;

    if (this._quality !== 'low') {
      const light = new THREE.PointLight(0xfbbf24, 1.8, 9, 2);
      light.position.set(0, 1.8, z);
      this.trackGroup.add(light);
    }
  }

  _createFinishMarker() {
    const z = this._zForUnits(this.options.trackLengthUnits);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH + 1.4, 0.12, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.8 })
    );
    bar.position.set(0, 0.26, z);
    this.trackGroup.add(bar);
  }

  /**
   * Keep the follow camera clean: the HUD already shows the live distance, so
   * the world-space distance signs and robot name tag are hidden in follow mode.
   * The target beacon stays visible, only slightly smaller.
   */
  _applyCameraLabelVisibility() {
    const follow = this.cameraMode === 'follow';
    if (this._distanceLabels) {
      this._distanceLabels.forEach((label) => { label.visible = !follow; });
    }
    if (this._startLabel) {
      this._startLabel.visible = !follow;
    }
    if (this._robotViews) {
      this._robotViews.forEach((view) => {
        if (view.nameLabel) {
          view.nameLabel.visible = !follow || this.robots.length > 1;
        }
      });
    }
    if (this._targetLabel) {
      if (follow) this._targetLabel.scale.set(3.4, 1.0, 1);
      else this._targetLabel.scale.set(4.6, 1.35, 1);
    }
  }

  /**
   * Rebuild the localized target sign when the student switches language while
   * the track is open. Distance/START signs are numeric or language-neutral.
   */
  refreshLanguage() {
    if (!this._targetLabel) return;
    const visible = this._targetLabel.visible;
    const position = this._targetLabel.position.clone();
    const old = this._targetLabel;
    this.trackGroup.remove(old);
    if (old.material) {
      if (old.material.map) old.material.map.dispose();
      old.material.dispose();
    }

    const label = this._makeLabelSprite(
      `${window.I18N?.isVietnamese?.() ? 'ĐÍCH' : 'TARGET'}  ${formatNumber(this.options.targetDistance)}${this.options.unitLabel}`,
      { color: '#fffbeb', bg: 'rgba(146,64,14,0.92)', border: 'rgba(251,191,36,0.95)', font: '800 52px "Baloo 2", Arial, sans-serif' }
    );
    label.position.copy(position);
    label.visible = visible;
    this.trackGroup.add(label);
    this._targetLabel = label;
    this._applyCameraLabelVisibility();
  }

  _makeLabelSprite(text, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const radius = 34;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = options.bg || 'rgba(15,23,42,0.85)';
    ctx.strokeStyle = options.border || 'rgba(148,163,184,0.7)';
    ctx.lineWidth = 5;
    this._roundRect(ctx, 5, 18, 502, 92, radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = options.color || '#f8fafc';
    ctx.font = options.font || '800 56px "Baloo 2", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), 256, 66);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 20;
    return sprite;
  }

  _roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ */
  /* Robot views                                                        */
  /* ------------------------------------------------------------------ */

  _rebuildRobotViews() {
    this._robotViews.forEach((view) => {
      this.scene.remove(view.group);
      this._disposeObject(view.group);
    });
    this._robotViews = [];

    const count = this.robots.length;
    this.robots.forEach((robot, index) => {
      const group = new THREE.Group();
      const laneX = this._laneX(index, count);
      group.position.x = laneX;
      group.position.z = this._zForUnits(robot.position);
      group.rotation.y = robot.direction < 0 ? Math.PI : 0;

      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(robot.color || PALETTE.robot),
        roughness: 0.48,
        metalness: 0.15,
        flatShading: true,
      });
      const lightMaterial = new THREE.MeshStandardMaterial({
        color: 0xa5b4fc,
        roughness: 0.5,
        metalness: 0.1,
        flatShading: true,
      });
      const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.65,
        metalness: 0.25,
      });
      const eyeMaterial = new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x22d3ee,
        emissiveIntensity: 2.2,
        roughness: 0.25,
      });

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 1.55), bodyMaterial);
      body.position.y = 0.62;
      group.add(body);

      // Rear service panel and glowing power core: this is the side the follow
      // camera sees most of the time, so it should not be a plain blue box.
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.46, 0.2), darkMaterial);
      backpack.position.set(0, 0.72, 0.86);
      group.add(backpack);
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0x9d174d,
        emissive: 0xf472b6,
        emissiveIntensity: 1.1,
        roughness: 0.35,
        metalness: 0.2,
      });
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), coreMaterial);
      core.rotation.x = Math.PI / 2;
      core.position.set(0, 0.72, 0.98);
      group.add(core);
      const coreRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.155, 0.018, 6, 20),
        new THREE.MeshBasicMaterial({ color: 0xf9a8d4 })
      );
      coreRing.position.set(0, 0.72, 0.99);
      group.add(coreRing);

      const head = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62, 1.05), lightMaterial);
      head.position.set(0, 1.28, -0.04);
      group.add(head);

      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.3, 0.08), darkMaterial);
      visor.position.set(0, 1.3, -0.56);
      group.add(visor);

      [-0.23, 0.23].forEach((x) => {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMaterial);
        eye.position.set(x, 1.3, -0.61);
        group.add(eye);
      });

      const antennaStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6),
        darkMaterial
      );
      antennaStem.position.set(0, 1.82, -0.02);
      group.add(antennaStem);

      const antennaLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMaterial.clone());
      antennaLight.position.set(0, 2.05, -0.02);
      group.add(antennaLight);
      if (this._quality !== 'low') {
        const antennaGlow = new THREE.PointLight(0x67e8f9, 0.55, 2.3, 2);
        antennaGlow.position.set(0, 2.05, -0.02);
        group.add(antennaGlow);
      }

      const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.7,
        metalness: 0.3,
      });
      const wheels = [];
      [0.48, -0.42].forEach((axleZ) => {
        [-1, 1].forEach((side) => {
          const wheelGroup = new THREE.Group();
          wheelGroup.position.set(side * 0.76, 0.32, axleZ);
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(ROBOT_WHEEL_RADIUS, ROBOT_WHEEL_RADIUS, 0.22, 14), wheelMaterial);
          wheel.rotation.z = Math.PI / 2;
          wheelGroup.add(wheel);
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 8), eyeMaterial);
          hub.rotation.z = Math.PI / 2;
          wheelGroup.add(hub);
          group.add(wheelGroup);
          wheels.push(wheelGroup);
        });
      });

      // Soft blob shadow (cheap and stable on low-end devices).
      const shadowTexture = this._makeShadowTexture();
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.9, 1.9),
        new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.17;
      group.add(shadow);

      const nameLabel = this._makeLabelSprite(robot.name || 'Robot', {
        color: '#eef2ff',
        bg: 'rgba(49,46,129,0.82)',
        border: 'rgba(165,180,252,0.9)',
        font: '800 46px "Baloo 2", Arial, sans-serif',
      });
      nameLabel.position.set(0, 2.55, 0);
      nameLabel.scale.set(2.0, 0.5, 1);
      group.add(nameLabel);

      this.scene.add(group);
      this._robotViews.push({
        group,
        wheels,
        eyeMaterial,
        antennaLight,
        nameLabel,
        baseZ: group.position.z,
        laneX,
        lastPosition: robot.position,
      });
    });

    this._applyCameraLabelVisibility();
  }

  _makeShadowTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(0,0,0,0.8)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /* ------------------------------------------------------------------ */
  /* Animation loop                                                     */
  /* ------------------------------------------------------------------ */

  _loop(timestamp) {
    if (this._destroyed) return;
    this._raf = requestAnimationFrame(this._loop);

    if (document.hidden) {
      this._lastTimestamp = timestamp;
      return;
    }

    const delta = Math.min((timestamp - this._lastTimestamp) / 1000, 0.05);
    this._lastTimestamp = timestamp;
    this._animTime += delta;
    this._adaptResolution(delta);

    if (this.isRunning) {
      const dt = Math.min(delta * this.options.timeScale, 0.1 * Math.max(1, this.options.timeScale));
      this.model.update(dt);
      this._syncRobotViews(dt);
      this._updateCamera(delta);
      if (this.onTick) this.onTick(this.elapsedSimTime, this.robots);

      if (this.model.isFinished) {
        this.isRunning = false;
        if (this.onFinish) this.onFinish(this.elapsedSimTime, this.robots);
      }
    } else {
      this._syncRobotViews(0);
      this._updateCamera(delta);
    }

    this._updateEffects(delta);

    // Idle scenes render at 30fps; running/camera transitions render at full speed.
    const idle = !this.isRunning && !this._cameraMoving;
    if (idle && timestamp - this._lastRenderTimestamp < 32) return;
    this._lastRenderTimestamp = timestamp;

    if (this.container.offsetParent !== null) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _syncRobotViews(delta) {
    if (!this._robotViews) return;
    this.robots.forEach((robot, index) => {
      const view = this._robotViews[index];
      if (!view) return;

      const z = this._zForUnits(robot.position);
      view.group.position.z = z;
      view.group.position.y = this._reduceMotion || !this.isRunning
        ? 0
        : Math.sin(this._animTime * 9 + index) * 0.025;

      if (robot.direction < 0) view.group.rotation.y = Math.PI;
      else view.group.rotation.y = 0;

      const distanceDelta = Math.abs(robot.position - view.lastPosition);
      if (distanceDelta > 0.0001) {
        const spin = (distanceDelta / ROBOT_WHEEL_RADIUS) * (robot.direction < 0 ? -1 : 1);
        view.wheels.forEach((wheel) => { wheel.rotation.x -= spin; });
      }
      view.lastPosition = robot.position;

      const finished = robot.isFinished;
      view.antennaLight.material.color.setHex(finished ? 0x34d399 : 0x67e8f9);
      view.antennaLight.material.emissive.setHex(finished ? 0x059669 : 0x0891b2);
    });

    if (this._targetRing && !this._reduceMotion) {
      const pulse = 1 + Math.sin(this._animTime * 2.4) * 0.07;
      this._targetRing.scale.set(pulse, pulse, 1);
      this._targetRing2.rotation.z += delta * 0.35;
      this._targetRing2.scale.set(1 + Math.sin(this._animTime * 2.4 + 1) * 0.04, 1 + Math.sin(this._animTime * 2.4 + 1) * 0.04, 1);
    }

    if (this.starField && !this._reduceMotion) {
      this.starField.rotation.y += delta * 0.002;
    }
  }

  _updateCamera(delta, snap = false) {
    if (!this.camera) return;
    const robot = this.robots[0];
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();

    if (this.cameraMode === 'follow' && robot) {
      const x = this._laneX(0, this.robots.length);
      const z = this._zForUnits(robot.position);
      const behind = robot.direction < 0 ? -1 : 1;
      desired.set(x + 3.4, 3.2, z + behind * 6.4);
      look.set(x, 1.0, z);
    } else {
      const distance = this._overviewDistance || 48;
      desired.set(0, this.width < 620 ? 21 : 18, distance);
      look.set(0, 0.8, -2);
    }

    const amount = snap || this._reduceMotion ? 1 : 1 - Math.pow(0.001, delta || 0.016);
    this.camera.position.lerp(desired, amount);
    this._lookTarget.lerp(look, amount);
    this.camera.lookAt(this._lookTarget);

    if (this._cameraMoving && this.camera.position.distanceTo(desired) < 0.08) {
      this._cameraMoving = false;
    }
  }

  _updateEffects(delta) {
    if (!this._effects.length) return;
    this._effects = this._effects.filter((effect) => {
      effect.life += delta;
      if (effect.type === 'confetti') {
        const positions = effect.points.geometry.attributes.position.array;
        effect.velocities.forEach((velocity, index) => {
          velocity.y -= 9.8 * delta;
          positions[index * 3] += velocity.x * delta;
          positions[index * 3 + 1] += velocity.y * delta;
          positions[index * 3 + 2] += velocity.z * delta;
        });
        effect.points.geometry.attributes.position.needsUpdate = true;
        effect.points.material.opacity = Math.max(0, 1 - effect.life / effect.maxLife);
      }
      if (effect.life >= effect.maxLife) {
        this.scene.remove(effect.points);
        this._disposeObject(effect.points);
        return false;
      }
      return true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Geometry helpers                                                   */
  /* ------------------------------------------------------------------ */

  _computeOverviewDistance() {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const halfLength = TRACK_WORLD_LENGTH / 2 + 2;
    const distance = halfLength / Math.tan(fov / 2);
    const aspect = this.width && this.height ? this.width / this.height : 1.6;
    const widthDistance = ((LANE_WIDTH + 6) / 2) / Math.tan(Math.atan(Math.tan(fov / 2) * aspect));
    return Math.max(distance * 0.94, widthDistance * 0.8, 38);
  }

  _zForUnits(units) {
    const ratio = Math.max(-0.12, Math.min(1.12, Number(units) / this.options.trackLengthUnits || 0));
    return TRACK_WORLD_LENGTH / 2 - ratio * TRACK_WORLD_LENGTH;
  }

  _worldPositionForUnits(units, y = 0.8) {
    return new THREE.Vector3(0, y, this._zForUnits(units));
  }

  _laneX(index, count = this.robots.length) {
    if (count <= 1) return 0;
    const spacing = Math.min(1.9, (LANE_WIDTH - 2.2) / Math.max(1, count - 1));
    return (index - (count - 1) / 2) * spacing;
  }

  _bindEvents() {
    this._resizeHandler = () => this.resizeCanvas();
    window.addEventListener('resize', this._resizeHandler, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this._resizeObserver.observe(this.container);
    }

    this._visibilityHandler = () => {
      this._lastTimestamp = performance.now();
      if (!document.hidden) this.resizeCanvas();
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    const canvas = this.renderer.domElement;
    const contextLost = (event) => {
      event.preventDefault();
      this.isRunning = false;
      if (this.onFatal) this.onFatal(new Error('WebGL context lost'));
    };
    canvas.addEventListener('webglcontextlost', contextLost, false);
    canvas._contextLostHandler = contextLost;
  }

  _disposeObject(root) {
    if (!root) return;
    root.traverse((object) => {
      if (object.geometry && !object.isSprite) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (!material) return;
          ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap'].forEach((key) => {
            if (material[key] && material[key].dispose) material[key].dispose();
          });
          material.dispose();
        });
      }
    });
    if (root.parent) root.parent.remove(root);
  }
}

window.Simulation3DEngine = Simulation3DEngine;
export { Simulation3DEngine };
