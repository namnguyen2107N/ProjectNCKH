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
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);
    const session = await requireOwner(req, { csrf: true });
    await revokeOwnerSession(session.sessionId);
    for (const cookie of clearOwnerCookies()) appendSetCookie(res, cookie);
    return sendJson(res, 200, { data: { ok: true } });
  } catch (error) {
    return handleError(res, error);
  }
};
