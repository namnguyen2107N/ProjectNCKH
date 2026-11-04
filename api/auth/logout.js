'use strict';

const { handleError, methodNotAllowed } = require('../../lib/http');
const {
  clearSessionCookies,
  requireAuth,
  revokeSession,
} = require('../../lib/auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

    // Logout is idempotent from the browser's point of view: clear cookies even
    // if the session has already expired.
    try {
      const session = await requireAuth(req, { csrf: true });
      await revokeSession(session.sessionId);
    } catch (error) {
      if (error.status !== 401) throw error;
    }

    res.statusCode = 204;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Set-Cookie', clearSessionCookies());
    res.end();
  } catch (error) {
    return handleError(res, error);
  }
};
