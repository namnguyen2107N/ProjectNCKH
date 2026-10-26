/**
 * ROBOT MATH LAB - LOG ENGINE
 * Specialized pedagogical process logger for elementary STEM & Polya problem solving.
 * Formats data according to the PS1-PS11 problem-solving process codes.
 * Stores events in localStorage and presents them in the learning journal.
 */

class LogEngine {
  constructor() {
    this.currentSession = null;
    this.storageKey = 'rml_research_logs_v2';
    this.listeners = [];
  }

  /**
   * Subscribe to log events (e.g. for UI event counters)
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify(event) {
    this.listeners.forEach(cb => {
      try { cb(event, this.currentSession); } catch (e) { console.error('Log listener error:', e); }
    });
  }

  /**
   * Start a new tracking session for a student and task
   */
  startSession(studentName = 'Student', taskId = 'task1', taskTitle = 'Task') {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.currentSession = {
      sessionId,
      accountId: window.RMLAuth?.account?.id || null,
      studentName: studentName.trim() || 'Anonymous Student',
      taskId,
      taskTitle,
      startedAt: new Date().toISOString(),
      completedAt: null,
      events: [],
      supportUsage: {
        vocabLookups: [],
        mathHints: []
      },
      stepTimings: {
        1: { enteredAt: Date.now(), totalTimeMs: 0 },
        2: { enteredAt: null, totalTimeMs: 0 },
        3: { enteredAt: null, totalTimeMs: 0 },
        4: { enteredAt: null, totalTimeMs: 0 }
      },
      currentStep: 1,
      summary: {
        totalAttempts: 0,
        totalTimeSeconds: 0,
        finalSuccess: false,
        backwardStepsCount: 0
      }
    };

    this.logEvent('SESSION_STARTED', 'Started a learning session', {
      taskId,
      taskTitle,
      studentName: this.currentSession.studentName
    });
    this.notify({ type: 'SESSION_STARTED', sessionId });
    return this.currentSession;
  }

  /**
   * Track transition between Polya steps and accumulate active duration
   */
  transitionStep(fromStep, toStep, reason = 'NORMAL') {
    if (!this.currentSession) return;
    const now = Date.now();

    // Accumulate time spent in fromStep
    if (fromStep && this.currentSession.stepTimings[fromStep]?.enteredAt) {
      const duration = now - this.currentSession.stepTimings[fromStep].enteredAt;
      this.currentSession.stepTimings[fromStep].totalTimeMs += duration;
      this.currentSession.stepTimings[fromStep].enteredAt = null;
    }

    // Set enter time for toStep
    if (toStep && this.currentSession.stepTimings[toStep]) {
      this.currentSession.stepTimings[toStep].enteredAt = now;
      this.currentSession.currentStep = toStep;
    }

    if (fromStep && toStep && toStep < fromStep) {
      this.currentSession.summary.backwardStepsCount++;
    }

    this.logEvent('STEP_TRANSITION', `Transition from Step ${fromStep} to Step ${toStep}`, {
      fromStep,
      toStep,
      reason
    });
  }

  /**
   * Core logging function for PS1-PS11 and auxiliary events
   * @param {string} code PS1 to PS11 or system event code
   * @param {string} label Descriptive event label
   * @param {object} data Event payload
   */
  logEvent(code, label, data = {}) {
    if (!this.currentSession) {
      console.warn('LogEngine: No active session. Creating fallback session.');
      this.startSession('Student', 'general', 'General Session');
    }

    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      code,
      label,
      step: this.currentSession.currentStep,
      data: JSON.parse(JSON.stringify(data)),
      timestamp: new Date().toISOString(),
      relativeTimeMs: Date.now() - new Date(this.currentSession.startedAt).getTime()
    };

    this.currentSession.events.push(event);

    // Update specific summary metrics
    if (code === 'PS7' || code === 'PS11') {
      this.currentSession.summary.totalAttempts++;
      if (data.success || data.meetsRequirement) {
        this.currentSession.summary.finalSuccess = true;
      }
    }

