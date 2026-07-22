/**
 * Contract test: llm-replay record/replay with RESUME + crash-durability
 * (verification/llm-replay.js). Proves:
 *   - invalid mode throws;
 *   - a live MISS calls liveFn, records, and PERSISTS immediately (autosave),
 *     atomically (valid JSON, no leftover .tmp) — an interrupted run keeps it;
 *   - a live HIT replays the recorded response WITHOUT calling liveFn (resume /
 *     no re-bill) — the whole point of the 2026-07-22 fix;
 *   - a fresh live replayer over the same file resumes: recorded keys replay
 *     free, only missing keys spend;
 *   - replay mode: hit returns stored, miss throws REPLAY MISS (fail-closed);
 *   - autosave:false defers writing until save(); save() is a no-op when clean.
 *
 * Run from repo root: node test/contract-llm-replay.js
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { createReplayer } from "../verification/llm-replay.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const dirs = [];
const mkdir = () => { const d = mkdtempSync(join(tmpdir(), "replay-")); dirs.push(d); return d; };

async function run() {
  try {
    // 1. mode validation
    let threw = false;
    try { createReplayer({ fixturePath: "/x", mode: "bogus" }); } catch { threw = true; }
    check(threw, "invalid mode throws");

    // 2/3. live MISS → calls liveFn, records, persists immediately + atomically
    const fp1 = join(mkdir(), "gen.json");
    let calls = 0;
    const live = async () => { calls += 1; return { text: `resp-${calls}` }; };
    const r1 = createReplayer({ fixturePath: fp1, mode: "live" });
    const a = await r1.call("k1", live);
    check(a.text === "resp-1" && calls === 1, "live miss calls liveFn once and returns its result");
    check(existsSync(fp1), "live miss PERSISTS immediately (autosave) — crash-durable");
    check(!existsSync(`${fp1}.tmp`), "no leftover .tmp after the atomic rename");
    const onDisk = JSON.parse(readFileSync(fp1, "utf8")); // must be valid JSON
    check(onDisk.k1 && onDisk.k1.text === "resp-1", "persisted fixture holds the recorded pair");

    // 4. live HIT (same replayer) → replays WITHOUT a second liveFn call
    const b = await r1.call("k1", live);
    check(b.text === "resp-1" && calls === 1, "live HIT replays the recorded response WITHOUT calling liveFn (no re-bill)");

    // 4b. a NEW live replayer over the same file resumes prior state
    const r1b = createReplayer({ fixturePath: fp1, mode: "live" });
    check(r1b.size() === 1 && r1b.has("k1"), "a new live replayer loads prior records (resume state)");
    let calls2 = 0;
    const live2 = async () => { calls2 += 1; return { text: "new" }; };
    await r1b.call("k1", live2);
    check(calls2 === 0, "resumed run does NOT re-bill an already-recorded key");
    await r1b.call("k2", live2);
    check(calls2 === 1, "resumed run DOES spend on a missing key");

    // 5. replay mode: hit returns stored, miss throws REPLAY MISS
    const rp = createReplayer({ fixturePath: fp1, mode: "replay" });
    check((await rp.call("k1")).text === "resp-1", "replay hit returns the stored response");
    let missThrew = false;
    try { await rp.call("nope"); } catch (e) { missThrew = /REPLAY MISS/.test(e.message); }
    check(missThrew, "replay miss throws REPLAY MISS (fail-closed)");

    // 6. autosave:false defers the write; save() flushes; save() clean → no-op
    const fp2 = join(mkdir(), "gen.json");
    const r2 = createReplayer({ fixturePath: fp2, mode: "live", autosave: false });
    await r2.call("z", live);
    check(!existsSync(fp2), "autosave:false does NOT write on record");
    check(r2.save() === true && existsSync(fp2), "explicit save() writes the deferred records");
    check(r2.save() === false, "save() is a no-op when nothing is dirty");
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }

  if (errors.length) {
    console.error("Contract failures:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("contract-llm-replay: OK");
}

run();
