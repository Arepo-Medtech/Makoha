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

// Receipt trust-qualifier vocabularies (MI-02). Exported so the source ranker
// (MI-03) and jurisdiction guard (MI-20) bind to one definition, not a copy.
export const JURISDICTION_TAGS = ["AU_endorsed", "US_context", "non_AU"];
export const CONFIDENCE_BANDS = ["high", "moderate", "low", "provisional"];
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
    // MI-02 additive-monotone trust qualifiers — optional, so every legacy
    // MCP-call receipt still validates unchanged.
    jurisdiction_tag: z.enum(JURISDICTION_TAGS).optional(),
    confidence: z.enum(CONFIDENCE_BANDS).optional(),
    source_rank: z.number().int().min(1).max(5).optional(),
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
    // Audit/scorer-side consult tags (FreeText_Taxonomy vocabulary) — advisory
    // metadata on audit-channel evidence only, never on packet-injected facts.
    taxonomy_tags: z
      .array(z.object({ group: z.string(), tag: z.string(), matched: z.string().optional() }).strict())
      .optional(),
    snomed_ref: z
      .object({ system: z.string(), code: z.string(), display: z.string(), receipt_id: z.string() })
      .strict()
      .optional(),
  })
  .strict();

/** Patient-provided channels (mirror of 01 objective_data_offered[].source).
 *  None imply clinician measurement or verification. */
const PATIENT_PROVENANCE = ["patient_home_device", "patient_wearable", "patient_reported", "video_observable", "caregiver_reported"];

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
    // Patient-provided fact stamps (HIST-1): provenance marks the channel,
    // verified is always false on entry — nothing may flip it without a
    // receipt-backed verification step.
    provenance: z.enum(PATIENT_PROVENANCE).optional(),
    verified: z.boolean().optional(),
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
  .strict()
  // Hard-limit enforcement: every lab_result fact MUST be sanitised (carry
  // sanitised_by) and MUST NOT carry a bare/leading numeric value — raw lab
  // numbers must go through the deterministic investigation parser before they
  // can enter a packet the LLM sees (<non_negotiable_invariants>).
  .superRefine((packet, ctx) => {
    (packet.facts || []).forEach((f, i) => {
      // MECHANICAL BAR (HIST-1): patient-provided data can never masquerade as
      // laboratory data. A lab_result reaches the packet only via the
      // deterministic parser over a tool-derived source — never via a
      // patient-provenance channel.
      if (f.provenance && f.category === "lab_result") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["facts", i, "category"], message: "a patient-provenance fact may never carry category lab_result — patient-provided data cannot masquerade as laboratory data" });
      }
      if (f.category !== "lab_result") return;
      if (!f.sanitised_by) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["facts", i, "sanitised_by"], message: "lab_result fact must be sanitised (sanitised_by required) — raw lab values must go through the investigation parser" });
      }
      const v = f.value;
      const looksNumeric = typeof v === "number" || (typeof v === "string" && /^\s*[-+]?\d/.test(v));
      if (looksNumeric) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["facts", i, "value"], message: "lab_result value must be sanitised qualitative text, not a (leading) number" });
      }
    });
  });

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
