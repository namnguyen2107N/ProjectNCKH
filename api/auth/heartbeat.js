'use strict';

const { getDb } = require('../../lib/db');
const { handleError, methodNotAllowed, sendJson } = require('../../lib/http');
const { requireAuth } = require('../../lib/auth');
const { hit, cleanup } = require('../../lib/rate-limit');
const { updatePeak } = require('../../lib/metrics');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    const session = await requireAuth(req, { csrf: true });
    const sql = getDb();

    const limit = await hit(`heartbeat:${session.account.id}`, 30, 60);
    if (!limit.allowed) {
      return sendJson(res, 429, {
        error: {
          code: 'RATE_LIMITED',
          message: 'Heartbeat quá nhanh.',
        },
      }, { 'Retry-After': String(limit.retryAfter) });
    }

    await sql`
      update auth_sessions
      set last_seen_at = now()
      where id = ${session.sessionId}
    `;

    const online = await updatePeak(sql).catch(() => 0);
    await cleanup().catch(() => {});

    return sendJson(res, 200, {
      data: {
        online_now: online,
        server_time: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
