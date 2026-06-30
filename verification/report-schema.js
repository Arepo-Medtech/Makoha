/**
 * Zod contract for the VerificationReport (pipeline Step 5 output).
 *
 * Mirrors mcp/schemas/verification-report.schema.json. This is the schema-first
 * gate for the audit record: validateReport() is called by BOTH report writers
 * (verification/run.js and integration/trunk-pipeline.js) before the report is
 * persisted.
 *
 * WHY this gate exists: the VerificationReport — and specifically
 * candidate_output_hash — is the medicolegal record of exactly what a trunk
 * generated. A malformed or hash-less report is not a valid audit record. We
 * therefore fail LOUD (throw) rather than write a defective record: a missing
 * proof is a blocked status, never a silently-degraded one. Keep this in lockstep
 * with the JSON schema — if they disagree, the JSON schema is the source of truth.
 */
import { z } from "zod";

/** sha256:<64 lowercase hex> — the medicolegal anchor. */
export const SHA256_HASH = /^sha256:[a-f0-9]{64}$/;

/** The five fixed verifier checks, in the order verify() runs them. */
const CHECK_NAMES = [
  "no_invented_codes",
  "no_invented_guidelines",
  "no_invented_operations",
  "no_repo_invention",
  "hard_stop_enforcement",
];

const MODE = ["live", "dry_run", "mock"];

const ResultSchema = z
  .object({
    check: z.enum(CHECK_NAMES),
    passed: z.boolean(),
    reason: z.string().optional(),
    severity: z.enum(["critical", "fail", "warning"]).optional(),
    evidence_refs_checked: z.array(z.string()).optional(),
  })
  .strict();

/**
 * VerificationReport contract. .strict() mirrors the JSON schema's
 * additionalProperties:false. The six required keys match the JSON schema's
 * `required` array (candidate_output_hash included as of the hashing build);
 * the remaining keys are optional and documented in the JSON schema.
 */
export const VerificationReportSchema = z
  .object({
    // Required — the medicolegal core.
    run_id: z.string().min(8),
    timestamp_utc: z.string().datetime(),
    pass: z.boolean(),
    results: z.array(ResultSchema).min(1),
    missing_receipts: z.array(z.string().min(5)),
    candidate_output_hash: z
      .string()
      .regex(SHA256_HASH, "candidate_output_hash must be 'sha256:' + 64 lowercase hex chars"),

    // Optional — present in some writers / reserved for audit enrichment.
    trunk_id: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "6.0", "7.0", "8.0", "9.0"]).optional(),
    session_ref: z.string().min(6).optional(),
    overall_severity: z.enum(["critical", "fail", "warning", "pass"]).optional(),
    mock_receipt_flags: z.array(z.string()).optional(),
    hard_stops: z.array(z.string().min(5)).optional(),
    candidate_output_excerpt: z.string().max(500).optional(),
    packet_summary: z
      .object({
        facts_count: z.number().int().min(0).optional(),
        evidence_count: z.number().int().min(0).optional(),
        receipts_count: z.number().int().min(0).optional(),
        static_doc_citations: z.array(z.string()).optional(),
        live_receipt_ids: z.array(z.string()).optional(),
        packet_mode: z.enum(MODE).optional(),
        packet_blocked: z.boolean().optional(),
      })
      .strict()
      .optional(),
    pipeline_version: z.literal("1.0.0").optional(),
    mode: z.enum(MODE).optional(),
  })
  .strict();

/**
 * Validate a report object against the contract, throwing on failure.
 * Call this in every report writer BEFORE persisting report.json.
 *
 * @param {unknown} report - the report object about to be written
 * @returns {object} the parsed (and type-narrowed) report
 * @throws {Error} with a readable message if the report is not a valid audit record
 */
export function validateReport(report) {
  const result = VerificationReportSchema.safeParse(report);
  if (!result.success) {
    // Fail loud: a defective medicolegal record must never be persisted.
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid VerificationReport — refusing to write audit record. ${issues}`);
  }
  return result.data;
}
