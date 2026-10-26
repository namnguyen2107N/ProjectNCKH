'use strict';

const { getDb } = require('../../lib/db');
const { handleError, methodNotAllowed, sendJson } = require('../../lib/http');
const { requireAuth, requireRole } = require('../../lib/auth');
const {
  classIdsForAccount,
  countOnline,
  todayRange,
} = require('../../lib/metrics');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    const session = await requireAuth(req);
    requireRole(session, ['admin', 'teacher']);

    const sql = getDb();
    const account = session.account;
    const classIds = await classIdsForAccount(sql, account);
    const { today, start, end } = todayRange();

    const online = await countOnline(sql, classIds);

    const peakRows = await sql`
      select coalesce(max(peak_online), 0)::int as n
      from app_metrics
      where metric_date = ${today}
    `;
    const peakToday = Number(peakRows[0]?.n || 0);

    let loginsToday = 0;
    let failedToday = 0;
    if (classIds === null) {
      const rows = await sql`
        select
          count(*) filter (where success)::int as logins,
          count(*) filter (where not success)::int as failed
        from login_events
        where created_at >= ${start} and created_at < ${end}
      `;
      loginsToday = Number(rows[0]?.logins || 0);
      failedToday = Number(rows[0]?.failed || 0);
    } else if (classIds.length) {
      const rows = await sql`
        select
          count(*) filter (where le.success)::int as logins,
          count(*) filter (where not le.success)::int as failed
        from login_events le
        join accounts a on a.id = le.account_id
        where le.created_at >= ${start}
          and le.created_at < ${end}
          and a.class_id in ${sql(classIds)}
      `;
      loginsToday = Number(rows[0]?.logins || 0);
      failedToday = Number(rows[0]?.failed || 0);
    }

    let accountsTotal = 0;
    if (classIds === null) {
      const rows = await sql`select count(*)::int as n from accounts`;
      accountsTotal = Number(rows[0]?.n || 0);
    } else if (classIds.length) {
      const rows = await sql`
        select count(*)::int as n
        from accounts
        where class_id in ${sql(classIds)}
      `;
      accountsTotal = Number(rows[0]?.n || 0);
    }

    let classes = [];
    if (classIds === null) {
      classes = await sql`
        select
          c.id,
          c.name,
          c.join_code,
          count(distinct a.id)::int as accounts_total,
          count(distinct s.account_id) filter (
            where s.revoked_at is null
              and s.expires_at > now()
              and s.last_seen_at > now() - interval '2 minutes'
              and a.status = 'active'
          )::int as online_now
        from classes c
        left join accounts a on a.class_id = c.id
        left join auth_sessions s on s.account_id = a.id
        group by c.id, c.name, c.join_code
        order by c.name
      `;
    } else {
      classes = await sql`
        select
          c.id,
          c.name,
          c.join_code,
          count(distinct a.id)::int as accounts_total,
          count(distinct s.account_id) filter (
            where s.revoked_at is null
              and s.expires_at > now()
              and s.last_seen_at > now() - interval '2 minutes'
              and a.status = 'active'
          )::int as online_now
        from classes c
        left join accounts a on a.class_id = c.id
        left join auth_sessions s on s.account_id = a.id
        where c.teacher_id = ${account.id}
        group by c.id, c.name, c.join_code
        order by c.name
      `;
    }

    let onlineUsers = [];
    if (classIds === null) {
      onlineUsers = await sql`
        select
          a.id,
          a.username,
          a.display_name,
          a.role,
          a.class_id,
          c.name as class_name,
          max(s.last_seen_at) as last_seen_at
        from auth_sessions s
        join accounts a on a.id = s.account_id
        left join classes c on c.id = a.class_id
        where s.revoked_at is null
          and s.expires_at > now()
          and s.last_seen_at > now() - interval '2 minutes'
          and a.status = 'active'
        group by a.id, a.username, a.display_name, a.role, a.class_id, c.name
        order by last_seen_at desc
        limit 200
      `;
    } else if (classIds.length) {
      onlineUsers = await sql`
        select
          a.id,
          a.username,
          a.display_name,
          a.role,
          a.class_id,
          c.name as class_name,
          max(s.last_seen_at) as last_seen_at
        from auth_sessions s
        join accounts a on a.id = s.account_id
        left join classes c on c.id = a.class_id
        where s.revoked_at is null
          and s.expires_at > now()
          and s.last_seen_at > now() - interval '2 minutes'
          and a.status = 'active'
          and a.class_id in ${sql(classIds)}
        group by a.id, a.username, a.display_name, a.role, a.class_id, c.name
        order by last_seen_at desc
        limit 200
      `;
    }

    const alertThresholdRaw = Number(process.env.MAX_ONLINE_ALERT || 100);
    const alertThreshold = Number.isFinite(alertThresholdRaw) && alertThresholdRaw > 0
      ? alertThresholdRaw
      : 100;

    return sendJson(res, 200, {
      data: {
        role: account.role,
        scope: classIds === null ? 'all' : 'teacher',
        class_ids: classIds,
        today,
        online_now: online,
        peak_today: peakToday,
        logins_today: loginsToday,
        failed_logins_today: failedToday,
        accounts_total: accountsTotal,
        alert: {
          threshold: alertThreshold,
          active: online >= alertThreshold,
        },
        classes: classes.map((row) => ({
          id: Number(row.id),
          name: row.name,
          join_code: row.join_code,
          accounts_total: Number(row.accounts_total || 0),
          online_now: Number(row.online_now || 0),
        })),
        online_users: onlineUsers.map((row) => ({
          id: Number(row.id),
          username: row.username,
          display_name: row.display_name,
          role: row.role,
          class_id: row.class_id == null ? null : Number(row.class_id),
          class_name: row.class_name || null,
          last_seen_at: row.last_seen_at,
        })),
        server_time: new Date().toISOString(),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
