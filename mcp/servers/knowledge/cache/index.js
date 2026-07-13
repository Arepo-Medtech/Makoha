/**
 * Evidence Broker cache + rate governor (MI-23).
 *
 * SAFETY (fail-safe rule E1): on upstream outage, the Evidence Broker may serve a
 * cached receipt ONLY IF it is labelled fresh; otherwise the caller must return
 * "unknown" rather than pass off a stale-but-unlabelled claim as current. This
 * module enforces that split of responsibility narrowly:
 *   - ResponseCache never decides policy. get() only REPORTS whether an entry is
 *     fresh (elapsed < ttlMs) alongside the value — the caller (the broker) is the
 *     one that must refuse to treat a stale hit as a live claim.
 *   - RateGovernor is a generic min-interval spacer so the broker stays under an
 *     upstream's requests-per-second budget. It knows nothing about API keys or
 *     which upstream it is spacing for — that policy lives in the caller.
 *   - withRetry backs off on retryable transport failures (429 / 5xx) with
 *     jittered exponential backoff, and rethrows immediately (no backoff, no
 *     retry) on anything non-retryable — a 4xx client error is a caller bug, not
 *     a transient outage, and must not be masked by a retry loop.
 *
 * Pure module: no MCP server, no I/O of its own. `now` and `sleep` are injected
 * everywhere so tests can drive a fake clock deterministically — no real timers.
 * No new dependency — Node 20 built-ins only.
 */

/** Deterministic, policy-free TTL cache with FIFO eviction. */
export class ResponseCache {
  /**
   * @param {{ now?: () => number, maxEntries?: number }} [opts]
   */
  constructor({ now = () => Date.now(), maxEntries = 500 } = {}) {
    this._now = now;
    this._maxEntries = maxEntries;
    /** @type {Map<string, { value: any, stored_at: number, ttlMs: number }>} */
    this._store = new Map();
  }

  /**
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs
   */
  set(key, value, ttlMs) {
    // Re-inserting an existing key must not change its FIFO position for the
    // purposes of eviction ordering below — delete first so Map re-appends it
    // at the end of insertion order, same as any fresh key.
    this._store.delete(key);
    this._store.set(key, { value, stored_at: this._now(), ttlMs });
    while (this._store.size > this._maxEntries) {
      // Map iteration order is insertion order, so the first key is the oldest.
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
    }
  }

  /**
   * @param {string} key
   * @returns {{ hit: false } | { hit: true, fresh: boolean, value: *, stored_at: number, age_ms: number }}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return { hit: false };
    const age_ms = this._now() - entry.stored_at;
    return {
      hit: true,
      fresh: age_ms < entry.ttlMs,
      value: entry.value,
      stored_at: entry.stored_at,
      age_ms,
    };
  }
}

/** Min-interval spacer enforcing a max requests-per-second budget. */
export class RateGovernor {
  /**
   * @param {{ rps?: number, now?: () => number, sleep?: (ms: number) => Promise<void> }} [opts]
   */
  constructor({ rps = 3, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    this._minIntervalMs = 1000 / rps;
    this._now = now;
    this._sleep = sleep;
    this._last = null;
  }

  /** Resolves once at least `1000 / rps` ms have elapsed since the previous acquire(). */
  async acquire() {
    const nowMs = this._now();
    if (this._last !== null) {
      const elapsed = nowMs - this._last;
      const remaining = this._minIntervalMs - elapsed;
      if (remaining > 0) await this._sleep(remaining);
    }
    this._last = this._now();
  }
}

/**
 * @param {() => Promise<*>} fn
 * @param {{ retries?: number, baseMs?: number, maxMs?: number, sleep?: (ms: number) => Promise<void>, isRetryable?: (err: any) => boolean }} [opts]
 */
export async function withRetry(fn, {
  retries = 4,
  baseMs = 200,
  maxMs = 5000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  isRetryable,
} = {}) {
  const defaultIsRetryable = (err) => {
    const status = err?.status ?? err?.statusCode;
    return status === 429 || (status >= 500 && status <= 599);
  };
  const retryable = isRetryable ?? defaultIsRetryable;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const canRetry = retryable(err) && attempt < retries;
      if (!canRetry) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt) + Math.random() * baseMs;
      await sleep(backoff);
      attempt += 1;
    }
  }
}
