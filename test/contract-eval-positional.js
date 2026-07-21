/**
 * Contract tests for long-list selection + the M3 positional-stability gate
 * (FL-40, Phase 6). Asserts:
 *   - the corpus genuinely contains long-list cases (M3 coverage requirement met);
 *   - longListSignals classifies a long vs short case correctly;
 *   - aggregatePositional severity ordering + not_applicable-on-empty;
 *   - positionalGate blocks on unstable / indeterminate / not_applicable, passes on stable;
 *   - DETECTION: a merit-ranking generator is "stable", a position-sensitive one
 *     (ranking rides fact ORDER) is "unstable";
 *   - WIRING: runBackendCases folds a positional block into release_gate.
 * Run from repo root: node test/contract-eval-positional.js
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rmSync } from "node:fs";
import { loadCaseNodes } from "../verification/eval-case-loader.js";
import {
  longListSignals,
  differentialDxNames,
  runPositionalForCase,
  aggregatePositional,
  positionalGate,
  LONG_LIST_N,
} from "../verification/eval-positional.js";
import { runBackendCases } from "../verification/eval-harness.js";
import { createReplayer } from "../verification/llm-replay.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = join(HERE, "..", "data", "cases");
const LONG_CASE = loadCaseNodes(join(CASES, "SPEC-CARD-01-00041")); // differential=8
const SHORT_CASE = loadCaseNodes(join(CASES, "SPEC-CARD-01-00023")); // disc=6, dx=4

/** Merit generator: emits the differential in a FIXED order regardless of input. */
function meritGen(dxNames) {
  const fixed = dxNames.join(" ");
  return () => Promise.resolve({ candidate_output: fixed });
}
/** Position-sensitive generator: emits each dx in the order its ANCHOR fact
 *  (case-<k>) appears in THIS (possibly permuted) packet — so permuting facts
 *  permutes the differential ranking. Content-tied, not index-tied. */
function positionGen(dxNames) {
  return (packet) =>
    Promise.resolve({
      candidate_output: (packet.facts || [])
        .map((f) => {
          const m = /case-(\d+)/.exec(f.fact_id || "");
          const n = m ? Number(m[1]) : 0;
          return dxNames[(n - 1 + dxNames.length) % dxNames.length];
        })
        .join(" "),
    });
}

async function run() {
  const errors = [];
  const cleanup = [];

  // 1. Corpus coverage — long-list cases exist (M3 requirement).
  const dirs = readdirSync(CASES).filter((d) => existsSync(join(CASES, d, "10_ground_truth_node.json")));
  let longCount = 0;
  for (const d of dirs) {
    const policy = JSON.parse(readFileSync(join(CASES, d, "02_conversational_policy.json"), "utf8"));
    const ground_truth = JSON.parse(readFileSync(join(CASES, d, "10_ground_truth_node.json"), "utf8"));
    if (longListSignals({ policy, ground_truth }).qualifies) longCount += 1;
  }
  if (longCount < 50) errors.push(`only ${longCount} long-list cases at N=${LONG_LIST_N} — M3 coverage requirement at risk (expected many)`);

  // 2. longListSignals classification.
  if (!longListSignals(LONG_CASE).qualifies) errors.push("SPEC-CARD-01-00041 should qualify as long-list");
  if (longListSignals(SHORT_CASE).qualifies) errors.push("SPEC-CARD-01-00023 should NOT qualify as long-list");

  // 3. aggregatePositional severity ordering.
  if (aggregatePositional([]).overall !== "not_applicable") errors.push("empty → not_applicable");
  if (aggregatePositional([{ case_id: "a", verdict: "stable" }]).overall !== "stable") errors.push("all stable → stable");
  if (aggregatePositional([{ case_id: "a", verdict: "stable" }, { case_id: "b", verdict: "indeterminate" }]).overall !== "indeterminate") errors.push("indeterminate wins over stable");
  if (aggregatePositional([{ case_id: "a", verdict: "indeterminate" }, { case_id: "b", verdict: "unstable" }]).overall !== "unstable") errors.push("unstable wins over all");

  // 4. positionalGate.
  if (positionalGate({ overall: "stable", results: [] }).passes !== true) errors.push("stable should pass the gate");
  for (const bad of ["unstable", "indeterminate", "not_applicable"]) {
    const g = positionalGate({ overall: bad, results: [{ verdict: bad }] });
    if (g.passes) errors.push(`${bad} should block the gate`);
    if (!g.reasons.length) errors.push(`${bad} should carry a blocking reason`);
  }

  // 5. DETECTION on a real long-list case.
  const dx = differentialDxNames(LONG_CASE.ground_truth);
  const stableRes = await runPositionalForCase(LONG_CASE, meritGen(dx), { permutations: 4 });
  if (stableRes.verdict !== "stable") errors.push(`merit generator → ${stableRes.verdict}, expected stable`);
  const unstableRes = await runPositionalForCase(LONG_CASE, positionGen(dx), { permutations: 4 });
  if (unstableRes.verdict !== "unstable") errors.push(`position-sensitive generator → ${unstableRes.verdict}, expected unstable`);

  // 6. WIRING: runBackendCases folds positional into release_gate.
  const mkFix = (tag) => {
    const p = join(tmpdir(), `eval-pos-${tag}-${process.pid}.json`);
    cleanup.push(p);
    return p;
  };
  const judge = { replayer: createReplayer({ fixturePath: mkFix("judge"), mode: "live" }), transport: () => Promise.resolve("clear") };
  // position-sensitive across the whole run (consult + positional): the positional
  // pass must flag it and the gate must carry a positional block.
  const posBody = await runBackendCases({
    cases: [LONG_CASE],
    backendName: "claude",
    replayer: createReplayer({ fixturePath: mkFix("gen"), mode: "live" }),
    judge,
    generatorFactory: () => positionGen(dx),
    nowIso: "2026-07-20T00:00:00.000Z",
  });
  if (posBody.positional_stability.overall !== "unstable") errors.push(`wiring: expected unstable, got ${posBody.positional_stability.overall}`);
  if (posBody.release_gate.release_ready) errors.push("wiring: release_ready should be false under positional instability");
  if (!posBody.release_gate.blocking_reasons.some((r) => /positional/i.test(r))) errors.push("wiring: release_gate missing a positional blocking reason");

  const judge2 = { replayer: createReplayer({ fixturePath: mkFix("judge2"), mode: "live" }), transport: () => Promise.resolve("clear") };
  const meritBody = await runBackendCases({
    cases: [LONG_CASE],
    backendName: "claude",
    replayer: createReplayer({ fixturePath: mkFix("gen2"), mode: "live" }),
    judge: judge2,
    generatorFactory: () => meritGen(dx),
    nowIso: "2026-07-20T00:00:00.000Z",
  });
  if (meritBody.positional_stability.overall !== "stable") errors.push(`wiring: merit expected stable, got ${meritBody.positional_stability.overall}`);
  if (meritBody.release_gate.blocking_reasons.some((r) => /positional/i.test(r))) errors.push("wiring: merit run should carry NO positional block");

  for (const f of cleanup) if (existsSync(f)) rmSync(f, { force: true });

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log(`contract-eval-positional: OK (${longCount} long-list cases at N=${LONG_LIST_N})`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
