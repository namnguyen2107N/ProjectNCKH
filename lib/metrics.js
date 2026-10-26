'use strict';

const ONLINE_WINDOW = "2 minutes";

function todayInVietnam() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function todayRange() {
  const today = todayInVietnam();
  const start = new Date(`${today}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { today, start, end };
}

async function countOnline(sql, classIds = null) {
  if (Array.isArray(classIds) && classIds.length === 0) return 0;

  if (Array.isArray(classIds)) {
    const rows = await sql`
      select count(distinct a.id)::int as n
      from auth_sessions s
      join accounts a on a.id = s.account_id
      where s.revoked_at is null
        and s.expires_at > now()
        and s.last_seen_at > now() - interval '2 minutes'
        and a.status = 'active'
        and a.class_id in ${sql(classIds)}
    `;
    return Number(rows[0].n);
  }

  const rows = await sql`
    select count(distinct a.id)::int as n
    from auth_sessions s
    join accounts a on a.id = s.account_id
    where s.revoked_at is null
      and s.expires_at > now()
      and s.last_seen_at > now() - interval '2 minutes'
      and a.status = 'active'
  `;
  return Number(rows[0].n);
}

async function updatePeak(sql) {
  const online = await countOnline(sql);
  const today = todayInVietnam();
  await sql`
    insert into app_metrics (metric_date, peak_online)
    values (${today}, ${online})
    on conflict (metric_date) do update
    set peak_online = greatest(app_metrics.peak_online, excluded.peak_online),
        updated_at = now()
  `;
  return online;
}

async function classIdsForAccount(sql, account) {
  if (account.role === 'admin') return null;
  if (account.role !== 'teacher') return [];

  const rows = await sql`
    select id from classes where teacher_id = ${account.id} order by name
  `;
  return rows.map((row) => Number(row.id));
}

module.exports = {
  ONLINE_WINDOW,
  todayInVietnam,
  todayRange,
  countOnline,
  updatePeak,
  classIdsForAccount,
};
