/**
 * ROBOT MATH LAB - TASK ENGINE
 * Core orchestrator for the 3 Polya tasks.
 * Manages the UI lifecycle, Polya FSM state transitions, canvas simulation,
 * interactive step validation, bilingual problem support, and PS1-PS11 event telemetry.
 */

class TaskEngine {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.taskConfig = null;
    this.polya = null;
    this.sim = null;
    this._openTrackPromise = null;
    this._openTrackToken = 0;
    this.attemptCount = 0;
    this.lastRunResult = null;
    this.trackReturnContext = 'step3';
    this.studentInputs = {
      step1: {},
      step2: {},
      step3: {},
      step4: {}
    };

  }

  getEnglishChoiceLabel(label) {
    const vietnameseChars = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    return String(label || '')
      .replace(/\s*\(([^)]*)\)/g, (match, text) => vietnameseChars.test(text) ? '' : match)
      .trim();
  }

  openTrackFromStep3() {
    const t = (key, params) => window.I18N ? window.I18N.t(key, params) : key;
    const speedEntry = document.getElementById('param-speed-entry');
    const timeEntry = document.getElementById('param-time-entry');
    const speedInput = document.getElementById('param-speed');
    const timeInput = document.getElementById('param-time');
    const parsePositiveParameter = rawValue => {
      const raw = String(rawValue ?? '').trim().replace(',', '.');
      if (!raw) return NaN;
      const value = Number(raw);
      return Number.isFinite(value) && value > 0 ? value : NaN;
    };
    const readParameter = (entry, internalInput, fallback) => {
      const rawEntry = String(entry?.value ?? '').trim();
      if (rawEntry) return parsePositiveParameter(rawEntry);
      const internalValue = String(internalInput?.value ?? '').trim();
      return parsePositiveParameter(internalValue || fallback);
    };
    const speed = readParameter(speedEntry, speedInput, this.studentInputs.step3.speed);
    const time = readParameter(timeEntry, timeInput, this.studentInputs.step3.time);

    if (!Number.isFinite(speed) || !Number.isFinite(time)) {
      if (window.LogEngine) {
        window.LogEngine.logEvent('INPUT_VALIDATION_FAILED', 'Simulation parameters were not valid', {
          step: 3,
          validSpeed: Number.isFinite(speed),
          validTime: Number.isFinite(time)
        });
      }
      const errorBox = document.getElementById('s3-error-box');
      if (errorBox) {
        errorBox.innerText = t('s3_val_error');
        errorBox.classList.remove('hidden');
      }
      return;
    }

    const errorBox = document.getElementById('s3-error-box');
    if (errorBox) errorBox.classList.add('hidden');
    this.lastRunResult = null;
    this.studentInputs.step3 = { speed, time };
    this.openTrackView('step3');
  }

  continueFromTrack() {
    const speed = this.studentInputs.step3.speed;
    const time = this.studentInputs.step3.time;
    if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(time) || time <= 0) {
      const t = (key, params) => window.I18N ? window.I18N.t(key, params) : key;
      const status = document.getElementById('sim-status-box');
      if (status) {
        status.classList.add('is-error');
        status.innerText = t('s3_val_error');
      }
      return;
    }

    if (this.trackReturnContext === 'step4') {
      const isSuccess = Math.abs(speed * time - this.taskConfig.targetDistance) < 0.01;
      if (isSuccess) this.studentInputs.step4.checkResult = 'yes';
      this.closeTrackView();
      this.renderStep(4);
      return;
    }

    this.polya.markStepComplete(3);
    this.polya.nextStep();
    this.closeTrackView();
  }

  /**
   * Load and initialize a task
   */
  loadTask(taskConfig, studentName = 'Student') {
    if (this.sim) {
      this.sim.destroy();
      this.sim = null;
    }
    this._openTrackPromise = null;
    this._openTrackToken += 1;

    this.taskConfig = taskConfig;
    this.attemptCount = 0;
    this.lastRunResult = null;
    this.trackReturnContext = 'step3';
    this.studentInputs = { step1: {}, step2: {}, step3: {}, step4: {} };

    // Initialize Log Session
    if (window.LogEngine) {
      window.LogEngine.startSession(studentName, taskConfig.id, taskConfig.title);
    }

    // Initialize Math Hints
    if (window.MathHints) {
      window.MathHints.setTaskHints(taskConfig.id, taskConfig.title, taskConfig.hints);
      window.MathHints.setCurrentStep(1);
    }

    // Initialize Polya FSM
    this.polya = new PolyaEngine(this);
    this.polya.onChange(({ oldStep, newStep, actionType }) => {
      this.handleStepChange(oldStep, newStep, actionType);
    });

    this.renderLayout();
    this.preloadSimulation();
    this.polya.start();
  }

  /**
   * Warm up the optional 3D renderer while the student is still solving steps.
   * The 2D canvas remains available as the fallback.
   */
  preloadSimulation() {
    if (!window.RML3D || !window.RML3D.enabled) return;
    const load = () => {
      window.RML3D.load().catch(() => {
        // Fallback to 2D is handled when the track opens.
      });
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(load, { timeout: 2500 });
    } else {
      setTimeout(load, 900);
    }
  }

  /**
   * Create the appropriate simulation renderer. Both engines share the same
   * KinematicsModel and expose the same subset of the SimulationEngine API.
   */
  initSimulation(EngineClass = window.SimulationEngine) {
    if (!EngineClass) return null;

    if (this.sim) {
      this.sim.destroy();
      this.sim = null;
    }

    const task = this.taskConfig;
    const use3D = Boolean(EngineClass.is3D);
    const targetId = use3D ? 'canvas-container' : 'robot-canvas';

    this.sim = new EngineClass(targetId, {
      trackLengthUnits: task.trackLength,
      unitLabel: task.unit,
      targetDistance: task.targetDistance,
      timeScale: task.timeScale || 1.0
    });

    this.sim.onResize = () => {
      this.updateFlagPosition();
    };

    this.sim.onTick = (elapsedSeconds, robots) => {
      const bot = (robots && robots[0]) || this.sim?.robots?.[0];
      if (!bot) return;
      const distEl = document.getElementById('disp-dist');
      const speedEl = document.getElementById('disp-speed');
      const timeEl = document.getElementById('disp-time');
      const elapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : this.sim.elapsedSimTime;
      if (distEl) distEl.innerText = `${bot.position.toFixed(1)} ${task.unit}`;
      if (speedEl) speedEl.innerText = `${bot.velocity.toFixed(1)} ${task.speedUnit}`;
      if (timeEl) timeEl.innerText = `${elapsed.toFixed(1)} ${task.timeUnit}`;
    };

    this.sim.onFatal = () => {
      this.handleSimulationFatal();
    };

    this.sim.setRobots([{
      id: 'main_bot',
      name: 'Alpha Bot',
      color: '#4f46e5',
      velocity: task.robotSpeed,
      startPosUnits: 0,
      targetUnits: task.targetDistance
    }]);

    this.updateCameraUI();
    return this.sim;
  }

  handleSimulationFatal() {
    if (!this.sim || !this.sim.is3D) return;
    const status = document.getElementById('sim-status-box');
    if (status) {
      status.innerText = window.I18N
        ? window.I18N.t('track_3d_fallback')
        : '3D is unavailable — using the 2D track.';
    }
    try {
      this.sim.destroy();
    } catch (_) { /* noop */ }
    this.sim = null;
    this.initSimulation(window.SimulationEngine);
    this.updateTrackViewUI();
  }

  /**
   * Render the full workspace shell with Config View and Dedicated Track View
   */
  renderLayout() {
    if (!this.container) return;
    const task = this.taskConfig;
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;
    const currentTitle = isVi ? (task.titleVi || task.title) : task.title;

    // Rule: Problem Statement ALWAYS in English with interactive vocabulary markup!
    const decoratedEn = window.VocabSupport
      ? window.VocabSupport.decorateText(task.descriptionEn)
      : task.descriptionEn;

    this.container.innerHTML = `
      <div class="task-workspace animate-fade-in" id="task-workspace-container">
        
        <!-- =========================================================================
             VIEW 1: PROBLEM CONFIGURATION & POLYA STEPS VIEW (CENTRALIZED)
             ========================================================================= -->
        <div class="workspace-view workspace-config-view" id="workspace-config-view">
          <!-- Top Navigation / Actions Bar -->
          <div class="workspace-top-bar">
            <button type="button" class="btn-back-hub" id="btn-back-hub" title="${t('btn_back_hub')}">
              ${t('btn_back_hub')}
            </button>
            <div class="workspace-task-header">
              <h2 class="workspace-task-title">${currentTitle}</h2>
            </div>
            <div class="workspace-top-tools">
              <button type="button" class="btn-tool-pill" id="btn-open-hints" title="${t('btn_hint')}">
                ${t('btn_hint')}
              </button>
              <button type="button" class="btn-tool-pill" id="btn-open-dict" title="${t('btn_dict')}">
                ${t('btn_dict')}
              </button>
              <button type="button" class="btn-tool-pill btn-tool-feedback hidden" id="btn-open-feedback" title="${t('btn_feedback')}">
                ${t('btn_feedback')}
              </button>
              <button type="button" class="btn-tool-pill btn-tool-journal" id="btn-open-journal" title="${t('btn_journal')}">
                ${t('btn_journal')}
              </button>
            </div>
          </div>

          <!-- Configuration View Content -->
          <div class="workspace-config-content">
            <!-- Problem Description Card -->
            <section class="card problem-card">
              <div class="problem-card-header">
                <div class="problem-card-title-group">
                  <span class="problem-card-icon">📋</span>
                  <span class="problem-card-title">${t('problem_card_title')}</span>
                </div>
                <!-- Mode to show Vietnamese translation if needed -->
                <button type="button" class="btn-toggle-translation ${isVi ? '' : 'hidden'}" id="btn-toggle-trans" title="Tiếng Việt">
                  ${t('btn_trans_show')}
                </button>
              </div>

              <!-- Problem statement: Always English with clickable terms -->
              <div class="problem-text-en" id="problem-text-en">
                ${decoratedEn}
              </div>

              <!-- Optional Vietnamese translation revealed on demand -->
              <div class="problem-text-vi hidden" id="problem-text-vi">
                <div class="vi-trans-tag">🇻🇳 BẢN DỊCH TIẾNG VIỆT:</div>
                <div class="vi-trans-body">${task.descriptionVi}</div>
              </div>

              <div class="problem-meta-hint">
                ${t('problem_hint_meta')}
              </div>
            </section>

            <!-- Interactive Step Form Container -->
            <section class="card step-form-card" id="step-content-card">
              <!-- Dynamically populated based on active Polya step -->
            </section>
          </div>
        </div>

        <!-- =========================================================================
             VIEW 2: DEDICATED VIRTUAL ROBOT TRACK SUB-SCREEN
             ========================================================================= -->
        <div class="workspace-view workspace-track-view hidden" id="workspace-track-view">
          <!-- Track Top Navigation Bar -->
          <div class="track-top-bar">
            <button type="button" class="btn-secondary btn-track-back" id="btn-track-back" title="${t('track_btn_back_params')}">
              ${t('track_btn_back_params')}
            </button>
            <div class="track-mission-header">
              <span class="track-mission-title" id="track-mission-title">${currentTitle}</span>
              <span class="track-progress-pill" id="track-progress-pill">${t('track_progress_badge')}</span>
            </div>
            <div class="track-target-pill" id="track-target-pill">
              🏁 ${t('sim_target_label')} <strong>${task.targetDistance} ${task.unit}</strong>
            </div>
          </div>

          <!-- Main Track Card: Expansive Canvas, Kinematics Readouts, and Simulation Controls -->
          <div class="card track-main-card">
            <div class="track-card-header">
              <div class="track-title-group">
                <span class="sim-icon">🤖</span>
                <h2 class="track-view-heading">${t('track_view_title')}</h2>
              </div>
              <div class="track-instruction-text" id="track-instruction-text">
                ${t('track_instruction')}
              </div>
            </div>

            <!-- 3D camera switcher (hidden when the 2D fallback is active) -->
            <div class="track-camera-bar hidden" id="track-camera-bar" role="group" aria-label="${t('track_camera_label')}">
              <span class="track-camera-title" id="track-camera-title">🎥 ${t('track_camera_label')}</span>
              <button type="button" class="track-camera-btn active" id="btn-camera-overview" aria-pressed="true">
                🌍 ${t('track_camera_overview')}
              </button>
              <button type="button" class="track-camera-btn" id="btn-camera-follow" aria-pressed="false">
                🤖 ${t('track_camera_follow')}
              </button>
              <span class="track-camera-divider" aria-hidden="true"></span>
              <button type="button" class="track-camera-btn track-camera-icon" id="btn-camera-rotate-left"
                title="${t('track_camera_rotate_left')}" aria-label="${t('track_camera_rotate_left')}">↺</button>
              <button type="button" class="track-camera-btn track-camera-icon" id="btn-camera-rotate-right"
                title="${t('track_camera_rotate_right')}" aria-label="${t('track_camera_rotate_right')}">↻</button>
              <button type="button" class="track-camera-btn track-camera-icon" id="btn-camera-reset"
                title="${t('track_camera_reset')}" aria-label="${t('track_camera_reset')}">⌂</button>
              <span class="track-camera-hint" id="track-camera-hint">🖐 ${t('track_camera_drag_hint')}</span>
            </div>

            <!-- Canvas Wrapper for Full-width Road Simulation -->
            <div class="canvas-wrapper track-canvas-wrapper" id="canvas-container">
              <canvas id="robot-canvas"></canvas>
              <div class="sim-3d-loading hidden" id="sim-loading-overlay" role="status" aria-live="polite">
                <span class="sim-3d-loading-robot" aria-hidden="true">🤖</span>
                <span>${t('track_loading_3d')}</span>
              </div>
              <!-- Target destination flag overlay (2D fallback) -->
              <div class="track-destination-flag" id="destination-flag" title="Destination: ${task.targetDistance}${task.unit}">
                🏁 ${task.targetDistance}${task.unit}
              </div>
            </div>

            <!-- Kinematics Readout Bar: Speed, Time, Distance -->
            <div class="kinematics-readout track-readouts">
              <div class="readout-item">
                <span class="readout-label" id="lbl-disp-speed">${t('sim_speed_label')}</span>
                <span class="readout-value" id="disp-speed">-- ${task.speedUnit}</span>
              </div>
              <div class="readout-item">
                <span class="readout-label" id="lbl-disp-time">${t('sim_time_label')}</span>
                <span class="readout-value" id="disp-time">0.0 ${task.timeUnit}</span>
              </div>
              <div class="readout-item readout-highlight">
                <span class="readout-label" id="lbl-disp-dist">${t('sim_dist_label')}</span>
                <span class="readout-value" id="disp-dist">0.0 ${task.unit}</span>
              </div>
            </div>

            <!-- Simulation Status Message Box -->
            <div class="track-status-box" id="sim-status-box">
              ${t('track_status_ready')}
            </div>

            <!-- Result Feedback Card (Appears after simulation completes) -->
            <div class="track-result-card hidden" id="track-result-card"></div>

            <!-- Action Controls on Track Screen -->
            <div class="track-action-bar">
              <button type="button" class="btn-action-run" id="btn-track-run-robot">
                ${t('track_btn_run')}
              </button>
              <button type="button" class="btn-secondary hidden" id="btn-track-rerun">
                ${t('track_btn_rerun')}
              </button>
              <button type="button" class="btn-primary btn-track-continue hidden" id="btn-track-go-step4">
                ${t('track_btn_continue_step4')}
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    // Event Listeners for Top Bar Tools
    document.getElementById('btn-back-hub').onclick = () => {
      const confirmMsg = t('confirm_leave_task');
      if (confirm(confirmMsg)) {
        if (this.sim) {
          this.sim.destroy();
        }
        window.App.renderTaskSelection();
      }
    };

    document.getElementById('btn-open-hints').onclick = () => {
      if (window.MathHints) window.MathHints.openModal();
    };

    document.getElementById('btn-open-dict').onclick = () => {
      if (window.VocabSupport) window.VocabSupport.openDictionaryModal();
    };

    const topFbBtn = document.getElementById('btn-open-feedback');
    if (topFbBtn) {
      topFbBtn.onclick = () => {
        if (window.FeedbackEngine) window.FeedbackEngine.showModal();
      };
    }

    const journalBtn = document.getElementById('btn-open-journal');
    if (journalBtn) journalBtn.onclick = () => window.LogEngine?.openJournal();

    // Problem translation toggle
    const toggleTransBtn = document.getElementById('btn-toggle-trans');
    const viText = document.getElementById('problem-text-vi');
    if (toggleTransBtn && viText) {
      toggleTransBtn.onclick = () => {
        if (window.SoundFX) window.SoundFX.playPop();
        const isShowing = !viText.classList.contains('hidden');
        if (isShowing) {
          viText.classList.add('hidden');
          toggleTransBtn.classList.remove('active');
          toggleTransBtn.innerHTML = t('btn_trans_show');
        } else {
          viText.classList.remove('hidden');
          toggleTransBtn.classList.add('active');
          toggleTransBtn.innerHTML = t('btn_trans_hide');
        }
      };
    }

    // Track Screen Controls
    const trackBackBtn = document.getElementById('btn-track-back');
    if (trackBackBtn) trackBackBtn.onclick = () => this.closeTrackView();

    const trackRunBtn = document.getElementById('btn-track-run-robot');
    if (trackRunBtn) trackRunBtn.onclick = () => this.executeSimulationRun();

    const trackRerunBtn = document.getElementById('btn-track-rerun');
    if (trackRerunBtn) {
      trackRerunBtn.onclick = () => {
        if (this.sim) this.sim.reset();
        this.executeSimulationRun();
      };
    }

    const trackGoStep4Btn = document.getElementById('btn-track-go-step4');
    if (trackGoStep4Btn) trackGoStep4Btn.onclick = () => this.continueFromTrack();

    const cameraOverviewBtn = document.getElementById('btn-camera-overview');
    if (cameraOverviewBtn) cameraOverviewBtn.onclick = () => this.setCameraMode('overview');
    const cameraFollowBtn = document.getElementById('btn-camera-follow');
    if (cameraFollowBtn) cameraFollowBtn.onclick = () => this.setCameraMode('follow');
    const cameraRotateLeftBtn = document.getElementById('btn-camera-rotate-left');
    if (cameraRotateLeftBtn) cameraRotateLeftBtn.onclick = () => this.rotateCamera(-1);
    const cameraRotateRightBtn = document.getElementById('btn-camera-rotate-right');
    if (cameraRotateRightBtn) cameraRotateRightBtn.onclick = () => this.rotateCamera(1);
    const cameraResetBtn = document.getElementById('btn-camera-reset');
    if (cameraResetBtn) cameraResetBtn.onclick = () => this.resetCamera();

  }

  /**
   * Open the dedicated Virtual Robot Track sub-screen
   */
  openTrackView(returnContext = 'step3') {
    this.trackReturnContext = returnContext;
    const configView = document.getElementById('workspace-config-view');
    const trackView = document.getElementById('workspace-track-view');
    if (!trackView) return;

    if (configView) configView.classList.add('hidden');
    trackView.classList.remove('hidden');
    this.updateTrackViewUI();

    // Keep tests and devices without 3D synchronous: create the 2D renderer now.
    if (this.sim) {
      this.revealTrack();
      return;
    }
    if (!window.RML3D || !window.RML3D.enabled) {
      this.initSimulation(window.SimulationEngine);
      this.revealTrack();
      return;
    }
    this.openTrackWith3D();
  }

  async openTrackWith3D() {
    if (this._openTrackPromise) return this._openTrackPromise;

    const token = ++this._openTrackToken;
    const loading = document.getElementById('sim-loading-overlay');
    const runBtn = document.getElementById('btn-track-run-robot');
    if (loading) loading.classList.remove('hidden');
    if (runBtn) runBtn.disabled = true;

    this._openTrackPromise = (async () => {
      try {
        const Engine3D = await window.RML3D.load();
        if (token !== this._openTrackToken) return;
        this.initSimulation(Engine3D || window.SimulationEngine);
      } catch (error) {
        if (token !== this._openTrackToken) return;
        console.warn('3D renderer unavailable, using 2D fallback:', error?.message || error);
        this.initSimulation(window.SimulationEngine);
      } finally {
        if (token === this._openTrackToken) {
          if (loading) loading.classList.add('hidden');
          this.updateTrackViewUI();
          this.revealTrack();
          this._openTrackPromise = null;
        }
      }
    })();

    return this._openTrackPromise;
  }

  revealTrack() {
    this.updateFlagPosition();
    requestAnimationFrame(() => {
      if (!this.sim) return;
      this.sim.resizeCanvas();
      if (this.sim.onResize) this.sim.onResize();
      this.updateFlagPosition();
      this.updateCameraUI();
    });
  }

  /**
   * Close the dedicated Track sub-screen and return to configuration view
   */
  closeTrackView() {
    const configView = document.getElementById('workspace-config-view');
    const trackView = document.getElementById('workspace-track-view');
    if (trackView) trackView.classList.add('hidden');
    if (configView) configView.classList.remove('hidden');

    // Re-render active step to ensure input states and choices are synchronized
    if (this.polya) {
      this.renderStep(this.polya.currentStep);
    }
  }

  /**
   * Synchronize labels, badges, and readouts on the dedicated Track sub-screen
   */
  updateTrackViewUI() {
    const task = this.taskConfig;
    if (!task) return;
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;
    const currentTitle = isVi ? (task.titleVi || task.title) : task.title;

    // Mission Title & Badges
    const titleEl = document.getElementById('track-mission-title');
    if (titleEl) titleEl.innerText = currentTitle;

    const progressEl = document.getElementById('track-progress-pill');
    if (progressEl) {
      progressEl.innerText = t('track_progress_badge');
    }

    const backBtn = document.getElementById('btn-track-back');
    if (backBtn) {
      backBtn.innerText = this.trackReturnContext === 'step4'
        ? t('track_btn_back_step4')
        : t('track_btn_back_params');
      backBtn.title = backBtn.innerText;
    }

    const trackHeading = document.querySelector('.track-view-heading');
    if (trackHeading) trackHeading.innerText = t('track_view_title');

    const instrEl = document.getElementById('track-instruction-text');
    if (instrEl) instrEl.innerText = t('track_instruction');

    // Only show values submitted from Step 3. Never substitute the mission answer.
    const speed = this.studentInputs.step3.speed;
    const time = this.studentInputs.step3.time;
    const hasValidParameters = Number.isFinite(speed) && speed > 0 && Number.isFinite(time) && time > 0;

    // A result only belongs to the parameters that produced it. Editing the
    // plan must not leave a stale "Continue" state on the track screen.
    if (this.lastRunResult && (
      Number(this.lastRunResult.speed) !== Number(speed) ||
      Number(this.lastRunResult.time) !== Number(time)
    )) {
      this.lastRunResult = null;
    }

    // Update readout labels and values
    const lblSpeed = document.getElementById('lbl-disp-speed');
    const lblTime = document.getElementById('lbl-disp-time');
    const lblDist = document.getElementById('lbl-disp-dist');
    if (lblSpeed) lblSpeed.innerText = t('sim_speed_label');
    if (lblTime) lblTime.innerText = t('sim_time_label');
    if (lblDist) lblDist.innerText = t('sim_dist_label');

    const speedDisp = document.getElementById('disp-speed');
    if (speedDisp) {
      speedDisp.innerText = hasValidParameters ? `${speed.toFixed(1)} ${task.speedUnit}` : `-- ${task.speedUnit}`;
    }

    // Target pill
    const targetPill = document.getElementById('track-target-pill');
    if (targetPill) targetPill.innerHTML = `🏁 ${t('sim_target_label')} <strong>${task.targetDistance} ${task.unit}</strong>`;

    // Destination flag (2D fallback only; 3D renders its own beacon)
    const flagEl = document.getElementById('destination-flag');
    if (flagEl) {
      flagEl.innerHTML = `🏁 ${task.targetDistance}${task.unit}`;
      flagEl.style.display = this.sim?.is3D ? 'none' : '';
    }

    const runBtn = document.getElementById('btn-track-run-robot');
    const rerunBtn = document.getElementById('btn-track-rerun');
    const contBtn = document.getElementById('btn-track-go-step4');
    const statusBox = document.getElementById('sim-status-box');
    const resultCard = document.getElementById('track-result-card');

    if (this.lastRunResult) {
      // A completed run survives language changes and revisiting the track.
      this.renderTrackResult(this.lastRunResult, false);
    } else {
      const timeDisp = document.getElementById('disp-time');
      const distDisp = document.getElementById('disp-dist');
      if (timeDisp) timeDisp.innerText = `0.0 ${task.timeUnit}`;
      if (distDisp) distDisp.innerText = `0.0 ${task.unit}`;

      if (runBtn) {
        runBtn.disabled = !hasValidParameters;
        runBtn.innerText = t('track_btn_run');
        runBtn.classList.remove('hidden');
      }
      if (rerunBtn) rerunBtn.classList.add('hidden');
      if (contBtn) {
        if (this.trackReturnContext === 'step4' && this.polya && this.polya.stepCompleted[3] && hasValidParameters) {
          contBtn.classList.remove('hidden');
          contBtn.innerText = t('track_btn_continue_step4');
        } else {
          contBtn.classList.add('hidden');
        }
      }
      if (statusBox) {
        statusBox.classList.remove('is-error');
        statusBox.innerText = hasValidParameters ? t('track_status_ready') : t('s3_val_error');
      }
      if (resultCard) {
        resultCard.className = 'track-result-card hidden';
        resultCard.innerHTML = '';
      }
    }

    this.updateCameraUI();
  }

  /**
   * Render a completed run. Kept separate so language changes and Step 4
   * revisits do not wipe the student's result.
   */
  renderTrackResult(result, animate = false) {
    const task = this.taskConfig;
    if (!task || !result) return;
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const { speed, time, finalDist, targetDist, isMatch } = result;

    const speedDisp = document.getElementById('disp-speed');
    const timeDisp = document.getElementById('disp-time');
    const distDisp = document.getElementById('disp-dist');
    if (speedDisp) speedDisp.innerText = `${Number(speed).toFixed(1)} ${task.speedUnit}`;
    if (timeDisp) timeDisp.innerText = `${Number(time).toFixed(1)} ${task.timeUnit}`;
    if (distDisp) distDisp.innerText = `${Number(finalDist).toFixed(1)} ${task.unit}`;

    const statusBox = document.getElementById('sim-status-box');
    if (statusBox) {
      statusBox.classList.remove('is-error');
      statusBox.innerHTML = t('track_status_finished', { dist: finalDist, unit: task.unit });
    }

    const resultCard = document.getElementById('track-result-card');
    if (resultCard) {
      resultCard.classList.remove('hidden');
      resultCard.className = `track-result-card ${isMatch ? 'result-success' : 'result-warning'}${animate ? ' animate-fade-in' : ''}`;
      resultCard.innerHTML = `
        <div class="result-icon">${isMatch ? '🏆' : '⚠️'}</div>
        <div class="result-details">
          <div class="result-heading">${isMatch ? t('track_result_match', { dist: finalDist, unit: task.unit }) : t('track_result_mismatch', { dist: finalDist, unit: task.unit, target: targetDist })}</div>
          <div class="result-meta">${t('s3_obs_traveled', { dist: finalDist, time })} &bull; ${t('s3_obs_target', { target: targetDist })}</div>
        </div>
      `;
    }

    const runBtn = document.getElementById('btn-track-run-robot');
    const rerunBtn = document.getElementById('btn-track-rerun');
    const contBtn = document.getElementById('btn-track-go-step4');
    if (runBtn) {
      runBtn.classList.add('hidden');
      runBtn.disabled = false;
      runBtn.innerText = t('track_btn_run');
    }
    if (rerunBtn) {
      rerunBtn.classList.remove('hidden');
      rerunBtn.innerText = t('track_btn_rerun');
    }
    if (contBtn) {
      contBtn.classList.remove('hidden');
      contBtn.innerText = t('track_btn_continue_step4');
    }
  }

  /**
   * Camera switcher shown only when the 3D renderer is active.
   */
  updateCameraUI() {
    const bar = document.getElementById('track-camera-bar');
    if (!bar) return;
    const is3D = Boolean(this.sim?.is3D);
    bar.classList.toggle('hidden', !is3D);
    if (!is3D) return;

    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    bar.setAttribute('aria-label', t('track_camera_label'));
    const title = document.getElementById('track-camera-title');
    if (title) title.innerText = `🎥 ${t('track_camera_label')}`;
    const overview = document.getElementById('btn-camera-overview');
    const follow = document.getElementById('btn-camera-follow');
    if (overview) {
      overview.innerText = `🌍 ${t('track_camera_overview')}`;
      overview.classList.toggle('active', this.sim.cameraMode !== 'follow');
      overview.setAttribute('aria-pressed', String(this.sim.cameraMode !== 'follow'));
    }
    if (follow) {
      follow.innerText = `🤖 ${t('track_camera_follow')}`;
      follow.classList.toggle('active', this.sim.cameraMode === 'follow');
      follow.setAttribute('aria-pressed', String(this.sim.cameraMode === 'follow'));
    }
    const rotateLeft = document.getElementById('btn-camera-rotate-left');
    if (rotateLeft) {
      rotateLeft.title = t('track_camera_rotate_left');
      rotateLeft.setAttribute('aria-label', t('track_camera_rotate_left'));
    }
    const rotateRight = document.getElementById('btn-camera-rotate-right');
    if (rotateRight) {
      rotateRight.title = t('track_camera_rotate_right');
      rotateRight.setAttribute('aria-label', t('track_camera_rotate_right'));
    }
    const resetView = document.getElementById('btn-camera-reset');
    if (resetView) {
      resetView.title = t('track_camera_reset');
      resetView.setAttribute('aria-label', t('track_camera_reset'));
    }
    const hint = document.getElementById('track-camera-hint');
    if (hint) hint.innerText = `🖐 ${t('track_camera_drag_hint')}`;
  }

  setCameraMode(mode) {
    if (!this.sim || !this.sim.is3D || typeof this.sim.setCameraMode !== 'function') return;
    this.sim.setCameraMode(mode);
    this.updateCameraUI();
  }

  rotateCamera(direction) {
    if (!this.sim || !this.sim.is3D || typeof this.sim.rotateCamera !== 'function') return;
    this.sim.rotateCamera(direction);
    this.updateCameraUI();
  }

  resetCamera() {
    if (!this.sim || !this.sim.is3D || typeof this.sim.resetCamera !== 'function') return;
    this.sim.resetCamera();
    this.updateCameraUI();
  }

  /**
   * Snapshot unsaved form values before a language re-render so a student does
   * not lose typed numbers or selected options.
   */
  captureStepFormState() {
    const root = document.getElementById('workspace-config-view');
    if (!root) return [];
    const state = [];
    root.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.type === 'hidden' || el.disabled) return;
      if (el.type === 'radio' || el.type === 'checkbox') {
        if (el.checked) state.push({ kind: 'check', name: el.name, value: el.value });
      } else if (el.id) {
        state.push({ kind: 'value', id: el.id, value: el.value });
      }
    });
    return state;
  }

  restoreStepFormState(state) {
    if (!Array.isArray(state) || !state.length) return;
    const root = document.getElementById('workspace-config-view');
    if (!root) return;
    const dispatch = (el, type) => {
      if (typeof Event !== 'undefined') {
        el.dispatchEvent(new Event(type, { bubbles: true }));
      }
    };
    state.forEach((item) => {
      if (item.kind === 'check') {
        const radio = Array.from(root.querySelectorAll('input'))
          .find((el) => el.name === item.name && el.value === item.value);
        if (radio) {
          radio.checked = true;
          dispatch(radio, 'change');
        }
      } else {
        const el = document.getElementById(item.id);
        if (el) {
          el.value = item.value;
          dispatch(el, 'input');
          dispatch(el, 'change');
        }
      }
    });
  }

  /**
   * Reactive Language Update without losing state
   */
  updateLanguage() {
    if (!this.container || !this.taskConfig) return;
    const formState = this.captureStepFormState();
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;
    const currentTitle = isVi ? (this.taskConfig.titleVi || this.taskConfig.title) : this.taskConfig.title;

    // Top Bar
    const backBtn = document.getElementById('btn-back-hub');
    if (backBtn) backBtn.innerText = t('btn_back_hub');

    const titleEl = this.container.querySelector('.workspace-task-title');
    if (titleEl) titleEl.innerText = currentTitle;

    const hintBtn = document.getElementById('btn-open-hints');
    if (hintBtn) {
      const count = window.MathHints?.unlockedLevel || 0;
      hintBtn.innerHTML = count > 0 ? `💡 Hint (${count}/3)` : t('btn_hint');
    }

    const dictBtn = document.getElementById('btn-open-dict');
    if (dictBtn) dictBtn.innerText = t('btn_dict');

    const journalBtn = document.getElementById('btn-open-journal');
    if (journalBtn) {
      journalBtn.innerText = t('btn_journal');
      journalBtn.title = t('btn_journal');
    }

    // Problem Card
    const probTitle = document.querySelector('.problem-card-title');
    if (probTitle) probTitle.innerText = t('problem_card_title');

    const toggleTransBtn = document.getElementById('btn-toggle-trans');
    const viText = document.getElementById('problem-text-vi');
    if (toggleTransBtn && viText) {
      toggleTransBtn.classList.toggle('hidden', !isVi);
      if (!isVi) {
        viText.classList.add('hidden');
        toggleTransBtn.classList.remove('active');
      }
      const isShowing = !viText.classList.contains('hidden');
      toggleTransBtn.innerHTML = isShowing ? t('btn_trans_hide') : t('btn_trans_show');
    }

    const metaHint = document.querySelector('.problem-meta-hint');
    if (metaHint) metaHint.innerHTML = t('problem_hint_meta');

    // Update Track Screen elements if instantiated
    this.updateTrackViewUI();
    if (this.sim && typeof this.sim.refreshLanguage === 'function') {
      this.sim.refreshLanguage();
    }

    // Re-render active step in config view
    if (this.polya) {
      this.renderStep(this.polya.currentStep);
      this.restoreStepFormState(formState);
    }
  }

  updateFlagPosition() {
    const flagEl = document.getElementById('destination-flag');
    if (!flagEl) return;

    if (this.sim?.is3D) {
      flagEl.style.display = 'none';
      return;
    }

    if (this.sim && this.taskConfig) {
      flagEl.style.display = '';
      const px = this.sim.unitsToPixels(this.taskConfig.targetDistance);
      flagEl.style.left = `${px}px`;
      const lineHeight = Math.max(80, (this.sim.height || 0) - 58);
      if (typeof flagEl.style.setProperty === 'function') {
        flagEl.style.setProperty('--track-flag-line-height', `${lineHeight}px`);
      }
    }
  }

  /**
   * Handle step state changes from PolyaEngine
   */
  handleStepChange(oldStep, newStep, actionType) {
    if (window.MathHints) {
      window.MathHints.setCurrentStep(newStep);
    }

    // Update Sparky mascot speech bubble with localized messages
    const sparkyBubble = document.getElementById('sparky-bubble');
    if (sparkyBubble) {
      const key = `sparky_step_${newStep}`;
      const msg = window.I18N ? window.I18N.t(key) : "Cố lên bạn nhé! 🤖✨";
      sparkyBubble.innerText = msg;
    }

    if (window.SoundFX && actionType !== 'START') {
      window.SoundFX.playPop();
    }

    // Render active step content
    this.renderStep(newStep);
  }

  renderStep(stepNumber) {
    const card = document.getElementById('step-content-card');
    if (!card) return;

    switch (stepNumber) {
      case 1:
        this.renderStep1(card);
        break;
      case 2:
        this.renderStep2(card);
        break;
      case 3:
        this.renderStep3(card);
        break;
      case 4:
        this.renderStep4(card);
        break;
    }
  }

  // =========================================================================
  // STEP 1: UNDERSTAND THE PROBLEM (PS1 - PS3)
  // =========================================================================
  renderStep1(container) {
    const s1 = this.taskConfig.step1;
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;

    container.innerHTML = `
      <div class="step-view animate-fade-in">
        <p class="step-instruction">
          <strong>${s1.promptEn}</strong><br/>
          ${isVi ? `<small class="text-muted">${s1.promptVi}</small>` : ''}
        </p>

        <!-- Given Data Inputs (PS1) -->
        <div class="given-fields-box">
          ${s1.fields.map(f => `
            <div class="input-group-row">
              <label for="input-s1-${f.key}" class="field-label">
                <strong>${f.label}:</strong>
              </label>
              <div class="input-with-unit">
                <input type="text" inputmode="decimal" id="input-s1-${f.key}" class="input-field" placeholder="" value="${this.studentInputs.step1[f.key] !== undefined ? this.studentInputs.step1[f.key] : ''}" />
                <span class="unit-tag">${f.unit}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Target Quantity Question (PS2) -->
        <div class="target-qty-box">
          <label class="field-label">
            <strong>${s1.targetQuestionEn}</strong>
            ${isVi ? `<div class="text-muted small">${s1.targetQuestionVi}</div>` : ''}
          </label>
          <div class="options-radio-group">
            ${s1.targetOptions.map(opt => `
              <label class="radio-card ${this.studentInputs.step1.targetQty === opt.id ? 'selected' : ''}">
                <input type="radio" name="s1-target-qty" value="${opt.id}" ${this.studentInputs.step1.targetQty === opt.id ? 'checked' : ''} />
                <span>${isVi ? opt.label : this.getEnglishChoiceLabel(opt.label)}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="step-error-box hidden" id="s1-error-box"></div>

        <div class="step-actions">
          <button type="button" class="btn-primary" id="btn-submit-step-1">
            ${t('s1_btn_next')}
          </button>
        </div>
      </div>
    `;

    // Radio selection visual styling
    container.querySelectorAll('input[name="s1-target-qty"]').forEach(r => {
      r.onchange = () => {
        container.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
        r.closest('.radio-card').classList.add('selected');
      };
    });

    document.getElementById('btn-submit-step-1').onclick = () => {
      this.validateStep1();
    };
  }

  validateStep1() {
    const s1 = this.taskConfig.step1;
    const errorBox = document.getElementById('s1-error-box');
    errorBox.classList.add('hidden');
    const t = (k) => window.I18N ? window.I18N.t(k) : k;

    const enteredData = {};
    let allFilled = true;

    s1.fields.forEach(f => {
      const raw = document.getElementById(`input-s1-${f.key}`)?.value || '';
      const val = parseFloat(String(raw).trim().replace(',', '.'));
      if (isNaN(val)) allFilled = false;
      enteredData[f.key] = val;
    });

    const selectedTarget = document.querySelector('input[name="s1-target-qty"]:checked')?.value;

    if (!allFilled || !selectedTarget) {
      if (window.LogEngine) {
        window.LogEngine.logEvent('INPUT_VALIDATION_FAILED', 'Step 1 submission missing required answers', {
          step: 1,
          missingValues: !allFilled,
          missingTarget: !selectedTarget
        });
      }
      errorBox.innerText = t('s1_error_missing');
      errorBox.classList.remove('hidden');
      return;
    }

    // Verify given values and target quantity
    const mismatches = [];
    s1.fields.forEach(f => {
      if (f.expected !== undefined && enteredData[f.key] !== f.expected) {
        mismatches.push({ field: f.key, entered: enteredData[f.key], expected: f.expected });
      }
    });

    const correctTargetOpt = s1.targetOptions.find(o => o.correct);
    if (correctTargetOpt && selectedTarget !== correctTargetOpt.id) {
      mismatches.push({ field: 'target', entered: selectedTarget, expected: correctTargetOpt.id });
    }

    if (mismatches.length > 0) {
      if (window.LogEngine) {
        window.LogEngine.logEvent('STEP1_MISMATCH', 'Identified data does not match problem statement', {
          mismatches,
          enteredData,
          selectedTarget
        });
      }
      if (window.SoundFX) window.SoundFX.playOops();
      errorBox.innerHTML = window.I18N && window.I18N.isVietnamese()
        ? '💡 Có một số thông tin chưa khớp với đề bài. Hãy đọc lại đề bài tiếng Anh và kiểm tra lại số liệu nhé!'
        : '💡 Some values do not match the problem statement. Please check the problem text and numbers again!';
      errorBox.classList.remove('hidden');
      return;
    }

    this.studentInputs.step1 = { ...enteredData, targetQty: selectedTarget };

    if (window.SoundFX) window.SoundFX.playTing();

    // Log PS1, PS2, PS3
    if (window.LogEngine) {
      window.LogEngine.logEvent('PS1', 'Identify given data', enteredData);
      window.LogEngine.logEvent('PS2', 'Identify target quantity', { targetQuantity: selectedTarget });
      window.LogEngine.logEvent('PS3', 'Confirm problem parameters and constraints', {
        fields: enteredData,
        target: selectedTarget
      });
    }

    this.polya.markStepComplete(1);
    this.polya.nextStep();
  }

  // =========================================================================
  // STEP 2: PLAN (PS4 - PS5)
  // =========================================================================
  renderStep2(container) {
    const s2 = this.taskConfig.step2;
    const t = (k) => window.I18N ? window.I18N.t(k) : k;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;

    container.innerHTML = `
      <div class="step-view animate-fade-in">
        ${s2.proposedNoteEn ? `
          <div class="alert-box-info">
            <strong>${s2.proposedNoteEn}</strong>
            ${isVi && s2.proposedNoteVi ? `<div>${s2.proposedNoteVi}</div>` : ''}
          </div>
        ` : ''}

        <p class="step-instruction">
          <strong>${s2.promptEn}</strong><br/>
          ${isVi ? `<small class="text-muted">${s2.promptVi}</small>` : ''}
        </p>

        <!-- Formula Options -->
        <div class="formula-group">
          ${s2.formulaOptions.map(opt => `
            <label class="radio-card formula-card ${this.studentInputs.step2.formulaId === opt.id ? 'selected' : ''}">
              <input type="radio" name="s2-formula" value="${opt.id}" ${this.studentInputs.step2.formulaId === opt.id ? 'checked' : ''} />
              <span class="formula-text"><strong>${opt.text}</strong></span>
            </label>
          `).join('')}
        </div>

        <!-- Calculation Input -->
        <div class="calc-box">
          <label class="field-label" for="input-s2-calc">
            <strong>${s2.calcPromptEn}</strong>
            ${isVi ? `<div class="text-muted small">${s2.calcPromptVi}</div>` : ''}
          </label>
          <div class="input-with-unit">
            <input type="text" inputmode="decimal" id="input-s2-calc" class="input-field" placeholder="" value="${this.studentInputs.step2.calcResult !== undefined ? this.studentInputs.step2.calcResult : ''}" />
            <span class="unit-tag">${s2.resultUnit}</span>
          </div>
        </div>

        <div class="step-error-box hidden" id="s2-error-box"></div>

        <div class="step-actions">
          <button type="button" class="btn-secondary" id="btn-back-step-1">${t('s2_btn_back')}</button>
          <button type="button" class="btn-primary" id="btn-submit-step-2">${t('s2_btn_next')}</button>
        </div>
      </div>
    `;

    container.querySelectorAll('input[name="s2-formula"]').forEach(r => {
      r.onchange = () => {
        container.querySelectorAll('.formula-card').forEach(c => c.classList.remove('selected'));
        r.closest('.formula-card').classList.add('selected');
      };
    });

    document.getElementById('btn-back-step-1').onclick = () => this.polya.prevStep();
    document.getElementById('btn-submit-step-2').onclick = () => this.validateStep2();
  }

  validateStep2() {
    const s2 = this.taskConfig.step2;
    const errorBox = document.getElementById('s2-error-box');
    errorBox.classList.add('hidden');
    const t = (k) => window.I18N ? window.I18N.t(k) : k;

    const formulaId = document.querySelector('input[name="s2-formula"]:checked')?.value;
    const rawCalc = document.getElementById('input-s2-calc')?.value || '';
    const calcVal = parseFloat(String(rawCalc).trim().replace(',', '.'));

    if (!formulaId || isNaN(calcVal)) {
      if (window.LogEngine) {
        window.LogEngine.logEvent('INPUT_VALIDATION_FAILED', 'Step 2 submission missing required answers', {
          step: 2,
          missingFormula: !formulaId,
          missingCalculation: isNaN(calcVal)
        });
      }
      errorBox.innerText = t('s2_error_missing');
      errorBox.classList.remove('hidden');
      return;
    }

    const selectedFormula = s2.formulaOptions.find(f => f.id === formulaId);
    const formulaCorrect = !!selectedFormula?.correct;
    const calcCorrect = Math.abs(calcVal - s2.expectedResult) < 0.001;

    if (!formulaCorrect || !calcCorrect) {
      if (window.LogEngine) {
        window.LogEngine.logEvent('STEP2_MISTAKE', 'Formula or calculation mismatch', {
          formulaId,
          formulaCorrect,
          calcVal,
          expectedResult: s2.expectedResult
        });
      }
      if (window.SoundFX) window.SoundFX.playOops();
      errorBox.innerHTML = window.I18N && window.I18N.isVietnamese()
        ? '💡 Công thức hoặc kết quả tính toán chưa chính xác. Hãy xem kỹ mối liên hệ giữa các đại lượng hoặc bấm nút 💡 Gợi ý để được hỗ trợ nhé!'
        : '💡 The chosen formula or calculation is not yet correct. Please check your math or click 💡 Hint for assistance!';
      errorBox.classList.remove('hidden');
      return;
    }

    this.studentInputs.step2 = {
      formulaId,
      formulaText: selectedFormula?.text || '',
      calcResult: calcVal
    };

    // Keep a validated result for the simulation without displaying it in the
    // next step's input field. The learner may still enter a different value.
    const targetParam = this.taskConfig.step3?.targetParam;
    if (targetParam === 'speed' && this.taskConfig.step3?.canEditSpeed) {
      this.studentInputs.step3.speed = calcVal;
    } else if (targetParam === 'time' && this.taskConfig.step3?.canEditTime) {
      this.studentInputs.step3.time = calcVal;
    }

    if (window.SoundFX) window.SoundFX.playTing();

    // Log PS4 & PS5
    if (window.LogEngine) {
      window.LogEngine.logEvent('PS4', 'Select mathematical formula', {
        formulaId,
        formula: selectedFormula?.formula || '',
        correct: true
      });
      window.LogEngine.logEvent('PS5', 'Initial mathematical plan and calculation', {
        calculationResult: calcVal,
        expectedResult: s2.expectedResult,
        matchesExpected: true
      });
    }

    this.polya.markStepComplete(2);
    this.polya.nextStep();
  }

  // =========================================================================
  // STEP 3: EXECUTE (PS6 - PS7)
  // =========================================================================
  renderStep3(container) {
    const s3 = this.taskConfig.step3;
    const task = this.taskConfig;
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;

    // Editable parameters are either entered here or transferred from a
    // validated Step 2 calculation. Fixed parameters come from the mission.
    const prefilledSpeed = s3.canEditSpeed ? '' : (s3.defaultSpeed ?? task.robotSpeed ?? '');
    const prefilledTime = s3.canEditTime ? '' : (s3.defaultTime ?? task.correctTime ?? '');
    const hasPositiveParameter = value => {
      const parsed = Number(String(value ?? '').trim().replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0;
    };
    const initialSpeed = s3.canEditSpeed
      ? this.studentInputs.step3.speed
      : prefilledSpeed;
    const initialTime = s3.canEditTime
      ? this.studentInputs.step3.time
      : prefilledTime;
    const trackReadyInitially = hasPositiveParameter(initialSpeed) && hasPositiveParameter(initialTime);
    const internalSpeed = s3.canEditSpeed ? (this.studentInputs.step3.speed ?? '') : prefilledSpeed;
    const internalTime = s3.canEditTime ? (this.studentInputs.step3.time ?? '') : prefilledTime;

    container.innerHTML = `
      <div class="step-view animate-fade-in">
        <p class="step-instruction">
          <strong>${s3.promptEn}</strong><br/>
          ${isVi ? `<small class="text-muted">${s3.promptVi}</small>` : ''}
        </p>

        ${s3.noteEn ? `
          <div class="alert-box-info">
            ℹ️ ${isVi && s3.noteVi ? s3.noteVi : s3.noteEn}
          </div>
        ` : ''}

        <!-- Robot Parameter Controls (PS6) -->
        <div class="robot-params-panel">
          <div class="param-row">
            <label class="param-label" for="${s3.canEditSpeed ? 'param-speed-entry' : 'param-speed-display'}">
              <span>${t('s3_speed_label')}</span>
            </label>
            <div class="param-control-wrap">
              ${s3.canEditSpeed ? `
                <input type="hidden" id="param-speed" value="${internalSpeed}" />
                <div class="input-with-unit">
                  <input type="number" step="any" id="param-speed-entry" class="input-field" value="${internalSpeed}" placeholder="${t('s3_param_placeholder') || '...'}" />
                  <span class="unit-tag">${task.speedUnit}</span>
                </div>
              ` : `
                <input type="hidden" id="param-speed" value="${prefilledSpeed}" />
                <div class="locked-field-badge" id="param-speed-display">
                  <div class="locked-field-val">
                    <strong>${prefilledSpeed}</strong>
                    <span class="unit">${task.speedUnit}</span>
                  </div>
                  <span class="locked-field-status">${t('s3_speed_locked')}</span>
                </div>
              `}
            </div>
          </div>

          <div class="param-row">
            <label class="param-label" for="${s3.canEditTime ? 'param-time-entry' : 'param-time-display'}">
              <span>${t('s3_time_label')}</span>
            </label>
            <div class="param-control-wrap">
              ${s3.canEditTime ? `
                <input type="hidden" id="param-time" value="${internalTime}" />
                <div class="input-with-unit">
                  <input type="number" step="any" id="param-time-entry" class="input-field" value="${internalTime}" placeholder="${t('s3_param_placeholder') || '...'}" />
                  <span class="unit-tag">${task.timeUnit}</span>
                </div>
              ` : `
                <input type="hidden" id="param-time" value="${prefilledTime}" />
                <div class="locked-field-badge" id="param-time-display">
                  <div class="locked-field-val">
                    <strong>${prefilledTime}</strong>
                    <span class="unit">${task.timeUnit}</span>
                  </div>
                  <span class="locked-field-status">${t('s3_time_locked')}</span>
                </div>
              `}
            </div>
          </div>
        </div>

        <div class="step-error-box hidden" id="s3-error-box" role="alert"></div>

        <div class="step-actions">
          <button type="button" class="btn-secondary" id="btn-back-step-2">${t('s3_btn_back')}</button>
          <button type="button" class="btn-action-run btn-open-track ${trackReadyInitially ? '' : 'hidden'}" id="btn-open-track">
            ${t('s3_btn_open_track')}
          </button>
          ${this.polya && this.polya.stepCompleted[3] ? `
            <button type="button" class="btn-primary" id="btn-go-to-step-4">
              ${t('s3_btn_next')}
            </button>
          ` : ''}
        </div>
      </div>
    `;

    document.getElementById('btn-back-step-2').onclick = () => {
      if (this.polya.stepCompleted[3]) {
        this.polya.allowRerun();
        this.studentInputs.step4 = {};
      }
      this.polya.prevStep();
    };

    const openTrackBtn = document.getElementById('btn-open-track');
    if (openTrackBtn) openTrackBtn.onclick = () => this.openTrackFromStep3();

    const resolveParameter = (entry, internalInput, storedValue, fallbackValue) => {
      const raw = String(entry?.value ?? '').trim();
      const candidate = raw || String(internalInput?.value ?? '').trim() || storedValue || fallbackValue;
      const parsed = Number(String(candidate ?? '').trim().replace(',', '.'));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : NaN;
    };
    const syncOpenTrackButton = () => {
      const errorBox = document.getElementById('s3-error-box');
      if (errorBox) errorBox.classList.add('hidden');
      const speed = resolveParameter(
        document.getElementById('param-speed-entry'),
        document.getElementById('param-speed'),
        this.studentInputs.step3.speed,
        s3.defaultSpeed ?? task.robotSpeed
      );
      const time = resolveParameter(
        document.getElementById('param-time-entry'),
        document.getElementById('param-time'),
        this.studentInputs.step3.time,
        s3.defaultTime ?? task.correctTime
      );
      if (openTrackBtn) openTrackBtn.classList.toggle('hidden', !Number.isFinite(speed) || !Number.isFinite(time));
    };

    [document.getElementById('param-speed-entry'), document.getElementById('param-time-entry')]
      .filter(Boolean)
      .forEach(input => {
        const handler = () => {
          if (input.id === 'param-speed-entry') {
            const hidden = document.getElementById('param-speed');
            if (hidden) hidden.value = input.value;
          } else if (input.id === 'param-time-entry') {
            const hidden = document.getElementById('param-time');
            if (hidden) hidden.value = input.value;
          }
          syncOpenTrackButton();
        };
        if (typeof input.addEventListener === 'function') {
          input.addEventListener('input', handler);
        } else {
          input.oninput = handler;
        }
      });
    syncOpenTrackButton();

    const nextBtn = document.getElementById('btn-go-to-step-4');
    if (nextBtn) {
      nextBtn.onclick = () => {
        this.polya.markStepComplete(3);
        this.polya.nextStep();
      };
    }
  }

  executeSimulationRun() {
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const task = this.taskConfig;

    if (!this.sim) {
      const status = document.getElementById('sim-status-box');
      if (status) status.innerText = t('track_loading_3d');
      return;
    }

    // The track may only run with the values explicitly submitted from Step 3.
    const speed = this.studentInputs.step3.speed;
    const time = this.studentInputs.step3.time;

    if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(time) || time <= 0) {
      if (window.LogEngine) {
        window.LogEngine.logEvent('INPUT_VALIDATION_FAILED', 'Simulation parameters were not valid', {
          step: 3,
          validSpeed: Number.isFinite(speed) && speed > 0,
          validTime: Number.isFinite(time) && time > 0
        });
      }
      const runBtn = document.getElementById('btn-track-run-robot');
      const rerunBtn = document.getElementById('btn-track-rerun');
      const contBtn = document.getElementById('btn-track-go-step4');
      const status = document.getElementById('sim-status-box');
      const result = document.getElementById('track-result-card');
      this.lastRunResult = null;
      if (runBtn) runBtn.disabled = true;
      if (rerunBtn) rerunBtn.classList.add('hidden');
      if (contBtn) contBtn.classList.add('hidden');
      if (result) {
        result.className = 'track-result-card hidden';
        result.innerHTML = '';
      }
      if (status) {
        status.classList.add('is-error');
        status.innerText = t('s3_val_error');
      }
      return;
    }

    this.attemptCount++;
    this.lastRunResult = null;
    this.studentInputs.step3 = { speed, time };

    // Update readout displays immediately
    const speedDisp = document.getElementById('disp-speed');
    const timeDisp = document.getElementById('disp-time');
    const distDisp = document.getElementById('disp-dist');
    if (speedDisp) speedDisp.innerText = `${speed.toFixed(1)} ${task.speedUnit}`;
    if (timeDisp) timeDisp.innerText = `0.0 ${task.timeUnit}`;
    if (distDisp) distDisp.innerText = `0.0 ${task.unit}`;

    // Disable run button while running
    const runBtn = document.getElementById('btn-track-run-robot');
    const rerunBtn = document.getElementById('btn-track-rerun');
    const contBtn = document.getElementById('btn-track-go-step4');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.innerText = t('track_btn_running');
    }
    if (rerunBtn) rerunBtn.classList.add('hidden');
    if (contBtn) contBtn.classList.add('hidden');

    const statusBox = document.getElementById('sim-status-box');
    if (statusBox) {
      statusBox.classList.remove('is-error');
      statusBox.innerText = t('track_status_running', {
        speed: speed.toFixed(1),
        speedUnit: task.speedUnit,
        time: time.toFixed(1),
        timeUnit: task.timeUnit
      });
    }

    const resultCard = document.getElementById('track-result-card');
    if (resultCard) resultCard.classList.add('hidden');

    // Log PS6 (Set Robot Parameters)
    if (window.LogEngine) {
      window.LogEngine.logEvent('PS6', 'Set robot parameters', {
        attempt: this.attemptCount,
        speed,
        time,
        expectedDistance: speed * time,
        targetDistance: task.targetDistance
      });
    }

    // Configure simulation robot
    this.sim.reset();
    const bot = this.sim.robots[0];
    if (bot) {
      bot.velocity = speed;
      bot.target = speed * time;
    }

    // Robot finish handler (set before start to avoid a first-frame race)
    this.sim.onFinish = () => {
      const finalDist = Number((speed * time).toFixed(1));
      const targetDist = task.targetDistance;
      const discrepancy = Number((finalDist - targetDist).toFixed(1));
      const isMatch = Math.abs(discrepancy) < 0.01;

      this.lastRunResult = {
        speed,
        time,
        finalDist,
        targetDist,
        discrepancy,
        isMatch
      };
      this.renderTrackResult(this.lastRunResult, true);

      // Audio & Mascot Feedback
      if (isMatch) {
        if (window.SoundFX) window.SoundFX.playVictory();
        if (this.sim && typeof this.sim.celebrate === 'function') this.sim.celebrate();
        const sparkyBubble = document.getElementById('sparky-bubble');
        if (sparkyBubble) sparkyBubble.innerText = t('sparky_victory');
      } else {
        if (window.SoundFX) window.SoundFX.playOops();
        const sparkyBubble = document.getElementById('sparky-bubble');
        if (sparkyBubble) sparkyBubble.innerText = t('sparky_oops');
      }

      // Log PS7 (Execution Result)
      if (window.LogEngine) {
        window.LogEngine.logEvent('PS7', 'Execution observation result', {
          attempt: this.attemptCount,
          actualDistance: finalDist,
          targetDistance: targetDist,
          discrepancy,
          meetsRequirement: isMatch
        });
      }
    };

    // Start after onFinish is installed (works for 2D and 3D renderers).
    this.sim.start();
  }

  // =========================================================================
  // STEP 4: LOOK BACK & VERIFY (PS8 - PS11)
  // =========================================================================
  renderStep4(container) {
    const s4 = this.taskConfig.step4;
    const task = this.taskConfig;
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;

    const speed = this.studentInputs.step3.speed;
    const time = this.studentInputs.step3.time;
    const hasValidParameters = Number.isFinite(speed) && speed > 0 && Number.isFinite(time) && time > 0;
    const lastDist = hasValidParameters ? Number((speed * time).toFixed(1)) : 0;
    const isSuccess = hasValidParameters && Math.abs(lastDist - task.targetDistance) < 0.01;

    container.innerHTML = `
      <div class="step-view animate-fade-in">
        <!-- Question PS8: Check Result without spoiler banner -->
        <div class="lookback-q-box">
          <label class="field-label">
            <strong>${s4.checkQuestionEn}</strong>
            ${isVi ? `<div class="text-muted small">${s4.checkQuestionVi}</div>` : ''}
          </label>
          <div class="binary-choice-group">
            <button type="button" class="btn-choice ${this.studentInputs.step4.checkResult === 'yes' ? 'selected' : ''}" id="btn-check-yes" ${hasValidParameters ? '' : 'disabled'}>
              ${t('s4_btn_yes', { target: task.targetDistance })}
            </button>
            <button type="button" class="btn-choice ${this.studentInputs.step4.checkResult === 'no' ? 'selected' : ''}" id="btn-check-no" ${hasValidParameters ? '' : 'disabled'}>
              ${t('s4_btn_no', { target: task.targetDistance })}
            </button>
          </div>
        </div>

        <!-- Sub-flow depending on Yes / No -->
        <div class="step-error-box hidden" id="s4-error-box" role="alert"></div>
        <div id="lookback-subflow">
          <!-- Rendered dynamically below -->
        </div>

        <div class="step-actions">
          <button type="button" class="btn-secondary" id="btn-back-step-3">${t('s4_btn_back')}</button>
          <button type="button" class="btn-secondary btn-view-track" id="btn-view-track-s4">${t('track_view_track_btn')}</button>
          <div id="step-4-finish-action"></div>
        </div>
      </div>
    `;

    document.getElementById('btn-back-step-3').onclick = () => {
      this.polya.allowRerun();
      this.studentInputs.step4 = {};
      this.polya.prevStep();
    };
    const viewTrackBtn = document.getElementById('btn-view-track-s4');
    if (viewTrackBtn) viewTrackBtn.onclick = () => this.openTrackView('step4');
    document.getElementById('btn-check-yes').onclick = () => {
      if (isSuccess) {
        this.handlePS8Choice('yes');
      } else {
        // Robot did not reach destination; guide student to observe ruler without giving away numeric calculation
        if (window.LogEngine) {
          window.LogEngine.logEvent('PS8', 'Initial observation evaluation', {
            response: 'yes',
            accurate: false,
            actualDistance: lastDist,
            targetDistance: task.targetDistance
          });
        }
        document.getElementById('btn-check-yes')?.classList.remove('selected');
        document.getElementById('btn-check-no')?.classList.remove('selected');
        const subflow = document.getElementById('lookback-subflow');
        if (subflow) {
          subflow.innerHTML = `
            <div class="observation-hint-box animate-fade-in">
              <span class="obs-icon">🧐</span>
              <div>
                <strong>${t('s4_obs_recheck', { actual: lastDist, target: task.targetDistance })}</strong>
              </div>
            </div>
          `;
        }
      }
    };

    document.getElementById('btn-check-no').onclick = () => {
      if (!isSuccess) {
        this.handlePS8Choice('no');
      } else {
        // Robot actually reached destination
        if (window.LogEngine) {
          const actualSpeed = this.studentInputs.step3.speed;
          const actualTime = this.studentInputs.step3.time;
          window.LogEngine.logEvent('PS8_RESPONSE', 'Student marked a successful run as not reaching the target', {
            response: 'no',
            accurate: false,
            actualDistance: Number((actualSpeed * actualTime).toFixed(1)),
            targetDistance: task.targetDistance
          });
        }
        document.getElementById('btn-check-yes')?.classList.remove('selected');
        document.getElementById('btn-check-no')?.classList.remove('selected');
        const subflow = document.getElementById('lookback-subflow');
        const isVi = window.I18N ? window.I18N.isVietnamese() : false;
        if (subflow) {
          subflow.innerHTML = `
            <div class="observation-hint-box animate-fade-in">
              <span class="obs-icon">🧐</span>
              <div>
                <strong>${isVi ? `Thước đo trên đường chạy cho thấy robot đã dừng đúng mốc ${task.targetDistance}m rồi đó! Hãy kiểm tra lại nhé!` : `The track ruler shows the robot landed right on the ${task.targetDistance}m marker! Please verify again!`}</strong>
              </div>
            </div>
          `;
        }
      }
    };

    // Only restore state if student previously made an active choice
    if (this.studentInputs.step4.checkResult) {
      this.handlePS8Choice(this.studentInputs.step4.checkResult, true);
    } else {
      // Clean initial state: prompt student to observe without pre-judging
      const subflow = document.getElementById('lookback-subflow');
      if (subflow) {
        subflow.innerHTML = `
          <div class="observation-prompt-card animate-fade-in">
            <span class="obs-icon">👀</span>
            <div>${t('s4_obs_prompt')}</div>
          </div>
        `;
      }
    }
  }

  handlePS8Choice(choice, isRepaint = false) {
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const observedSpeed = this.studentInputs.step3.speed;
    const observedTime = this.studentInputs.step3.time;
    if (!Number.isFinite(observedSpeed) || observedSpeed <= 0 || !Number.isFinite(observedTime) || observedTime <= 0) {
      const errorBox = document.getElementById('s4-error-box');
      if (errorBox) {
        errorBox.innerText = t('s3_val_error');
        errorBox.classList.remove('hidden');
      }
      return;
    }
    const errorBox = document.getElementById('s4-error-box');
    if (errorBox) errorBox.classList.add('hidden');

    this.studentInputs.step4.checkResult = choice;
    const observedDistance = Number((observedSpeed * observedTime).toFixed(1));
    const targetDistance = this.taskConfig.targetDistance;
    const reachedTarget = Math.abs(observedDistance - targetDistance) < 0.01;

    document.getElementById('btn-check-yes')?.classList.toggle('selected', choice === 'yes');
    document.getElementById('btn-check-no')?.classList.toggle('selected', choice === 'no');

    if (!isRepaint && window.LogEngine) {
      window.LogEngine.logEvent('PS8', 'Check result against requirements', {
        response: choice,
        meetsRequirement: choice === 'yes',
        accurate: (choice === 'yes') === reachedTarget,
        actualDistance: observedDistance,
        targetDistance
      });
    }

    const subflow = document.getElementById('lookback-subflow');
    const finishAction = document.getElementById('step-4-finish-action');
    const s4 = this.taskConfig.step4;

    if (choice === 'yes') {
      const isVi = window.I18N ? window.I18N.isVietnamese() : false;
      const mathProofHtml = s4.getMathProof
        ? s4.getMathProof(this.studentInputs, isVi)
        : `<strong>s = v × t</strong> = ${this.studentInputs.step3.speed} m/s × ${this.studentInputs.step3.time} s = <strong>${this.taskConfig.targetDistance} m</strong>`;

      subflow.innerHTML = `
        <div class="verified-box animate-fade-in">
          <div class="verified-icon">🏆</div>
          <div class="lookback-status-banner banner-success">${t('s4_banner_success')}</div>
          <h4>${t('s4_math_proof_title')}</h4>
          <p class="math-proof">
            ${mathProofHtml}
          </p>
          <div class="reflection-box">
            <label for="input-reflection" class="field-label">
              <strong>${s4.reflectionPromptEn}</strong>
              ${isVi ? `<div class="text-muted small">${s4.reflectionPromptVi}</div>` : ''}
            </label>
            <textarea id="input-reflection" class="input-textarea" rows="2" placeholder="${t('s4_refl_placeholder')}"></textarea>
          </div>
        </div>
      `;

      finishAction.innerHTML = `
        <button type="button" class="btn-primary btn-complete-task" id="btn-complete-mission">
          ${t('s4_btn_complete')}
        </button>
      `;

      const reflectionInput = document.getElementById('input-reflection');
      if (reflectionInput) {
        reflectionInput.value = this.studentInputs.step4.reflection || '';
        if (typeof reflectionInput.addEventListener === 'function') {
          reflectionInput.addEventListener('input', () => {
            this.studentInputs.step4.reflection = reflectionInput.value;
          });
        }
      }

      document.getElementById('btn-complete-mission').onclick = () => {
        const refl = document.getElementById('input-reflection')?.value || '';
        this.studentInputs.step4.reflection = refl;

        if (window.LogEngine) {
          window.LogEngine.logEvent('TASK_REFLECTION', 'Student reflection submitted', { reflection: refl });
          window.LogEngine.completeSession(true);
        }

        this.polya.markStepComplete(4);
        this.showMissionCompletedModal();
      };

    } else {
      // Diagnostic & Parameter Adjustment (PS9, PS10, PS11)
      const isVi = window.I18N ? window.I18N.isVietnamese() : false;
      subflow.innerHTML = `
        <div class="debug-cycle-card animate-fade-in">
          <div class="observation-confirm-box">
            <span class="obs-icon">👍</span>
            <div>
              <strong>${t('s4_obs_accurate')}</strong>
              <div class="text-muted small">${t('s4_obs_shortfall')}</div>
            </div>
          </div>

          <div class="debug-step-item">
            <span class="step-sub-badge">🔍</span>
            <label class="field-label">
              <strong>${s4.discrepancyQuestionEn}</strong>
              ${isVi ? `<div class="text-muted small">${s4.discrepancyQuestionVi}</div>` : ''}
            </label>
            <div class="options-radio-group">
              ${(s4.discrepancyOptions || []).map(opt => `
                <label class="radio-card ${this.studentInputs.step4.discrepancyId === opt.id ? 'selected' : ''}">
                  <input type="radio" name="ps9-disc" value="${opt.id}" ${this.studentInputs.step4.discrepancyId === opt.id ? 'checked' : ''} />
                  <span>${opt.label}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div class="debug-step-item">
            <span class="step-sub-badge">⚙️</span>
            <label class="field-label">
              <strong>${s4.diagnosisQuestionEn || 'Plan Adjustment'}</strong>
              ${isVi ? `<div class="text-muted small">${s4.diagnosisQuestionVi || 'Điều chỉnh phương án:'}</div>` : ''}
            </label>
            ${s4.diagnosisOptions ? `
              <div class="options-radio-group">
                ${s4.diagnosisOptions.map(opt => `
                  <label class="radio-card ${this.studentInputs.step4.diagnosisId === opt.id ? 'selected' : ''}">
                    <input type="radio" name="ps10-diag" value="${opt.id}" ${this.studentInputs.step4.diagnosisId === opt.id ? 'checked' : ''} />
                    <span>${opt.label}</span>
                  </label>
                `).join('')}
              </div>
            ` : ''}

            ${s4.adjustmentQuestionEn ? `
              <div class="adjustment-prompt" style="margin-top: 1rem; margin-bottom: 0.5rem;">
                <strong>${s4.adjustmentQuestionEn}</strong>
                ${isVi ? `<div class="text-muted small">${s4.adjustmentQuestionVi}</div>` : ''}
              </div>
            ` : ''}

            <div class="revision-input-row">
              <label for="input-revised-time">
                <strong>${s4.revisionPromptEn || 'New Time value for robot:'}</strong>
                ${isVi && s4.revisionPromptVi ? `<div class="text-muted small">${s4.revisionPromptVi}</div>` : ''}
              </label>
              <div class="input-with-unit">
                <input type="text" inputmode="decimal" id="input-revised-time" class="input-field" placeholder="" value="${this.studentInputs.step4.revisedTime || ''}" />
                <span class="unit-tag">${this.taskConfig.timeUnit}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      finishAction.innerHTML = `
        <button type="button" class="btn-action-run" id="btn-retry-ps11">
          ${t('s4_btn_retry')}
        </button>
      `;

      subflow.querySelectorAll('input[name="ps9-disc"]').forEach(r => {
        r.onchange = () => {
          subflow.querySelectorAll('input[name="ps9-disc"]').forEach(x => x.closest('.radio-card').classList.remove('selected'));
          r.closest('.radio-card').classList.add('selected');
        };
      });

      subflow.querySelectorAll('input[name="ps10-diag"]').forEach(r => {
        r.onchange = () => {
          subflow.querySelectorAll('input[name="ps10-diag"]').forEach(x => x.closest('.radio-card').classList.remove('selected'));
          r.closest('.radio-card').classList.add('selected');
        };
      });

      document.getElementById('btn-retry-ps11').onclick = () => {
        this.handlePS11Retry();
      };
    }
  }

  handlePS11Retry() {
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    const discId = document.querySelector('input[name="ps9-disc"]:checked')?.value;
    const diagId = document.querySelector('input[name="ps10-diag"]:checked')?.value;
    const rawRevised = (document.getElementById('input-revised-time')?.value || '').trim();
    const revisedVal = rawRevised ? Number(rawRevised.replace(',', '.')) : NaN;

    if (!Number.isFinite(revisedVal) || revisedVal <= 0) {
      const errorBox = document.getElementById('s4-error-box');
      if (errorBox) {
        errorBox.innerText = t('s4_input_error');
        errorBox.classList.remove('hidden');
      }
      return;
    }
    if (!discId || !diagId) {
      const errorBox = document.getElementById('s4-error-box');
      if (errorBox) {
        errorBox.innerText = t('s4_choice_error');
        errorBox.classList.remove('hidden');
      }
      return;
    }
    const errorBox = document.getElementById('s4-error-box');
    if (errorBox) errorBox.classList.add('hidden');

    this.studentInputs.step4.discrepancyId = discId;
    this.studentInputs.step4.diagnosisId = diagId;
    this.studentInputs.step4.revisedTime = revisedVal;

    // Log PS9 & PS10
    if (window.LogEngine) {
      window.LogEngine.logEvent('PS9', 'Error detection and discrepancy identification', {
        discrepancyId: discId
      });
      window.LogEngine.logEvent('PS10', 'Diagnosis and parameter revision', {
        diagnosisId: diagId,
        revisedTime: revisedVal
      });
    }

    // Update step 3 parameters with revised values
    this.studentInputs.step3.time = revisedVal;

    // Open dedicated track view and execute the simulation run live
    this.openTrackView('step4');
    this.executeSimulationRun();
  }

  showMissionCompletedModal() {
    let modal = document.getElementById('mission-completed-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mission-completed-modal';
      modal.className = 'modal-backdrop animate-fade-in active';
      document.body.appendChild(modal);
    }
    if (window.SoundFX) window.SoundFX.playVictory();
    const sparkyBubble = document.getElementById('sparky-bubble');
    if (sparkyBubble) {
      sparkyBubble.innerText = window.I18N && window.I18N.isVietnamese()
        ? "Tuyệt vời quá bạn ơi! Bạn vừa nhận được chiếc cúp hoàn thành nhiệm vụ rồi! 🏆🎉"
        : "Amazing job! You earned the Mission Champion Trophy! 🏆🎉";
    }

    const session = window.LogEngine?.currentSession;
    const totalEvents = session?.events?.length || 0;
    const attempts = session?.summary?.totalAttempts || 1;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;
    const lang = window.I18N ? window.I18N.currentLang : 'vi';
    const analysis = window.FeedbackEngine?.analyzeSession(session, lang);
    const nextChallenge = analysis?.nextChallenge || {
      title: isVi ? 'Chọn nhiệm vụ tiếp theo' : 'Choose your next mission',
      subtitle: '',
      description: '',
      actionText: isVi ? 'Về danh sách nhiệm vụ' : 'Return to missions'
    };
    const practiceRecommendations = (analysis?.practiceRecommendations || []).slice(0, 2);

    modal.innerHTML = `
      <div class="modal-card completion-card animate-scale-up" style="position: relative;">
        <button type="button" class="btn-close-modal completion-close-btn" id="btn-close-completion" aria-label="Close">✕</button>
        <div class="completion-header">
          <div class="completion-trophy">🏆</div>
          <h2 class="completion-title">${isVi ? 'Hoàn Thành Xuất Sắc!' : 'Mission Accomplished!'}</h2>
          <p class="completion-sub">${isVi ? 'Bạn đã giải quyết vấn đề thành công và kiểm chứng chính xác trên robot!' : 'You solved the problem and verified the result with the robot!'}</p>
        </div>

        <div class="completion-stats-grid">
          <div class="stat-card">
            <span class="stat-num">${attempts}</span>
            <span class="stat-lbl">${isVi ? 'Lần thử nghiệm' : 'Total Attempts'}</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">${totalEvents}</span>
            <span class="stat-lbl">${isVi ? 'Hành động học tập' : 'Learning Activities'}</span>
          </div>
          <div class="stat-card">
            <span class="stat-num">✓</span>
            <span class="stat-lbl">${isVi ? 'Nhiệm vụ hoàn thành' : 'Mission Complete'}</span>
          </div>
        </div>

        <div class="completion-guidance">
          <section class="completion-next-card">
            <span class="completion-guidance-label">${isVi ? 'CHẶNG TIẾP THEO' : 'NEXT MISSION'}</span>
            <h3>${nextChallenge.title}</h3>
            <p class="completion-next-subtitle">${nextChallenge.subtitle}</p>
            <p>${nextChallenge.description}</p>
          </section>
          <section class="completion-practice-card">
            <div class="completion-practice-heading">
              <span>✨</span>
              <h3>${isVi ? 'Luyện thêm' : 'Practice next'}</h3>
            </div>
            <div class="completion-practice-list">
              ${practiceRecommendations.map(item => `
                <div class="completion-practice-item">
                  <span aria-hidden="true">${item.icon}</span>
                  <div><strong>${item.title}</strong><small>${item.description}</small></div>
                </div>
              `).join('')}
            </div>
          </section>
        </div>

        <div class="completion-actions">
          <button type="button" class="btn-primary btn-feedback-hero" id="btn-view-feedback">
            📋 ${isVi ? 'Xem Nhận Xét Đánh Giá (View Feedback) ➔' : 'View Process Feedback ➔'}
          </button>
          <div class="completion-sub-actions">
            <button type="button" class="btn-secondary" id="btn-view-journal">
              📒 ${isVi ? 'Xem nhật ký' : 'View journal'}
            </button>
            <button type="button" class="btn-secondary" id="btn-next-mission">
              ${nextChallenge.actionText}
            </button>
          </div>
        </div>
      </div>
    `;

    modal.classList.add('active');
    modal.style.display = 'flex';
    document.getElementById('btn-open-feedback')?.classList.remove('hidden');

    const closeCompletion = () => {
      modal.classList.remove('active');
      modal.style.display = 'none';
    };

    const compCloseBtn = document.getElementById('btn-close-completion');
    if (compCloseBtn) compCloseBtn.onclick = closeCompletion;

    modal.onclick = (e) => {
      if (e.target === modal) closeCompletion();
    };

    document.getElementById('btn-view-feedback').onclick = () => {
      closeCompletion();
      if (window.FeedbackEngine) {
        window.FeedbackEngine.showModal(session);
      }
    };

    document.getElementById('btn-view-journal').onclick = () => {
      closeCompletion();
      window.LogEngine?.openJournal(session?.sessionId || null);
    };

    document.getElementById('btn-next-mission').onclick = () => {
      closeCompletion();
      let nextTaskId = 'task2-fix';
      if (this.taskConfig && this.taskConfig.id === 'task1-reach') nextTaskId = 'task2-fix';
      else if (this.taskConfig && this.taskConfig.id === 'task2-fix') nextTaskId = 'task3-new';
      else nextTaskId = 'hub';

      if (nextTaskId === 'hub') {
        window.App.renderTaskSelection();
      } else {
        window.App.navigateToTask(nextTaskId);
      }
    };
  }
}

window.TaskEngine = TaskEngine;
