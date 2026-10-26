'use strict';

const { getDb } = require('../../lib/db');
const {
  HttpError,
  handleError,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
  sendError,
  sendJson,
} = require('../../lib/http');
const { requireAuth, requireRole } = require('../../lib/auth');
const { generateJoinCode, validateClassInput } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);

    const session = await requireAuth(req, { csrf: true });
    requireRole(session, ['admin', 'teacher']);

    const body = await readJson(req);
    const validation = validateClassInput(body);
    if (!validation.ok) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Dữ liệu lớp không hợp lệ.', validation.errors);
    }

    const sql = getDb();
    const { name } = validation.data;
    let joinCode = validation.data.joinCode || generateJoinCode();
    const explicitCode = Boolean(validation.data.joinCode);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const rows = await sql`
          insert into classes (name, join_code, teacher_id)
          values (${name}, ${joinCode}, ${session.account.id})
          returning id, name, join_code, created_at
        `;
        return sendJson(res, 201, {
          data: {
            class: {
              id: Number(rows[0].id),
              name: rows[0].name,
              join_code: rows[0].join_code,
              created_at: rows[0].created_at,
            },
          },
        });
      } catch (error) {
        if (error.code !== '23505') throw error;
        if (explicitCode) {
          throw new HttpError(409, 'CLASS_CODE_TAKEN', 'Mã lớp này đã được sử dụng.');
        }
        joinCode = generateJoinCode();
      }
    }

    throw new HttpError(500, 'CLASS_CODE_ERROR', 'Không thể tạo mã lớp. Vui lòng thử lại.');
  } catch (error) {
    return handleError(res, error);
  }
};
