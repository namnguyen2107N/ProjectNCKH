'use strict';

const { HttpError } = require('./http');

const MAX_SESSIONS = 20;
const MAX_EVENTS_PER_SESSION = 500;
const MAX_TOTAL_EVENTS = 2000;
const MAX_PAYLOAD_BYTES = 4096;
const MAX_SUMMARY_BYTES = 8192;

const EVENT_CODES = new Set([
  'PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PS6', 'PS7', 'PS8', 'PS8_RESPONSE',
  'PS9', 'PS10', 'PS11',
  'SESSION_STARTED', 'SESSION_COMPLETED',
  'STEP_TRANSITION', 'STEP1_MISMATCH', 'STEP2_MISTAKE',
  'PREMATURE_NEXT_BLOCKED', 'INPUT_VALIDATION_FAILED',
  'HINT_REQUESTED', 'VOCAB_LOOKUP', 'JOURNAL_VIEWED', 'TASK_REFLECTION',
  'SIMULATION_START', 'SIMULATION_PAUSE', 'SIMULATION_RESET', 'BACKWARD_STEP',
]);

const SENSITIVE_KEY = /^(student_?name|display_?name|full_?name|name|email|phone|address|account_?id)$/i;

function byteLength(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Infinity;
  }
}

function sanitizeValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, 500);
  if (depth >= 4) return null;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    const result = {};
    let keys = 0;
    for (const [key, item] of Object.entries(value)) {
      if (keys >= 50) break;
      if (!key || SENSITIVE_KEY.test(key)) continue;
      result[String(key).slice(0, 60)] = sanitizeValue(item, depth + 1);
      keys += 1;
    }
    return result;
  }
  return null;
}

function sanitizeObject(value, maxBytes) {
  const clean = sanitizeValue(value);
  if (!clean || typeof clean !== 'object' || Array.isArray(clean)) return {};
  return byteLength(clean) <= maxBytes ? clean : { truncated: true };
}

function asString(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function asInt(value, min, max, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeEvent(raw, sessionUid) {
  if (!raw || typeof raw !== 'object') return null;
  const uid = asString(raw.uid ?? raw.id, 120);
  const code = asString(raw.code, 40).toUpperCase();
  if (!uid || !EVENT_CODES.has(code)) return null;

  let payload = sanitizeObject(raw.payload ?? raw.data ?? {}, MAX_PAYLOAD_BYTES);
  if (code === 'TASK_REFLECTION') {
    const text = raw.payload?.reflection ?? raw.data?.reflection;
    payload = { length: typeof text === 'string' ? text.length : 0 };
  }

  return {
    uid,
    sessionUid,
    code,
    label: asString(raw.label, 300),
    step: Number.isInteger(Number(raw.step)) ? Math.min(10, Math.max(0, Number(raw.step))) : null,
    relativeTimeMs: Number.isFinite(Number(raw.relativeTimeMs))
      ? Math.max(0, Math.trunc(Number(raw.relativeTimeMs)))
      : null,
    payload,
  };
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sessionUid = asString(raw.sessionUid ?? raw.sessionId, 120);
  const taskId = asString(raw.taskId, 80);
  if (!sessionUid || !taskId) return null;

  const rawEvents = Array.isArray(raw.events) ? raw.events.slice(0, MAX_EVENTS_PER_SESSION) : [];
  const seen = new Set();
  const events = [];
  for (const item of rawEvents) {
    const event = normalizeEvent(item, sessionUid);
    if (!event || seen.has(event.uid)) continue;
    seen.add(event.uid);
    events.push(event);
  }

  const language = raw.language === 'en' ? 'en' : 'vi';
  return {
    sessionUid,
    taskId,
    taskTitle: asString(raw.taskTitle, 200),
    language,
    startedAt: asIsoDate(raw.startedAt),
    completedAt: asIsoDate(raw.completedAt),
    totalTimeSeconds: asInt(raw.totalTimeSeconds, 0, 86_400, 0),
    totalAttempts: asInt(raw.totalAttempts, 0, 10_000, 0),
    backwardSteps: asInt(raw.backwardSteps, 0, 10_000, 0),
    hintsOpened: asInt(raw.hintsOpened, 0, 10_000, 0),
    maxHintLevel: asInt(raw.maxHintLevel, 0, 3, 0),
    vocabLookups: asInt(raw.vocabLookups, 0, 10_000, 0),
    finalSuccess: typeof raw.finalSuccess === 'boolean' ? raw.finalSuccess : null,
    summary: sanitizeObject(raw.summary ?? {}, MAX_SUMMARY_BYTES),
    events,
  };
}

function validateEventBatch(body) {
  const profileId = Number.parseInt(String(body?.profileId ?? ''), 10);
  const profileToken = typeof body?.profileToken === 'string' ? body.profileToken.slice(0, 200) : '';
  const consentVersion = asString(body?.consentVersion, 60);
  const language = body?.language === 'en' ? 'en' : 'vi';

  if (!Number.isInteger(profileId) || profileId <= 0) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Thiếu hồ sơ học sinh.', { profileId: 'profileId không hợp lệ.' });
  }
  if (!profileToken) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Thiếu mã truy cập hồ sơ.', { profileToken: 'profileToken là bắt buộc.' });
  }
  if (!consentVersion) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Thiếu phiên bản consent.', { consentVersion: 'consentVersion là bắt buộc.' });
  }

  const rawSessions = Array.isArray(body?.sessions) ? body.sessions.slice(0, MAX_SESSIONS) : [];
  if (!rawSessions.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Không có phiên học nào để lưu.');
  }

  const sessions = [];
  let totalEvents = 0;
  for (const raw of rawSessions) {
    const session = normalizeSession(raw);
    if (!session) continue;
    totalEvents += session.events.length;
    if (totalEvents > MAX_TOTAL_EVENTS) break;
    sessions.push(session);
  }

  if (!sessions.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Dữ liệu phiên học không hợp lệ.');
  }

  return { profileId, profileToken, consentVersion, language, sessions };
}

module.exports = {
  EVENT_CODES,
  MAX_SESSIONS,
  MAX_EVENTS_PER_SESSION,
  MAX_TOTAL_EVENTS,
  MAX_PAYLOAD_BYTES,
  MAX_SUMMARY_BYTES,
  sanitizeValue,
  sanitizeObject,
  normalizeEvent,
  normalizeSession,
  validateEventBatch,
};
