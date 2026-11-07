'use strict';

const { getDb } = require('../../lib/db');
const { HttpError, handleError, methodNotAllowed, sendJson } = require('../../lib/http');
const { requireOwner } = require('../../lib/owner-auth');

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
    await requireOwner(req);

    const sessionId = Number.parseInt(String(req.query?.sessionId ?? ''), 10);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'Thiếu sessionId hợp lệ.');
    }

    const sql = getDb();
    const sessionRows = await sql`
      select
        s.id,
        s.session_uid,
        s.profile_id,
        p.display_name,
        p.age,
        s.task_id,
        s.task_title,
        s.started_at,
        s.completed_at,
        s.total_time_s,
        s.final_success
      from learning_sessions s
      join student_profiles p on p.id = s.profile_id
      where s.id = ${sessionId}
      limit 1
    `;
    if (!sessionRows.length) {
      throw new HttpError(404, 'SESSION_NOT_FOUND', 'Không tìm thấy phiên học.');
    }

    const events = await sql`
      select id, client_event_uid, code, label, step, relative_time_ms, payload, created_at
      from learning_events
      where session_id = ${sessionId}
      order by created_at asc, id asc
      limit 3000
    `;

    const row = sessionRows[0];
    return sendJson(res, 200, {
      data: {
        session: {
          id: Number(row.id),
          sessionUid: row.session_uid,
          profileId: Number(row.profile_id),
          displayName: row.display_name,
          age: Number(row.age),
          taskId: row.task_id,
          taskTitle: row.task_title,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          totalTimeSeconds: Number(row.total_time_s),
          finalSuccess: row.final_success,
        },
        events: events.map((event) => ({
          id: Number(event.id),
          uid: event.client_event_uid,
          code: event.code,
          label: event.label,
          step: event.step,
          relativeTimeMs: event.relative_time_ms,
          payload: event.payload,
          createdAt: event.created_at,
        })),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
