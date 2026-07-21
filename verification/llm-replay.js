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
 * Determinism: the stored record is returned VERBATIM (including its recorded
 * timestamp), so a replayed receipt is byte-identical to the recorded one. The
 * eval-run mode (replay vs live) is applied by the CALLER to the receipt's
 * `mode` field — this layer never rewrites the stored bytes.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * @param {{ fixturePath: string, mode: "replay"|"live" }} args
 *   replay: read-only, throws on a miss. live: calls the liveFn and records it.
 */
export function createReplayer({ fixturePath, mode } = {}) {
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

  return {
    mode,
    /**
     * Return the recorded response for `key`, or (live only) call `liveFn`,
     * record its result, and return it.
     * @param {string} key - the prompt hash (sha256:… )
     * @param {() => Promise<any>} liveFn - the real model call (live mode only)
     */
    async call(key, liveFn) {
      if (mode === "replay") {
        if (!Object.prototype.hasOwnProperty.call(store, key)) {
          throw new Error(
            `REPLAY MISS: no recorded response for prompt key ${key} in ${fixturePath}. ` +
              "A replay run cannot call a model or fabricate a response — record a live run first.",
          );
        }
        return store[key];
      }
      // live: call once, record. The SDK's own retries are the only retries.
      const response = await liveFn();
      store[key] = response;
      dirty = true;
      return response;
    },
    has(key) {
      return Object.prototype.hasOwnProperty.call(store, key);
    },
    /** Persist newly-recorded pairs (live mode). Returns true if it wrote. */
    save() {
      if (!dirty) return false;
      mkdirSync(dirname(fixturePath), { recursive: true });
      writeFileSync(fixturePath, JSON.stringify(store, null, 2));
      dirty = false;
      return true;
    },
    size() {
      return Object.keys(store).length;
    },
  };
}
