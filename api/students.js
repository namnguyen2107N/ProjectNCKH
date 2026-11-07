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
const {
  normalizeProfileInput,
  normalizeProfileId,
  newProfileToken,
  hashProfileToken,
} = require('../lib/profiles');
const { hit } = require('../lib/rate-limit');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);

    const body = await readJson(req, 8 * 1024);
    const input = normalizeProfileInput(body);
    const sql = getDb();

    const ipHash = hashIp(getClientIp(req));
    const limit = await hit(`students:ip:${ipHash}`, 500, 3600);
    if (!limit.allowed) {
      return sendError(
        res,
        429,
        'RATE_LIMITED',
        'Có quá nhiều yêu cầu tạo hồ sơ. Vui lòng thử lại sau.',
        null,
        { 'Retry-After': String(limit.retryAfter) }
      );
    }

    const profileId = normalizeProfileId(body.profileId);
    const profileToken = typeof body.profileToken === 'string' ? body.profileToken : '';
    const expectedConsent = process.env.CONSENT_VERSION || '2026-11-v1';

    if (profileId) {
      if (!profileToken) {
        throw new HttpError(401, 'PROFILE_UNAUTHORIZED', 'Thiếu mã truy cập hồ sơ.');
      }
      const updated = await sql`
        update student_profiles
        set display_name = ${input.displayName},
            age = ${input.age},
            last_seen_at = now()
        where id = ${profileId}
          and access_token_hash = ${hashProfileToken(profileToken)}
          and deactivated_at is null
        returning id, display_name, age
      `;
      if (!updated.length) {
        throw new HttpError(401, 'PROFILE_UNAUTHORIZED', 'Hồ sơ không hợp lệ trên thiết bị này.');
      }
      return sendJson(res, 200, {
        data: {
          profile: {
            id: Number(updated[0].id),
            displayName: updated[0].display_name,
            age: Number(updated[0].age),
          },
          profileToken,
          updated: true,
        },
      });
    }

    const consentVersion = String(body.consentVersion || '').trim();
    if (!consentVersion) {
      throw new HttpError(422, 'CONSENT_REQUIRED', 'Cần đồng ý lưu dữ liệu trước khi tạo hồ sơ.');
    }
    if (consentVersion !== expectedConsent) {
      return sendError(res, 409, 'CONSENT_VERSION_MISMATCH', 'Phiên bản consent đã thay đổi.', {
        expectedVersion: expectedConsent,
      });
    }

    const token = newProfileToken();
    const profile = await sql.begin(async (tx) => {
      const rows = await tx`
        insert into student_profiles (display_name, age, access_token_hash, last_seen_at)
        values (${input.displayName}, ${input.age}, ${hashProfileToken(token)}, now())
        returning id, display_name, age
      `;
      await tx`
        insert into consents (profile_id, consent_version)
        values (${rows[0].id}, ${expectedConsent})
        on conflict (profile_id, consent_version) do update
        set granted_at = now(),
            revoked_at = null
      `;
      return rows[0];
    });

    return sendJson(res, 201, {
      data: {
        profile: {
          id: Number(profile.id),
          displayName: profile.display_name,
          age: Number(profile.age),
        },
        profileToken: token,
        updated: false,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
