/**
 * ROBOT MATH LAB - VIRTUAL ROBOTICS SIMULATION ENGINE
 * Zero-install 2D Physics & Kinematics Engine using HTML5 Canvas & Matter.js compatibility.
 * Features customizable tracks, multiple robot agents, distance rulers, real-time kinematics.
 */

class SimulationEngine {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.warn('Canvas not found:', canvasId);
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    this.options = Object.assign({
      trackLengthUnits: 100, // in meters or km
      unitLabel: 'm',
      timeScale: 1.0,
      mode: 'single', // 'single', 'race', 'opposite', 'multistage'
    }, options);

    if (!window.KinematicsModel) {
      throw new Error('KinematicsModel is not loaded. Add js/kinematics-model.js before simulation-engine.js.');
    }

    this.model = new window.KinematicsModel({
      trackLengthUnits: this.options.trackLengthUnits,
      mode: this.options.mode
    });
    this.isRunning = false;
    this.lastTimestamp = 0;
    this.animationFrameId = null;

    // Callbacks
    this.onTick = null;
    this.onFinish = null;

    // Cache DPR for performance
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._resizeTimeout = null;
    this._resizeRAF = null;

    this.resizeCanvas();
    this._resizeHandler = () => {
      // Debounce resize events for performance
      if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
      this._resizeTimeout = setTimeout(() => this.resizeCanvas(), 150);
    };
    window.addEventListener('resize', this._resizeHandler);

