'use strict';

const { randomInt } = require('node:crypto');
const { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } = require('./password');

const USERNAME_RE = /^[a-z0-9][a-z0-9_]{2,23}$/;
const CLASS_CODE_RE = /^[A-Z0-9]{4,12}$/;
const DISPLAY_NAME_MAX = 50;
const CLASS_NAME_MAX = 100;

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'teacher',
  'giaovien',
  'giao_vien',
  'robot',
  'sparky',
]);

// Ambiguous characters (0/O, 1/I) are intentionally excluded.
const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeClassCode(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function normalizeDisplayName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function generateJoinCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += JOIN_CODE_CHARS[randomInt(0, JOIN_CODE_CHARS.length)];
  }
  return code;
}

function validateRegistration(body) {
  const errors = {};
  const username = normalizeUsername(body.username);
  const displayName = normalizeDisplayName(body.display_name);
  const classCode = normalizeClassCode(body.class_code);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!USERNAME_RE.test(username)) {
    errors.username = 'Tên đăng nhập phải có 3-24 ký tự, chỉ gồm chữ thường, số và dấu gạch dưới.';
  } else if (RESERVED_USERNAMES.has(username)) {
    errors.username = 'Tên đăng nhập này không được sử dụng.';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Mật khẩu không được quá ${PASSWORD_MAX_LENGTH} ký tự.`;
  }

  if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX) {
    errors.display_name = `Tên hiển thị phải có 1-${DISPLAY_NAME_MAX} ký tự.`;
  }

  // Class code is now optional. Validate only when a legacy client sends one.
  if (classCode && !CLASS_CODE_RE.test(classCode)) {
    errors.class_code = 'Mã lớp phải có 4-12 ký tự chữ hoặc số.';
  }

  if (body.consent !== true) {
    errors.consent = 'Bạn cần đồng ý với việc ghi nhận dữ liệu học tập.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: { username, password, displayName, classCode },
  };
}

function validateLogin(body) {
  const errors = {};
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!USERNAME_RE.test(username)) {
    errors.username = 'Tên đăng nhập không hợp lệ.';
  }
  if (password.length < 1 || password.length > PASSWORD_MAX_LENGTH) {
    errors.password = 'Mật khẩu không hợp lệ.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: { username, password },
  };
}

function validateClassInput(body) {
  const errors = {};
  const name = normalizeDisplayName(body.name).slice(0, CLASS_NAME_MAX);
  const joinCode = body.join_code ? normalizeClassCode(body.join_code) : '';

  if (name.length < 1) {
    errors.name = 'Tên lớp không được để trống.';
  }
  if (joinCode && !CLASS_CODE_RE.test(joinCode)) {
    errors.join_code = 'Mã lớp phải có 4-12 ký tự chữ hoặc số.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: { name, joinCode },
  };
}

module.exports = {
  USERNAME_RE,
  CLASS_CODE_RE,
  DISPLAY_NAME_MAX,
  RESERVED_USERNAMES,
  normalizeUsername,
  normalizeClassCode,
  normalizeDisplayName,
  generateJoinCode,
  validateRegistration,
  validateLogin,
  validateClassInput,
};
