'use strict';

const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { getDb } = require('./db');
const {
  HttpError,
  parseCookies,
  serializeCookie,
  getClientIp,
  hashIp,
  hashUserAgent,
} = require('./http');

const OWNER_COOKIE_PROD = '__Host-rml_owner';
const OWNER_COOKIE_DEV = 'rml_owner';

function deploymentEnv() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

function isDeployed() {
  const env = deploymentEnv();
  return env === 'production' || env === 'preview';
}

function ownerCookieName() {
  return isDeployed() ? OWNER_COOKIE_PROD : OWNER_COOKIE_DEV;
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function sessionTtlSeconds() {
  const hours = Number(process.env.OWNER_SESSION_TTL_HOURS || 8);
  const safeHours = Number.isFinite(hours) ? Math.min(72, Math.max(1, hours)) : 8;
  return Math.floor(safeHours * 3600);
}

async function createOwnerSession(db, ownerId, req) {
  const token = newToken();
  const csrf = newToken();
  const maxAge = sessionTtlSeconds();
  const expiresAt = new Date(Date.now() + maxAge * 1000);

  await db`
    insert into owner_sessions
      (owner_id, token_hash, csrf_token, ip_hash, user_agent_hash, expires_at)
    values
      (${ownerId}, ${hashToken(token)}, ${csrf}, ${hashIp(getClientIp(req))},
       ${hashUserAgent(req.headers?.['user-agent'] || '')}, ${expiresAt})
  `;

  return { token, csrf, maxAge, expiresAt };
}

function ownerCookieHeader(token, maxAge) {
  return serializeCookie(ownerCookieName(), token, {
    maxAge,
    httpOnly: true,
    secure: isDeployed(),
    sameSite: 'Strict',
  });
}

function clearOwnerCookies() {
  return [OWNER_COOKIE_PROD, OWNER_COOKIE_DEV].map((name) =>
    serializeCookie(name, '', {
      maxAge: 0,
      httpOnly: true,
      secure: isDeployed(),
      sameSite: 'Strict',
    })
  );
}

function publicOwner(row) {
  return {
    id: Number(row.id),
    username: row.username,
  };
}

async function getOwnerSession(req) {
  const cookies = parseCookies(req);
  const rawToken = cookies[OWNER_COOKIE_PROD] || cookies[OWNER_COOKIE_DEV];
  if (!rawToken) return null;

  const sql = getDb();
  const rows = await sql`
    select
      s.id as session_id,
      s.csrf_token,
      s.expires_at,
      s.last_seen_at,
      o.id,
      o.username
    from owner_sessions s
    join owner_accounts o on o.id = s.owner_id
    where s.token_hash = ${hashToken(rawToken)}
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
  `;

  if (!rows.length) return null;
  const row = rows[0];

  const lastSeen = new Date(row.last_seen_at).getTime();
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 60_000) {
    await sql`
      update owner_sessions
      set last_seen_at = now()
      where id = ${row.session_id}
    `;
  }

  return {
    sessionId: Number(row.session_id),
    csrf: row.csrf_token,
    expiresAt: row.expires_at,
    owner: publicOwner(row),
    token: rawToken,
  };
}

function checkCsrf(req, session) {
  const provided = req.headers?.['x-csrf-token'];
  if (!safeEqualStrings(provided, session.csrf)) {
    throw new HttpError(403, 'CSRF_INVALID', 'Phiên làm việc không hợp lệ. Vui lòng tải lại trang.');
  }
}

async function requireOwner(req, options = {}) {
  const session = await getOwnerSession(req);
  if (!session) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập để xem dữ liệu.');
  }
  if (options.csrf) checkCsrf(req, session);
  return session;
}

async function revokeOwnerSession(sessionId, db = getDb()) {
  await db`
    update owner_sessions
    set revoked_at = now()
    where id = ${sessionId}
      and revoked_at is null
  `;
}

module.exports = {
  OWNER_COOKIE_PROD,
  OWNER_COOKIE_DEV,
  createOwnerSession,
  ownerCookieHeader,
  clearOwnerCookies,
  getOwnerSession,
  requireOwner,
  checkCsrf,
  revokeOwnerSession,
  hashToken,
  sessionTtlSeconds,
  publicOwner,
};
