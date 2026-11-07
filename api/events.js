'use strict';

const { getDb } = require('../lib/db');
const {
  HttpError,
  getClientIp,
  handleError,
  hashIp,
  hashUserAgent,
  methodNotAllowed,
  readJson,
  requireSameOrigin,
  sendError,
  sendJson,
} = require('../lib/http');
const { verifyProfileAccess } = require('../lib/profiles');
const { validateEventBatch } = require('../lib/learning');
const { hit } = require('../lib/rate-limit');

function currentConsentVersion() {
  return process.env.CONSENT_VERSION || '2026-11-v1';
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    requireSameOrigin(req);

    const body = await readJson(req, 128 * 1024);
    const batch = validateEventBatch(body);
    const sql = getDb();

    const profile = await verifyProfileAccess(sql, batch.profileId, batch.profileToken);
    if (!profile) {
      throw new HttpError(401, 'PROFILE_UNAUTHORIZED', 'Hồ sơ không hợp lệ trên thiết bị này.');
    }

    const expectedConsent = currentConsentVersion();
    if (batch.consentVersion !== expectedConsent) {
      return sendError(res, 409, 'CONSENT_VERSION_MISMATCH', 'Phiên bản consent đã thay đổi.', {
        expectedVersion: expectedConsent,
      });
    }

    const consent = await sql`
      select 1
      from consents
      where profile_id = ${batch.profileId}
        and consent_version = ${expectedConsent}
        and revoked_at is null
      limit 1
    `;
    if (!consent.length) {
      return sendError(res, 403, 'CONSENT_REQUIRED', 'Cần đồng ý lưu nhật ký học tập trước khi gửi dữ liệu.');
    }

    const ipHash = hashIp(getClientIp(req));
    const limit = await hit(`events:profile:${batch.profileId}:ip:${ipHash}`, 300, 3600);
    if (!limit.allowed) {
      return sendError(res, 429, 'RATE_LIMITED', 'Có quá nhiều lần gửi dữ liệu. Vui lòng thử lại sau.', null, {
        'Retry-After': String(limit.retryAfter),
      });
    }

    const uaHash = hashUserAgent(req.headers?.['user-agent'] || '');
    let acceptedSessions = 0;
    let acceptedEvents = 0;

    await sql.begin(async (tx) => {
      for (const session of batch.sessions) {
        const sessionRows = await tx`
          insert into learning_sessions (
            session_uid, profile_id, task_id, task_title, language,
            started_at, completed_at, total_time_s, total_attempts,
            backward_steps, hints_opened, max_hint_level, vocab_lookups,
            final_success, summary, ip_hash, ua_hash
          ) values (
            ${session.sessionUid}, ${batch.profileId}, ${session.taskId}, ${session.taskTitle || null}, ${session.language},
            ${session.startedAt}, ${session.completedAt}, ${session.totalTimeSeconds}, ${session.totalAttempts},
            ${session.backwardSteps}, ${session.hintsOpened}, ${session.maxHintLevel}, ${session.vocabLookups},
            ${session.finalSuccess}, ${JSON.stringify(session.summary)}::jsonb, ${ipHash}, ${uaHash}
          )
          on conflict (session_uid) do update set
            task_title = excluded.task_title,
            language = excluded.language,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            total_time_s = excluded.total_time_s,
            total_attempts = excluded.total_attempts,
            backward_steps = excluded.backward_steps,
            hints_opened = excluded.hints_opened,
            max_hint_level = excluded.max_hint_level,
            vocab_lookups = excluded.vocab_lookups,
            final_success = excluded.final_success,
            summary = excluded.summary,
            ip_hash = excluded.ip_hash,
            ua_hash = excluded.ua_hash,
            updated_at = now()
          where learning_sessions.profile_id = excluded.profile_id
          returning id
        `;

        if (!sessionRows.length) continue;
        acceptedSessions += 1;
        const sessionId = sessionRows[0].id;

        for (const event of session.events) {
          const rows = await tx`
            insert into learning_events (
              session_id, client_event_uid, profile_id, task_id,
              code, label, step, relative_time_ms, payload
            ) values (
              ${sessionId}, ${event.uid}, ${batch.profileId}, ${session.taskId},
              ${event.code}, ${event.label || null}, ${event.step}, ${event.relativeTimeMs},
              ${JSON.stringify(event.payload)}::jsonb
            )
            on conflict (client_event_uid) do nothing
            returning id
          `;
          acceptedEvents += rows.length;
        }
      }

      await tx`
        update student_profiles
        set last_seen_at = now()
        where id = ${batch.profileId}
      `;
    });

    return sendJson(res, 200, {
      data: {
        acceptedSessions,
        acceptedEvents,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
