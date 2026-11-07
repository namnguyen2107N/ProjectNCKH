'use strict';

const {
  handleError,
  methodNotAllowed,
  sendJson,
} = require('../../lib/http');
const { requireOwner } = require('../../lib/owner-auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    const session = await requireOwner(req);
    return sendJson(res, 200, {
      data: {
        owner: session.owner,
        csrf_token: session.csrf,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
