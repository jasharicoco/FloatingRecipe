import assert from 'node:assert/strict';
import test from 'node:test';
import { FixedWindowRateLimiter, RateLimitError } from '../lib/rate-limit.js';

test('limits attempts within the same time window', () => {
  const limiter = new FixedWindowRateLimiter({ maximum: 2, windowMs: 1_000 });

  limiter.consume('client', 0);
  limiter.consume('client', 1);
  assert.throws(() => limiter.consume('client', 2), RateLimitError);
  assert.doesNotThrow(() => limiter.consume('client', 1_001));
});

test('can reset a limit after a successful sign-in', () => {
  const limiter = new FixedWindowRateLimiter({ maximum: 1, windowMs: 1_000 });

  limiter.record('account', 0);
  assert.throws(() => limiter.assertAllowed('account', 1), RateLimitError);
  limiter.reset('account');
  assert.doesNotThrow(() => limiter.assertAllowed('account', 2));
});
