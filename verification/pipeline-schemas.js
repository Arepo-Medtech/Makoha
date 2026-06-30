/**
 * Zod contracts for the pipeline step boundaries — GroundingPlan (Step 1 output),
 * ContextPacket (Step 3 output), and the EvidenceNode / Receipt it contains.
 *
 * Mirrors mcp/schemas/{grounding-plan,context-packet,evidence-node,receipt}.json.
 * validateGroundingPlan() / validateContextPacket() are called at the step
 * boundaries so no step hands on data that breaks its contract (schema-first,
 * <engineering_standards>). The JSON schemas remain the source of truth — keep
 * these in lockstep. `.strict()` mirrors each schema's additionalProperties:false.
 */
import { z } from "zod";

const MODE = ["live", "dry_run", "mock"];
const SERVERS = ["docs", "knowledge", "identity-au", "terminology", "fhir-broker", "pharmacology", "messaging-geo"];
const TRUNK_IDS = ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0", "7.0", "8.0", "9.0"];

const FACT_CATEGORIES = [
  "demographic", "symptom", "past_history", "medication", "allergy", "vital_sign",
  "lab_result", "risk_score", "family_history", "social_history", "clinical_assessment",
  "care_plan", "investigation", "immunisation", "procedure", "routing_signal", "pertinent_negative",
];

/** Receipt — proof of a live (or explicitly mock) tool call. */
export const ReceiptSchema = z
  .object({
    request_id: z.string().min(8),
    timestamp_utc: z.string().datetime(),
    upstream: z.string().min(1),
    mode: z.enum(MODE),
    tool: z.string().optional(),
    server: z.enum(SERVERS).optional(),
    latency_ms: z.number().int().min(0).optional(),
    correlation_id: z.string().optional(),
    error: z
      .object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() })
      .strict()
      .optional(),
  })
  .strict();

/** EvidenceNode — links a critical claim to its proof. */
export const EvidenceNodeSchema = z
  .object({
    id: z.string(),
    claim: z.string(),
    supports: z
      .array(z.object({ kind: z.string(), ref: z.string(), excerpt: z.string().optional() }).strict())
      .min(1),
    provenance: z
      .object({
        created_at_utc: z.string().datetime(),
        created_by: z.string(),
        verification: z
          .object({
            status: z.enum(["unverified", "verified", "rejected"]),
            reasons: z.array(z.string()).optional(),
            verified_at_utc: z.string().datetime().optional(),
          })
          .strict(),
      })
      .strict(),
    fhir_path: z.string().optional(),
    snomed_ref: z
      .object({ system: z.string(), code: z.string(), display: z.string(), receipt_id: z.string() })
      .strict()
      .optional(),
  })
  .strict();

const FactSchema = z
  .object({
    fact_id: z.string(),
    category: z.enum(FACT_CATEGORIES),
    label: z.string(),
    value: z.unknown(),
    fhir_path: z.string().optional(),
    unit: z.string().optional(),
    interpretation: z.string().optional(),
    snomed_code: z.string().optional(),
    receipt_id: z.string().optional(),
    evidence_node_id: z.string().optional(),
    sanitised_by: z.string().optional(),
  })
  .strict();

/** GroundingPlan — Step 1 routing output. */
export const GroundingPlanSchema = z
  .object({
    needs_static_docs: z.array(z.string()),
    needs_live_calls: z.array(z.string()),
    needs_structured_kg: z.array(z.string()),
    trunk_id: z.enum(TRUNK_IDS).optional(),
    session_ref: z.string().optional(),
    run_id: z.string().optional(),
    constraints: z.array(z.string()).optional(),
    needs_pharmacology_check: z.boolean().optional(),
    needs_fhir_reads: z.array(z.string()).optional(),
    priority: z.enum(["urgent", "routine"]).optional(),
    live_call_specs: z
      .array(
        z
          .object({
            server: z.string(),
            tool: z.string(),
            query: z.unknown().optional(),
            required_for_generation: z.boolean().optional(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();

/** ContextPacket — Step 3 context-injection output (the only thing the trunk sees). */
export const ContextPacketSchema = z
  .object({
    facts: z.array(FactSchema),
    evidence: z.array(EvidenceNodeSchema),
    constraints: z.array(z.string()),
    receipts: z.array(ReceiptSchema),
    trunk_id: z.string().optional(),
    session_ref: z.string().optional(),
    run_id: z.string().optional(),
    assembled_at_utc: z.string().datetime().optional(),
    mode: z.enum(MODE).optional(),
    grounding_plan_summary: z.record(z.unknown()).optional(),
    pharm_check_receipt: z.record(z.unknown()).optional(),
    blocked: z.boolean().optional(),
    block_reasons: z.array(z.string()).optional(),
  })
  .strict();

function makeValidator(schema, label) {
  return (value) => {
    const result = schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid ${label} — pipeline step refused to hand it on. ${issues}`);
    }
    return result.data;
  };
}

export const validateGroundingPlan = makeValidator(GroundingPlanSchema, "GroundingPlan");
export const validateContextPacket = makeValidator(ContextPacketSchema, "ContextPacket");
