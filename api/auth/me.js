'use strict';

const { handleError, methodNotAllowed, sendJson } = require('../../lib/http');
const { requireAuth } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    const session = await requireAuth(req);
    return sendJson(res, 200, {
      data: {
        account: session.account,
        csrf_token: session.csrf,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
