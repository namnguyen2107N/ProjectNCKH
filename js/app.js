/**
 * ROBOT MATH LAB - APPLICATION CONTROLLER & ROUTER
 * Orchestrates Mandatory Start Screen, Mission Hub, Robot Mascot, and Task Workspace.
 */

class AppController {
  constructor() {
    this.selectedLanguage = localStorage.getItem('rml_language') || localStorage.getItem('rml_ui_language') || (window.I18N ? window.I18N.currentLang : 'vi');
    this.currentStudent = localStorage.getItem('rml_student_name') || (this.selectedLanguage === 'vi' ? 'Bé Yêu Toán' : 'Math Explorer');
    this.currentAge = Number.parseInt(localStorage.getItem('rml_student_age') || '', 10) || null;
    this.taskEngine = null;
    this.activeTaskId = null;
    this.splashScreen = null;
    this.init();
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  init() {
    // 1. Initialize retro pixel art splash screen
    this.initSplashScreen();

    // 2. Ensure task engine instance
    this.taskEngine = new TaskEngine('main-view');

    // 3. Update header student badge on startup
    const badge = document.getElementById('header-student-name');
    if (badge) badge.innerText = this.currentStudent;

    // 4. Initialize Settings Modal
    this.initSettingsModal();

    // 5. Listen to I18N language changes
    window.addEventListener('languageChanged', (e) => {
      this.handleLanguageChanged(e.detail.lang);
    });

    // 6. Hash-based router
    window.addEventListener('hashchange', () => this.handleRoute());

    // 7. Initial access: ALWAYS show Start Screen first when accessing the website!
    const currentHash = window.location.hash;
    const isTask = currentHash && currentHash.startsWith('#task/');
    if (!isTask) {
      window.location.hash = '#start';
      this.renderStartScreen();
    } else {
      this.handleRoute();
    }

    // 8. Brand Logo click: Return to Start Screen
    const brandLink = document.getElementById('brand-home-link');
    if (brandLink) {
      brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.taskEngine && this.taskEngine.sim) {
          try { this.taskEngine.sim.destroy(); } catch (_) {}
        }
        if (window.SoundFX) window.SoundFX.playPop();
        if (window.location.hash === '#start') {
          this.renderStartScreen();
        } else {
          window.location.hash = '#start';
        }
      });
    }
  }

  handleLanguageChanged(lang) {
    this.selectedLanguage = lang;
    localStorage.setItem('rml_language', lang);
    localStorage.setItem('rml_ui_language', lang);

    // Update student name fallback if using standard defaults
    if (this.currentStudent === 'Math Explorer' && lang === 'vi') {
      this.setStudentName('Bé Yêu Toán');
    } else if (this.currentStudent === 'Bé Yêu Toán' && lang === 'en') {
      this.setStudentName('Math Explorer');
    }

    this.syncSettingsModalContent();

    const hash = window.location.hash || '#hub';
    if (hash === '#start' || hash === '#welcome') {
      this.renderStartScreen();
    } else if (hash.startsWith('#task/')) {
      if (this.taskEngine) this.taskEngine.updateLanguage();
    } else {
      this.renderTaskHub();
    }
  }

  handleRoute() {
    const hash = window.location.hash || '#start';

    if (hash === '#start' || hash === '#welcome') {
      this.activeTaskId = null;
      this.renderStartScreen();
    } else if (hash.startsWith('#task/')) {
      this.hideSplashScreen();
      const taskId = hash.replace('#task/', '');
      this.launchTask(taskId);
    } else {
      this.hideSplashScreen();
      this.activeTaskId = null;
      this.renderTaskHub();
    }
  }

  setStudentName(name) {
    if (!name || !name.trim()) return;
    this.currentStudent = name.trim();
    localStorage.setItem('rml_student_name', this.currentStudent);
    const badge = document.getElementById('header-student-name');
    if (badge) badge.innerText = this.currentStudent;
    const hubBadge = document.querySelector('.hub-student-badge-wrap .badge-name');
    if (hubBadge) hubBadge.innerText = `${this.currentStudent} ✏️`;
    const splashInput = document.getElementById('splash-student-name');
    if (splashInput) splashInput.value = this.currentStudent;
    const settingsInput = document.getElementById('settings-input-name');
    if (settingsInput && settingsInput !== document.activeElement) settingsInput.value = this.currentStudent;
  }

  // =========================================================================
  // SETTINGS & STUDENT PROFILE MODAL CONTROLLER
  // =========================================================================
  initSettingsModal() {
    const btnToggleSettings = document.getElementById('btn-toggle-settings');
    if (btnToggleSettings) {
      btnToggleSettings.addEventListener('click', () => this.openSettingsModal());
    }

    const studentTag = document.getElementById('header-student-tag');
    if (studentTag) {
      studentTag.addEventListener('click', () => this.openSettingsModal());
    }

    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => this.closeSettingsModal());
    }

    const btnDone = document.getElementById('btn-settings-done');
    if (btnDone) {
      btnDone.addEventListener('click', () => this.closeSettingsModal());
    }

    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeSettingsModal();
      });
    }

    // Name input save inside settings modal
    const btnSaveName = document.getElementById('btn-save-settings-name');
    const inputName = document.getElementById('settings-input-name');
    if (btnSaveName && inputName) {
      const nameError = document.getElementById('settings-name-error');
      const doSave = async () => {
        if (btnSaveName.disabled) return;
        const t = (key) => window.I18N ? window.I18N.t(key) : key;
        const val = inputName.value.trim();
        if (!val) {
          if (nameError) {
            nameError.textContent = t('settings_name_required');
            nameError.hidden = false;
          }
          inputName.focus();
          return;
        }

        if (nameError) nameError.hidden = true;
        btnSaveName.disabled = true;
        btnSaveName.innerText = '…';
        try {
          localStorage.setItem('rml_student_name', val);
          this.setStudentName(val);
          if (window.SoundFX) window.SoundFX.playTing();
          btnSaveName.innerText = '✓';
          setTimeout(() => {
            btnSaveName.innerText = t('settings_name_save');
          }, 1200);
        } catch (error) {
          if (nameError) {
            nameError.textContent = error?.message || t('settings_name_save_failed');
            nameError.hidden = false;
          }
          btnSaveName.innerText = t('settings_name_save');
          if (window.SoundFX) window.SoundFX.playOops();
        } finally {
          btnSaveName.disabled = false;
        }
      };
      btnSaveName.addEventListener('click', doSave);
      inputName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSave();
      });
    }

    // Language pills inside modal
    const modalLangEn = document.getElementById('btn-settings-lang-en');
    const modalLangVi = document.getElementById('btn-settings-lang-vi');
    if (modalLangEn) {
      modalLangEn.addEventListener('click', () => {
        if (window.I18N) window.I18N.setLang('en');
        this.syncSettingsModalContent();
      });
    }
    if (modalLangVi) {
      modalLangVi.addEventListener('click', () => {
        if (window.I18N) window.I18N.setLang('vi');
        this.syncSettingsModalContent();
      });
    }

    // Sound toggle inside modal
    const modalSoundBtn = document.getElementById('btn-settings-sound-toggle');
    if (modalSoundBtn) {
      modalSoundBtn.addEventListener('click', () => {
        if (window.SoundFX) {
          window.SoundFX.toggleMute();
          this.syncSettingsModalContent();
        }
      });
    }

    // Fullscreen toggle inside modal
    const modalFsBtn = document.getElementById('btn-settings-fs-toggle');
    if (modalFsBtn) {
      modalFsBtn.addEventListener('click', () => {
        if (window.SoundFX) window.SoundFX.playPop();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
        }
        setTimeout(() => this.syncSettingsModalContent(), 120);
      });
    }


    // Escape key listener to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal && settingsModal.classList.contains('active')) {
          this.closeSettingsModal();
        }
      }
    });
  }

  openSettingsModal() {
    if (window.SoundFX) window.SoundFX.playPop();
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    const inputName = document.getElementById('settings-input-name');
    if (inputName) inputName.value = this.currentStudent;
    const nameError = document.getElementById('settings-name-error');
    if (nameError) nameError.hidden = true;

    this.syncSettingsModalContent();

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('active'));
    document.body.style.overflow = 'hidden';

    const btnSettings = document.getElementById('btn-toggle-settings');
    if (btnSettings) btnSettings.setAttribute('aria-expanded', 'true');
  }

  closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }, 200);

    const btnSettings = document.getElementById('btn-toggle-settings');
    if (btnSettings) btnSettings.setAttribute('aria-expanded', 'false');
  }

  syncSettingsModalContent() {
    const t = (key) => window.I18N ? window.I18N.t(key) : key;
    const isVi = window.I18N ? window.I18N.isVietnamese() : false;

    const titleEl = document.getElementById('settings-modal-title');
    if (titleEl) titleEl.innerText = t('settings_modal_title');
    const subEl = document.getElementById('settings-modal-subtitle');
    if (subEl) subEl.innerText = t('settings_modal_subtitle');

    const lblName = document.getElementById('lbl-settings-name');
    if (lblName) lblName.innerText = t('settings_name_label');
    const hintName = document.getElementById('hint-settings-name');
    if (hintName) hintName.innerText = t('settings_name_hint');
    const btnSaveName = document.getElementById('btn-save-settings-name');
    if (btnSaveName && btnSaveName.innerText !== '✓') btnSaveName.innerText = t('settings_name_save');
    const nameError = document.getElementById('settings-name-error');
    if (nameError) nameError.hidden = true;

    const lblLang = document.getElementById('lbl-settings-lang');
    if (lblLang) lblLang.innerText = t('settings_lang_label');
    const hintLang = document.getElementById('hint-settings-lang');
    if (hintLang) hintLang.innerText = t('settings_lang_hint');

    const btnLangEn = document.getElementById('btn-settings-lang-en');
    const btnLangVi = document.getElementById('btn-settings-lang-vi');
    if (btnLangEn) btnLangEn.classList.toggle('active', !isVi);
    if (btnLangVi) btnLangVi.classList.toggle('active', isVi);

    const lblSound = document.getElementById('lbl-settings-sound');
    if (lblSound) lblSound.innerText = t('settings_sound_label');
    const hintSound = document.getElementById('hint-settings-sound');
    if (hintSound) hintSound.innerText = t('settings_sound_hint');

    const isMuted = window.SoundFX ? window.SoundFX.isMuted : false;
    const soundIcon = document.getElementById('settings-sound-status-icon');
    if (soundIcon) soundIcon.innerText = isMuted ? '🔇' : '🔊';
    const soundText = document.getElementById('settings-sound-status-text');
    if (soundText) soundText.innerText = isMuted ? (isVi ? 'Đang tắt tiếng' : 'Muted') : (isVi ? 'Đang bật' : 'Sound On');

    const lblFs = document.getElementById('lbl-settings-fs');
    if (lblFs) lblFs.innerText = t('settings_fs_label');
    const hintFs = document.getElementById('hint-settings-fs');
    if (hintFs) hintFs.innerText = t('settings_fs_hint');

    const isFs = !!document.fullscreenElement;
    const fsIcon = document.getElementById('settings-fs-status-icon');
    if (fsIcon) fsIcon.innerText = isFs ? '⤢' : '⛶';
    const fsText = document.getElementById('settings-fs-status-text');
    if (fsText) fsText.innerText = isFs ? (isVi ? 'Thu nhỏ' : 'Windowed') : (isVi ? 'Toàn màn hình' : 'Fullscreen');



    const btnDone = document.getElementById('btn-settings-done');
    if (btnDone) btnDone.innerText = t('settings_done_btn');
  }

  // =========================================================================
  // RETRO PIXEL ART SPLASH SCREEN CONTROLLER
  // =========================================================================
  initSplashScreen() {
    this.splashScreen = document.getElementById('splash-screen');
    if (!this.splashScreen) return;

    // Synchronize initial language from stored state without audio blip
    const savedLang = localStorage.getItem('rml_language') || localStorage.getItem('rml_ui_language') || (window.I18N ? window.I18N.currentLang : 'vi');
    this.selectSplashLanguage(savedLang, false);

    // Language options: 1 PLAYER (vi) and 2 PLAYERS (en)
    const langOptions = this.splashScreen.querySelectorAll('.lang-option');
    langOptions.forEach(opt => {
      const chooseOption = () => {
        const lang = opt.getAttribute('data-lang');
        this.selectSplashLanguage(lang, true);
      };
      opt.addEventListener('click', chooseOption);
      opt.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          this.selectSplashLanguage('vi', true);
          const viOpt = this.splashScreen.querySelector('.lang-option[data-lang="vi"]');
          if (viOpt) viOpt.focus();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          this.selectSplashLanguage('en', true);
          const enOpt = this.splashScreen.querySelector('.lang-option[data-lang="en"]');
          if (enOpt) enOpt.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          chooseOption();
        }
      });
    });

    // START Button
    const startBtn = document.getElementById('btn-splash-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.completeStartScreen();
      });
    }

    // Interactive Robot Mascot: Welcoming Dialogue Board (Logic & Aesthetics)
    const robotEl = document.getElementById('splash-robot');
    const welcomeBoard = document.getElementById('splash-welcome-board');
    const robotWrapper = robotEl?.closest?.('.splash-robot-wrapper') || document.querySelector('.splash-robot-wrapper');
    const closeWelcomeBtn = document.getElementById('btn-close-splash-welcome');
    const exploreWelcomeBtn = document.getElementById('btn-welcome-explore');

    if (robotEl) {
      const toggleWelcomeBoard = (e) => {
        if (e) e.stopPropagation();
        if (window.SoundFX) window.SoundFX.playRetroSelect();
        robotEl.classList.add('sparky-jump');
        setTimeout(() => robotEl.classList.remove('sparky-jump'), 600);

        if (welcomeBoard) {
          const isHidden = welcomeBoard.classList.contains('hidden');
          if (isHidden) {
            this.updateWelcomeBoardContent();
            welcomeBoard.classList.remove('hidden');
            welcomeBoard.classList.add('animate-welcome-pop');
            robotWrapper?.classList.add('has-welcome-open');
            robotEl.setAttribute('aria-expanded', 'true');
          } else {
            // Pulse/wiggle to acknowledge re-click
            welcomeBoard.classList.remove('animate-welcome-pop');
            void welcomeBoard.offsetWidth; // trigger reflow
            welcomeBoard.classList.add('animate-welcome-pop');
          }
        }
      };

      robotEl.addEventListener('click', toggleWelcomeBoard);
      robotEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleWelcomeBoard(e);
        }
      });
    }

    if (closeWelcomeBtn && welcomeBoard) {
      closeWelcomeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.SoundFX) window.SoundFX.playPop();
        welcomeBoard.classList.add('hidden');
        robotWrapper?.classList.remove('has-welcome-open');
        if (robotEl) robotEl.setAttribute('aria-expanded', 'false');
      });
    }

    if (exploreWelcomeBtn) {
      exploreWelcomeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (welcomeBoard) welcomeBoard.classList.add('hidden');
        robotWrapper?.classList.remove('has-welcome-open');
        this.completeStartScreen();
      });
    }

    // Dismiss welcome board when clicking outside or pressing Escape
    document.addEventListener('click', (e) => {
      if (welcomeBoard && !welcomeBoard.classList.contains('hidden')) {
        if (!welcomeBoard.contains(e.target) && !robotEl?.contains(e.target)) {
          welcomeBoard.classList.add('hidden');
          robotWrapper?.classList.remove('has-welcome-open');
          if (robotEl) robotEl.setAttribute('aria-expanded', 'false');
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && welcomeBoard && !welcomeBoard.classList.contains('hidden')) {
        welcomeBoard.classList.add('hidden');
        robotWrapper?.classList.remove('has-welcome-open');
        if (robotEl) robotEl.setAttribute('aria-expanded', 'false');
      }
    });

    // Splash Sound toggle button
    const splashSoundBtn = document.getElementById('btn-splash-sound');
    if (splashSoundBtn) {
      splashSoundBtn.addEventListener('click', () => {
        if (window.SoundFX) {
          const isMuted = window.SoundFX.toggleMute();
          const icon = document.getElementById('splash-sound-icon');
          if (icon) icon.innerText = isMuted ? '🔇' : '🔊';
        }
      });
    }

    // Student Name Input
    const nameInput = document.getElementById('splash-student-name');
    if (nameInput) {
      nameInput.value = this.currentStudent;
      nameInput.addEventListener('input', (e) => this.setStudentName(e.target.value));
      nameInput.addEventListener('change', (e) => this.setStudentName(e.target.value));
    }

    // Student Age Input (light sign-in, used for the research profile)
    const ageInput = document.getElementById('splash-student-age');
    if (ageInput) {
      if (this.currentAge) ageInput.value = String(this.currentAge);
      const saveAge = (e) => {
        const age = Number.parseInt(String(e.target.value || ''), 10);
        if (Number.isInteger(age) && age >= 3 && age <= 18) {
          this.currentAge = age;
          localStorage.setItem('rml_student_age', String(age));
        }
      };
      ageInput.addEventListener('input', saveAge);
      ageInput.addEventListener('change', saveAge);
    }

    // Keyboard navigation (Strictly Arrow Left/Right or A/D to switch language, Enter to start)
    document.addEventListener('keydown', (e) => {
      if (!this.splashScreen || this.splashScreen.classList.contains('hidden')) return;

      // When typing in the name/age inputs, Enter triggers start; other keys type normally.
      if (document.activeElement === nameInput || document.activeElement === ageInput) {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.completeStartScreen();
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        this.selectSplashLanguage('vi', true);
        const viOpt = this.splashScreen.querySelector('.lang-option[data-lang="vi"]');
        if (viOpt) viOpt.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        this.selectSplashLanguage('en', true);
        const enOpt = this.splashScreen.querySelector('.lang-option[data-lang="en"]');
        if (enOpt) enOpt.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.completeStartScreen();
      }
    });
  }

  selectSplashLanguage(lang, playSound = true) {
    if (lang !== 'vi' && lang !== 'en') return;
    this.selectedLanguage = lang;

    if (window.I18N) {
      window.I18N.setLang(lang);
    }
    if (playSound && window.SoundFX) {
      window.SoundFX.playRetroSelect();
    }

    if (this.splashScreen) {
      this.splashScreen.querySelectorAll('.lang-option').forEach(opt => {
        const isMatch = opt.getAttribute('data-lang') === lang;
        opt.classList.toggle('active', isMatch);
        opt.setAttribute('aria-checked', isMatch ? 'true' : 'false');
      });

      const eyebrow = document.getElementById('splash-eyebrow');
      if (eyebrow) {
        eyebrow.innerText = lang === 'vi' ? '★ TOÁN CHUYỂN ĐỘNG & ROBOT ★' : '★ MOTION MATH & ROBOTS ★';
      }

      const subtitle = document.getElementById('splash-subtitle');
      if (subtitle) {
        subtitle.innerText = lang === 'vi' ? 'TOÁN CHUYỂN ĐỘNG' : 'MOTION MATH';
      }

      const nameLabel = document.getElementById('splash-name-label');
      if (nameLabel) {
        nameLabel.innerText = lang === 'vi' ? '🧑‍🎓 TÊN BẠN:' : '🧑‍🎓 YOUR NAME:';
      }
      const ageLabel = document.getElementById('splash-age-label');
      if (ageLabel) {
        ageLabel.innerText = lang === 'vi' ? '🎂 TUỔI:' : '🎂 AGE:';
      }

      // Update input placeholders and default student name
      const nameInput = document.getElementById('splash-student-name');
      if (nameInput) {
        if (lang === 'vi') {
          nameInput.placeholder = 'Nhập tên của bạn...';
          if (this.currentStudent === 'Math Explorer') this.setStudentName('Bé Yêu Toán');
        } else {
          nameInput.placeholder = 'Enter your name...';
          if (this.currentStudent === 'Bé Yêu Toán') this.setStudentName('Math Explorer');
        }
        nameInput.value = this.currentStudent;
      }
      const ageInput = document.getElementById('splash-student-age');
      if (ageInput) ageInput.placeholder = lang === 'vi' ? 'Ví dụ: 10' : 'e.g. 10';

      // Update welcome board text dynamically if rendered/open
      this.updateWelcomeBoardContent(lang);
    }
  }

  updateWelcomeBoardContent(lang) {
    const isVi = (lang ? lang === 'vi' : (window.I18N ? window.I18N.isVietnamese() : this.selectedLanguage !== 'en'));
    const badge = document.getElementById('welcome-badge-text');
    const title = document.getElementById('welcome-board-title');
    const desc = document.getElementById('welcome-board-desc');
    const tip = document.getElementById('welcome-tip-text');
    const act = document.getElementById('welcome-action-text');
    const chipMath = document.getElementById('chip-math-text');
    const chipSim = document.getElementById('chip-sim-text');
    const chipStem = document.getElementById('chip-stem-text');
    const closeBtn = document.getElementById('btn-close-splash-welcome');

    if (badge) badge.innerText = isVi ? 'LỜI CHÀO TỪ SPARKY' : "SPARKY'S GREETING";
    if (title) title.innerText = isVi ? 'CHÀO MỪNG BẠN ĐẾN VỚI ROBOT MATH LAB! 🚀✨' : 'WELCOME TO ROBOT MATH LAB! 🚀✨';
    if (desc) {
      desc.innerHTML = isVi
        ? 'Xin chào nhà thám hiểm nhí! Hãy cùng <strong>Sparky</strong> khám phá thế giới Toán học và Lập trình chuyển động rô-bốt đầy kỳ thú. Hãy chọn ngôn ngữ, nhập tên và sẵn sàng chinh phục các nhiệm vụ nhé!'
        : 'Hello young explorer! Join <strong>Sparky</strong> to discover the exciting world of Math & Robotics simulation. Choose your language, enter your name, and get ready to conquer fun missions!';
    }
    if (chipMath) chipMath.innerText = isVi ? '📐 Toán chuyển động' : '📐 Motion Math';
    if (chipSim) chipSim.innerText = isVi ? '🤖 Đường chạy thực tế' : '🤖 Live Robot Track';
    if (chipStem) chipStem.innerText = isVi ? '🏆 Chiến binh STEM' : '🏆 STEM Champion';
    if (tip) tip.innerHTML = isVi ? '💡 Nhấn <strong>START</strong> để bắt đầu ngay!' : '💡 Click <strong>START</strong> to begin right away!';
    if (act) act.innerText = isVi ? 'Khám phá ngay' : 'Explore Now';
    if (closeBtn) closeBtn.title = isVi ? 'Đóng lời chào' : 'Close greeting';
  }

  showSplashScreen() {
    document.body.classList.add('view-start-screen');
    if (!this.splashScreen) {
      this.splashScreen = document.getElementById('splash-screen');
    }
    if (this.splashScreen) {
      this.splashScreen.classList.remove('hidden', 'splash-exit');
      const curr = window.I18N ? window.I18N.currentLang : (this.selectedLanguage || 'vi');
      this.selectSplashLanguage(curr, false);

      const nameInput = document.getElementById('splash-student-name');
      if (nameInput) nameInput.value = this.currentStudent;
      const ageInput = document.getElementById('splash-student-age');
      if (ageInput && this.currentAge) ageInput.value = String(this.currentAge);

      const soundIcon = document.getElementById('splash-sound-icon');
      if (soundIcon && window.SoundFX) {
        soundIcon.innerText = window.SoundFX.isMuted ? '🔇' : '🔊';
      }
    }
  }

  hideSplashScreen() {
    document.body.classList.remove('view-start-screen');
    if (this.splashScreen) {
      this.splashScreen.classList.add('hidden');
    }
  }

  renderStartScreen() {
    this.showSplashScreen();
  }

  completeStartScreen() {
    const isVi = window.I18N ? window.I18N.isVietnamese() : true;
    const nameInput = document.getElementById('splash-student-name');
    const ageInput = document.getElementById('splash-student-age');
    const errorBox = document.getElementById('splash-profile-error');
    const name = String(nameInput?.value || this.currentStudent || '').trim();
    const age = Number.parseInt(String(ageInput?.value || ''), 10);

    const showError = (message, focusEl) => {
      if (errorBox) {
        errorBox.textContent = message;
        errorBox.hidden = false;
      }
      focusEl?.focus?.();
    };

    if (!name) {
      showError(isVi ? 'Vui lòng nhập tên của bạn.' : 'Please enter your name.', nameInput);
      return;
    }
    if (!Number.isInteger(age) || age < 3 || age > 18) {
      showError(
        isVi ? 'Vui lòng nhập tuổi từ 3 đến 18.' : 'Please enter an age between 3 and 18.',
        ageInput
      );
      return;
    }

    if (errorBox) errorBox.hidden = true;
    this.currentAge = age;
    localStorage.setItem('rml_student_age', String(age));
    this.setStudentName(name);

    sessionStorage.setItem('rml_started', 'true');
    localStorage.setItem('rml_splash_done', 'true');
    const lang = window.I18N ? window.I18N.currentLang : (this.selectedLanguage || 'vi');
    localStorage.setItem('rml_ui_language', lang);
    localStorage.setItem('rml_language', lang);

    if (window.SoundFX) {
      window.SoundFX.playRetroStart();
    }

    const robotEl = document.getElementById('splash-robot');
    if (robotEl) {
      robotEl.classList.add('sparky-jump');
    }

    if (this.splashScreen) {
      this.splashScreen.classList.add('splash-exit');
    }

    setTimeout(() => {
      this.hideSplashScreen();
      window.RMLTelemetry?.begin?.({ displayName: name, age });
      this.renderTaskSelection();
    }, 450);
  }

  renderTaskSelection() {
    window.location.hash = '#hub';
    this.renderTaskHub();
  }

  // =========================================================================
  // SCREEN 2: MAIN MISSION HUB (CHOOSE TASK 1, 2, OR 3)
  // =========================================================================
  renderTaskHub() {
    this.hideSplashScreen();
    document.body.classList.remove('view-start-screen');
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.classList.remove('active');
      m.style.display = 'none';
    });
    document.body.style.overflow = '';
    const main = document.getElementById('main-view');
    if (!main) return;

    const t = (key) => window.I18N ? window.I18N.t(key) : key;
    const isVi = window.I18N ? window.I18N.isVietnamese() : true;

    main.innerHTML = `
      <div class="hub-container animate-fade-in">
        
        <!-- Mission Hub Hero Briefing Banner -->
        <div class="hub-hero">
          <div class="hub-hero-content">
            <h1 class="hub-title">${t('hero_title')}</h1>
            <p class="hub-subtitle">
              ${t('hub_greeting')}
            </p>
          </div>
          
          <div class="hub-actions-card">
            <div class="hub-student-badge-wrap" onclick="window.App && window.App.openSettingsModal()" style="cursor: pointer;" title="${t('settings_btn_title') || 'Cài đặt'}">
              <span class="badge-avatar">🧑‍🎓</span>
              <div>
                <div class="badge-role">${t('student_tag_title')}</div>
                <div class="badge-name">${this.escapeHtml(this.currentStudent)} ✏️</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Task Selection Grid -->
        <section class="tasks-section" id="tasks-section">
          <div class="section-title-wrap">
            <h2 class="section-title">${t('hub_section_title')}</h2>
          </div>

          <div class="tasks-grid">
            
            <!-- Task 1 Card: Hành trình đến đích / Reach the Goal -->
            <div class="task-card task-card-1" id="card-task1">
              <div class="task-card-header">
                <span class="task-card-badge">${t('task1_badge')}</span>
              </div>
              <h3 class="task-card-title">${t('task1_title')}</h3>
              <div class="task-card-footer">
                <button type="button" class="btn-start-task" onclick="window.App.navigateToTask('task1-reach')">
                  ${t('task1_btn')}
                </button>
              </div>
            </div>

            <!-- Task 2 Card: Chuyến đi bất ngờ / The Unexpected Journey -->
            <div class="task-card task-card-2" id="card-task2">
              <div class="task-card-header">
                <span class="task-card-badge">${t('task2_badge')}</span>
              </div>
              <h3 class="task-card-title">${t('task2_title')}</h3>
              <div class="task-card-footer">
                <button type="button" class="btn-start-task btn-start-task2" onclick="window.App.navigateToTask('task2-fix')">
                  ${t('task2_btn')}
                </button>
              </div>
            </div>

            <!-- Task 3 Card: Thử thách đúng giờ / The On-Time Challenge -->
            <div class="task-card task-card-3" id="card-task3">
              <div class="task-card-header">
                <span class="task-card-badge">${t('task3_badge')}</span>
              </div>
              <h3 class="task-card-title">${t('task3_title')}</h3>
              <div class="task-card-footer">
                <button type="button" class="btn-start-task" onclick="window.App.navigateToTask('task3-new')">
                  ${t('task3_btn')}
                </button>
              </div>
            </div>

          </div>
        </section>

      </div>
    `;

    // Synchronize Sparky floating companion bubble
    const sparkyBubble = document.getElementById('sparky-bubble');
    if (sparkyBubble) {
      sparkyBubble.innerText = t('robot_bubble_welcome');
    }
  }

  animateRobotHappyCheer() {
    if (window.SoundFX) window.SoundFX.playTing();
    const robotEl = document.getElementById('hero-robot-character');
    const bubbleEl = document.getElementById('hero-robot-bubble');
    if (robotEl) {
      robotEl.classList.add('robot-jump-spin');
      setTimeout(() => robotEl.classList.remove('robot-jump-spin'), 800);
    }
    if (bubbleEl) {
      const easterMsg = window.I18N ? window.I18N.t('robot_easter_egg') : 'Yay! Let\'s learn together! 🚀';
      bubbleEl.innerText = easterMsg;
      bubbleEl.classList.add('pop-highlight');
      setTimeout(() => bubbleEl.classList.remove('pop-highlight'), 1200);
    }
  }

  navigateToTask(taskId) {
    if (window.SoundFX) window.SoundFX.playPop();
    const targetHash = `#task/${taskId}`;
    if (window.location.hash === targetHash) {
      this.launchTask(taskId);
    } else {
      window.location.hash = targetHash;
    }
  }

  launchTask(taskId) {
    this.hideSplashScreen();
    document.body.classList.remove('view-start-screen');

    // Dismiss any active modals
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.classList.remove('active');
      m.style.display = 'none';
    });
    document.body.style.overflow = '';

    let taskConfig = null;
    if (taskId === 'task1-reach') taskConfig = window.Task1Reach;
    else if (taskId === 'task2-fix') taskConfig = window.Task2Fix;
    else if (taskId === 'task3-new') taskConfig = window.Task3New;

    if (!taskConfig) {
      window.location.hash = '#hub';
      return;
    }

    this.activeTaskId = taskId;
    this.taskEngine.loadTask(taskConfig, this.currentStudent);
  }
}

// Global bootstrap - starts Robot Math Lab directly
document.addEventListener('DOMContentLoaded', () => {
  window.App = new AppController();
});
