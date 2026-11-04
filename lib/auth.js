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

const SESSION_COOKIE_PROD = '__Host-rml_session';
const SESSION_COOKIE_DEV = 'rml_session';

function deploymentEnv() {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development';
}

function isProduction() {
  return deploymentEnv() === 'production';
}

function isDeployed() {
  const env = deploymentEnv();
  return env === 'production' || env === 'preview';
}

function sessionCookieName() {
  return isProduction() ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV;
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
  const hours = Number(process.env.SESSION_TTL_HOURS || 12);
  const safeHours = Number.isFinite(hours) ? Math.min(168, Math.max(1, hours)) : 12;
  return Math.floor(safeHours * 3600);
}

async function createSession(db, accountId, req) {
  const token = newToken();
  const csrf = newToken();
  const maxAge = sessionTtlSeconds();
  const expiresAt = new Date(Date.now() + maxAge * 1000);
  const ipHash = hashIp(getClientIp(req));
  const userAgentHash = hashUserAgent(req.headers?.['user-agent'] || '');

  await db`
    insert into auth_sessions
      (account_id, token_hash, csrf_token, ip_hash, user_agent_hash, expires_at)
    values
      (${accountId}, ${hashToken(token)}, ${csrf}, ${ipHash}, ${userAgentHash}, ${expiresAt})
  `;

  return { token, csrf, maxAge, expiresAt };
}

function sessionCookieHeader(token, maxAge) {
  return serializeCookie(sessionCookieName(), token, {
    maxAge,
    httpOnly: true,
    secure: isDeployed(),
    sameSite: 'Lax',
  });
}

function clearSessionCookies() {
  return [SESSION_COOKIE_PROD, SESSION_COOKIE_DEV].map((name) =>
    serializeCookie(name, '', {
      maxAge: 0,
      httpOnly: true,
      secure: isDeployed(),
      sameSite: 'Lax',
    })
  );
}

function publicAccount(row, className = null) {
  return {
    id: Number(row.id),
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    class_id: row.class_id == null ? null : Number(row.class_id),
    class_name: row.class_name ?? className ?? null,
    created_at: row.created_at || null,
  };
}

async function getSession(req) {
  const cookies = parseCookies(req);
  const rawToken = cookies[SESSION_COOKIE_PROD] || cookies[SESSION_COOKIE_DEV];
  if (!rawToken) return null;

  const sql = getDb();
  const rows = await sql`
    select
      s.id as session_id,
      s.csrf_token,
      s.expires_at,
      s.last_seen_at,
      a.id,
      a.username,
      a.display_name,
      a.role,
      a.class_id,
      a.status,
      a.created_at,
      c.name as class_name
    from auth_sessions s
    join accounts a on a.id = s.account_id
    left join classes c on c.id = a.class_id
    where s.token_hash = ${hashToken(rawToken)}
      and s.revoked_at is null
      and s.expires_at > now()
    limit 1
  `;

  if (!rows.length) return null;
  const row = rows[0];
  if (row.status !== 'active') return null;

  // Throttle presence writes: one update per minute per session.
  const lastSeen = new Date(row.last_seen_at).getTime();
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 60_000) {
    await sql`
      update auth_sessions
      set last_seen_at = now()
      where id = ${row.session_id}
    `;
  }

  return {
    sessionId: Number(row.session_id),
    csrf: row.csrf_token,
    expiresAt: row.expires_at,
    account: publicAccount(row),
    token: rawToken,
  };
}

function checkCsrf(req, session) {
  const provided = req.headers?.['x-csrf-token'];
  if (!safeEqualStrings(provided, session.csrf)) {
    throw new HttpError(403, 'CSRF_INVALID', 'Phiên làm việc không hợp lệ. Vui lòng tải lại trang.');
  }
}

async function requireAuth(req, options = {}) {
  const session = await getSession(req);
  if (!session) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục.');
  }
  if (options.csrf) checkCsrf(req, session);
  return session;
}

async function revokeSession(sessionId, db = getDb()) {
  await db`
    update auth_sessions
    set revoked_at = now()
    where id = ${sessionId}
      and revoked_at is null
  `;
}

async function recordLoginEvent(db, {
  accountId = null,
  username = null,
  success,
  reason = null,
  ipHash = null,
}) {
  await db`
    insert into login_events
      (account_id, username_attempted, success, reason, ip_hash)
    values
      (${accountId}, ${username}, ${success}, ${reason}, ${ipHash})
  `;
}

module.exports = {
  SESSION_COOKIE_PROD,
  SESSION_COOKIE_DEV,
  createSession,
  sessionCookieHeader,
  clearSessionCookies,
  getSession,
  requireAuth,
  checkCsrf,
  revokeSession,
  recordLoginEvent,
  publicAccount,
  hashToken,
  sessionTtlSeconds,
};
