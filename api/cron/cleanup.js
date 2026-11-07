'use strict';

const { getDb } = require('../../lib/db');
const { handleError, methodNotAllowed, sendJson } = require('../../lib/http');

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers?.authorization === `Bearer ${secret}`;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    if (!isAuthorized(req)) {
      return sendJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }

    const sql = getDb();
    const retentionDays = Math.max(
      30,
      Number.parseInt(process.env.LEARNING_RETENTION_DAYS || '730', 10) || 730
    );

    const rateLimits = await sql`
      delete from rate_limits
      where window_start < now() - interval '2 days'
      returning bucket
    `;
    const ownerSessions = await sql`
      delete from owner_sessions
      where expires_at < now() - interval '30 days'
         or (revoked_at is not null and revoked_at < now() - interval '30 days')
      returning id
    `;
    const learningSessions = await sql`
      delete from learning_sessions
      where started_at < now() - (${retentionDays} * interval '1 day')
      returning id
    `;

    return sendJson(res, 200, {
      data: {
        deletedRateLimits: rateLimits.length,
        deletedOwnerSessions: ownerSessions.length,
        deletedLearningSessions: learningSessions.length,
        retentionDays,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
