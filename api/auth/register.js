'use strict';

const { getDb } = require('../../lib/db');
const {
  HttpError,
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
const { hashPassword } = require('../../lib/password');
const { validateRegistration } = require('../../lib/validate');
const { hit, cleanup } = require('../../lib/rate-limit');
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
    const validation = validateRegistration(body);
    if (!validation.ok) {
      return sendError(
        res,
        422,
        'VALIDATION_ERROR',
        'Dữ liệu đăng ký không hợp lệ.',
        validation.errors
      );
    }

    const { username, password, displayName, classCode } = validation.data;
    const sql = getDb();
    const ipHash = hashIp(getClientIp(req));

    const ipLimit = await hit(`register:ip:${ipHash}`, 500, 3600);
    if (!ipLimit.allowed) {
      return sendError(
        res,
        429,
        'RATE_LIMITED',
        'Có quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau.',
        null,
        { 'Retry-After': String(ipLimit.retryAfter) }
      );
    }

    // Class code is optional: registrations are open. Legacy clients may still
    // send one, in which case it is validated and the account is grouped.
    let selectedClass = null;
    if (classCode) {
      const classLimit = await hit(`register:class:${classCode}`, 200, 3600);
      if (!classLimit.allowed) {
        return sendError(
          res,
          429,
          'RATE_LIMITED',
          'Lớp này đã tạo quá nhiều tài khoản trong thời gian ngắn. Vui lòng thử lại sau.',
          null,
          { 'Retry-After': String(classLimit.retryAfter) }
        );
      }

      const classes = await sql`
        select id, name, join_code
        from classes
        where join_code = ${classCode}
        limit 1
      `;
      if (!classes.length) {
        return sendError(
          res,
          422,
          'CLASS_NOT_FOUND',
          'Mã lớp không đúng. Vui lòng kiểm tra lại mã giáo viên đã cung cấp.',
          { class_code: 'Mã lớp không tồn tại.' }
        );
      }
      selectedClass = classes[0];
    }

    const passwordHash = await hashPassword(password);
    const consentVersion = process.env.CONSENT_VERSION || '2026-10-v1';

    const result = await sql.begin(async (tx) => {
      let account;
      try {
        const rows = await tx`
          insert into accounts
            (username, password_hash, display_name, role, class_id, status,
             consent_version, consent_granted_at)
          values
            (${username}, ${passwordHash}, ${displayName}, 'student', ${selectedClass ? selectedClass.id : null}, 'active',
             ${consentVersion}, now())
          returning id, username, display_name, role, class_id, created_at
        `;
        account = rows[0];
      } catch (error) {
        if (error.code === '23505') {
          throw new HttpError(409, 'USERNAME_TAKEN', 'Tên đăng nhập này đã được sử dụng.');
        }
        throw error;
      }

      const session = await createSession(tx, account.id, req);
      await recordLoginEvent(tx, {
        accountId: account.id,
        username,
        success: true,
        reason: 'REGISTER',
        ipHash,
      });
      return { account, session };
    });

    await updatePeak(sql).catch(() => {});
    await cleanup().catch(() => {});

    appendSetCookie(
      res,
      sessionCookieHeader(result.session.token, result.session.maxAge)
    );

    return sendJson(res, 201, {
      data: {
        account: publicAccount(result.account, selectedClass ? selectedClass.name : null),
        csrf_token: result.session.csrf,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
