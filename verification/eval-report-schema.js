/**
 * Zod contract for the EvalRunReport (FL-40 live clinical eval run output).
 *
 * Mirrors mcp/schemas/eval-run-report.schema.json. This is the schema-first gate
 * for the evaluation record: validateEvalRunReport() is called by the eval
 * harness (scripts/eval-run.mjs) BEFORE a run report is persisted or acted on by
 * the release gate.
 *
 * WHY this gate exists: release_gate.release_ready is the blocking signal that
 * FL-52 (production promotion) reads. A malformed eval report is not a valid
 * basis for a release decision, so we fail LOUD (throw) rather than let a
 * defective record drive a gate — a missing proof is a blocked status, never a
 * silently-degraded one. Keep this in lockstep with the JSON schema; if they
 * disagree, the JSON schema is the source of truth.
 *
 * SCORING-STORE FIREWALL: this contract describes DERIVED scores + item
 * ids/labels only. Sealed nodes 10-13 are read scorer-side by eval-scoring.js and
 * the dimension graders; their content never appears in a report or a
 * ContextPacket. Nothing here places a scoring node into a trunk path.
 */
import { z } from "zod";

/** sha256:<64 lowercase hex> — reused from the medicolegal anchor convention. */
export const SHA256_HASH = /^sha256:[a-f0-9]{64}$/;

const TRUNK_IDS = ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0", "7.0", "8.0", "9.0"];
const BACKENDS = ["claude", "medgemma"];
const EVAL_MODE = ["replay", "live"];
const STABILITY_VERDICT = ["stable", "unstable", "indeterminate", "not_applicable"];
const TRIAGE_CLASS = [
  "correct",
  "acceptable",
  "minor_over_triage",
  "moderate_over_triage",
  "minor_under_triage",
  "serious_under_triage",
  "critical_under_triage",
];

/** score in [0,1] or null (null = dimension stubbed on a replay/pre-live run). */
const ScoreOrNull = z.number().min(0).max(1).nullable();

/** Deterministic coverage-scored dimension (history / diagnostic / management). */
const CoverageDimensionSchema = z
  .object({
    score: ScoreOrNull,
    method: z.literal("coverage"),
    evidence: z
      .object({
        matched: z.array(z.string()),
        missed: z.array(z.string()),
        total: z.number().int().min(0),
        penalised: z.array(z.string()).optional(),
      })
      .strict(),
  })
  .strict();

/** Communication dimension scored by the LLM-judge — receipt-gated. */
const JudgeDimensionSchema = z
  .object({
    score: ScoreOrNull,
    method: z.literal("judge"),
    judge_receipt: z
      .object({
        request_id: z.string().min(6),
        timestamp_utc: z.string().datetime(),
        upstream: z.string().min(1),
        mode: z.enum(EVAL_MODE),
        prompt_hash: z.string().regex(SHA256_HASH, "judge prompt_hash must be 'sha256:' + 64 lowercase hex chars"),
        verdict: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const TurnSchema = z
  .object({
    turn: z.number().int().min(0),
    trunk_id: z.enum(TRUNK_IDS),
    candidate_output_hash: z
      .string()
      .regex(SHA256_HASH, "candidate_output_hash must be 'sha256:' + 64 lowercase hex chars"),
    verification_pass: z.boolean(),
  })
  .strict();

const TriageSchema = z
  .object({
    classification: z.enum(TRIAGE_CLASS),
    score: z.number().min(0).max(1),
    ai_tier: z.string().regex(/^T[0-5]$/).optional(),
    under_triage: z.boolean(),
    critical_under_triage: z.boolean(),
    over_triage: z.boolean().optional(),
  })
  .strict();

const CaseResultSchema = z
  .object({
    case_id: z.string().min(1),
    difficulty_tier: z.string().optional(),
    diagnosis_category: z.string().optional(),
    is_t5: z.boolean(),
    turns: z.array(TurnSchema).min(1),
    dimensions: z
      .object({
        history_taking: CoverageDimensionSchema,
        diagnostic_reasoning: CoverageDimensionSchema,
        management_quality: CoverageDimensionSchema,
        communication: JudgeDimensionSchema,
      })
      .strict(),
    triage: TriageSchema,
    verification_pass: z.boolean(),
    ungrounded: z.boolean(),
    fully_scored: z.boolean(),
    case_score: z.number().min(0).max(1).nullable(),
    clinical_pass: z.boolean(),
    auto_fail: z.boolean().optional(),
  })
  .strict();

const PositionalStabilitySchema = z
  .object({
    overall: z.enum(STABILITY_VERDICT),
    long_list_case_ids: z.array(z.string()),
    results: z.array(
      z
        .object({
          case_id: z.string().min(1),
          verdict: z.enum(STABILITY_VERDICT),
          reason: z.string().optional(),
          permutations: z.number().int().min(0).optional(),
        })
        .strict(),
    ),
  })
  .strict();

const MetricsSchema = z
  .object({
    n: z.number().int().min(1),
    grounding_compliance: z.number().min(0).max(1).nullable(),
    fully_scored: z.number().int().min(0),
    clinical_pass_rate: z.number().min(0).max(1).nullable(),
    critical_under_triage_count: z.number().int().min(0),
    t5_critical_under_triage_count: z.number().int().min(0),
  })
  .strict();

const ReleaseGateSchema = z
  .object({
    release_ready: z.boolean(),
    armed: z.boolean(),
    blocking_reasons: z.array(z.string().min(5)),
  })
  .strict();

/**
 * EvalRunReport contract. .strict() mirrors the JSON schema's
 * additionalProperties:false. The required keys match the JSON schema's
 * `required` array.
 */
export const EvalRunReportSchema = z
  .object({
    schema_version: z.literal("1.0.0"),
    run_id: z.string().min(8),
    rubric_version: z.string().min(3),
    clinician_signoff_ref: z.string().min(6).optional(),
    backend: z.enum(BACKENDS),
    mode: z.enum(EVAL_MODE),
    generated_at_utc: z.string().datetime(),
    case_set_ref: z.string().optional(),
    cases: z.array(CaseResultSchema).min(1),
    positional_stability: PositionalStabilitySchema,
    metrics: MetricsSchema,
    release_gate: ReleaseGateSchema,
  })
  .strict();

/**
 * Validate an eval-run report against the contract, throwing on failure.
 * Call this in the harness BEFORE persisting a report or reading its
 * release_gate. A defective evaluation record must never drive a release gate.
 *
 * @param {unknown} report - the eval-run report about to be written/acted on
 * @returns {object} the parsed (and type-narrowed) report
 * @throws {Error} with a readable message if the report is not a valid record
 */
export function validateEvalRunReport(report) {
  const result = EvalRunReportSchema.safeParse(report);
  if (!result.success) {
    // Fail loud: a defective evaluation record must never drive a release gate.
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid EvalRunReport — refusing to record/act on eval run. ${issues}`);
  }
  return result.data;
}
