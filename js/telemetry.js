/**
 * Robot Math Lab - anonymous learning telemetry
 * Sends the existing LogEngine session snapshot to /api/events after consent.
 * The site keeps working when the API/database is unavailable.
 */
(function () {
  'use strict';

  const CONSENT_VERSION = (document.querySelector('meta[name="rml-consent-version"]')?.content || '2026-11-v1').trim();
  const KEYS = {
    profileId: 'rml_profile_id',
    profileToken: 'rml_profile_token',
    studentName: 'rml_student_name',
    studentAge: 'rml_student_age',
    consent: 'rml_consent_version',
    declined: 'rml_consent_declined_version',
    pending: 'rml_telemetry_pending',
  };

  const state = {
    displayName: '',
    age: null,
    profileId: null,
    profileToken: null,
    profileReady: false,
    profileRetryAt: 0,
    consent: false,
    consentSynced: false,
    subscribed: false,
    flushing: false,
    profilePromise: null,
    flushTimer: null,
    pendingSessions: [],
    consentModal: null,
  };

  function readStoredProfile() {
    const id = Number.parseInt(localStorage.getItem(KEYS.profileId) || '', 10);
    const token = localStorage.getItem(KEYS.profileToken) || '';
    if (Number.isInteger(id) && id > 0 && token) {
      state.profileId = id;
      state.profileToken = token;
    }
  }

  function saveStoredProfile(id, token) {
    state.profileId = Number(id);
    state.profileToken = token;
    localStorage.setItem(KEYS.profileId, String(id));
    localStorage.setItem(KEYS.profileToken, token);
  }

  function clearStoredProfile() {
    state.profileId = null;
    state.profileToken = null;
    state.profileReady = false;
    state.consentSynced = false;
    localStorage.removeItem(KEYS.profileId);
    localStorage.removeItem(KEYS.profileToken);
  }

  function currentLanguage() {
    return window.I18N?.currentLang === 'en' ? 'en' : 'vi';
  }

  function hasConsent() {
    return localStorage.getItem(KEYS.consent) === CONSENT_VERSION;
  }

  function hasDeclined() {
    return localStorage.getItem(KEYS.declined) === CONSENT_VERSION;
  }

  async function postJson(path, body, options = {}) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: Boolean(options.keepalive),
      body: JSON.stringify(body),
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    return { response, payload };
  }

  async function ensureProfile() {
    if (state.profileReady && state.profileId && state.profileToken) return true;
    if (Date.now() < state.profileRetryAt) return false;
    if (state.profilePromise) return state.profilePromise;

    const displayName = String(state.displayName || localStorage.getItem(KEYS.studentName) || '').trim();
    const age = Number.parseInt(String(state.age || localStorage.getItem(KEYS.studentAge) || ''), 10);
    if (!displayName || !Number.isInteger(age) || age < 3 || age > 18) return false;

    state.profilePromise = (async () => {
      const hadStoredProfile = Boolean(state.profileId && state.profileToken);
      const body = { displayName, age };
      if (hadStoredProfile) {
        body.profileId = state.profileId;
        body.profileToken = state.profileToken;
      }

      body.consentVersion = CONSENT_VERSION;
      let result = await postJson('/api/students', body);
      if (hadStoredProfile && result.response.status === 401) {
        clearStoredProfile();
        result = await postJson('/api/students', { displayName, age, consentVersion: CONSENT_VERSION });
      }
      if (!result.response.ok || !result.payload?.data?.profile) {
        state.profileRetryAt = Date.now() + 15_000;
        return false;
      }

      saveStoredProfile(result.payload.data.profile.id, result.payload.data.profileToken);
      localStorage.setItem(KEYS.studentName, displayName);
      localStorage.setItem(KEYS.studentAge, String(age));
      state.profileReady = true;
      state.profileRetryAt = 0;
      return true;
    })().catch(() => {
      state.profileRetryAt = Date.now() + 15_000;
      return false;
    }).finally(() => {
      state.profilePromise = null;
    });

    return state.profilePromise;
  }

  async function postConsent() {
    if (!state.profileId || !state.profileToken) return false;
    if (state.consentSynced) return true;
    const { response, payload } = await postJson('/api/consent', {
      profileId: state.profileId,
      profileToken: state.profileToken,
      consentVersion: CONSENT_VERSION,
    });
    if (response.ok) {
      state.consentSynced = true;
      return true;
    }
    if (response.status === 409 && payload?.error?.details?.expectedVersion) {
      console.warn('[telemetry] consent version mismatch; server expects', payload.error.details.expectedVersion);
    }
    return false;
  }

  const SENSITIVE_KEY = /^(student_?name|display_?name|full_?name|name|email|phone|address|account_?id)$/i;

  function cleanPayload(value, depth = 0) {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value.slice(0, 500);
    if (depth >= 4) return null;
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => cleanPayload(item, depth + 1));
    if (value && typeof value === 'object') {
      const result = {};
      let count = 0;
      for (const [key, item] of Object.entries(value)) {
        if (count >= 50) break;
        if (!key || SENSITIVE_KEY.test(key)) continue;
        result[String(key).slice(0, 60)] = cleanPayload(item, depth + 1);
        count += 1;
      }
      return result;
    }
    return null;
  }

  function buildSessionSnapshot(session) {
    if (!session || !session.sessionId) return null;
    const summary = session.summary || {};
    const hints = Array.isArray(session.supportUsage?.mathHints) ? session.supportUsage.mathHints : [];
    const vocab = Array.isArray(session.supportUsage?.vocabLookups) ? session.supportUsage.vocabLookups : [];
    const maxHintLevel = hints.reduce((max, item) => Math.max(max, Number(item?.level) || 0), 0);
    const events = Array.isArray(session.events) ? session.events : [];

    return {
      sessionUid: session.sessionId,
      taskId: session.taskId || 'unknown',
      taskTitle: session.taskTitle || '',
      language: currentLanguage(),
      startedAt: session.startedAt || null,
      completedAt: session.completedAt || null,
      totalTimeSeconds: Math.max(0, Math.round(Number(summary.totalTimeSeconds) || 0)),
      totalAttempts: Math.max(0, Number(summary.totalAttempts) || 0),
      backwardSteps: Math.max(0, Number(summary.backwardStepsCount) || 0),
      hintsOpened: hints.length,
      maxHintLevel,
      vocabLookups: vocab.length,
      finalSuccess: typeof summary.finalSuccess === 'boolean' ? summary.finalSuccess : null,
      summary: {
        totalAttempts: Number(summary.totalAttempts) || 0,
        totalTimeSeconds: Number(summary.totalTimeSeconds) || 0,
        finalSuccess: Boolean(summary.finalSuccess),
        backwardStepsCount: Number(summary.backwardStepsCount) || 0,
        currentStep: Number(session.currentStep) || 0,
        stepTimings: session.stepTimings || {},
      },
      events: events.map((event) => ({
        uid: event.id,
        code: event.code,
        label: event.label || '',
        step: Number.isInteger(Number(event.step)) ? Number(event.step) : null,
        relativeTimeMs: Math.max(0, Number(event.relativeTimeMs) || 0),
        // Free-text reflections are never sent; only their length is useful.
        payload: event.code === 'TASK_REFLECTION'
          ? { length: String(event.data?.reflection || '').length }
          : cleanPayload(event.data || {}),
      })),
    };
  }

  function persistPending() {
    try {
      if (!state.pendingSessions.length) {
        localStorage.removeItem(KEYS.pending);
      } else {
        localStorage.setItem(KEYS.pending, JSON.stringify(state.pendingSessions));
      }
    } catch { /* quota is not critical */ }
  }

  function savePending(session) {
    const snapshot = buildSessionSnapshot(session);
    if (!snapshot) return;
    const index = state.pendingSessions.findIndex((item) => item.sessionUid === snapshot.sessionUid);
    if (index >= 0) state.pendingSessions[index] = snapshot;
    else state.pendingSessions.push(snapshot);
    if (state.pendingSessions.length > 10) state.pendingSessions.shift();
    persistPending();
  }

  function loadPending() {
    try {
      const raw = localStorage.getItem(KEYS.pending);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (parsed && parsed.sessionUid ? [parsed] : []);
      state.pendingSessions = list.filter((item) => item && item.sessionUid).slice(-10);
    } catch { /* ignore corrupted queue */ }
  }

  function removePending(uids) {
    const sent = new Set(uids);
    state.pendingSessions = state.pendingSessions.filter((item) => !sent.has(item.sessionUid));
    persistPending();
  }

  function scheduleFlush(delay = 1500) {
    if (!state.consent) return;
    if (state.flushTimer) clearTimeout(state.flushTimer);
    state.flushTimer = setTimeout(() => {
      state.flushTimer = null;
      flush();
    }, delay);
  }

  function subscribe() {
    if (state.subscribed) return;
    const engine = window.LogEngine;
    if (!engine || typeof engine.subscribe !== 'function') return;
    state.subscribed = true;
    engine.subscribe((event) => {
      const session = engine.currentSession;
      if (!session) return;
      savePending(session);
      if (event?.code === 'SESSION_COMPLETED') {
        if (state.flushTimer) {
          clearTimeout(state.flushTimer);
          state.flushTimer = null;
        }
        flush();
      } else {
        scheduleFlush();
      }
    });
  }

  async function flush(options = {}) {
    if (!state.consent || state.flushing) return;
    if (!state.pendingSessions.length) return;

    state.flushing = true;
    try {
      const ready = await ensureProfile();
      if (!ready) return;
      const consentReady = await postConsent();
      if (!consentReady) return;
      const sentUids = state.pendingSessions.map((item) => item.sessionUid);
      const { response, payload } = await postJson('/api/events', {
        profileId: state.profileId,
        profileToken: state.profileToken,
        consentVersion: CONSENT_VERSION,
        language: currentLanguage(),
        sessions: state.pendingSessions,
      }, { keepalive: options.keepalive });

      if (response.ok) {
        removePending(sentUids);
        return;
      }
      if (response.status === 401) {
        clearStoredProfile();
        return;
      }
      if (response.status === 403) {
        // Server has no consent row for this profile (e.g. cleared database).
        state.consent = false;
        state.consentSynced = false;
        localStorage.removeItem(KEYS.consent);
        scheduleConsentPrompt();
        return;
      }
      if (response.status === 409 && payload?.error?.details?.expectedVersion) {
        console.warn('[telemetry] consent version mismatch; server expects', payload.error.details.expectedVersion);
      }
    } catch {
      // Offline: keep the pending snapshot and retry on the next event/page hide.
    } finally {
      state.flushing = false;
    }
  }

  function consentCopy() {
    const vi = currentLanguage() === 'vi';
    return vi
      ? {
          title: 'Lưu nhật ký học tập?',
          body: 'Để cải thiện bài học, hệ thống có thể lưu nhật ký làm bài của em. Dữ liệu chỉ dùng cho nghiên cứu và chỉ người phụ trách xem được.',
          items: [
            'Lưu tên, tuổi và các bước làm bài (PS1–PS11).',
            'Lưu số lần dùng gợi ý và từ điển.',
            'Không lưu email, số điện thoại hay địa chỉ IP gốc.',
            'Có thể yêu cầu xoá dữ liệu bất cứ lúc nào.',
          ],
          accept: 'Đồng ý & tiếp tục',
          decline: 'Không đồng ý',
        }
      : {
          title: 'Save your learning journal?',
          body: 'To improve the lessons, the system can save your problem-solving journal. The data is used for research only and is visible to the owner.',
          items: [
            'Save your name, age and problem-solving steps (PS1–PS11).',
            'Save how often you use hints and the dictionary.',
            'Never save email, phone number or the raw IP address.',
            'You can ask for your data to be deleted at any time.',
          ],
          accept: 'Agree & continue',
          decline: 'No thanks',
        };
  }

  function hideConsentModal() {
    if (!state.consentModal) return;
    state.consentModal.remove();
    state.consentModal = null;
  }

  function showConsentModal() {
    if (state.consentModal || hasConsent() || hasDeclined()) return;
    const copy = consentCopy();
    const overlay = document.createElement('div');
    overlay.className = 'rml-consent-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'rml-consent-title');
    overlay.innerHTML = `
      <div class="rml-consent-card">
        <div class="rml-consent-icon" aria-hidden="true">📒</div>
        <h2 id="rml-consent-title">${copy.title}</h2>
        <p>${copy.body}</p>
        <ul>${copy.items.map((item) => `<li>${item}</li>`).join('')}</ul>
        <div class="rml-consent-actions">
          <button type="button" class="rml-consent-accept" id="rml-consent-accept">${copy.accept}</button>
          <button type="button" class="rml-consent-decline" id="rml-consent-decline">${copy.decline}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    state.consentModal = overlay;

    overlay.querySelector('#rml-consent-accept')?.addEventListener('click', async () => {
      localStorage.setItem(KEYS.consent, CONSENT_VERSION);
      localStorage.removeItem(KEYS.declined);
      state.consent = true;
      hideConsentModal();
      subscribe();
      await ensureProfile();
      await postConsent().catch(() => {});
      flush();
    });

    overlay.querySelector('#rml-consent-decline')?.addEventListener('click', () => {
      localStorage.setItem(KEYS.declined, CONSENT_VERSION);
      localStorage.removeItem(KEYS.consent);
      state.consent = false;
      hideConsentModal();
    });

    overlay.querySelector('#rml-consent-accept')?.focus();
  }

  function scheduleConsentPrompt() {
    setTimeout(() => {
      if (!hasConsent() && !hasDeclined()) showConsentModal();
    }, 600);
  }

  function begin({ displayName, age } = {}) {
    state.displayName = String(displayName || localStorage.getItem(KEYS.studentName) || '').trim();
    state.age = Number.parseInt(String(age || localStorage.getItem(KEYS.studentAge) || ''), 10);
    localStorage.setItem(KEYS.studentName, state.displayName);
    if (Number.isInteger(state.age)) localStorage.setItem(KEYS.studentAge, String(state.age));

    state.profileReady = false;
    state.consentSynced = false;
    readStoredProfile();
    loadPending();

    if (hasConsent()) {
      state.consent = true;
      subscribe();
      ensureProfile()
        .then(() => postConsent())
        .catch(() => false)
        .finally(() => flush());
      return;
    }
    if (hasDeclined()) {
      state.consent = false;
      return;
    }
    setTimeout(showConsentModal, 450);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && state.consent) {
      flush({ keepalive: true });
    }
  });
  window.addEventListener('pagehide', () => {
    if (state.consent) flush({ keepalive: true });
  });

  window.RMLTelemetry = {
    begin,
    flush,
    showConsent: showConsentModal,
    get enabled() { return state.consent; },
    get profileId() { return state.profileId; },
  };
})();
