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
