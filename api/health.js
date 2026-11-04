'use strict';

const { getDb } = require('../lib/db');
const { handleError, methodNotAllowed, sendJson } = require('../lib/http');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

    try {
      const sql = getDb();
      const rows = await sql`select now() as now`;
      return sendJson(res, 200, {
        status: 'ok',
        db: true,
        time: rows[0]?.now || null,
      });
    } catch {
      return sendJson(res, 503, {
        status: 'degraded',
        db: false,
        time: null,
      });
    }
  } catch (error) {
    return handleError(res, error);
  }
};
