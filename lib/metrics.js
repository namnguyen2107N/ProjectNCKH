'use strict';

function todayInVietnam() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function countOnline(sql) {
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

module.exports = {
  countOnline,
  updatePeak,
};
