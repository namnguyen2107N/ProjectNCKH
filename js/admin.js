(function () {
  'use strict';

  const state = {
    account: null,
    csrf: null,
    timer: null,
    loginHooked: false,
  };

  const $ = (id) => document.getElementById(id);

  function text(id, value) {
    const el = $(id);
    if (el) el.textContent = value == null || value === '' ? '—' : String(value);
  }

  function setHidden(id, hidden) {
    const el = $(id);
    if (el) el.hidden = hidden;
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.csrf) headers['X-CSRF-Token'] = state.csrf;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(path, {
        ...options,
        headers,
        credentials: 'same-origin',
        signal: options.signal || controller.signal,
      });

      let data = null;
      const type = response.headers.get('content-type') || '';
      if (type.includes('application/json')) {
        try { data = await response.json(); } catch { data = null; }
      }
      return { response, data };
    } finally {
      clearTimeout(timer);
    }
  }

  function errorMessage(data, response) {
    if (data?.error?.code === 'VALIDATION_ERROR' && data.error.details) {
      return Object.values(data.error.details).filter(Boolean).slice(0, 3).join(' ');
    }
    if (data?.error?.message) return data.error.message;
    if (response && response.status >= 500) return '🤖 Máy chủ đang bận. Thử lại sau nhé!';
    return '🤖 Có gì đó chưa ổn. Thử lại nhé!';
  }

  function stopTimer() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  function showLogin(message) {
    stopTimer();
    state.account = null;
    state.csrf = null;
    setHidden('admin-login', false);
    setHidden('admin-dashboard', true);
    setHidden('admin-noaccess', true);
    setHidden('admin-logout', true);

    const error = $('admin-login-error');
    if (error) {
      if (message) {
        error.textContent = message;
        error.hidden = false;
      } else {
        error.textContent = '';
        error.hidden = true;
      }
    }

    hookLogin();
  }

  function showNoAccess() {
    stopTimer();
    setHidden('admin-login', true);
    setHidden('admin-dashboard', true);
    setHidden('admin-noaccess', false);
    setHidden('admin-logout', false);
  }

  function showDashboard() {
    setHidden('admin-login', true);
    setHidden('admin-noaccess', true);
    setHidden('admin-dashboard', false);
    setHidden('admin-logout', false);
  }

  function formatTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(date);
  }

  function roleLabel(role) {
    if (role === 'admin') return '👑 Quản trị';
    if (role === 'teacher') return '🍎 Giáo viên';
    return '🎒 Học sinh';
  }

  function renderOnlineUsers(users) {
    const body = $('admin-online-body');
    if (!body) return;
    body.innerHTML = '';

    if (!users || !users.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'admin-empty';
      cell.textContent = 'Chưa có ai online trong 2 phút gần nhất.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    for (const user of users) {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = 'admin-online-dot';
      dot.setAttribute('aria-hidden', 'true');
      nameCell.appendChild(dot);
      nameCell.appendChild(document.createTextNode(user.display_name || '—'));

      const usernameCell = document.createElement('td');
      usernameCell.textContent = `@${user.username}`;

      const classCell = document.createElement('td');
      classCell.textContent = user.class_name || '—';

      const roleCell = document.createElement('td');
      roleCell.textContent = roleLabel(user.role);

      const timeCell = document.createElement('td');
      timeCell.textContent = formatTime(user.last_seen_at);

      row.append(nameCell, usernameCell, classCell, roleCell, timeCell);
      body.appendChild(row);
    }
  }

  async function copyText(value, button) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        window.prompt('Mã lớp:', value);
        return;
      }
      const original = button.textContent;
      button.textContent = 'Đã copy';
      setTimeout(() => { button.textContent = original; }, 1500);
    } catch {
      window.prompt('Mã lớp:', value);
    }
  }

  function renderClasses(classes) {
    const body = $('admin-classes-body');
    if (!body) return;
    body.innerHTML = '';

    if (!classes || !classes.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'admin-empty';
      cell.textContent = 'Chưa có lớp nào. Hãy tạo lớp mới bên dưới.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    for (const item of classes) {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = item.name;

      const codeCell = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = item.join_code;
      codeCell.appendChild(code);

      const accountsCell = document.createElement('td');
      accountsCell.textContent = String(item.accounts_total ?? 0);

      const onlineCell = document.createElement('td');
      if (Number(item.online_now) > 0) {
        const dot = document.createElement('span');
        dot.className = 'admin-online-dot';
        dot.setAttribute('aria-hidden', 'true');
        onlineCell.appendChild(dot);
      }
      onlineCell.appendChild(document.createTextNode(String(item.online_now ?? 0)));

      const actionCell = document.createElement('td');
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'admin-copy';
      copy.textContent = 'Copy mã';
      copy.addEventListener('click', () => copyText(item.join_code, copy));
      actionCell.appendChild(copy);

      row.append(nameCell, codeCell, accountsCell, onlineCell, actionCell);
      body.appendChild(row);
    }
  }

  function renderStats(data) {
    text('admin-online', data.online_now ?? 0);
    text('admin-peak', data.peak_today ?? 0);
    text('admin-logins', data.logins_today ?? 0);
    text('admin-failed', data.failed_logins_today ?? 0);
    text('admin-accounts', data.accounts_total ?? 0);
    text('admin-today', data.today || '—');
    text('admin-online-count', `${data.online_now ?? 0} bạn`);
    text('admin-scope', data.scope === 'all' ? 'Toàn hệ thống' : 'Lớp phụ trách');
    text(
      'admin-sparky-line',
      Number(data.online_now) > 0
        ? `Có ${data.online_now} bạn đang học cùng mình!`
        : 'Sẵn sàng chào đón các bạn!'
    );

    const threshold = data.alert?.threshold ?? 100;
    text('admin-threshold', threshold);

    const alert = $('admin-alert');
    if (alert) {
      if (data.alert?.active) {
        alert.textContent = `Có ${data.online_now} bạn đang online (ngưỡng ${threshold}). Sparky vẫn mở cửa cho các bạn tiếp theo!`;
        alert.hidden = false;
      } else {
        alert.textContent = '';
        alert.hidden = true;
      }
    }

    renderOnlineUsers(data.online_users || []);
    renderClasses(data.classes || []);
  }

  async function loadStats() {
    try {
      const { response, data } = await api('/api/admin/stats');
      if (response.status === 401) {
        showLogin('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }
      if (response.status === 403) {
        showNoAccess();
        return;
      }
      if (!response.ok) {
        console.warn('Cannot load stats:', data);
        return;
      }
      renderStats(data.data || {});
    } catch (error) {
      console.warn('Stats request failed:', error);
    }
  }

  function startTimer() {
    stopTimer();
    state.timer = setInterval(loadStats, 30_000);
  }

  function hookLogin() {
    if (state.loginHooked) return;
    state.loginHooked = true;

    const form = $('admin-login-form');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = $('admin-login-error');
      if (error) error.hidden = true;

      const data = new FormData(form);
      const username = String(data.get('username') || '').trim();
      const password = String(data.get('password') || '');
      if (!username || !password) {
        if (error) {
          error.textContent = 'Thầy/cô nhập tên đăng nhập và mật khẩu nhé!';
          error.hidden = false;
        }
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      const original = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = 'Đang đăng nhập...';
      }

      try {
        const { response, data: payload } = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        if (response.ok) {
          await boot();
          return;
        }
        if (error) {
          error.textContent = errorMessage(payload, response);
          error.hidden = false;
        }
      } catch {
        if (error) {
          error.textContent = '🤖 Sparky không kết nối được máy chủ. Thử lại nhé!';
          error.hidden = false;
        }
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = original;
        }
      }
    });
  }

  async function boot() {
    try {
      const { response, data } = await api('/api/auth/me');
      if (response.ok && data?.data?.account) {
        state.account = data.data.account;
        state.csrf = data.data.csrf_token;

        if (!['admin', 'teacher'].includes(state.account.role)) {
          showNoAccess();
          return;
        }

        showDashboard();
        await loadStats();
        startTimer();
        return;
      }

      if (response.status === 401) {
        showLogin();
        return;
      }

      showLogin(errorMessage(data, response));
    } catch {
      showLogin('🤖 Sparky không kết nối được máy chủ. Thử lại nhé!');
    }
  }

  function hookLogout() {
    const button = $('admin-logout');
    if (!button) return;

    button.addEventListener('click', async () => {
      if (!window.confirm('Đăng xuất khỏi trang quản trị?')) return;
      button.disabled = true;
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {
        // Even if the request fails, send the user back to the login gate.
      }
      location.href = '/';
    });
  }

  function hookCreateClass() {
    const form = $('admin-create-class-form');
    if (!form) return;

    const codeInput = $('admin-class-code');
    if (codeInput) {
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const result = $('admin-class-result');
      if (result) {
        result.hidden = true;
        result.textContent = '';
        result.classList.remove('is-error');
      }

      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const joinCode = String(data.get('join_code') || '').trim().toUpperCase();

      if (!name) {
        if (result) {
          result.textContent = 'Thầy/cô đặt tên cho lớp nhé!';
          result.classList.add('is-error');
          result.hidden = false;
        }
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      const original = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = 'Đang tạo...';
      }

      try {
        const { response, data: payload } = await api('/api/admin/classes', {
          method: 'POST',
          body: JSON.stringify({ name, join_code: joinCode || undefined }),
        });

        if (response.ok && payload?.data?.class) {
          const created = payload.data.class;
          if (result) {
            result.innerHTML = '';
            result.classList.remove('is-error');
            result.appendChild(document.createTextNode('🎉 Đã tạo lớp! Mã lớp: '));
            const code = document.createElement('code');
            code.textContent = created.join_code;
            result.appendChild(code);
            result.appendChild(document.createTextNode(' — dùng khi cần quản lý lớp.'));
            result.hidden = false;
          }
          form.reset();
          await loadStats();
        } else if (result) {
          result.textContent = errorMessage(payload, response);
          result.classList.add('is-error');
          result.hidden = false;
        }
      } catch {
        if (result) {
          result.textContent = '🤖 Sparky chưa tạo được lớp. Kiểm tra kết nối và thử lại nhé!';
          result.classList.add('is-error');
          result.hidden = false;
        }
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = original;
        }
      }
    });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    hookLogout();
    hookCreateClass();
    boot();
  });
})();
