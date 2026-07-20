export class RateLimitError extends Error {}

export class FixedWindowRateLimiter {
  #buckets = new Map();
  #maximum;
  #maximumBuckets;
  #windowMs;
  #nextSweep = 0;

  constructor({ maximum, windowMs, maximumBuckets = 10_000 }) {
    if (!Number.isInteger(maximum) || maximum < 1) throw new TypeError('maximum must be positive.');
    if (!Number.isInteger(windowMs) || windowMs < 1) throw new TypeError('windowMs must be positive.');
    this.#maximum = maximum;
    this.#maximumBuckets = maximumBuckets;
    this.#windowMs = windowMs;
  }

  assertAllowed(key, now = Date.now()) {
    this.#sweep(now);
    const bucket = this.#buckets.get(key);
    if (bucket && bucket.expiresAt > now && bucket.count >= this.#maximum) {
      throw new RateLimitError('För många försök. Vänta en stund och försök igen.');
    }
  }

  record(key, now = Date.now()) {
    this.#sweep(now);
    const bucket = this.#buckets.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      if (this.#buckets.size >= this.#maximumBuckets) {
        throw new RateLimitError('För många försök. Vänta en stund och försök igen.');
      }
      this.#buckets.set(key, { count: 1, expiresAt: now + this.#windowMs });
      return;
    }
    bucket.count += 1;
  }

  consume(key, now = Date.now()) {
    this.assertAllowed(key, now);
    this.record(key, now);
  }

  reset(key) {
    this.#buckets.delete(key);
  }

  #sweep(now) {
    if (now < this.#nextSweep && this.#buckets.size < this.#maximumBuckets) return;
    for (const [key, bucket] of this.#buckets) {
      if (bucket.expiresAt <= now) this.#buckets.delete(key);
    }
    this.#nextSweep = now + Math.min(this.#windowMs, 60_000);
  }
}
