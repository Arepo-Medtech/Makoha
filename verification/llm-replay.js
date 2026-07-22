/**
 * llm-replay — prompt-hash-keyed record/replay for every LLM call in the eval
 * harness (FL-40, Phase 4). It is what lets the release gate be BOTH real and
 * CI-reproducible: a live run records each (prompt_hash → response) pair once;
 * every later run replays those bytes with no network, no key, no variance.
 *
 * Used by BOTH generation (integration/llm-adapter.js, wired in Phase 5) and the
 * communication judge (verification/eval-judge.js) — one mechanism, so the whole
 * consult replays deterministically.
 *
 * FAIL-CLOSED (the core rule): in "replay" mode a MISSING key THROWS. A replay
 * run must never reach out to a model and must never fabricate a response — a
 * missing fixture is a blocked run with a clear message ("record a live run
 * first"), consistent with BLOCKED_NO_PROOF everywhere else in the system.
 *
 * RESUME + CRASH-DURABILITY (2026-07-22): a live run that dies partway (a killed
 * terminal, a sleeping host, an exhausted API balance) must NOT lose the work it
 * already paid for, and a re-run must NOT re-bill for cases it already recorded.
 * Two properties give that:
 *   1. RECORD-OR-REPLAY: `call()` returns an already-recorded response in ANY
 *      mode — so in live mode a key that's already on disk REPLAYS for free
 *      (no API call) instead of regenerating. A live run is therefore a
 *      resumable TOP-UP: it only spends on the keys still missing.
 *   2. INCREMENTAL ATOMIC PERSIST: each newly-recorded pair is written to disk
 *      immediately (autosave, on by default), via write-tmp-then-rename so a
 *      crash mid-write can never truncate/corrupt the fixture.
 * Keys are prompt-hash based, so a changed prompt/packet yields a NEW key and
 * regenerates automatically; stale keys from an old prompt simply linger unused.
 * To force a fully fresh run, DELETE the fixture file first.
 *
 * Determinism: the stored record is returned VERBATIM (including its recorded
 * timestamp), so a replayed receipt is byte-identical to the recorded one. The
 * eval-run mode (replay vs live) is applied by the CALLER to the receipt's
 * `mode` field — this layer never rewrites the stored bytes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @param {{ fixturePath: string, mode: "replay"|"live", autosave?: boolean }} args
 *   replay: read-only, throws on a miss. live: replays a recorded key, else calls
 *   liveFn and records it. autosave (default true): persist after each new record
 *   so an interrupted live run keeps everything it recorded.
 */
export function createReplayer({ fixturePath, mode, autosave = true } = {}) {
  if (mode !== "replay" && mode !== "live") {
    throw new Error(`llm-replay mode must be 'replay' or 'live' (got ${JSON.stringify(mode)})`);
  }
  let store = {};
  if (existsSync(fixturePath)) {
    try {
      store = JSON.parse(readFileSync(fixturePath, "utf8"));
    } catch (e) {
      throw new Error(`llm-replay: fixture ${fixturePath} is not valid JSON — ${e.message}`);
    }
  }
  let dirty = false;

  /** Atomic persist: write a temp file then rename over the target. rename is
   *  atomic on a single filesystem, so a crash mid-write leaves EITHER the old
   *  intact fixture OR the new one — never a half-written, unparseable file. */
  const persist = () => {
    if (!dirty) return false;
    mkdirSync(dirname(fixturePath), { recursive: true });
    const tmp = `${fixturePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(store, null, 2));
    renameSync(tmp, fixturePath);
    dirty = false;
    return true;
  };

  return {
    mode,
    /**
     * Return the recorded response for `key`, or (live only, on a miss) call
     * `liveFn`, record its result, persist it, and return it.
     * @param {string} key - the prompt hash (sha256:… )
     * @param {() => Promise<any>} liveFn - the real model call (live-mode miss only)
     */
    async call(key, liveFn) {
      // RECORD-OR-REPLAY: an already-recorded key returns verbatim in ANY mode.
      // In live mode this is the resume path — a recorded case is never re-billed.
      if (Object.prototype.hasOwnProperty.call(store, key)) {
        return store[key];
      }
      if (mode === "replay") {
        throw new Error(
          `REPLAY MISS: no recorded response for prompt key ${key} in ${fixturePath}. ` +
            "A replay run cannot call a model or fabricate a response — record a live run first.",
        );
      }
      // live + miss: call once, record, persist immediately. The SDK's own
      // retries are the only retries.
      const response = await liveFn();
      store[key] = response;
      dirty = true;
      if (autosave) persist();
      return response;
    },
    has(key) {
      return Object.prototype.hasOwnProperty.call(store, key);
    },
    /** Persist newly-recorded pairs. A final flush; a no-op when autosave has
     *  already written everything (nothing dirty). Returns true if it wrote. */
    save() {
      return persist();
    },
    size() {
      return Object.keys(store).length;
    },
  };
}
