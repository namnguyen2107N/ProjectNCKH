'use strict';

const {
  appendSetCookie,
  handleError,
  methodNotAllowed,
  requireSameOrigin,
  sendJson,
} = require('../../lib/http');
const {
  clearOwnerCookies,
  requireOwner,
  revokeOwnerSession,
} = require('../../lib/owner-auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const session = await requireOwner(req);
      return sendJson(res, 200, {
        data: {
          owner: session.owner,
          csrf_token: session.csrf,
        },
      });
    }

    if (req.method === 'POST') {
      requireSameOrigin(req);
      const session = await requireOwner(req, { csrf: true });
      await revokeOwnerSession(session.sessionId);
      for (const cookie of clearOwnerCookies()) appendSetCookie(res, cookie);
      return sendJson(res, 200, { data: { ok: true } });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (error) {
    return handleError(res, error);
  }
};
