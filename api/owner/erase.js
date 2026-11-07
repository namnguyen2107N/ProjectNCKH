'use strict';

const { getDb } = require('../../lib/db');
const {
  HttpError,
  handleError,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
  sendJson,
} = require('../../lib/http');
const { requireOwner } = require('../../lib/owner-auth');
const { normalizeProfileId } = require('../../lib/profiles');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);
    await requireOwner(req, { csrf: true });

    const body = await readJson(req, 4 * 1024);
    const profileId = normalizeProfileId(body.profileId);
    if (!profileId) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Thiếu profileId hợp lệ.');
    }

    const sql = getDb();
    const rows = await sql`
      delete from student_profiles
      where id = ${profileId}
      returning id
    `;

    if (!rows.length) {
      throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Không tìm thấy hồ sơ.');
    }

    return sendJson(res, 200, {
      data: { deletedProfileId: profileId },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