    // Container-based resize (fullscreen, layout changes, responsive cards).
    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this._resizeRAF) cancelAnimationFrame(this._resizeRAF);
        this._resizeRAF = requestAnimationFrame(() => this.resizeCanvas());
      });
      this._resizeObserver.observe(this.canvas.parentElement);
    }
  }

  get robots() {
    return this.model ? this.model.robots : [];
  }

  get elapsedSimTime() {
    return this.model ? this.model.elapsedSimTime : 0;
  }

  get isFinished() {
    return this.model ? this.model.isFinished : false;
  }

  get history() {
    return this.model ? this.model.history : [];
  }

  destroy() {
    this.pause();
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }
    if (this._resizeRAF) {
      cancelAnimationFrame(this._resizeRAF);
      this._resizeRAF = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    const dpr = this._dpr;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Reset and apply scale cleanly
    this.width = rect.width;
    this.height = rect.height;
    this.render();
    if (this.onResize) {
      try { this.onResize(); } catch(e) {}
    }
  }

  /**
   * Configure robots in the simulation
   * Each robot: { id, name, color, velocity, startPosUnits, targetUnits, direction: 1 or -1 }
   */
  setRobots(robotConfigs) {
    this.model.setRobots(robotConfigs);
    this.reset();
  }

  start() {
    if (this.isRunning) return;
    if (this.isFinished) {
      this.reset();
    }
    this.isRunning = true;
    this.lastTimestamp = performance.now(); // Reset timestamp to prevent time jump
    if (typeof Telemetry !== 'undefined') {
      Telemetry.logEvent(null, Telemetry.EVENT_TYPES?.SIMULATION_START || 'SIMULATION_START', {
        simTime: this.elapsedSimTime,
        robots: this.robots.map(r => ({ id: r.id, v: r.velocity }))
      });
    }
    this.animationFrameId = requestAnimationFrame(t => this.loop(t));
  }

  pause() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (typeof Telemetry !== 'undefined') {
      Telemetry.logEvent(null, Telemetry.EVENT_TYPES?.SIMULATION_PAUSE || 'SIMULATION_PAUSE', {
        simTime: this.elapsedSimTime
      });
    }
  }

  reset() {
    this.pause();
    this.model.reset();
    this.render();
    if (this.onTick) this.onTick(this.elapsedSimTime, this.robots);
    if (typeof Telemetry !== 'undefined') {
      Telemetry.logEvent(null, Telemetry.EVENT_TYPES?.SIMULATION_RESET || 'SIMULATION_RESET', {});
    }
  }

  step(stepSeconds = 0.5) {
    this.pause();
    const wasFinished = this.isFinished;
    this.updatePhysics(stepSeconds);
    this.render();
    if (this.onTick) this.onTick(this.elapsedSimTime, this.robots);
    if (!wasFinished && this.isFinished && this.onFinish) {
      this.onFinish(this.elapsedSimTime, this.robots);
    }
  }

  setTimeScale(scale) {
    this.options.timeScale = Math.max(0.1, Math.min(100.0, scale));
  }

  loop(timestamp) {
    if (!this.isRunning) return;

    // Tạm dừng tính toán vật lý khi tab bị ẩn để tiết kiệm CPU và tránh time jump khi quay lại
    if (typeof document !== 'undefined' && document.hidden) {
      this.lastTimestamp = timestamp;
      this.animationFrameId = requestAnimationFrame(t => this.loop(t));
      return;
    }

    const deltaRealMs = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Convert real dt (ms) to simulated dt (seconds)
    const dt = (deltaRealMs / 1000) * this.options.timeScale;
    
    // Cap dt to prevent huge jumps while allowing high timeScale
    const safeDt = Math.min(dt, 0.1 * Math.max(1, this.options.timeScale));

    this.updatePhysics(safeDt);
    this.render();

    if (this.onTick) {
      this.onTick(this.elapsedSimTime, this.robots);
    }

    if (!this.isFinished) {
      this.animationFrameId = requestAnimationFrame(t => this.loop(t));
    } else {
      this.isRunning = false;
      if (this.onFinish) {
        this.onFinish(this.elapsedSimTime, this.robots);
      }
    }
  }

  updatePhysics(dt) {
    this.model.update(dt);
  }

  recordHistoryPoint() {
    this.model.recordHistoryPoint();
  }

  /**
   * Convert track units (meters or km) to canvas pixels
   */
  unitsToPixels(units) {
    const paddingX = 60;
    const availableWidth = this.width - paddingX * 2;
    const ratio = Math.max(0, Math.min(1, units / this.options.trackLengthUnits));
    return paddingX + ratio * availableWidth;
  }

  /**
   * Main rendering function
   */
  render() {
    if (!this.ctx || !this.width) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw Environment & Sky / Road Background
    this.drawEnvironment(ctx, w, h);

    // 2. Draw Distance Ruler & Markers
    this.drawRuler(ctx, w, h);

    // 3. Draw Robots
    this.robots.forEach((robot) => {
      this.drawRobot(ctx, robot);
    });
  }

  drawEnvironment(ctx, w, h) {
    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    skyGrad.addColorStop(0, '#E0F2FE');
    skyGrad.addColorStop(1, '#BAE6FD');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.7);

    // Distant hills/ground
    ctx.fillStyle = '#A7F3D0';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.6);
    ctx.quadraticCurveTo(w * 0.25, h * 0.52, w * 0.5, h * 0.58);
    ctx.quadraticCurveTo(w * 0.75, h * 0.62, w, h * 0.55);
    ctx.lineTo(w, h * 0.7);
    ctx.lineTo(0, h * 0.7);
    ctx.closePath();
    ctx.fill();

    // Road / Track area
    const roadGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
    roadGrad.addColorStop(0, '#334155');
    roadGrad.addColorStop(1, '#1E293B');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, h * 0.65, w, h * 0.35);

    // Lane divider
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 3;
    ctx.setLineDash([20, 15]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.82);
    ctx.lineTo(w, h * 0.82);
    ctx.stroke();
    ctx.setLineDash([]); // reset

    // Start Line
    const startX = this.unitsToPixels(0);
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(startX, h * 0.65);
    ctx.lineTo(startX, h);
    ctx.stroke();

    // Start label
    ctx.fillStyle = '#22C55E';
    ctx.font = 'bold 11px "Lexend", "Nunito", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('START (0m)', startX, h * 0.65 - 8);

    // Finish Line (Checkerboard)
    const finishX = this.unitsToPixels(this.options.trackLengthUnits);
    this.drawCheckeredLine(ctx, finishX, h * 0.65, h);

    // Target Destination Line (Red dashed line on track)
    const targetDist = this.options.targetDistance || (this.robots && this.robots[0]?.target);
    if (targetDist && targetDist < this.options.trackLengthUnits) {
      const targetX = this.unitsToPixels(targetDist);
      ctx.save();
      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(targetX, h * 0.65);
      ctx.lineTo(targetX, h);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawCheckeredLine(ctx, x, y1, y2) {
    const size = 8;
    const height = y2 - y1;
    const rows = Math.floor(height / size);
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = (i % 2 === 0) ? '#FFFFFF' : '#000000';
      ctx.fillRect(x - size, y1 + i * size, size, size);
      ctx.fillStyle = (i % 2 === 0) ? '#000000' : '#FFFFFF';
      ctx.fillRect(x, y1 + i * size, size, size);
    }
  }

  drawRuler(ctx, w, h) {
    const rulerY = h - 26;
    const totalUnits = this.options.trackLengthUnits;
    const unitLabel = this.options.unitLabel;

    // Dynamic major and minor tick interval according to totalUnits scale
    let majorStep;
    if (totalUnits <= 60) majorStep = 5;
    else if (totalUnits <= 120) majorStep = 10;
    else if (totalUnits <= 600) majorStep = 50;
    else if (totalUnits <= 2000) majorStep = 200;
    else majorStep = Math.pow(10, Math.floor(Math.log10(totalUnits))) / 2;

    const minorStep = Math.max(1, majorStep / 5);

    // Minor ticks
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    for (let u = 0; u <= totalUnits; u += minorStep) {
      if (Math.abs(u % majorStep) > 0.001) {
        const px = this.unitsToPixels(u);
        ctx.beginPath();
        ctx.moveTo(px, rulerY - 1);
        ctx.lineTo(px, rulerY + 5);
        ctx.stroke();
      }
    }

    // Major ticks & labels
    ctx.font = 'bold 12px "Lexend", "Nunito", sans-serif';
    ctx.textAlign = 'center';
    for (let u = 0; u <= totalUnits; u += majorStep) {
      const px = this.unitsToPixels(u);

      // Major tick line
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, rulerY - 5);
      ctx.lineTo(px, rulerY + 7);
      ctx.stroke();

      // Number Label
      ctx.fillStyle = (u === 0) ? '#4ADE80' : '#F8FAFC';
      ctx.fillText(`${u}${unitLabel}`, px, rulerY + 20);
    }

    // Always ensure trackLengthUnits tick is drawn if not a multiple of majorStep
    if (totalUnits % majorStep > majorStep * 0.2 && totalUnits % majorStep < majorStep * 0.8) {
      const px = this.unitsToPixels(totalUnits);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(px, rulerY - 5);
      ctx.lineTo(px, rulerY + 7);
      ctx.stroke();
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(`${totalUnits}${unitLabel}`, px, rulerY + 20);
    }
  }

  /**
   * Draw a sleek, high-detail vector robot sprite
   */
  drawRobot(ctx, robot) {
    const px = this.unitsToPixels(robot.position);
    const py = this.height * robot.trackY;
    const size = 44;

    ctx.save();
    ctx.translate(px, py);

    // Flip horizontally if facing left
    if (robot.direction < 0) {
      ctx.scale(-1, 1);
    }

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.45, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    // Robot Body
    ctx.fillStyle = robot.color;
    this.roundRect(ctx, -size * 0.4, -size * 0.35, size * 0.8, size * 0.7, 8);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0F172A';
    ctx.stroke();

    // Visor / Eye screen
    ctx.fillStyle = '#0F172A';
    this.roundRect(ctx, -size * 0.3, -size * 0.25, size * 0.6, size * 0.3, 4);
    ctx.fill();

    // Glowing Eyes
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(-size * 0.12, -size * 0.1, 3.5, 0, Math.PI * 2);
    ctx.arc(size * 0.12, -size * 0.1, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Wheels / Tracks
    ctx.fillStyle = '#334155';
    this.roundRect(ctx, -size * 0.45, size * 0.2, size * 0.9, size * 0.2, 5);
    ctx.fill();
    ctx.stroke();

    // Antenna with pulsing light
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.35);
    ctx.lineTo(0, -size * 0.55);
    ctx.stroke();

    ctx.fillStyle = robot.isFinished ? '#22C55E' : '#F59E0B';
    ctx.beginPath();
    ctx.arc(0, -size * 0.55, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Draw Robot Label Tag above
    ctx.save();
    ctx.font = 'bold 12px Nunito, sans-serif';
    ctx.textAlign = 'center';
    
    // Tag background with correct physical unit (km -> km/h, m -> m/s)
    const speedUnit = (this.options.unitLabel === 'km') ? 'km/h' : (this.options.unitLabel === 'm' ? 'm/s' : `${this.options.unitLabel}/s`);
    const tagText = `${robot.name} (${robot.velocity} ${speedUnit})`;
    const textWidth = ctx.measureText(tagText).width;
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    this.roundRect(ctx, px - textWidth / 2 - 8, py - size * 0.85, textWidth + 16, 20, 10);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(tagText, px, py - size * 0.85 + 14);

    ctx.restore();
  }

  roundRect(ctx, x, y, width, height, radius) {
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
}

window.SimulationEngine = SimulationEngine;
