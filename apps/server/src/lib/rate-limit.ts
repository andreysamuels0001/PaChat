/**
 * A fixed-window counter and a token bucket, both in-process.
 *
 * Deliberately not Redis-backed: PaChat ships as a single self-hosted node, and
 * an in-memory limiter has zero operational surface. The interfaces are narrow
 * enough that swapping in a shared store later touches only this file.
 */

interface Window {
  count: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    // Evict expired windows periodically so a long-lived process cannot grow
    // an unbounded map from one-off keys (e.g. scanning IPs).
    const timer = setInterval(() => this.sweep(), windowMs * 2);
    timer.unref?.();
  }

  /** Returns `null` when allowed, or the milliseconds to wait when limited. */
  check(key: string, now: number = Date.now()): number | null {
    const window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return null;
    }
    if (window.count >= this.limit) return window.resetAt - now;
    window.count += 1;
    return null;
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  private sweep(now: number = Date.now()): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Smooths bursty socket traffic: a member may fire `capacity` events at once,
 * then settles to `refillPerSecond`. Used for message sends and reactions so
 * one runaway client cannot saturate the fan-out loop.
 */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    const timer = setInterval(() => this.sweep(), 60_000);
    timer.unref?.();
  }

  /** Consumes one token. Returns `true` when the action may proceed. */
  tryConsume(key: string, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };
    const elapsedSeconds = (now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(now: number = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      const full = bucket.tokens >= this.capacity;
      if (full && now - bucket.updatedAt > 300_000) this.buckets.delete(key);
    }
  }
}
