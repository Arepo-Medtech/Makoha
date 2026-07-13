/**
 * Internal clinical domain model for the PharmCheck live core (FL-30 §2.2).
 *
 * This model sits BEHIND the frozen PharmCheck contract — it is the engine's internal
 * representation of clinical reference knowledge, never exposed on the wire. The wire
 * shape is and remains the frozen pharm-intent / pharm-check schemas (source of truth);
 * this file must never be treated as a substitute for them.
 *
 * SCOPE (Step 2 = contract lock): these are the zod TYPES + validators only. No clinical
 * content is authored here — populating provenanced records is Step 3 (authoring pipeline).
 * Defining the shapes first is the schema-first discipline: no data flows through the seam
 * without a validated contract.
 *
 * PROVENANCE OR IT DOESN'T SHIP (FL-30 Guardrail 5): every clinical entity carries a
 * ProvenanceSchema block. A record with no provenance cannot validate, so an anonymous
 * clinical fact is structurally unrepresentable.
 */
import { z } from "zod";

/**
 * Governance / provenance block — mandatory on every clinical entity (Guardrail 5).
 * source_ref cites the primary/open source (SUSMP instrument id, STOPP/START citation,
 * TDM reference, RxNorm/ATC id) or "self-authored"; reviewed_by is null until a
 * registered pharmacist attests; review_status walks draft → clinician_review → approved.
 */
export const ProvenanceSchema = z
  .object({
    source: z.string().min(2), // e.g. "SUSMP Poisons Standard", "STOPP/START v3", "TDM reference", "self-authored"
    source_ref: z.string().min(1), // instrument id / citation / concept id / URL id
    authored_by: z.string().min(2),
    reviewed_by: z.string().min(2).nullable(), // null until a clinician attests
    review_status: z.enum(["draft", "clinician_review", "approved"]),
    version: z.string().min(1),
    effective_date: z.string().min(4), // ISO date (YYYY-MM-DD)
  })
  .strict();

/** AU scheduling — the full SUSMP set (richer than the frozen intent's subset). S4D is
 * the AU "drugs of dependence" appendix, carried for parity with the frozen intent. */
export const AU_SCHEDULES = ["unscheduled", "S2", "S3", "S4", "S4D", "S5", "S6", "S7", "S8", "S9", "S10", "unknown"];

/** Drug / product entity — ingredient-level identity, agnostic to country where the drug
 * is (most generics are US/UK/AU-common). ARTG id / ATC are optional (nullable) so a
 * generic-level record needn't wait on an AU registration id. */
export const DrugProductSchema = z
  .object({
    ingredient: z.string().min(2),
    form: z.string().nullable().optional(),
    strength: z.string().nullable().optional(),
    route: z.string().nullable().optional(),
    artg_id: z.string().nullable().optional(), // AU Register of Therapeutic Goods id, if applicable
    synonyms: z.array(z.string()).default([]),
    atc_code: z.string().nullable().optional(), // WHO ATC classification (open)
    provenance: ProvenanceSchema,
  })
  .strict();

