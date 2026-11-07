'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { HttpError } = require('./http');

const NAME_MAX = 50;
const AGE_MIN = 3;
const AGE_MAX = 18;

function normalizeDisplayName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeAge(value) {
  const age = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(age) ? age : NaN;
}

/**
 * Validate the light student login (name + age only).
 * Returns { displayName, age } or throws a 422 HttpError.
 */
function normalizeProfileInput(body) {
  const displayName = normalizeDisplayName(body?.displayName ?? body?.display_name);
  const age = normalizeAge(body?.age);
  const errors = {};

  if (displayName.length < 1 || displayName.length > NAME_MAX) {
    errors.displayName = `Tên phải có 1-${NAME_MAX} ký tự.`;
  }
  if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) {
    errors.age = `Tuổi phải nằm trong khoảng ${AGE_MIN}-${AGE_MAX}.`;
  }

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Thông tin học sinh không hợp lệ.', errors);
  }

  return { displayName, age };
}

function normalizeProfileId(value) {
  const id = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function newProfileToken() {
  return randomBytes(32).toString('base64url');
}

function hashProfileToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

/**
 * Return the profile row only when both the id and device token match.
 */
async function verifyProfileAccess(sql, profileId, token) {
  const id = normalizeProfileId(profileId);
  if (!id || !token) return null;
  const rows = await sql`
    select id, display_name, age, created_at
    from student_profiles
    where id = ${id}
      and access_token_hash = ${hashProfileToken(token)}
      and deactivated_at is null
    limit 1
  `;
  return rows[0] || null;
}

module.exports = {
  NAME_MAX,
  AGE_MIN,
  AGE_MAX,
  normalizeDisplayName,
  normalizeAge,
  normalizeProfileInput,
  normalizeProfileId,
  newProfileToken,
  hashProfileToken,
  verifyProfileAccess,
};
