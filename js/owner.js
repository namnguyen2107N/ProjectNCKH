'use strict';

(function () {
  const TASK_NAMES = {
    'task1-reach': 'Nhiệm vụ 1 — Hành trình đến đích',
    'task2-fix': 'Nhiệm vụ 2 — Chuyến đi bất ngờ',
    'task3-new': 'Nhiệm vụ 3 — Thử thách đúng giờ',
  };

  const state = {
    csrf: null,
    owner: null,
    profileId: null,
    toastTimer: null,
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function fmtDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  }

  function fmtDuration(seconds) {
    const total = Math.max(0, Number(seconds) || 0);
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    if (minutes < 60) return `${minutes}m ${rest}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function taskName(id) {
    return TASK_NAMES[id] || id || '—';
  }

  function toast(message) {
    const el = $('owner-toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function showLogin() {
    state.csrf = null;
    state.owner = null;
    $('dashboard-view').hidden = true;
    $('login-view').hidden = false;
    $('btn-logout').hidden = true;
    $('events-panel').hidden = true;
  }

  function showDashboard() {
    $('login-view').hidden = true;
    $('dashboard-view').hidden = false;
    $('btn-logout').hidden = false;
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (options.csrf && state.csrf) headers['X-CSRF-Token'] = state.csrf;

    const response = await fetch(path, {
      ...options,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (response.status === 401 && !options.allow401) {
      showLogin();
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'Không tải được dữ liệu.');
    }
    return payload;
  }

  function filterParams() {
    const params = new URLSearchParams();
    const task = $('filter-task').value;
    const from = $('filter-from').value;
    const to = $('filter-to').value;
    if (task) params.set('taskId', task);
    if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
    if (state.profileId) params.set('profileId', String(state.profileId));
    return params;
  }

  function renderStudents(students) {
    const body = $('students-body');
    const empty = $('students-empty');
    const count = $('students-count');
    if (count) count.textContent = `${students.length} hồ sơ`;
    empty.hidden = students.length > 0;

    body.innerHTML = students.map((student) => `
      <tr>
        <td>${escapeHtml(student.displayName)}</td>
        <td class="owner-num">${student.age}</td>
        <td class="owner-num">${student.sessionCount}</td>
        <td class="owner-num">${student.successCount}</td>
        <td>${fmtDate(student.lastSeenAt || student.lastSessionAt)}</td>
        <td>
          <button type="button" class="owner-btn" data-action="view-sessions" data-id="${student.id}" data-name="${escapeHtml(student.displayName)}">Phiên</button>
          <button type="button" class="owner-btn owner-btn-danger" data-action="erase" data-id="${student.id}" data-name="${escapeHtml(student.displayName)}">Xoá</button>
        </td>
      </tr>
    `).join('');
  }

  function renderSessions(sessions) {
    const body = $('sessions-body');
    const empty = $('sessions-empty');
    const count = $('sessions-count');
    if (count) count.textContent = `${sessions.length} phiên`;
    empty.hidden = sessions.length > 0;

    body.innerHTML = sessions.map((session) => {
      const success = session.finalSuccess === true;
      const done = session.finalSuccess === false;
      const pill = success ? 'owner-pill-success' : done ? 'owner-pill-warn' : 'owner-pill-neutral';
      const label = success ? 'Đạt đích' : done ? 'Chưa đạt' : 'Chưa xong';
      return `
        <tr>
          <td>${fmtDate(session.startedAt)}</td>
          <td>${escapeHtml(session.displayName)} (${session.age})</td>
          <td>${escapeHtml(taskName(session.taskId))}</td>
          <td class="owner-num">${fmtDuration(session.totalTimeSeconds)}</td>
          <td class="owner-num">${session.totalAttempts}</td>
          <td class="owner-num">${session.hintsOpened}</td>
          <td class="owner-num">${session.vocabLookups}</td>
          <td><span class="owner-pill ${pill}">${label}</span></td>
          <td><button type="button" class="owner-btn" data-action="view-events" data-id="${session.id}">Chi tiết</button></td>
        </tr>
      `;
    }).join('');
  }

  function renderEvents(session, events) {
    $('events-panel').hidden = false;
    $('events-title').textContent = `#${session.id} · ${session.displayName} (${session.age}) · ${taskName(session.taskId)}`;
    const body = $('events-body');
    const empty = $('events-empty');
    empty.hidden = events.length > 0;
    body.innerHTML = events.map((event) => `
      <tr>
        <td>${fmtDate(event.createdAt)}</td>
        <td><strong>${escapeHtml(event.code)}</strong></td>
        <td class="owner-num">${event.step ?? '—'}</td>
        <td>${escapeHtml(event.label || '')}</td>
        <td><div class="owner-event-payload">${escapeHtml(JSON.stringify(event.payload || {}, null, 2))}</div></td>
      </tr>
    `).join('');
    $('events-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadStudents() {
    const q = $('filter-q').value.trim();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const data = await request(`/api/owner/students?${params.toString()}`);
    const students = data?.data?.students || [];
    const totals = data?.data?.totals || {};
    $('stat-students').textContent = totals.students ?? students.length;
    $('stat-sessions').textContent = totals.sessions ?? 0;
    $('stat-success').textContent = totals.successSessions ?? 0;
    renderStudents(students);
  }

  async function loadSessions() {
    const params = filterParams();
    params.set('limit', '200');
    const data = await request(`/api/owner/sessions?${params.toString()}`);
    renderSessions(data?.data?.sessions || []);
  }

  async function loadAll() {
    try {
      await loadStudents();
      await loadSessions();
    } catch (error) {
      toast(error.message);
    }
  }

  async function viewEvents(sessionId) {
    try {
      const data = await request(`/api/owner/events?sessionId=${encodeURIComponent(sessionId)}`);
      renderEvents(data.data.session, data.data.events || []);
    } catch (error) {
      toast(error.message);
    }
  }

  async function eraseProfile(profileId, displayName) {
    const ok = window.confirm(`Xoá toàn bộ dữ liệu của "${displayName}"? Thao tác này không thể hoàn tác.`);
    if (!ok) return;
    try {
      await request('/api/owner/erase', {
        method: 'POST',
        csrf: true,
        body: JSON.stringify({ profileId }),
      });
      toast('Đã xoá dữ liệu học sinh.');
      state.profileId = null;
      await loadAll();
    } catch (error) {
      toast(error.message);
    }
  }

  async function login(event) {
    event.preventDefault();
    const errorEl = $('login-error');
    const button = $('btn-login');
    errorEl.hidden = true;
    button.disabled = true;
    button.textContent = 'Đang đăng nhập...';

    try {
      const payload = await request('/api/owner/login', {
        method: 'POST',
        allow401: true,
        body: JSON.stringify({
          username: $('owner-username').value,
          password: $('owner-password').value,
        }),
      });
      state.owner = payload.data.owner;
      state.csrf = payload.data.csrf_token;
      showDashboard();
      $('owner-password').value = '';
      await loadAll();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'Đăng nhập';
    }
  }

  async function logout() {
    try {
      await request('/api/owner/logout', { method: 'POST', csrf: true });
    } catch { /* session may already be gone */ }
    showLogin();
    toast('Đã đăng xuất.');
  }

  function exportCsv() {
    const params = filterParams();
    window.location.href = `/api/owner/export?${params.toString()}`;
  }

  function bind() {
    $('login-form').addEventListener('submit', login);
    $('btn-logout').addEventListener('click', logout);
    $('btn-apply').addEventListener('click', loadAll);
    $('btn-export').addEventListener('click', exportCsv);
    $('btn-reset').addEventListener('click', () => {
      $('filter-q').value = '';
      $('filter-task').value = '';
      $('filter-from').value = '';
      $('filter-to').value = '';
      state.profileId = null;
      loadAll();
    });
    $('btn-close-events').addEventListener('click', () => {
      $('events-panel').hidden = true;
    });

    $('students-body').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const id = Number(button.dataset.id);
      if (button.dataset.action === 'view-sessions') {
        state.profileId = id;
        $('events-panel').hidden = true;
        loadSessions().catch((error) => toast(error.message));
        toast(`Đang xem phiên của ${button.dataset.name}.`);
      }
      if (button.dataset.action === 'erase') {
        eraseProfile(id, button.dataset.name);
      }
    });

    $('sessions-body').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action="view-events"]');
      if (!button) return;
      viewEvents(Number(button.dataset.id));
    });
  }

  async function boot() {
    bind();
    try {
      const payload = await request('/api/owner/me');
      state.owner = payload.data.owner;
      state.csrf = payload.data.csrf_token;
      showDashboard();
      await loadAll();
    } catch {
      showLogin();
    }
  }

  boot();
})();
