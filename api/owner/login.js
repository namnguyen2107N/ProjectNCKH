'use strict';

const { getDb } = require('../../lib/db');
const {
  appendSetCookie,
  getClientIp,
  handleError,
  hashIp,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
  sendError,
  sendJson,
} = require('../../lib/http');
const { verifyPassword, verifyDummyPassword } = require('../../lib/password');
const { createOwnerSession, ownerCookieHeader, publicOwner } = require('../../lib/owner-auth');
const { hit } = require('../../lib/rate-limit');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);

    const body = await readJson(req, 4 * 1024);
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!username || !password) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Vui lòng nhập tên đăng nhập và mật khẩu.');
    }

    const sql = getDb();
    const ipHash = hashIp(getClientIp(req));
    const ipLimit = await hit(`owner-login:ip:${ipHash}`, 20, 900);
    const userLimit = await hit(`owner-login:user:${username}`, 10, 900);
    if (!ipLimit.allowed || !userLimit.allowed) {
      return sendError(res, 429, 'RATE_LIMITED', 'Quá nhiều lần đăng nhập. Vui lòng thử lại sau.', null, {
        'Retry-After': String(Math.max(ipLimit.retryAfter, userLimit.retryAfter)),
      });
    }

    const rows = await sql`
      select id, username, password_hash
      from owner_accounts
      where username = ${username}
      limit 1
    `;

    const owner = rows[0];
    const valid = owner
      ? await verifyPassword(password, owner.password_hash)
      : await verifyDummyPassword(password);

    if (!owner || !valid) {
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.');
    }

    const session = await createOwnerSession(sql, owner.id, req);
    appendSetCookie(res, ownerCookieHeader(session.token, session.maxAge));

    await sql`
      update owner_accounts
      set last_login_at = now()
      where id = ${owner.id}
    `;

    return sendJson(res, 200, {
      data: {
        owner: publicOwner(owner),
        csrf_token: session.csrf,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
