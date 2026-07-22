#!/usr/bin/env node
/**
 * eval-run — the FL-40 CLI + BLOCKING release gate.
 *
 * MODES (verification/llm-replay.js):
 *   --mode replay  read recorded fixtures — deterministic, no key, the CI path.
 *   --mode live    call the real backend once and record fixtures (staging only;
 *                  needs HEYDOC_LLM_LIVE + creds via the secrets seam).
 *
 * THE GATE (--gate): the run is release-ready only when EVERY backend that ran
 * is release_ready (the threshold gate AND the M3 positional gate). With --gate:
 *   - a backend that RAN and is not release_ready → exit 1 (blocks);
 *   - all backends SKIPPED (replay mode, no recorded fixtures yet) → exit 0 with
 *     a loud SKIP notice. This is the honest armed-but-inert state: the gate is
 *     wired into CI now and bites automatically the day Phase 8 commits fixtures
 *     (same idiom as the MIRAGE / opencds gates). It never fabricates a pass.
 *
 * POSITIONAL COST (--positional-sample N): cap the M3 positional pass to the
 * first N long-list cases (the ruling's sanctioned sampled canary). The drop is
 * LOGGED, never silent.
 *
 * Usage:
 *   node scripts/eval-run.mjs --mode replay --gate            # CI: gate on committed fixtures
 *   node scripts/eval-run.mjs --mode live --limit 45 --positional-sample 30   # staging record
 */
import { readdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCaseNodes } from "../verification/eval-case-loader.js";
import { runBackendCases } from "../verification/eval-harness.js";
import { selectLongListCases } from "../verification/eval-positional.js";
import { createReplayer } from "../verification/llm-replay.js";
import { makeDefaultJudgeTransport } from "../verification/eval-judge.js";
import { validateEvalRunReport } from "../verification/eval-report-schema.js";
import { resolveClinicianSignoff } from "../verification/eval-signoff.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CASES_DIR = join(ROOT, "data", "cases");
const RUBRIC_VERSION = "eval-rubric:v1.2"; // clinician-signed 2026-07-22 (docs/grounding/eval-rubric.md §10); tier-class quality scoring + 0.65 bar. v1.1 (§9) / v1.0 (§8) remain valid citations for runs recorded before their successor.

function parseArgs(argv) {
  const out = {
    mode: "replay",
    backends: ["claude", "medgemma"],
    cases: null,
    limit: null,
    gate: false,
    positionalSample: null,
    out: join(ROOT, "verification", "data", "eval-runs"),
    fixtures: join(ROOT, "verification", "data", "eval-fixtures"),
    rubricDoc: join(ROOT, "docs", "grounding", "eval-rubric.md"),
    signoffRef: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const eq = argv[i].includes("=");
    const [k, inlineV] = eq ? argv[i].split(/=(.*)/s) : [argv[i], undefined];
    const next = argv[i + 1];
    const v = eq ? inlineV : next !== undefined && !next.startsWith("--") ? (i += 1, next) : undefined;
    if (k === "--gate") out.gate = true;
    else if (k === "--mode") out.mode = v;
    else if (k === "--backends") out.backends = v.split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--cases") out.cases = v.split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--limit") out.limit = Number(v);
    else if (k === "--positional-sample") out.positionalSample = Number(v);
    else if (k === "--out") out.out = v;
    else if (k === "--fixtures") out.fixtures = v;
    else if (k === "--rubric-doc") out.rubricDoc = v;
    else if (k === "--signoff-ref") out.signoffRef = v;
  }
  return out;
}

function selectCaseDirs({ cases, limit }) {
  if (cases && cases.length) return cases.map((id) => join(CASES_DIR, id));
  const all = readdirSync(CASES_DIR)
    .filter((d) => existsSync(join(CASES_DIR, d, "13_safety_netting_node.json")))
    .sort();
  return (limit ? all.slice(0, limit) : all).map((d) => join(CASES_DIR, d));
}

