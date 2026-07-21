/**
 * Contract test for the eval CLI release gate (FL-40, Phase 7). Exercises the
 * two safety-critical exit behaviours by running scripts/eval-run.mjs as a
 * subprocess (proving the real CI behaviour):
 *   - NO FIXTURES (replay + --gate): exits 0 with a loud SKIP — the gate is armed
 *     but inert until Phase 8 records fixtures; it must NOT falsely red the build.
 *   - FIXTURES PRESENT, run NOT release-ready: exits 1 — the gate blocks.
 * The "ready → exit 0" path is the sole remaining branch of the same decision
 * (exit 1 only when a backend that ran is not release_ready).
 * Run from repo root: node test/contract-eval-gate.js
 */
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadCaseNodes } from "../verification/eval-case-loader.js";
import { runBackendCases } from "../verification/eval-harness.js";
import { createReplayer } from "../verification/llm-replay.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLI = join(ROOT, "scripts", "eval-run.mjs");
const CASE_ID = "SPEC-CARD-01-00023"; // T5, NOT long-list → never release-ready

function runCli(args) {
  return spawnSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
}

async function run() {
  const errors = [];
  const dirs = [];
  const mkTmp = (p) => {
    const d = mkdtempSync(join(tmpdir(), p));
    dirs.push(d);
    return d;
  };

  try {
    // 1. NO FIXTURES → SKIP green.
    const skipFix = mkTmp("eval-gate-skip-");
    const skipOut = mkTmp("eval-gate-skipout-");
    const skip = runCli(["--mode", "replay", "--gate", "--cases", CASE_ID, "--backends", "claude", "--fixtures", skipFix, "--out", skipOut]);
    if (skip.status !== 0) errors.push(`no-fixtures gate exit ${skip.status}, expected 0 (SKIP). stderr: ${skip.stderr}`);
    if (!/SKIP/i.test(skip.stdout)) errors.push("no-fixtures run did not print a SKIP notice");

    // 2. FIXTURES present + NOT release-ready → exit 1.
    //    Record a run (any deterministic outputs) at the CLI's fixture paths; the
    //    case is T5 but not long-list, so positional is not_applicable AND the
    //    scripted disposition under-triages → definitively not release-ready.
    const blockFix = mkTmp("eval-gate-block-");
    const blockOut = mkTmp("eval-gate-blockout-");
    const genRep = createReplayer({ fixturePath: join(blockFix, "claude-gen.json"), mode: "live" });
    const judgeRep = createReplayer({ fixturePath: join(blockFix, "claude-judge.json"), mode: "live" });
    await runBackendCases({
      cases: [loadCaseNodes(join(ROOT, "data", "cases", CASE_ID))],
      backendName: "claude",
      replayer: genRep,
      judge: { replayer: judgeRep, transport: () => Promise.resolve("clear") },
      generatorFactory: () => () => Promise.resolve({ ok: true, candidate_output: "Please tell me a bit more about what is happening." }),
      nowIso: "2026-07-20T00:00:00.000Z",
    });
    genRep.save();
    judgeRep.save();

    const block = runCli(["--mode", "replay", "--gate", "--cases", CASE_ID, "--backends", "claude", "--fixtures", blockFix, "--out", blockOut]);
    if (block.status !== 1) errors.push(`not-ready gate exit ${block.status}, expected 1 (BLOCK). stdout: ${block.stdout} stderr: ${block.stderr}`);
    if (!/GATE FAILED/i.test(block.stderr + block.stdout)) errors.push("not-ready run did not report GATE FAILED");
    // and it must have actually RUN the backend (not skipped it)
    if (/\[claude\] SKIPPED/.test(block.stdout)) errors.push("block run wrongly skipped the backend despite present fixtures");
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-eval-gate: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
