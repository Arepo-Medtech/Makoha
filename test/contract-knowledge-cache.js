/**
 * Contract tests for the Evidence Broker cache + rate governor (MI-23).
 * Deterministic — no real timers. Drives a fake clock ({ t: 0 }) through `now`
 * and a fake `sleep` that advances the clock synchronously instead of waiting.
 * Asserts: cache hit/miss shape; freshness flips false once ttl elapses (value
 * still returned); FIFO eviction at maxEntries; RateGovernor spaces acquire()
 * calls by ~1000/rps ms; withRetry backs off on 429/5xx and gives up after
 * retries exhausted, but rethrows immediately (no backoff) on a non-retryable
 * (e.g. 400) error.
 * Run from repo root: node test/contract-knowledge-cache.js
 */
import { ResponseCache, RateGovernor, withRetry } from "../mcp/servers/knowledge/cache/index.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

function makeClock() {
  const clock = { t: 0 };
  const now = () => clock.t;
  const sleep = (ms) => { clock.t += ms; return Promise.resolve(); };
  return { clock, now, sleep };
}

async function run() {
  // --- ResponseCache: hit / miss ---
  {
    const { clock, now } = makeClock();
    const cache = new ResponseCache({ now });
    check("miss returns hit:false", cache.get("nope").hit === false);
    cache.set("k1", { foo: "bar" }, 1000);
    const hit = cache.get("k1");
    check("hit returns hit:true", hit.hit === true);
    check("hit returns value", hit.value && hit.value.foo === "bar");
    check("hit is fresh immediately", hit.fresh === true);
    check("age_ms is 0 at store time", hit.age_ms === 0);
  }

  // --- ResponseCache: freshness flips false after ttl elapses ---
  {
    const { clock, now } = makeClock();
    const cache = new ResponseCache({ now });
    cache.set("k1", "value-1", 1000);
    clock.t += 1500; // advance past ttl
    const stale = cache.get("k1");
    check("still a hit after ttl elapsed", stale.hit === true);
    check("fresh:false after ttl elapsed", stale.fresh === false);
    check("value still present on stale hit", stale.value === "value-1");
    check("age_ms reflects elapsed time", stale.age_ms === 1500);
  }

  // --- ResponseCache: FIFO eviction ---
  {
    const { now } = makeClock();
    const cache = new ResponseCache({ now, maxEntries: 3 });
    cache.set("a", 1, 10000);
    cache.set("b", 2, 10000);
    cache.set("c", 3, 10000);
    check("cache not yet over capacity: a present", cache.get("a").hit === true);
    cache.set("d", 4, 10000); // exceeds maxEntries -> evict oldest ("a")
    check("oldest key 'a' evicted", cache.get("a").hit === false);
    check("'b' still present", cache.get("b").hit === true);
    check("'c' still present", cache.get("c").hit === true);
    check("'d' present", cache.get("d").hit === true);
    cache.set("e", 5, 10000); // evict "b" next
    check("'b' evicted next (FIFO order)", cache.get("b").hit === false);
    check("'c' still present after second eviction", cache.get("c").hit === true);
  }

  // --- RateGovernor: spacing ---
  {
    const { clock, now, sleep } = makeClock();
    const gov = new RateGovernor({ rps: 10, now, sleep }); // 100ms min interval
    await gov.acquire();
    check("first acquire() does not sleep", clock.t === 0);
    await gov.acquire();
    check("second acquire() spaces by ~1000/rps ms", clock.t === 100);
    await gov.acquire();
    check("third acquire() spaces by another ~1000/rps ms", clock.t === 200);
  }

  // --- RateGovernor: no extra sleep if caller was already slow ---
  {
    const { clock, now, sleep } = makeClock();
    const gov = new RateGovernor({ rps: 10, now, sleep });
    await gov.acquire();
    clock.t += 500; // caller took its own sweet time between acquires
    await gov.acquire();
    check("no sleep needed when interval already elapsed", clock.t === 500);
  }

  // --- withRetry: retries on 429 then succeeds ---
  {
    const { clock, now, sleep } = makeClock();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      if (calls <= 2) { const e = new Error("rate limited"); e.status = 429; throw e; }
      return "ok";
    };
    const result = await withRetry(fn, { sleep, baseMs: 200, maxMs: 5000 });
    check("withRetry resolves 'ok' after 429s", result === "ok");
    check("withRetry called fn 3 times", calls === 3);
    check("withRetry backed off (clock advanced)", clock.t > 0);
  }

  // --- withRetry: always 500s -> rejects after retries exhausted ---
  {
    const { sleep } = makeClock();
    let calls = 0;
    const fn = async () => { calls += 1; const e = new Error("server error"); e.status = 500; throw e; };
    let threw = null;
    try {
      await withRetry(fn, { retries: 4, sleep, baseMs: 10, maxMs: 100 });
    } catch (e) {
      threw = e;
    }
    check("withRetry rejects after retries exhausted", threw !== null && threw.status === 500);
    check("withRetry attempted retries + 1 calls", calls === 5); // attempt 0..4 = 5 total calls
  }

  // --- withRetry: non-retryable (400) rejects immediately, no clock advance ---
  {
    const { clock, sleep } = makeClock();
    let calls = 0;
    const fn = async () => { calls += 1; const e = new Error("bad request"); e.status = 400; throw e; };
    let threw = null;
    try {
      await withRetry(fn, { sleep, baseMs: 200, maxMs: 5000 });
    } catch (e) {
      threw = e;
    }
    check("withRetry rejects immediately on non-retryable error", threw !== null && threw.status === 400);
    check("withRetry called fn exactly once (no retry)", calls === 1);
    check("no backoff sleep for non-retryable error", clock.t === 0);
  }

  if (errors.length) {
    console.error("Contract failures:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log("MI-23 cache+rate PASS");
  process.exit(0);
}

run();
