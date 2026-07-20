import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthValidationError,
  createSessionToken,
  hashPassword,
  hashSessionToken,
  validateRegistration,
  verifyPassword,
} from '../lib/auth.js';

test('hashes and verifies passwords without storing plaintext', async () => {
  const password = 'a long password';
  const hash = await hashPassword(password);

  assert.equal(hash.includes(password), false);
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('normalizes registration data and requires a stronger password', () => {
  const registration = validateRegistration({
    name: '  Ada  ',
    email: '  ADA@Example.COM ',
    password: 'abcdefgh',
  });

  assert.deepEqual(registration, { name: 'Ada', email: 'ada@example.com', password: 'abcdefgh' });
  assert.throws(
    () => validateRegistration({ name: 'Ada', email: 'ada@example.com', password: 'short' }),
    AuthValidationError,
  );
});

test('creates random session tokens and hashes them one-way', () => {
  const first = createSessionToken();
  const second = createSessionToken();

  assert.notEqual(first, second);
  assert.equal(hashSessionToken(first).length, 64);
  assert.notEqual(hashSessionToken(first), first);
});
