'use strict';

const { getDb } = require('../lib/db');
const {
  HttpError,
  getClientIp,
  handleError,
  hashIp,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
  sendError,
  sendJson,
} = require('../lib/http');
const { normalizeProfileId, verifyProfileAccess } = require('../lib/profiles');
const { hit } = require('../lib/rate-limit');

function currentConsentVersion() {
  return process.env.CONSENT_VERSION || '2026-11-v1';
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);

    const body = await readJson(req, 4 * 1024);
    const profileId = normalizeProfileId(body.profileId);
    const profileToken = typeof body.profileToken === 'string' ? body.profileToken : '';
    const version = String(body.consentVersion || '').trim();

    if (!profileId || !profileToken) {
      throw new HttpError(401, 'PROFILE_UNAUTHORIZED', 'Hồ sơ không hợp lệ trên thiết bị này.');
    }
    if (!version) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Thiếu phiên bản consent.', {
        consentVersion: 'consentVersion là bắt buộc.',
      });
    }

    const sql = getDb();
    const profile = await verifyProfileAccess(sql, profileId, profileToken);
    if (!profile) {
      throw new HttpError(401, 'PROFILE_UNAUTHORIZED', 'Hồ sơ không hợp lệ trên thiết bị này.');
    }

    const limit = await hit(`consent:ip:${hashIp(getClientIp(req))}`, 500, 3600);
    if (!limit.allowed) {
      return sendError(res, 429, 'RATE_LIMITED', 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.', null, {
        'Retry-After': String(limit.retryAfter),
      });
    }

    const expected = currentConsentVersion();
    if (version !== expected) {
      return sendError(res, 409, 'CONSENT_VERSION_MISMATCH', 'Phiên bản consent đã thay đổi.', {
        expectedVersion: expected,
      });
    }

    const rows = await sql`
      insert into consents (profile_id, consent_version)
      values (${profileId}, ${expected})
      on conflict (profile_id, consent_version) do update
      set granted_at = now(),
          revoked_at = null
      returning consent_version, granted_at
    `;

    await sql`
      update student_profiles
      set last_seen_at = now()
      where id = ${profileId}
    `;

    return sendJson(res, 200, {
      data: {
        consentVersion: rows[0].consent_version,
        grantedAt: rows[0].granted_at,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
