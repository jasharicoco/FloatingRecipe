import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCRYPT_KEY_LENGTH = 64;

export class AuthValidationError extends Error {}

export function validateRegistration(input) {
  if (!input || typeof input !== 'object') throw new AuthValidationError('Fyll i alla fält.');

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';

  if (!name) throw new AuthValidationError('Fyll i ditt namn.');
  if (name.length > 60) throw new AuthValidationError('Namnet får vara högst 60 tecken.');
  validateEmail(email);
  validatePassword(password);
  return { name, email, password };
}

export function validateLogin(input) {
  if (!input || typeof input !== 'object') throw new AuthValidationError('Fyll i e-post och lösenord.');
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  validateEmail(email);
  if (!password) throw new AuthValidationError('Fyll i ditt lösenord.');
  if (password.length > 256) throw new AuthValidationError('Lösenordet är för långt.');
  return { email, password };
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('sv-SE') : '';
}

function validateEmail(email) {
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new AuthValidationError('Ange en giltig e-postadress.');
  }
}

function validatePassword(password) {
  if (password.length < 8) throw new AuthValidationError('Lösenordet måste ha minst 8 tecken.');
  if (password.length > 256) throw new AuthValidationError('Lösenordet är för långt.');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password, storedHash) {
  try {
    const [algorithm, n, r, p, saltValue, hashValue] = storedHash.split('$');
    if (algorithm !== 'scrypt') return false;
    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
