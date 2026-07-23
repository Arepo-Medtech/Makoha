/**
 * MedAgentBench score-artifact contract (zod mirror of
 * mcp/schemas/medagent-score.schema.json — the JSON schema is the source of truth).
 *
 * Schema-first discipline (as verification/eval-report-schema.js): the score artifact is
 * validated BEFORE it is written. MA.1 writes the INERT (driver-pending) form; MA.2 fills
 * task_success_rate / invariant_adherence_rate.
 */
import { z } from "zod";

export const MedAgentScoreSchema = z
  .object({
    schema_version: z.literal("1.0.0"),
    benchmark: z.literal("medagent"),
    milestone: z.string().optional(),
    harness: z.string().optional(),
    generated_utc: z.string().min(1),
    corpus_version: z.string().min(1),
    corpus_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/, "corpus_checksum must be sha256:<64 hex>"),
    corpus_counts: z.record(z.any()),
    ehr_conformance: z.record(z.any()).optional(),
    threshold: z.number(),
    armed: z.boolean(),
    benchmark_passed: z.boolean(),
    reason: z.string().optional(),
    task_success_rate: z.number().nullable().optional(),
    invariant_adherence_rate: z.number().nullable().optional(),
    counts: z.record(z.any()).optional(),
    per_task: z.array(z.any()).optional(),
  })
  .strict();

/** Validate a MedAgent score artifact; throws on any violation. */
export function validateMedAgentScore(obj) {
  return MedAgentScoreSchema.parse(obj);
}