/** A fixture file counts as present only if it exists AND holds ≥1 recorded pair. */
function fixturePresent(path) {
  if (!existsSync(path)) return false;
  try {
    return Object.keys(JSON.parse(readFileSync(path, "utf8"))).length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const caseDirs = selectCaseDirs(args);
  if (!caseDirs.length) {
    console.error("eval-run: no cases selected");
    process.exit(1);
  }
  const cases = caseDirs.map(loadCaseNodes);
  const longListTotal = selectLongListCases(cases).length;

  // AUTHORITATIVE LIVE RUN GATE (FL-40): a live run certifies a release, so it may
  // only proceed against a CLINICIAN-SIGNED rubric. Resolve the sign-off ref BEFORE
  // any generation and REFUSE fail-closed if the rubric is not signed for this
  // version — the report's clinician_signoff_ref is never stamped from a draft.
  // Replay/CI runs skip this (they validate the machinery, never certify).
  let signoffRef = null;
  if (args.mode === "live") {
    const r = resolveClinicianSignoff({ rubricVersion: RUBRIC_VERSION, rubricPath: args.rubricDoc, override: args.signoffRef });
    if (!r.ref) {
      console.error(`eval-run: REFUSING an authoritative live run — ${r.reason}. A live run requires a clinician-signed rubric (clinician_signoff_ref for ${RUBRIC_VERSION}).`);
      process.exit(1);
    }
    signoffRef = r.ref;
    console.log(`eval-run: authoritative live run authorised by clinician sign-off ${signoffRef}`);
  }

  const runId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const generatedAt = new Date().toISOString();
  mkdirSync(args.out, { recursive: true });
  mkdirSync(args.fixtures, { recursive: true });

  const ran = [];
  const skipped = [];
  for (const backend of args.backends) {
    const genPath = join(args.fixtures, `${backend}-gen.json`);
    const judgePath = join(args.fixtures, `${backend}-judge.json`);

    // Replay mode with no recorded fixtures → SKIP (armed but inert; never fake).
    if (args.mode === "replay" && !fixturePresent(genPath)) {
      skipped.push(backend);
      console.log(`[${backend}] SKIPPED — no recorded fixtures at ${genPath}. This proves NOTHING; record a live run first (Phase 8).`);
      continue;
    }

    const genReplayer = createReplayer({ fixturePath: genPath, mode: args.mode });
    const judgeReplayer = createReplayer({ fixturePath: judgePath, mode: args.mode });
    const judgeTransport = args.mode === "live" ? makeDefaultJudgeTransport() : undefined;

    // RESUME: a live run replays keys already on disk for free (llm-replay
    // record-or-replay) and persists each new record immediately, so an
    // interrupted run is resumed by simply re-running — only missing cases
    // call the API. Make that visible.
    if (args.mode === "live" && genReplayer.size() > 0) {
      console.log(`[${backend}] resuming: ${genReplayer.size()} generation + ${judgeReplayer.size()} judge response(s) already recorded — those replay free; only missing cases spend on the API. (Delete ${genPath} to force a fully fresh run.)`);
    }

    if (Number.isInteger(args.positionalSample) && args.positionalSample < longListTotal) {
      console.log(`[${backend}] positional: sampling ${args.positionalSample} of ${longListTotal} long-list cases (${longListTotal - args.positionalSample} UNCHECKED — sanctioned M3 canary)`);
    }

    const body = await runBackendCases({
      cases,
      backendName: backend,
      replayer: genReplayer,
      judge: { replayer: judgeReplayer, transport: judgeTransport },
      positionalSampleN: Number.isInteger(args.positionalSample) ? args.positionalSample : undefined,
    });
    if (args.mode === "live") {
      genReplayer.save();
      judgeReplayer.save();
    }

    const report = validateEvalRunReport({
      schema_version: "1.0.0",
      run_id: `${runId}-${backend}`,
      rubric_version: RUBRIC_VERSION,
      ...(signoffRef ? { clinician_signoff_ref: signoffRef } : {}),
      backend,
      mode: args.mode,
      generated_at_utc: generatedAt,
      cases: body.cases,
      positional_stability: body.positional_stability,
      metrics: body.metrics,
      release_gate: body.release_gate,
    });
    writeFileSync(join(args.out, `${runId}-${backend}.json`), JSON.stringify(report, null, 2));
    ran.push(report);

    const g = report.release_gate;
    console.log(
      `[${backend}] cases=${report.cases.length} armed=${g.armed} release_ready=${g.release_ready} ` +
        `pass_rate=${report.metrics.clinical_pass_rate} grounding=${report.metrics.grounding_compliance} ` +
        `crit_under_triage=${report.metrics.critical_under_triage_count} positional=${report.positional_stability.overall}`,
    );
    g.blocking_reasons.forEach((r) => console.log(`    • ${r}`));
  }

  // Gate decision.
  if (!args.gate) {
    console.log("eval-run: informational run (no --gate).");
    return;
  }
  if (ran.length === 0) {
    console.log(`eval-run: GATE SKIPPED — no backend produced a run (all fixtures absent). Nothing to certify; not a pass and not a failure.`);
    return; // exit 0: never red the build before Phase 8 records fixtures
  }
  const notReady = ran.filter((r) => !r.release_gate.release_ready);
  if (notReady.length) {
    console.error(`eval-run: GATE FAILED — ${notReady.map((r) => r.backend).join(", ")} not release-ready. Release requires EVERY backend to pass.`);
    process.exit(1);
  }
  if (skipped.length) {
    // Some backends ran and passed, but not all backends were covered.
    console.error(`eval-run: GATE INCOMPLETE — backends ${skipped.join(", ")} had no fixtures; release requires ALL of ${args.backends.join(", ")}.`);
    process.exit(1);
  }
  console.log(`eval-run: GATE PASSED — all backends (${args.backends.join(", ")}) release-ready.`);
}

main().catch((e) => {
  console.error("eval-run failed:", e.message);
  process.exit(1);
});
