'use strict';

const { getDb } = require('../../lib/db');
const { handleError, methodNotAllowed } = require('../../lib/http');
const { requireOwner } = require('../../lib/owner-auth');

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    await requireOwner(req);

    const sql = getDb();
    const taskId = String(req.query?.taskId || '').trim().slice(0, 80) || null;
    const from = toIso(req.query?.from);
    const to = toIso(req.query?.to);

    const rows = await sql`
      select
        p.id as profile_id,
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
      where (${taskId}::text is null or s.task_id = ${taskId})
        and (${from}::timestamptz is null or s.started_at >= ${from})
        and (${to}::timestamptz is null or s.started_at <= ${to})
      order by s.started_at desc nulls last, s.id desc
      limit 10000
    `;

    const header = [
      'profile_id', 'display_name', 'age', 'task_id', 'task_title', 'language',
      'started_at', 'completed_at', 'total_time_s', 'total_attempts', 'backward_steps',
      'hints_opened', 'max_hint_level', 'vocab_lookups', 'final_success',
    ];
    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push([
        row.profile_id,
        row.display_name,
        row.age,
        row.task_id,
        row.task_title,
        row.language,
        row.started_at ? new Date(row.started_at).toISOString() : '',
        row.completed_at ? new Date(row.completed_at).toISOString() : '',
        row.total_time_s,
        row.total_attempts,
        row.backward_steps,
        row.hints_opened,
        row.max_hint_level,
        row.vocab_lookups,
        row.final_success == null ? '' : row.final_success,
      ].map(csvCell).join(','));
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="robot-math-lab-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(`\uFEFF${lines.join('\n')}`);
  } catch (error) {
    return handleError(res, error);
  }
};
