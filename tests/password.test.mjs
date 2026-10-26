import test from 'node:test';
import assert from 'node:assert/strict';
import passwordUtils from '../lib/password.js';

const { hashPassword, verifyPassword } = passwordUtils;

test('hashPassword creates a verifiable scrypt hash', async () => {
  const hash = await hashPassword('matkhau123');
  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$/);
  assert.equal(await verifyPassword('matkhau123', hash), true);
  assert.equal(await verifyPassword('matkhau124', hash), false);
});

test('verifyPassword rejects malformed hashes instead of throwing', async () => {
  assert.equal(await verifyPassword('anything', ''), false);
  assert.equal(await verifyPassword('anything', 'bcrypt$abc'), false);
  assert.equal(await verifyPassword('anything', 'scrypt$x$8$1$abc$def'), false);
});
