'use strict';

const { getDb } = require('../../lib/db');
const {
  handleError,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
  sendError,
  sendJson,
} = require('../../lib/http');
const { requireAuth, publicAccount } = require('../../lib/auth');
const { normalizeDisplayName, DISPLAY_NAME_MAX } = require('../../lib/validate');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH']);
    requireSameOrigin(req);

    const session = await requireAuth(req, { csrf: true });
    const body = await readJson(req);
    const displayName = normalizeDisplayName(body.display_name);

    if (displayName.length < 1 || displayName.length > DISPLAY_NAME_MAX) {
      return sendError(
        res,
        422,
        'VALIDATION_ERROR',
        'Tên hiển thị không hợp lệ.',
        { display_name: `Tên hiển thị phải có 1-${DISPLAY_NAME_MAX} ký tự.` }
      );
    }

    const sql = getDb();
    const rows = await sql`
      update accounts
      set display_name = ${displayName}
      where id = ${session.account.id}
        and status = 'active'
      returning id, username, display_name, role, class_id, created_at
    `;

    if (!rows.length) {
      return sendError(res, 404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    }

    return sendJson(res, 200, {
      data: {
        account: publicAccount({
          ...rows[0],
          class_name: session.account.class_name,
        }),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
