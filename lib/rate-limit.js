'use strict';

const { getDb } = require('./db');

function windowStart(windowSeconds) {
  const windowMs = Math.max(1, windowSeconds) * 1000;
  return new Date(Math.floor(Date.now() / windowMs) * windowMs);
}

/**
 * Increment a fixed-window counter and return whether the request is allowed.
 * The table is intentionally simple; at this scale (100 concurrent users) it is
 * more than sufficient and avoids an extra Redis dependency.
 */
async function hit(bucket, limit, windowSeconds) {
  const sql = getDb();
  const start = windowStart(windowSeconds);

  const rows = await sql`
    insert into rate_limits (bucket, window_start, hits)
    values (${bucket}, ${start}, 1)
    on conflict (bucket, window_start)
    do update set hits = rate_limits.hits + 1
    returning hits
  `;

  const hits = Number(rows[0].hits);
  const resetAt = start.getTime() + windowSeconds * 1000;
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));

  return {
    allowed: hits <= limit,
    hits,
    remaining: Math.max(0, limit - hits),
    retryAfter,
    limit,
  };
}

async function reset(bucket) {
  const sql = getDb();
  await sql`delete from rate_limits where bucket = ${bucket}`;
}

async function cleanup() {
  if (Math.random() > 0.01) return;
  const sql = getDb();
  await sql`delete from rate_limits where window_start < now() - interval '2 days'`;
  await sql`delete from auth_sessions where expires_at < now() - interval '7 days'`;
}

module.exports = { hit, reset, cleanup };
