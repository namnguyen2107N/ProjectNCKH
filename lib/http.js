'use strict';

const { createHash } = require('node:crypto');

class HttpError extends Error {
  constructor(status, code, message, details = null, headers = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(body);
}

function sendError(res, status, code, message, details = null, extraHeaders = {}) {
  const error = { code, message };
  if (details) error.details = details;
  return sendJson(res, status, { error }, extraHeaders);
}

function handleError(res, error) {
  if (error instanceof HttpError) {
    return sendError(res, error.status, error.code, error.message, error.details, error.headers);
  }
  console.error('[api] unhandled error:', error);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Có lỗi xảy ra. Vui lòng thử lại.');
}

function methodNotAllowed(res, allowed) {
  return sendError(
    res,
    405,
    'METHOD_NOT_ALLOWED',
    'Phương thức không được hỗ trợ.',
    null,
    { Allow: allowed.join(', ') }
  );
}

function parseJson(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Dữ liệu gửi lên không phải JSON hợp lệ.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_JSON', 'Dữ liệu gửi lên phải là một object JSON.');
  }
  return value;
}

async function readJson(req, maxBytes = 32 * 1024) {
  // Vercel may parse JSON bodies before the handler runs.
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return parseJson(req.body.toString('utf8'));
    if (typeof req.body === 'string') return parseJson(req.body);
    if (typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn.');
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return parseJson(raw);
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  const { maxAge, httpOnly = true, secure = true, sameSite = 'Lax', path = '/' } = options;
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  return parts.join('; ');
}

function appendSetCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookie]);
  } else {
    res.setHeader('Set-Cookie', [String(current), cookie]);
  }
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ||
    req.headers?.['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '';
  const first = String(raw).split(',')[0].trim();
  return first.replace(/^::ffff:/, '');
}

function hashIp(ip) {
  const pepper = process.env.IP_HASH_PEPPER || 'dev-only-pepper';
  return createHash('sha256').update(`${pepper}:${ip || 'unknown'}`).digest('hex');
}

function hashUserAgent(userAgent) {
  return createHash('sha256').update(String(userAgent || '')).digest('hex');
}

function assertSameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true; // non-browser clients (curl, scripts)
  const host = (req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(',')[0]
    .trim();
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requireSameOrigin(req) {
  if (!assertSameOrigin(req)) {
    throw new HttpError(403, 'FORBIDDEN_ORIGIN', 'Nguồn yêu cầu không hợp lệ.');
  }
}

module.exports = {
  HttpError,
  sendJson,
  sendError,
  handleError,
  methodNotAllowed,
  readJson,
  parseCookies,
  serializeCookie,
  appendSetCookie,
  getClientIp,
  hashIp,
  hashUserAgent,
  assertSameOrigin,
  requireSameOrigin,
};
