/**
 * Contract tests for the EvalRunReport gate (FL-40, Phase 1 — contract lock).
 * Asserts:
 *   - validateEvalRunReport accepts a well-formed report (both dimension kinds).
 *   - it rejects: missing required key, malformed hash, unknown key, wrong
 *     method literal, bad enum, and a mode-mismatched (non-eval) receipt mode.
 *   - the JSON Schema and the zod mirror agree on the required-key set.
 * Run from repo root: node test/contract-eval-report.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateEvalRunReport } from "../verification/eval-report-schema.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HASH = "sha256:" + "a".repeat(64);

/** A hand-built, fully-scored, passing EvalRunReport — the positive fixture. */
function validEvalRunReport() {
  return {
    schema_version: "1.0.0",
    run_id: "eval-17214480-abc",
    rubric_version: "eval-rubric:v0.1",
    clinician_signoff_ref: "signoff:eval-rubric:v0.1:KL",
    backend: "claude",
    mode: "replay",
    generated_at_utc: new Date().toISOString(),
    case_set_ref: "case-corpus-v2:2026-07-20",
    cases: [
      {
        case_id: "SPEC-CARD-01-00023",
        difficulty_tier: "tier_1",
        diagnosis_category: "cardiovascular",
        is_t5: true,
        turns: [
          { turn: 0, trunk_id: "1.0", candidate_output_hash: HASH, verification_pass: true },
          { turn: 1, trunk_id: "9.0", candidate_output_hash: HASH, verification_pass: true },
        ],
        dimensions: {
          history_taking: {
            score: 1.0,
            method: "coverage",
            evidence: { matched: ["DI-001", "DI-003", "DI-005"], missed: [], total: 3 },
          },
          diagnostic_reasoning: {
            score: 0.9,
            method: "coverage",
            evidence: { matched: ["35304003", "57054005"], missed: ["59282003"], total: 3 },
          },
          management_quality: {
            score: 0.85,
            method: "coverage",
            evidence: {
              matched: ["escalate_000", "keep_upright_forward", "no_home_med_treats"],
              missed: [],
              total: 3,
              penalised: [],
            },
          },
          communication: {
            score: 0.8,
            method: "judge",
            judge_receipt: {
              request_id: "judge-17214480-xyz",
              timestamp_utc: new Date().toISOString(),
              upstream: "claude-opus-4-8",
              mode: "replay",
              prompt_hash: HASH,
              verdict: "clear",
            },
          },
        },
        triage: {
          classification: "correct",
          score: 1.0,
          ai_tier: "T5",
          under_triage: false,
          critical_under_triage: false,
          over_triage: false,
        },
        verification_pass: true,
        ungrounded: false,
        fully_scored: true,
        case_score: 0.9,
        clinical_pass: true,
        auto_fail: false,
      },
    ],
    positional_stability: {
      overall: "stable",
      long_list_case_ids: ["SPEC-CARD-01-00023"],
      results: [{ case_id: "SPEC-CARD-01-00023", verdict: "stable", permutations: 6 }],
    },
    metrics: {
      n: 1,
      grounding_compliance: 1,
      fully_scored: 1,
      clinical_pass_rate: 1,
      critical_under_triage_count: 0,
      t5_critical_under_triage_count: 0,
    },
    release_gate: { release_ready: true, armed: true, blocking_reasons: [] },
  };
}

function expectThrow(fn, label, errors) {
  try {
    fn();
    errors.push(`${label}: expected a throw, got none`);
  } catch (_) {
    /* expected */
  }
}

function run() {
  const errors = [];

  // 1. Positive fixture round-trips.
  try {
    validateEvalRunReport(validEvalRunReport());
  } catch (e) {
    errors.push("valid eval report rejected: " + e.message);
  }

  // 2. Missing a required top-level key.
  expectThrow(() => {
    const { metrics, ...noMetrics } = validEvalRunReport();
    validateEvalRunReport(noMetrics);
  }, "report missing metrics", errors);

  // 3. Malformed turn hash.
  expectThrow(() => {
    const r = validEvalRunReport();
    r.cases[0].turns[0].candidate_output_hash = "sha256:NOTHEX";
    validateEvalRunReport(r);
  }, "report malformed turn hash", errors);

  // 4. Unknown key (additionalProperties:false / .strict()).
  expectThrow(() => validateEvalRunReport({ ...validEvalRunReport(), unexpected_key: 1 }), "report unknown key", errors);

  // 5. Wrong method literal on a coverage dimension.
  expectThrow(() => {
    const r = validEvalRunReport();
    r.cases[0].dimensions.history_taking.method = "judge";
    validateEvalRunReport(r);
  }, "coverage dim with judge method", errors);

  // 6. Bad enum (backend).
  expectThrow(() => validateEvalRunReport({ ...validEvalRunReport(), backend: "gpt" }), "report bad backend enum", errors);

  // 7. Judge receipt with a non-eval mode (must be replay|live, not the pipeline mock/dry_run/live set).
  expectThrow(() => {
    const r = validEvalRunReport();
    r.cases[0].dimensions.communication.judge_receipt.mode = "mock";
    validateEvalRunReport(r);
  }, "judge receipt non-eval mode", errors);

  // 8. JSON Schema and zod mirror agree on the required-key set (drift guard).
  const jsonSchema = JSON.parse(
    readFileSync(join(HERE, "..", "mcp", "schemas", "eval-run-report.schema.json"), "utf8"),
  );
  const jsonRequired = [...jsonSchema.required].sort();
  const zodRequired = [
    "schema_version",
    "run_id",
    "rubric_version",
    "backend",
    "mode",
    "generated_at_utc",
    "cases",
    "positional_stability",
    "metrics",
    "release_gate",
  ].sort();
  if (JSON.stringify(jsonRequired) !== JSON.stringify(zodRequired)) {
    errors.push(`required-key drift: JSON ${JSON.stringify(jsonRequired)} vs zod ${JSON.stringify(zodRequired)}`);
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-eval-report: OK");
}

run();
