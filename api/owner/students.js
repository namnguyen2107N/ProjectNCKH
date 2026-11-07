'use strict';

const { getDb } = require('../../lib/db');
const { handleError, methodNotAllowed, sendJson } = require('../../lib/http');
const { requireOwner } = require('../../lib/owner-auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    await requireOwner(req);

    const sql = getDb();
    const rawQuery = String(req.query?.q || '').trim().slice(0, 50);
    const search = rawQuery ? `%${rawQuery}%` : null;

    const rows = search
      ? await sql`
          select
            p.id,
            p.display_name,
            p.age,
            p.created_at,
            p.last_seen_at,
            (count(s.id))::int as session_count,
            (count(s.id) filter (where s.final_success))::int as success_count,
            max(s.started_at) as last_session_at
          from student_profiles p
          left join learning_sessions s on s.profile_id = p.id
          where p.deactivated_at is null
            and p.display_name ilike ${search}
          group by p.id
          order by p.last_seen_at desc nulls last, p.created_at desc
          limit 200
        `
      : await sql`
          select
            p.id,
            p.display_name,
            p.age,
            p.created_at,
            p.last_seen_at,
            (count(s.id))::int as session_count,
            (count(s.id) filter (where s.final_success))::int as success_count,
            max(s.started_at) as last_session_at
          from student_profiles p
          left join learning_sessions s on s.profile_id = p.id
          where p.deactivated_at is null
          group by p.id
          order by p.last_seen_at desc nulls last, p.created_at desc
          limit 200
        `;

    const totals = await sql`
      select
        (select count(*)::int from student_profiles where deactivated_at is null) as total_students,
        (select count(*)::int from learning_sessions) as total_sessions,
        (select count(*)::int from learning_sessions where final_success is true) as success_sessions
    `;

    return sendJson(res, 200, {
      data: {
        students: rows.map((row) => ({
          id: Number(row.id),
          displayName: row.display_name,
          age: Number(row.age),
          createdAt: row.created_at,
          lastSeenAt: row.last_seen_at,
          sessionCount: Number(row.session_count),
          successCount: Number(row.success_count),
          lastSessionAt: row.last_session_at,
        })),
        totals: {
          students: Number(totals[0].total_students),
          sessions: Number(totals[0].total_sessions),
          successSessions: Number(totals[0].success_sessions),
        },
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
