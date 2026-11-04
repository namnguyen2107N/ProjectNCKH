import test from 'node:test';
import assert from 'node:assert/strict';
import validateUtils from '../lib/validate.js';

const {
  generateJoinCode,
  normalizeClassCode,
  validateRegistration,
  validateLogin,
  validateClassInput,
} = validateUtils;

test('registration without a class code passes', () => {
  const result = validateRegistration({
    username: 'hocsinh01',
    password: 'matkhau123',
    display_name: 'Bé An',
    consent: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.username, 'hocsinh01');
  assert.equal(result.data.classCode, '');
});

test('legacy class code is optional but validated when provided', () => {
  const valid = validateRegistration({
    username: 'hocsinh01',
    password: 'matkhau123',
    display_name: 'Bé An',
    class_code: 'lop4a',
    consent: true,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.data.classCode, 'LOP4A');

  const invalid = validateRegistration({
    username: 'hocsinh01',
    password: 'matkhau123',
    display_name: 'Bé An',
    class_code: 'x',
    consent: true,
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.class_code);
});

test('registration rejects short username, weak password, missing consent', () => {
  const result = validateRegistration({
    username: 'ab',
    password: '123',
    display_name: '',
    class_code: 'x',
    consent: false,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.username);
  assert.ok(result.errors.password);
  assert.ok(result.errors.display_name);
  assert.ok(result.errors.class_code);
  assert.ok(result.errors.consent);
});

test('reserved usernames cannot self-register', () => {
  const result = validateRegistration({
    username: 'admin',
    password: 'matkhau123',
    display_name: 'Admin',
    class_code: 'LOP4A',
    consent: true,
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.username);
});

test('display names cannot inject HTML tag delimiters', () => {
  const result = validateRegistration({
    username: 'hocsinh02',
    password: 'matkhau123',
    display_name: '<img src=x onerror=alert(1)> Bé An',
    class_code: 'LOP4A',
    consent: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.displayName.includes('<'), false);
  assert.equal(result.data.displayName.includes('>'), false);
});

test('login normalization and class input validation', () => {
  const login = validateLogin({ username: ' HocSinh01 ', password: 'matkhau123' });
  assert.equal(login.ok, true);
  assert.equal(login.data.username, 'hocsinh01');

  const klass = validateClassInput({ name: 'Lớp 4A', join_code: 'abc123' });
  assert.equal(klass.ok, true);
  assert.equal(klass.data.joinCode, 'ABC123');
});

test('generated join codes are uppercase and unambiguous', () => {
  for (let i = 0; i < 20; i += 1) {
    const code = generateJoinCode();
    assert.match(code, /^[A-Z0-9]{6}$/);
    assert.doesNotMatch(code, /[OI01]/);
  }
  assert.equal(normalizeClassCode(' ab-12 3 '), 'AB123');
});
