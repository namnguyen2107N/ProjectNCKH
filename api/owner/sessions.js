'use strict';

const { getDb } = require('../../lib/db');
const { handleError, methodNotAllowed, sendJson } = require('../../lib/http');
const { requireOwner } = require('../../lib/owner-auth');

function toInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    await requireOwner(req);

    const sql = getDb();
    const profileId = toInt(req.query?.profileId);
    const taskId = String(req.query?.taskId || '').trim().slice(0, 80) || null;
    const from = toIso(req.query?.from);
    const to = toIso(req.query?.to);
    const limit = Math.min(500, Math.max(1, toInt(req.query?.limit) || 100));

    const rows = await sql`
      select
        s.id,
        s.session_uid,
        s.profile_id,
        p.display_name,
        p.age,
        s.task_id,
        s.task_title,
        s.language,
        s.started_at,
        s.completed_at,
        s.total_time_s,
        s.total_attempts,
        s.backward_steps,
        s.hints_opened,
        s.max_hint_level,
        s.vocab_lookups,
        s.final_success
      from learning_sessions s
      join student_profiles p on p.id = s.profile_id
      where (${profileId}::bigint is null or s.profile_id = ${profileId})
        and (${taskId}::text is null or s.task_id = ${taskId})
        and (${from}::timestamptz is null or s.started_at >= ${from})
        and (${to}::timestamptz is null or s.started_at <= ${to})
      order by s.started_at desc nulls last, s.id desc
      limit ${limit}
    `;

    return sendJson(res, 200, {
      data: {
        sessions: rows.map((row) => ({
          id: Number(row.id),
          sessionUid: row.session_uid,
          profileId: Number(row.profile_id),
          displayName: row.display_name,
          age: Number(row.age),
          taskId: row.task_id,
          taskTitle: row.task_title,
          language: row.language,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          totalTimeSeconds: Number(row.total_time_s),
          totalAttempts: Number(row.total_attempts),
          backwardSteps: Number(row.backward_steps),
          hintsOpened: Number(row.hints_opened),
          maxHintLevel: Number(row.max_hint_level),
          vocabLookups: Number(row.vocab_lookups),
          finalSuccess: row.final_success,
        })),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