/** AU scheduling record (source: SUSMP / Poisons Standard). */
export const AuScheduleSchema = z
  .object({
    ingredient: z.string().min(2),
    schedule: z.enum(AU_SCHEDULES),
    state_appendix_flags: z.array(z.string()).default([]),
    effective_date: z.string().min(4),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Narrow Therapeutic Index record (source: TDM reference + primary literature; the
 * DrugBank NTI category is a STRUCTURE-ONLY pointer, never content — Guardrail 1).
 * therapeutic_interval / monitoring capture the TDM pathway (e.g. lithium 0.4–0.8 mmol/L). */
export const NtiSchema = z
  .object({
    ingredient: z.string().min(2),
    is_nti: z.boolean(),
    rationale: z.string().min(5),
    monitoring_hint: z.string().nullable().optional(),
    therapeutic_interval: z.string().nullable().optional(), // e.g. "0.4–0.8 mmol/L (prophylaxis)"
    time_to_steady_state_days: z.number().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Interaction record — drug–drug, drug–condition, or drug–renal. Mechanism is a
 * MECHANISTIC CLASS (e.g. "CYP3A4 inhibition"), never copied monograph prose (Guardrail 1). */
export const InteractionSchema = z
  .object({
    interaction_kind: z.enum(["drug_drug", "drug_condition", "drug_renal"]),
    subject: z.string().min(2), // the drug in question
    object: z.string().min(2), // the interacting drug, condition, or renal state
    severity: z.enum(["critical", "moderate", "low"]),
    mechanism_class: z.string().min(3), // mechanistic class, not prose
    management_category: z.string().min(3), // e.g. "avoid", "monitor", "dose-adjust"
    evidence_tier: z.enum(["guideline", "trial", "mechanistic", "consensus"]),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Renal dosing rule (source: STOPP/START v3 renal criteria corroborated against AMH/TGA).
 * Mirrors the frozen pharm-check renal_threshold object semantics. */
export const RenalDosingSchema = z
  .object({
    ingredient: z.string().min(2),
    action: z.enum(["renal_contraindicated", "renal_adjustment_required"]),
    contraindicated_below_egfr: z.number().nullable().optional(),
    dose_reduction_below_egfr: z.number().nullable().optional(),
    monitoring: z.string().nullable().optional(),
    provenance: ProvenanceSchema,
  })
  .strict();

/** Allergy cross-reactivity group (self-authored + primary literature). Members are
 * generic drug names that share a cross-reactivity class (e.g. beta-lactams). */
export const AllergyGroupSchema = z
  .object({
    group: z.string().min(2),
    members: z.array(z.string().min(1)).min(1),
    provenance: ProvenanceSchema,
  })
  .strict();

/** PBS formulary record (source: PBS Public API v3 — Commonwealth open data). Factual
 * formulary/subsidy data, distinct from the clinical-judgement capabilities; populated by
 * the cached sync (scripts/pharm-pbs-sync.mjs), not the clinician authoring pipeline. */
export const PbsFormularySchema = z
  .object({
    pbs_item_code: z.string().min(1),
    ingredient: z.string().min(1),
    atc_code: z.string().nullable().optional(),
    pbs_authority_required: z.boolean(),
    prescriber_types: z.array(z.string()).default([]),
    provenance: ProvenanceSchema,
  })
  .strict();

/** CDS envelope — the internal decision object (FL-30 §2.2). required_human_review must
 * ALWAYS be true: the engine proposes, a registered practitioner disposes (Guardrail 2).
 * This maps to the frozen PharmCheck.status; it never replaces it. */
export const CdsEnvelopeSchema = z
  .object({
    alert_level: z.enum(["PASS", "WARN", "HARD_FAIL", "BLOCKED_NO_PROOF"]),
    machine_rationale: z.string().min(3),
    required_human_review: z.literal(true), // structurally cannot be false — no auto-cleared gate
    provenance_refs: z.array(z.string()).default([]), // source_refs backing the decision
  })
  .strict();

const validator = (schema, label) => (v) => {
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(`Invalid ${label}: ` + r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
};

export const validateProvenance = validator(ProvenanceSchema, "Provenance");
export const validateDrugProduct = validator(DrugProductSchema, "DrugProduct");
export const validateAuSchedule = validator(AuScheduleSchema, "AuSchedule");
export const validateNti = validator(NtiSchema, "Nti");
export const validateInteraction = validator(InteractionSchema, "Interaction");
export const validateRenalDosing = validator(RenalDosingSchema, "RenalDosing");
export const validateAllergyGroup = validator(AllergyGroupSchema, "AllergyGroup");
export const validatePbsFormulary = validator(PbsFormularySchema, "PbsFormulary");
export const validateCdsEnvelope = validator(CdsEnvelopeSchema, "CdsEnvelope");

/** Map a capability key → its record validator, for the authoring pipeline. Capabilities
 * with a bespoke path (dose_guidance, pbs) are intentionally absent here. */
export const CAPABILITY_VALIDATORS = {
  nti: validateNti,
  interactions: validateInteraction,
  renal: validateRenalDosing,
  scheduling: validateAuSchedule,
  allergy: validateAllergyGroup,
};
