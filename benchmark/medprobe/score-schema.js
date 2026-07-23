/**
 * MedProbeBench score-artifact contract (zod mirror of
 * mcp/schemas/medprobe-score.schema.json — the JSON schema is the source of truth).
 *
 * Schema-first discipline, exactly like verification/eval-report-schema.js mirrors
 * eval-run-report.schema.json: the score artifact is validated BEFORE it is written,
 * so a malformed benchmark result can never be recorded.
 *
 * B2.1a writes the INERT (scorer-pending) form: armed:false, benchmark_passed:false.
 * The scored rates (citation_accountability_rate / hallucination_catch_rate) are
 * optional here and filled by the scorer in B2.1b.
 */
import { z } from "zod";

export const MedProbeScoreSchema = z
  .object({
    schema_version: z.literal("1.0.0"),
    benchmark: z.literal("medprobe"),
    milestone: z.string().optional(),
    harness: z.string().optional(),
    generated_utc: z.string().min(1),
    corpus_version: z.string().min(1),
    corpus_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/, "corpus_checksum must be sha256:<64 hex>"),
    corpus_counts: z.record(z.any()),
    threshold: z.number(),
    armed: z.boolean(),
    benchmark_passed: z.boolean(),
    reason: z.string().optional(),
    citation_accountability_rate: z.number().nullable().optional(),
    hallucination_catch_rate: z.number().nullable().optional(),
    counts: z.record(z.any()).optional(),
    per_item: z.array(z.any()).optional(),
  })
  .strict();

/** Validate a MedProbe score artifact; throws on any violation. */
export function validateMedProbeScore(obj) {
  return MedProbeScoreSchema.parse(obj);
}
