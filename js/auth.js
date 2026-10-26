/**
 * ROBOT MATH LAB - AUTH GATE
 * Username/password login + self-registration with a class code.
 * The gate is intentionally client-side; real access control lives in /api.
 */
(function () {
  'use strict';

  const AUTH_BASE = '/api/auth';
  const overlayId = 'rml-auth-overlay';
  const langKey = 'rml_language';
  const langKeyAlt = 'rml_ui_language';

  const state = {
    account: null,
    csrf: null,
    authenticated: false,
    overlay: null,
    mode: 'login',
    heartbeatTimer: null,
    heartbeatHooked: false,
    readyResolved: false,
    booting: false,
  };

  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const lang = (() => {
    const stored = localStorage.getItem(langKey) || localStorage.getItem(langKeyAlt);
    if (stored === 'vi' || stored === 'en') return stored;
    if (window.I18N && (window.I18N.currentLang === 'vi' || window.I18N.currentLang === 'en')) {
      return window.I18N.currentLang;
    }
    return 'vi';
  })();

  const TEXT = {
    vi: {
      loading: 'Đang kiểm tra đăng nhập...',
      kicker: 'NỀN TẢNG HỌC TOÁN & ROBOTICS',
      title: 'Chào mừng em đến với phòng thí nghiệm!',
      subtitle: 'Đăng nhập để lưu tiến độ và bảo vệ dữ liệu học tập của em.',
      loginTab: 'Đăng nhập',
      registerTab: 'Tạo tài khoản',
      username: 'Tên đăng nhập',
      usernameHint: '3-24 ký tự: chữ thường, số, dấu gạch dưới',
      password: 'Mật khẩu',
      passwordHint: 'Ít nhất 8 ký tự',
      confirm: 'Nhập lại mật khẩu',
      displayName: 'Tên hiển thị',
      displayNameHint: 'Tên em muốn hiện trong bài học',
      classCode: 'Mã lớp',
      classCodeHint: 'Mã do giáo viên cung cấp',
      consent: 'Em đồng ý để hệ thống ghi nhận dữ liệu học tập (không gồm email, số điện thoại) cho mục đích nghiên cứu.',
      loginBtn: 'Vào phòng học',
      registerBtn: 'Tạo tài khoản và vào học',
      forgot: 'Quên mật khẩu? Hãy liên hệ giáo viên để được cấp lại.',
      privacy: 'Dữ liệu được dùng để nghiên cứu quá trình học tập. Em có thể yêu cầu giáo viên xoá dữ liệu.',
      admin: 'Quản trị',
      logout: 'Đăng xuất',
      retry: 'Thử lại',
      maintenance: 'Hệ thống đang bảo trì hoặc chưa kết nối được máy chủ. Vui lòng thử lại.',
      network: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.',
      required: 'Vui lòng điền đầy đủ thông tin.',
      passwordMismatch: 'Mật khẩu nhập lại không khớp.',
      usernameInvalid: 'Tên đăng nhập phải có 3-24 ký tự, chỉ gồm chữ thường, số và dấu gạch dưới.',
      passwordShort: 'Mật khẩu phải có ít nhất 8 ký tự.',
      classInvalid: 'Mã lớp phải có 4-12 ký tự chữ hoặc số.',
      displayNameMissing: 'Vui lòng nhập tên hiển thị.',
      consentMissing: 'Em cần đồng ý với việc ghi nhận dữ liệu học tập.',
      accountPanel: 'Tài khoản',
      noClass: 'Chưa có lớp',
      logoutConfirm: 'Đăng xuất khỏi tài khoản này?',
      logoutFailed: 'Không đăng xuất được. Vui lòng thử lại.',
      langButton: 'EN',
    },
    en: {
      loading: 'Checking your session...',
      kicker: 'MATH & ROBOTICS LEARNING LAB',
      title: 'Welcome to the lab!',
      subtitle: 'Sign in to save your progress and protect your learning data.',
      loginTab: 'Sign in',
      registerTab: 'Create account',
      username: 'Username',
      usernameHint: '3-24 chars: lowercase letters, numbers, underscore',
      password: 'Password',
      passwordHint: 'At least 8 characters',
      confirm: 'Confirm password',
      displayName: 'Display name',
      displayNameHint: 'The name shown during lessons',
      classCode: 'Class code',
      classCodeHint: 'Provided by your teacher',
      consent: 'I agree that my learning data (no email or phone number) may be recorded for research purposes.',
      loginBtn: 'Enter the lab',
      registerBtn: 'Create account and start',
      forgot: 'Forgot your password? Ask your teacher to reset it.',
      privacy: 'Data is used to study the learning process. You can ask your teacher to delete it.',
      admin: 'Admin',
      logout: 'Sign out',
      retry: 'Retry',
      maintenance: 'The system is under maintenance or cannot reach the server. Please try again.',
      network: 'Cannot reach the server. Check your connection and try again.',
      required: 'Please fill in all fields.',
      passwordMismatch: 'The passwords do not match.',
      usernameInvalid: 'Username must be 3-24 chars: lowercase letters, numbers, underscore.',
      passwordShort: 'Password must be at least 8 characters.',
      classInvalid: 'Class code must be 4-12 letters or numbers.',
      displayNameMissing: 'Please enter a display name.',
      consentMissing: 'Please agree to the learning data notice.',
      accountPanel: 'Account',
      noClass: 'No class',
      logoutConfirm: 'Sign out of this account?',
      logoutFailed: 'Could not sign out. Please try again.',
      langButton: 'VIE',
    },
  };

  const t = TEXT[lang] || TEXT.vi;

  function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    return fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
      signal: options.signal || controller.signal,
    }).then(async (response) => {
      let data = null;
      const type = response.headers.get('content-type') || '';
      if (type.includes('application/json')) {
        try { data = await response.json(); } catch { data = null; }
      }
      return { response, data };
    }).finally(() => {
      clearTimeout(timer);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function setBackgroundInert(inert) {
    for (const el of document.body.children) {
      if (el.id === overlayId) continue;
      if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName)) continue;
      if (inert) {
        el.setAttribute('aria-hidden', 'true');
        el.inert = true;
      } else {
        el.removeAttribute('aria-hidden');
        el.inert = false;
      }
    }
  }

  function ensureOverlay() {
    if (state.overlay && document.body.contains(state.overlay)) return state.overlay;
    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.className = 'rml-auth-overlay';
    document.body.appendChild(overlay);
    state.overlay = overlay;
    document.documentElement.classList.add('rml-auth-pending');
    document.body.classList.add('rml-auth-locked');
    setBackgroundInert(true);
    return overlay;
  }

  function removeOverlay() {
    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
    }
    setBackgroundInert(false);
    document.documentElement.classList.remove('rml-auth-pending');
    document.body.classList.remove('rml-auth-locked');
  }

  function renderLoading() {
    const overlay = ensureOverlay();
    overlay.innerHTML = `
      <div class="rml-auth-card rml-auth-loading" role="status" aria-live="polite">
        <div class="rml-auth-spinner" aria-hidden="true"></div>
        <p>${escapeHtml(t.loading)}</p>
      </div>
    `;
  }

  function renderFatal(message) {
    const overlay = ensureOverlay();
    overlay.innerHTML = `
      <div class="rml-auth-card rml-auth-fatal" role="alert">
        <div class="rml-auth-robot" aria-hidden="true">🤖</div>
        <h1>Robot Math Lab</h1>
        <p class="rml-auth-error-text">${escapeHtml(message || t.maintenance)}</p>
        <button type="button" class="rml-auth-submit" id="rml-auth-retry">${escapeHtml(t.retry)}</button>
      </div>
    `;
    const retry = overlay.querySelector('#rml-auth-retry');
    if (retry) retry.addEventListener('click', () => bootstrap());
  }

  function field(id, name, label, hint, type = 'text', autocomplete = '') {
    return `
      <div class="rml-auth-field">
        <label for="${id}">${escapeHtml(label)}</label>
        <input id="${id}" name="${name}" type="${type}" autocomplete="${autocomplete}" />
        ${hint ? `<small>${escapeHtml(hint)}</small>` : ''}
      </div>
    `;
  }

  function renderGate() {
    const overlay = ensureOverlay();
    overlay.innerHTML = `
      <div class="rml-auth-card" role="dialog" aria-modal="true" aria-labelledby="rml-auth-title">
        <div class="rml-auth-top">
          <div class="rml-auth-brand">
            <span class="rml-auth-robot" aria-hidden="true">🤖</span>
            <div>
              <span class="rml-auth-kicker">${escapeHtml(t.kicker)}</span>
              <strong>Robot Math Lab</strong>
            </div>
          </div>
          <button type="button" class="rml-auth-lang" id="rml-auth-lang">${escapeHtml(t.langButton)}</button>
        </div>

        <h1 id="rml-auth-title">${escapeHtml(t.title)}</h1>
        <p class="rml-auth-subtitle">${escapeHtml(t.subtitle)}</p>

        <div class="rml-auth-tabs" role="tablist" aria-label="Login or register">
          <button type="button" class="rml-auth-tab active" data-tab="login" role="tab" aria-selected="true">${escapeHtml(t.loginTab)}</button>
          <button type="button" class="rml-auth-tab" data-tab="register" role="tab" aria-selected="false">${escapeHtml(t.registerTab)}</button>
        </div>

        <form id="rml-login-form" class="rml-auth-form" novalidate>
          ${field('rml-login-username', 'username', t.username, t.usernameHint, 'text', 'username')}
          ${field('rml-login-password', 'password', t.password, '', 'password', 'current-password')}
          <div id="rml-login-error" class="rml-auth-error" role="alert" hidden></div>
          <button type="submit" class="rml-auth-submit">${escapeHtml(t.loginBtn)}</button>
          <p class="rml-auth-note">${escapeHtml(t.forgot)}</p>
        </form>

        <form id="rml-register-form" class="rml-auth-form" hidden novalidate>
          ${field('rml-register-name', 'display_name', t.displayName, t.displayNameHint, 'text', 'nickname')}
          ${field('rml-register-username', 'username', t.username, t.usernameHint, 'text', 'username')}
          ${field('rml-register-password', 'password', t.password, t.passwordHint, 'password', 'new-password')}
          ${field('rml-register-confirm', 'password_confirm', t.confirm, '', 'password', 'new-password')}
          ${field('rml-register-class', 'class_code', t.classCode, t.classCodeHint, 'text', 'off')}
          <label class="rml-auth-consent">
            <input type="checkbox" name="consent" />
            <span>${escapeHtml(t.consent)}</span>
          </label>
          <div id="rml-register-error" class="rml-auth-error" role="alert" hidden></div>
          <button type="submit" class="rml-auth-submit">${escapeHtml(t.registerBtn)}</button>
        </form>

        <p class="rml-auth-privacy">${escapeHtml(t.privacy)}</p>
      </div>
    `;

    const languageButton = overlay.querySelector('#rml-auth-lang');
    if (languageButton) {
      languageButton.addEventListener('click', () => {
        const next = lang === 'vi' ? 'en' : 'vi';
        localStorage.setItem(langKey, next);
        localStorage.setItem(langKeyAlt, next);
        location.reload();
      });
    }

    overlay.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => showTab(button.dataset.tab));
    });

    const loginForm = overlay.querySelector('#rml-login-form');
    const registerForm = overlay.querySelector('#rml-register-form');
    const loginUsername = overlay.querySelector('#rml-login-username');
    const registerUsername = overlay.querySelector('#rml-register-username');
    const classInput = overlay.querySelector('#rml-register-class');

    if (loginUsername) {
      loginUsername.addEventListener('input', () => {
        loginUsername.value = loginUsername.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
      });
    }
    if (registerUsername) {
      registerUsername.addEventListener('input', () => {
        registerUsername.value = registerUsername.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
      });
    }
    if (classInput) {
      classInput.addEventListener('input', () => {
        classInput.value = classInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      });
    }

    if (loginForm) loginForm.addEventListener('submit', onLoginSubmit);
    if (registerForm) registerForm.addEventListener('submit', onRegisterSubmit);

    showTab('login');
    if (loginUsername) loginUsername.focus();
  }

  function showTab(mode) {
    state.mode = mode === 'register' ? 'register' : 'login';
    const overlay = state.overlay;
    if (!overlay) return;

    overlay.querySelectorAll('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });

    const loginForm = overlay.querySelector('#rml-login-form');
    const registerForm = overlay.querySelector('#rml-register-form');
    if (loginForm) loginForm.hidden = state.mode !== 'login';
    if (registerForm) registerForm.hidden = state.mode !== 'register';
    clearError('login');
    clearError('register');

    const focusId = state.mode === 'login' ? 'rml-login-username' : 'rml-register-name';
    const focusEl = overlay.querySelector(`#${focusId}`);
    if (focusEl) focusEl.focus();
  }

  function setBusy(form, busy) {
    if (!form) return;
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = '...';
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
    } else {
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  }

  function clearError(mode) {
    const el = state.overlay?.querySelector(`#rml-${mode}-error`);
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  function showError(mode, message) {
    const el = state.overlay?.querySelector(`#rml-${mode}-error`);
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function errorMessage(data, response) {
    const error = data && data.error;
    const code = error && error.code;
    if (code === 'VALIDATION_ERROR' && error.details) {
      const details = Object.values(error.details).filter(Boolean);
      if (details.length) return details.slice(0, 3).join(' ');
    }
    if (code === 'INVALID_CREDENTIALS') return lang === 'vi'
      ? 'Sai tên đăng nhập hoặc mật khẩu.'
      : 'Incorrect username or password.';
    if (code === 'CLASS_NOT_FOUND') return lang === 'vi'
      ? 'Mã lớp không đúng. Vui lòng kiểm tra lại.'
      : 'Class code not found. Please check it again.';
    if (code === 'USERNAME_TAKEN') return lang === 'vi'
      ? 'Tên đăng nhập này đã được sử dụng.'
      : 'This username is already taken.';
    if (code === 'ACCOUNT_DISABLED') return lang === 'vi'
      ? 'Tài khoản đã bị khoá. Vui lòng liên hệ giáo viên.'
      : 'This account is disabled. Please contact your teacher.';
    if (code === 'ACCOUNT_LOCKED') return lang === 'vi'
      ? 'Tài khoản tạm thời bị khoá. Vui lòng thử lại sau.'
      : 'This account is temporarily locked. Please try again later.';
    if (code === 'RATE_LIMITED') {
      const retry = response && response.headers.get('Retry-After');
      const suffix = retry ? ` (${retry}s)` : '';
      return (lang === 'vi'
        ? 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.'
        : 'Too many attempts. Please try again later.') + suffix;
    }
    if (code === 'DB_NOT_CONFIGURED' || (response && response.status >= 500)) {
      return t.maintenance;
    }
    if (error && error.message) return error.message;
    return t.maintenance;
  }

  async function onLoginSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearError('login');
    const data = new FormData(form);
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');

    if (!username || !password) {
      showError('login', t.required);
      return;
    }

    setBusy(form, true);
    try {
      const { response, data: payload } = await api(`${AUTH_BASE}/login`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (response.ok && payload?.data?.account) {
        finish(payload.data.account, payload.data.csrf_token);
        return;
      }
      showError('login', errorMessage(payload, response));
    } catch {
      showError('login', t.network);
    } finally {
      setBusy(form, false);
    }
  }

  async function onRegisterSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    clearError('register');
    const data = new FormData(form);
    const displayName = String(data.get('display_name') || '').trim();
    const username = String(data.get('username') || '').trim();
    const password = String(data.get('password') || '');
    const confirm = String(data.get('password_confirm') || '');
    const classCode = String(data.get('class_code') || '').trim().toUpperCase();
    const consent = data.get('consent') === 'on';

    if (!displayName) return showError('register', t.displayNameMissing);
    if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(username)) return showError('register', t.usernameInvalid);
    if (password.length < 8) return showError('register', t.passwordShort);
    if (password !== confirm) return showError('register', t.passwordMismatch);
    if (!/^[A-Z0-9]{4,12}$/.test(classCode)) return showError('register', t.classInvalid);
    if (!consent) return showError('register', t.consentMissing);

    setBusy(form, true);
    try {
      const { response, data: payload } = await api(`${AUTH_BASE}/register`, {
        method: 'POST',
        body: JSON.stringify({
          display_name: displayName,
          username,
          password,
          class_code: classCode,
          consent: true,
        }),
      });
      if (response.ok && payload?.data?.account) {
        finish(payload.data.account, payload.data.csrf_token);
        return;
      }
      showError('register', errorMessage(payload, response));
    } catch {
      showError('register', t.network);
    } finally {
      setBusy(form, false);
    }
  }

  function finish(account, csrf) {
    state.account = account;
    state.csrf = csrf;
    state.authenticated = true;

    localStorage.setItem('rml_student_name', account.display_name);
    localStorage.setItem('rml_account_id', String(account.id));
    localStorage.setItem('rml_account_role', account.role);

    removeOverlay();
    if (!state.readyResolved) {
      state.readyResolved = true;
      resolveReady();
    }

    startHeartbeat();
    installAccountUI();

    if (window.App && typeof window.App.setStudentName === 'function') {
      window.App.setStudentName(account.display_name);
    }
  }

  function installAccountUI() {
    const body = document.querySelector('.settings-modal-body');
    if (!body) return;

    let panel = document.getElementById('rml-account-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'rml-account-panel';
      panel.className = 'settings-row rml-account-panel';

      const labelWrap = document.createElement('div');
      labelWrap.className = 'settings-label-wrap';

      const icon = document.createElement('span');
      icon.className = 'settings-icon-bubble';
      icon.textContent = '👤';

      const textWrap = document.createElement('div');
      const label = document.createElement('span');
      label.className = 'settings-label';
      label.textContent = t.accountPanel;
      const hint = document.createElement('div');
      hint.className = 'settings-hint';
      hint.id = 'rml-account-meta';
      textWrap.appendChild(label);
      textWrap.appendChild(hint);

      labelWrap.appendChild(icon);
      labelWrap.appendChild(textWrap);

      const actions = document.createElement('div');
      actions.className = 'rml-account-actions';

      if (state.account.role === 'admin' || state.account.role === 'teacher') {
        const adminLink = document.createElement('a');
        adminLink.className = 'rml-admin-link';
        adminLink.href = '/admin.html';
        adminLink.textContent = t.admin;
        actions.appendChild(adminLink);
      }

      const logout = document.createElement('button');
      logout.type = 'button';
      logout.className = 'btn-settings-action-pill';
      logout.textContent = t.logout;
      logout.addEventListener('click', onLogoutClick);

      actions.appendChild(logout);
      panel.appendChild(labelWrap);
      panel.appendChild(actions);
      body.appendChild(panel);
    }

    const meta = panel.querySelector('#rml-account-meta');
    if (meta) {
      meta.textContent = `${state.account.username} · ${state.account.class_name || t.noClass}`;
    }

    // The display name is owned by the account; editing it locally would only
    // create a mismatch until the next reload.
    const nameInput = document.getElementById('settings-input-name');
    if (nameInput) {
      nameInput.readOnly = true;
      nameInput.title = lang === 'vi' ? 'Tên lấy từ tài khoản' : 'Name comes from your account';
    }
    const saveName = document.getElementById('btn-save-settings-name');
    if (saveName) saveName.hidden = true;

    const splashInput = document.getElementById('splash-student-name');
    if (splashInput) {
      splashInput.readOnly = true;
      splashInput.title = lang === 'vi' ? 'Tên lấy từ tài khoản' : 'Name comes from your account';
    }
  }

  async function onLogoutClick(event) {
    const button = event.currentTarget;
    if (!window.confirm(t.logoutConfirm)) return;
    button.disabled = true;
    try {
      const { response } = await api(`${AUTH_BASE}/logout`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': state.csrf || '' },
      });
      if (!response.ok && response.status !== 401) {
        window.alert(t.logoutFailed);
        button.disabled = false;
        return;
      }
    } catch {
      window.alert(t.logoutFailed);
      button.disabled = false;
      return;
    }

    localStorage.removeItem('rml_student_name');
    localStorage.removeItem('rml_account_id');
    localStorage.removeItem('rml_account_role');
    state.authenticated = false;
    location.href = '/';
  }

  function startHeartbeat() {
    if (state.heartbeatTimer) return;
    state.heartbeatTimer = setInterval(sendHeartbeat, 60_000);

    if (!state.heartbeatHooked) {
      state.heartbeatHooked = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') sendHeartbeat();
      });
      window.addEventListener('online', sendHeartbeat);
    }

    setTimeout(sendHeartbeat, 4_000);
  }

  async function sendHeartbeat() {
    if (!state.authenticated || !state.csrf) return;
    try {
      const { response } = await api(`${AUTH_BASE}/heartbeat`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': state.csrf },
      });
      if (response.status === 401 || response.status === 403) {
        state.authenticated = false;
        location.reload();
      }
    } catch {
      // Offline: keep using the app; the next beat will retry.
    }
  }

  async function bootstrap() {
    if (state.booting) return;
    state.booting = true;
    renderLoading();

    try {
      const { response, data } = await api(`${AUTH_BASE}/me`);
      if (response.ok && data?.data?.account) {
        finish(data.data.account, data.data.csrf_token);
        return;
      }
      if (response.status === 401) {
        renderGate();
        return;
      }
      if (response.status === 404) {
        renderFatal(lang === 'vi'
          ? 'Máy chủ đăng nhập chưa được triển khai. Vui lòng liên hệ quản trị viên.'
          : 'The login API is not deployed yet. Please contact the administrator.');
        return;
      }
      renderFatal(errorMessage(data, response));
    } catch {
      renderFatal(t.network);
    } finally {
      state.booting = false;
    }
  }

  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
    if (response.status === 401) location.reload();
    return response;
  }

  window.RMLAuth = {
    ready,
    get account() { return state.account; },
    get csrf() { return state.csrf; },
    get authenticated() { return state.authenticated; },
    apiFetch,
    refresh: bootstrap,
  };

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // Cover the app immediately so the static splash is not usable before auth.
  if (document.body) {
    ensureOverlay();
    renderLoading();
  }

  onReady(bootstrap);
})();