    this.saveSession();
    this.notify(event);
    return event;
  }

  /**
   * Log vocabulary lookup (Support usage)
   */
  logVocabLookup(word, data = {}) {
    if (!this.currentSession) return;
    const item = {
      word,
      vi: data.vi || '',
      step: this.currentSession.currentStep,
      timestamp: new Date().toISOString()
    };
    this.currentSession.supportUsage.vocabLookups.push(item);
    this.logEvent('VOCAB_LOOKUP', `Looked up vocabulary: "${word}"`, item);
  }

  /**
   * Log tiered hint request (Support usage)
   */
  logMathHint(level, hintData = {}) {
    if (!this.currentSession) return;
    const item = {
      level,
      step: this.currentSession.currentStep,
      hintTitle: hintData.title || `Level ${level} Hint`,
      timestamp: new Date().toISOString()
    };
    this.currentSession.supportUsage.mathHints.push(item);
    this.logEvent('HINT_REQUESTED', `Requested Tier ${level} Math Hint`, item);
  }

  /**
   * Complete current task session
   */
  completeSession(finalSuccess = true) {
    if (!this.currentSession) return;
    const now = Date.now();

    // Close timing for active step
    const currentStep = this.currentSession.currentStep;
    if (currentStep && this.currentSession.stepTimings[currentStep]?.enteredAt) {
      const duration = now - this.currentSession.stepTimings[currentStep].enteredAt;
      this.currentSession.stepTimings[currentStep].totalTimeMs += duration;
      this.currentSession.stepTimings[currentStep].enteredAt = null;
    }

    this.currentSession.completedAt = new Date().toISOString();
    this.currentSession.summary.finalSuccess = finalSuccess;
    this.currentSession.summary.totalTimeSeconds = Math.round(
      (now - new Date(this.currentSession.startedAt).getTime()) / 1000
    );

    this.logEvent('SESSION_COMPLETED', 'Completed the learning session', {
      finalSuccess,
      totalAttempts: this.currentSession.summary.totalAttempts,
      totalTimeSeconds: this.currentSession.summary.totalTimeSeconds
    });
    this.notify({ type: 'SESSION_COMPLETED', session: this.currentSession });
    return this.currentSession;
  }

  /**
   * Save current session into localStorage history
   */
  saveSession() {
    if (!this.currentSession) return;
    try {
      const allSessions = this.getAllSessions();
      const existingIdx = allSessions.findIndex(s => s.sessionId === this.currentSession.sessionId);
      if (existingIdx >= 0) {
        allSessions[existingIdx] = this.currentSession;
      } else {
        allSessions.push(this.currentSession);
      }
      const boundedSessions = allSessions.length > 30 ? allSessions.slice(-30) : allSessions;
      localStorage.setItem(this.storageKey, JSON.stringify(boundedSessions));
    } catch (e) {
      console.error('Failed to save log session to localStorage:', e);
    }
  }

  /**
   * Get all saved sessions from localStorage
   */
  getAllSessions() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Error reading saved sessions:', e);
      return [];
    }
  }

  /**
   * Sessions visible to the signed-in account. Legacy sessions without an
   * accountId are hidden once the student signs in so that a shared classroom
   * device does not expose another child's journal.
   */
  getVisibleSessions() {
    const all = this.getAllSessions();
    const accountId = window.RMLAuth?.account?.id;
    if (!accountId) return all;
    return all.filter(session => session && session.accountId === accountId);
  }

  /**
   * Open a local, student-friendly view of saved interaction sessions.
   */
  openJournal(sessionId = null) {
    if (this.currentSession && !this.currentSession.completedAt) {
      this.logEvent('JOURNAL_VIEWED', 'Opened the learning interaction journal', {
        taskId: this.currentSession.taskId,
        currentStep: this.currentSession.currentStep
      });
    }
    const allSessions = this.getVisibleSessions();
    const sessions = Array.isArray(allSessions)
      ? allSessions.filter(session => session && session.sessionId)
      : [];
    sessions.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

    this.selectedJournalSessionId = sessionId
      || this.currentSession?.sessionId
      || sessions[0]?.sessionId
      || null;

    let modal = document.getElementById('learning-journal-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'learning-journal-modal';
      modal.className = 'modal-backdrop learning-journal-backdrop';
      document.body.appendChild(modal);
    }

    this.renderJournal(modal);
    modal.classList.add('active');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (this._journalEscHandler) {
      document.removeEventListener('keydown', this._journalEscHandler);
    }
    this._journalEscHandler = (event) => {
      if (event.key === 'Escape') this.closeJournal();
    };
    document.addEventListener('keydown', this._journalEscHandler);
  }

  renderJournal(modal = document.getElementById('learning-journal-modal')) {
    if (!modal) return;

    const isVi = window.I18N ? window.I18N.isVietnamese() : true;
    const locale = isVi ? 'vi-VN' : 'en-US';
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
    const allSessions = this.getVisibleSessions();
    const sessions = Array.isArray(allSessions)
      ? allSessions.filter(session => session && session.sessionId)
      : [];
    sessions.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

    if (!sessions.some(session => session.sessionId === this.selectedJournalSessionId)) {
      this.selectedJournalSessionId = this.currentSession?.sessionId || sessions[0]?.sessionId || null;
    }
    const selected = sessions.find(session => session.sessionId === this.selectedJournalSessionId) || null;

    const formatDate = (value) => {
      const date = value ? new Date(value) : null;
      return date && !Number.isNaN(date.getTime())
        ? date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
        : (isVi ? 'Chưa có thời gian' : 'Time unavailable');
    };
    const formatElapsed = (value) => {
      const seconds = Math.max(0, Math.floor((Number(value) || 0) / 1000));
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    };
    const taskTitle = (session) => {
      const titles = {
        'task1-reach': isVi ? 'Nhiệm vụ 1: Hành trình đến đích' : 'Task 1: Reach the Goal',
        'task2-fix': isVi ? 'Nhiệm vụ 2: Chuyến đi bất ngờ' : 'Task 2: The Unexpected Journey',
        'task3-new': isVi ? 'Nhiệm vụ 3: Thử thách đúng giờ' : 'Task 3: The On-Time Challenge'
      };
      return titles[session.taskId] || session.taskTitle || (isVi ? 'Buổi học' : 'Learning session');
    };
    const eventTitles = isVi ? {
      SESSION_STARTED: 'Bắt đầu nhiệm vụ', SESSION_COMPLETED: 'Hoàn thành nhiệm vụ', STEP_TRANSITION: 'Cập nhật tiến trình',
      STEP1_MISMATCH: 'Kiểm tra dữ kiện chưa khớp', STEP2_MISTAKE: 'Thử công thức hoặc phép tính khác',
      INPUT_VALIDATION_FAILED: 'Thiếu hoặc chưa hợp lệ', PS1: 'Xác định dữ kiện',
      PS2: 'Xác định đại lượng cần tìm', PS3: 'Xác nhận điều kiện bài toán',
      PS4: 'Chọn công thức', PS5: 'Tính toán kế hoạch', PS6: 'Cài đặt thông số robot',
      PS7: 'Quan sát kết quả mô phỏng', PS8: 'Kiểm tra kết quả', PS9: 'Nhận diện độ lệch',
      PS10: 'Điều chỉnh phương án', PS11: 'Chạy lại và xác minh',
      HINT_REQUESTED: 'Mở gợi ý', VOCAB_LOOKUP: 'Tra từ vựng',
      TASK_REFLECTION: 'Ghi lại suy ngẫm', PS8_RESPONSE: 'Trả lời kiểm tra kết quả',
      JOURNAL_VIEWED: 'Mở nhật ký học tập'
    } : {
      SESSION_STARTED: 'Mission started', SESSION_COMPLETED: 'Mission completed', STEP_TRANSITION: 'Progress updated',
      STEP1_MISMATCH: 'Checked problem data', STEP2_MISTAKE: 'Tried another formula or calculation',
      INPUT_VALIDATION_FAILED: 'Missing or invalid input', PS1: 'Identified given data',
      PS2: 'Identified the unknown', PS3: 'Confirmed problem constraints',
      PS4: 'Selected a formula', PS5: 'Calculated a plan', PS6: 'Set robot parameters',
      PS7: 'Observed simulation result', PS8: 'Checked the result', PS9: 'Identified a discrepancy',
      PS10: 'Adjusted the plan', PS11: 'Reran and verified',
      HINT_REQUESTED: 'Opened a hint', VOCAB_LOOKUP: 'Looked up vocabulary',
      TASK_REFLECTION: 'Added a reflection', PS8_RESPONSE: 'Answered the result check',
      JOURNAL_VIEWED: 'Opened the learning journal'
    };

    const eventList = selected && Array.isArray(selected.events) ? selected.events : [];
    const sessionCards = sessions.map(session => {
      const active = session.sessionId === this.selectedJournalSessionId;
      const attempts = session.summary?.totalAttempts || 0;
      const complete = !!session.completedAt;
      return `
        <button type="button" class="journal-session-card ${active ? 'active' : ''}"
          data-session-id="${escapeHtml(session.sessionId)}" aria-pressed="${active}">
          <span class="journal-session-status ${complete ? 'complete' : ''}">${complete ? '✓' : '•'}</span>
          <span class="journal-session-copy">
            <strong>${escapeHtml(taskTitle(session))}</strong>
            <span>${escapeHtml(formatDate(session.startedAt))}</span>
            <small>${attempts} ${isVi ? 'lần chạy' : 'runs'} · ${eventList.length && active ? eventList.length : (session.events?.length || 0)} ${isVi ? 'hoạt động' : 'events'}</small>
          </span>
        </button>
      `;
    }).join('');

    const removeStepFields = (value) => {
      if (Array.isArray(value)) return value.map(removeStepFields);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !key.toLowerCase().includes('step'))
        .map(([key, nestedValue]) => [key, removeStepFields(nestedValue)]));
    };

    const timeline = selected ? eventList.map(event => {
      const data = removeStepFields(event.data && typeof event.data === 'object' ? event.data : {});
      const hasDetails = Object.keys(data).length > 0;
      const eventDate = event.timestamp ? new Date(event.timestamp) : null;
      const eventTime = eventDate && !Number.isNaN(eventDate.getTime())
        ? eventDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
        : '';
      const title = eventTitles[event.code] || event.label || event.code || (isVi ? 'Hoạt động' : 'Activity');
      return `
        <li class="journal-event-item">
          <span class="journal-event-dot" aria-hidden="true"></span>
          <div class="journal-event-content">
            <div class="journal-event-meta">
              <time>${escapeHtml(eventTime)}</time>
              <span>+${escapeHtml(formatElapsed(event.relativeTimeMs))}</span>
            </div>
            <h4>${escapeHtml(title)}</h4>
            ${hasDetails ? `
              <details class="journal-event-details">
                <summary>${isVi ? 'Xem chi tiết' : 'View details'}</summary>
                <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
              </details>
            ` : ''}
          </div>
        </li>
      `;
    }).join('') : '';

    const savedElapsed = Number(selected?.summary?.totalTimeSeconds);
    const startedAtMs = selected ? new Date(selected.startedAt).getTime() : NaN;
    const elapsed = selected
      ? Math.max(0, Number.isFinite(savedElapsed) && (savedElapsed > 0 || selected.completedAt)
        ? savedElapsed
        : (Number.isFinite(startedAtMs) ? Math.round((Date.now() - startedAtMs) / 1000) : 0))
      : 0;
    const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

    modal.innerHTML = `
      <section class="learning-journal-card" role="dialog" aria-modal="true" aria-labelledby="learning-journal-title">
        <header class="learning-journal-header">
          <div>
            <span class="journal-eyebrow">${isVi ? 'HÀNH TRÌNH HỌC TẬP' : 'LEARNING JOURNEY'}</span>
            <h2 id="learning-journal-title">📒 ${isVi ? 'Nhật ký tương tác' : 'Activity journal'}</h2>
            <p>${isVi ? 'Xem lại hoạt động làm bài, lần chạy robot và gợi ý đã sử dụng.' : 'Review your activity, robot runs, and support used.'}</p>
          </div>
          <button type="button" class="btn-close-modal" data-journal-action="close" aria-label="${isVi ? 'Đóng nhật ký' : 'Close journal'}">✕</button>
        </header>
        <div class="learning-journal-body">
          <aside class="journal-session-list" aria-label="${isVi ? 'Danh sách buổi học' : 'Learning sessions'}">
            <div class="journal-list-heading">
              <strong>${isVi ? 'Các buổi học' : 'Sessions'}</strong>
              <span>${sessions.length}</span>
            </div>
            ${sessions.length ? sessionCards : `
              <div class="journal-empty-state">
                <span>🌱</span>
                <strong>${isVi ? 'Chưa có nhật ký' : 'No journal yet'}</strong>
                <p>${isVi ? 'Hoạt động sẽ được lưu tại đây khi em bắt đầu làm nhiệm vụ.' : 'Your activity will appear here after you start a mission.'}</p>
              </div>
            `}
          </aside>
          <section class="journal-session-detail" aria-live="polite">
            ${selected ? `
              <div class="journal-detail-heading">
                <div>
                  <span class="journal-detail-date">${escapeHtml(formatDate(selected.startedAt))}</span>
                  <h3>${escapeHtml(taskTitle(selected))}</h3>
                  <p>${escapeHtml(selected.studentName || (isVi ? 'Học sinh' : 'Student'))}</p>
                </div>
                <div class="journal-detail-stats">
                  <strong>${eventList.length}</strong><span>${isVi ? 'hoạt động' : 'events'}</span>
                  <strong>${elapsedLabel}</strong><span>${isVi ? 'phút:giây' : 'min:sec'}</span>
                </div>
              </div>
              ${eventList.length ? `<ol class="journal-timeline">${timeline}</ol>` : `
                <div class="journal-empty-state journal-empty-timeline">
                  <span>📝</span>
                  <p>${isVi ? 'Buổi học đã được tạo. Các hoạt động sẽ hiện tại đây.' : 'Session started. Activities will appear here.'}</p>
                </div>
              `}
            ` : `
              <div class="journal-empty-state journal-empty-timeline">
                <span>🤖</span>
                <strong>${isVi ? 'Bắt đầu một nhiệm vụ nhé!' : 'Start a mission!'}</strong>
                <p>${isVi ? 'Nhật ký sẽ ghi lại tiến trình làm bài trên thiết bị này.' : 'Your progress will be recorded on this device.'}</p>
              </div>
            `}
          </section>
        </div>
        <footer class="learning-journal-footer">
          <span>🔒 ${isVi ? 'Nhật ký được lưu trên thiết bị này.' : 'Journal is stored on this device.'}</span>
        </footer>
      </section>
    `;

    modal.querySelector('[data-journal-action="close"]')?.addEventListener('click', () => this.closeJournal());
    modal.querySelectorAll('[data-session-id]').forEach(button => {
      button.addEventListener('click', () => {
        this.selectedJournalSessionId = button.getAttribute('data-session-id');
        this.renderJournal(modal);
      });
    });
    modal.onclick = (event) => {
      if (event.target === modal) this.closeJournal();
    };
  }

  closeJournal() {
    const modal = document.getElementById('learning-journal-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
    if (this._journalEscHandler) {
      document.removeEventListener('keydown', this._journalEscHandler);
      this._journalEscHandler = null;
    }
  }

  /**
   * Clear all sessions from storage
   */
  clearAllSessions() {
    localStorage.removeItem(this.storageKey);
    this.currentSession = null;
    this.notify({ type: 'SESSIONS_CLEARED' });
  }

}

// Global singleton instance
window.LogEngine = new LogEngine();

// Backward compatibility shim for legacy calls
window.Telemetry = {
  EVENT_TYPES: {
    STEP_TRANSITION: 'STEP_TRANSITION',
    BACKWARD_STEP: 'BACKWARD_STEP',
    SIMULATION_START: 'SIMULATION_START',
    SIMULATION_PAUSE: 'SIMULATION_PAUSE',
    SIMULATION_RESET: 'SIMULATION_RESET'
  },
  startStep: (step) => {},
  logEvent: (step, type, data = {}) => {
    if (window.LogEngine && window.LogEngine.currentSession) {
      window.LogEngine.logEvent(type, `Telemetry: ${type}`, data);
    }
  }
};
