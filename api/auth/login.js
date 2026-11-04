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
const { validateLogin } = require('../../lib/validate');
const { hit, reset, cleanup } = require('../../lib/rate-limit');
const {
  createSession,
  sessionCookieHeader,
  recordLoginEvent,
  publicAccount,
} = require('../../lib/auth');
const { updatePeak } = require('../../lib/metrics');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);

    const body = await readJson(req);
    const validation = validateLogin(body);
    if (!validation.ok) {
      return sendError(res, 422, 'VALIDATION_ERROR', 'Dữ liệu đăng nhập không hợp lệ.', validation.errors);
    }

    const { username, password } = validation.data;
    const sql = getDb();
    const ipHash = hashIp(getClientIp(req));

    const ipLimit = await hit(`login:ip:${ipHash}`, 600, 900);
    if (!ipLimit.allowed) {
      return sendError(
        res,
        429,
        'RATE_LIMITED',
        'Có quá nhiều lần đăng nhập từ mạng này. Vui lòng thử lại sau.',
        null,
        { 'Retry-After': String(ipLimit.retryAfter) }
      );
    }

    const userBucket = `login:user:${username}`;
    const userLimit = await hit(userBucket, 10, 900);
    if (!userLimit.allowed) {
      return sendError(
        res,
        429,
        'RATE_LIMITED',
        'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.',
        null,
        { 'Retry-After': String(userLimit.retryAfter) }
      );
    }

    const rows = await sql`
      select a.id, a.username, a.password_hash, a.display_name, a.role,
             a.class_id, a.status, a.created_at, a.locked_until,
             c.name as class_name
      from accounts a
      left join classes c on c.id = a.class_id
      where a.username = ${username}
      limit 1
    `;
    const account = rows[0];

    // Run a real scrypt verification even for unknown usernames so that the
    // response time does not reveal whether an account exists.
    const passwordValid = account
      ? await verifyPassword(password, account.password_hash)
      : await verifyDummyPassword(password);

    if (!account || !passwordValid) {
      if (account) {
        await sql`
          update accounts
          set failed_login_count = failed_login_count + 1
          where id = ${account.id}
        `;
      }
      await recordLoginEvent(sql, {
        accountId: account?.id ?? null,
        username,
        success: false,
        reason: 'BAD_CREDENTIALS',
        ipHash,
      });
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.');
    }

    if (account.status !== 'active') {
      await recordLoginEvent(sql, {
        accountId: account.id,
        username,
        success: false,
        reason: 'ACCOUNT_DISABLED',
        ipHash,
      });
      return sendError(res, 403, 'ACCOUNT_DISABLED', 'Tài khoản đã bị khoá. Vui lòng liên hệ giáo viên.');
    }

    if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
      await recordLoginEvent(sql, {
        accountId: account.id,
        username,
        success: false,
        reason: 'ACCOUNT_LOCKED',
        ipHash,
      });
      return sendError(res, 423, 'ACCOUNT_LOCKED', 'Tài khoản tạm thời bị khoá. Vui lòng thử lại sau.');
    }

    await reset(userBucket);

    const session = await sql.begin(async (tx) => {
      const created = await createSession(tx, account.id, req);
      await tx`
        update accounts
        set last_login_at = now(),
            failed_login_count = 0,
            locked_until = null
        where id = ${account.id}
      `;
      await recordLoginEvent(tx, {
        accountId: account.id,
        username,
        success: true,
        reason: 'LOGIN',
        ipHash,
      });
      return created;
    });

    await updatePeak(sql).catch(() => {});
    await cleanup().catch(() => {});

    appendSetCookie(res, sessionCookieHeader(session.token, session.maxAge));

    return sendJson(res, 200, {
      data: {
        account: publicAccount(account),
        csrf_token: session.csrf,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
