import test from 'node:test';
import assert from 'node:assert/strict';
import learning from '../lib/learning.js';
import profiles from '../lib/profiles.js';

const {
  normalizeProfileInput,
  normalizeProfileId,
  hashProfileToken,
} = profiles;

const {
  validateEventBatch,
  normalizeSession,
  sanitizeObject,
} = learning;

test('profile input requires a name and an age between 3 and 18', () => {
  const ok = normalizeProfileInput({ displayName: '  Bé An  ', age: '10' });
  assert.equal(ok.displayName, 'Bé An');
  assert.equal(ok.age, 10);

  assert.throws(() => normalizeProfileInput({ displayName: '', age: 10 }), /Thông tin học sinh/);
  assert.throws(() => normalizeProfileInput({ displayName: 'An', age: 2 }), /Thông tin học sinh/);
  assert.throws(() => normalizeProfileInput({ displayName: 'An', age: 19 }), /Thông tin học sinh/);
});

test('profile names strip control characters and angle brackets', () => {
  const result = normalizeProfileInput({ displayName: '<b>An</b>\u0001', age: 9 });
  assert.equal(result.displayName, 'bAn/b');
  assert.equal(normalizeProfileId('42'), 42);
  assert.equal(normalizeProfileId('0'), null);
  assert.equal(normalizeProfileId('abc'), null);
});

test('profile tokens hash deterministically and never return the raw token', () => {
  const a = hashProfileToken('secret-token');
  const b = hashProfileToken('secret-token');
  const c = hashProfileToken('other-token');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
});

test('session payload drops names and PII, and keeps safe event codes only', () => {
  const session = normalizeSession({
    sessionUid: 'sess_1',
    taskId: 'task1-reach',
    taskTitle: 'Reach the Goal',
    language: 'vi',
    startedAt: '2026-11-07T08:00:00.000Z',
    totalTimeSeconds: 120,
    totalAttempts: 2,
    summary: { totalAttempts: 2, finalSuccess: true },
    events: [
      {
        uid: 'evt_1',
        code: 'PS7',
        label: 'Execution observation result',
        step: 3,
        relativeTimeMs: 1000,
        payload: {
          actualDistance: 42,
          studentName: 'Bé An',
          email: 'an@example.com',
          nested: { name: 'Bé An', keep: 'ok' },
        },
      },
      { uid: 'evt_2', code: 'NOT_ALLOWED', payload: {} },
      { uid: 'evt_1', code: 'PS7', payload: {} },
    ],
  });

  assert.equal(session.events.length, 1);
  const event = session.events[0];
  assert.equal(event.uid, 'evt_1');
  assert.equal(event.payload.actualDistance, 42);
  assert.equal(event.payload.studentName, undefined);
  assert.equal(event.payload.email, undefined);
  assert.equal(event.payload.nested.name, undefined);
  assert.equal(event.payload.nested.keep, 'ok');
});

test('free-text reflections are reduced to a length', () => {
  const reflection = 'My phone number is 0900000000';
  const session = normalizeSession({
    sessionUid: 'sess_reflect',
    taskId: 'task1-reach',
    events: [{
      uid: 'evt_reflect',
      code: 'TASK_REFLECTION',
      payload: { reflection },
    }],
  });
  assert.deepEqual(session.events[0].payload, { length: reflection.length });
});

test('sanitizeObject truncates oversized payloads instead of throwing', () => {
  const big = {};
  for (let i = 0; i < 80; i += 1) big[`key_${i}`] = 'x'.repeat(500);
  const clean = sanitizeObject(big, 4096);
  assert.equal(clean.truncated, true);
});

test('event batch requires profile credentials and a non-empty session list', () => {
  assert.throws(
    () => validateEventBatch({ profileId: 1, profileToken: '', consentVersion: 'v1', sessions: [] }),
    /mã truy cập/i
  );
  assert.throws(
    () => validateEventBatch({ profileId: 1, profileToken: 'token', consentVersion: 'v1', sessions: [] }),
    /Không có phiên học/i
  );

  const batch = validateEventBatch({
    profileId: 1,
    profileToken: 'token',
    consentVersion: '2026-11-v1',
    language: 'en',
    sessions: [{
      sessionUid: 'sess_2',
      taskId: 'task2-fix',
      language: 'en',
      events: [{ uid: 'evt_2', code: 'PS8', payload: {} }],
    }],
  });
  assert.equal(batch.sessions.length, 1);
  assert.equal(batch.sessions[0].language, 'en');
});
