/**
 * ROBOT MATH LAB - TIERED MATH HINTS SYSTEM
 * Scaffolding framework providing 3 levels of assistance:
 * - Level 1: Conceptual Prompt (Stimulates thinking without giving formulas)
 * - Level 2: Formula & Strategy (Reminds student of the mathematical relationship)
 * - Level 3: Concrete Calculation (Shows numerical operation step-by-step)
 * Unlocks sequentially and logs every access to LogEngine.
 */

class MathHints {
  constructor() {
    this.currentHints = [];
    this.unlockedLevel = 0;
    this.taskId = null;
    this.taskTitle = '';
    this.activeStep = 1;
  }

  /**
   * Configure hints for the current active task and step
   */
  setTaskHints(taskId, taskTitle, hintsData = []) {
    this.taskId = taskId;
    this.taskTitle = taskTitle;
    this.currentHints = hintsData;
    this.unlockedLevel = 0;
    this.updateHintBadge();
  }

  setCurrentStep(stepNumber) {
    this.activeStep = stepNumber;
  }

  updateHintBadge() {
    const btn = document.getElementById('btn-open-hints');
    if (btn) {
      if (this.unlockedLevel > 0) {
        btn.classList.add('has-unlocked');
        btn.innerHTML = `💡 Hint (${this.unlockedLevel}/3)`;
      } else {
        btn.classList.remove('has-unlocked');
        btn.innerHTML = `💡 Hint`;
      }
    }
  }

  /**
   * Open the Hints Modal
   */
  openModal() {
    if (window.SoundFX) window.SoundFX.playPop();
    let modal = document.getElementById('math-hints-modal');
    const t = (k, p) => window.I18N ? window.I18N.t(k, p) : k;
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'math-hints-modal';
      modal.className = 'modal-backdrop animate-fade-in';
      modal.innerHTML = `
        <div class="modal-card math-hints-card">
          <div class="modal-header">
            <div class="modal-title-wrap">
              <span class="modal-icon">💡</span>
              <div>
                <h3 class="modal-title">${t('hints_title')}</h3>
              </div>
            </div>
            <button type="button" class="btn-close-modal" id="btn-close-hints">&times;</button>
          </div>
          <div class="hints-container" id="hints-level-list">
            <!-- Dynamic hint cards -->
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#btn-close-hints').onclick = () => this.closeModal();
      modal.onclick = (e) => {
        if (e.target === modal) this.closeModal();
      };
    } else {
      modal.querySelector('.modal-title').innerText = t('hints_title');
    }

    modal.classList.add('active');
    this.renderHintCards();
  }

  closeModal() {
    const modal = document.getElementById('math-hints-modal');
    if (modal) modal.classList.remove('active');
  }

  unlockLevel(level) {
    if (level !== this.unlockedLevel + 1) return;
    this.unlockedLevel = level;
    if (window.SoundFX) window.SoundFX.playTing();

    const hintData = this.currentHints[level - 1] || {};
    if (window.LogEngine) {
      window.LogEngine.logMathHint(level, {
        title: hintData.title || `Level ${level}`,
        step: this.activeStep,
        textEn: hintData.en,
        textVi: hintData.vi
      });
    }

    this.updateHintBadge();
    this.renderHintCards();
  }

  renderHintCards() {
    const container = document.getElementById('hints-level-list');
    if (!container) return;

    if (!this.currentHints || this.currentHints.length === 0) {
      container.innerHTML = `<div class="hints-empty">Không có gợi ý riêng cho bài tập này. Bạn hoàn toàn có thể tự giải được! 🚀</div>`;
      return;
    }

    const isVi = window.I18N ? window.I18N.isVietnamese() : false;
    const tiers = [
      { 
        level: 1, 
        tag: isVi ? 'Level 1: Gợi ý tư duy' : 'Level 1: Conceptual Thinking', 
        icon: '🌱', 
        desc: isVi ? 'Định hướng suy nghĩ bản chất' : 'Guiding key concepts' 
      },
      { 
        level: 2, 
        tag: isVi ? 'Level 2: Công thức & Phương pháp' : 'Level 2: Formula & Strategy', 
        icon: '📐', 
        desc: isVi ? 'Mối quan hệ toán học' : 'Mathematical relationships' 
      },
      { 
        level: 3, 
        tag: isVi ? 'Level 3: Hướng dẫn chi tiết' : 'Level 3: Concrete Calculation', 
        icon: '🎯', 
        desc: isVi ? 'Phép tính cụ thể' : 'Step-by-step arithmetic' 
      }
    ];

    container.innerHTML = tiers.map((tier, idx) => {
      const hint = this.currentHints[idx];
      const isUnlocked = this.unlockedLevel >= tier.level;
      const canUnlock = this.unlockedLevel === tier.level - 1;

      return `
        <div class="hint-tier-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <div class="hint-tier-header">
            <div class="hint-tier-title-row">
              <span class="hint-tier-icon">${tier.icon}</span>
              <div>
                <strong class="hint-tier-title">${tier.tag}</strong>
                <div class="hint-tier-desc">${tier.desc}</div>
              </div>
            </div>
            ${isUnlocked 
              ? `<span class="badge-unlocked">✓ ${isVi ? 'Đã mở' : 'Unlocked'}</span>` 
              : canUnlock 
                ? `<button type="button" class="btn-unlock-hint" onclick="window.MathHints.unlockLevel(${tier.level})">${isVi ? `Mở gợi ý mức ${tier.level} 🔓` : `Unlock Level ${tier.level} 🔓`}</button>` 
                : `<span class="badge-locked">🔒 ${isVi ? 'Cần mở mức trước' : 'Unlock previous level first'}</span>`
            }
          </div>
          ${isUnlocked && hint ? `
            <div class="hint-tier-content animate-slide-down">
              <div class="hint-text-en">🇬🇧 ${hint.en}</div>
              <div class="hint-text-vi">🇻🇳 ${hint.vi}</div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }
}

window.MathHints = new MathHints();
