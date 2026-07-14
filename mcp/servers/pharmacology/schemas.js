/**
 * Zod contracts for the pharmacology server I/O — mirrors mcp/schemas/pharm-intent
 * and pharm-check. PharmIntent input is validated leniently (unknown keys stripped);
 * the PharmCheck output we produce is validated strictly before return, so a
 * malformed safety result is never emitted.
 *
 * Keep in lockstep with the JSON schemas (source of truth).
 */
import { z } from "zod";

const MODE = ["live", "dry_run", "mock"];
const SEVERITY = ["critical", "moderate", "low"];

// The frozen check_id enum (pharm-check.schema.json, source of truth). The zod
// contract must match it exactly — a check_id outside this set (e.g. the former
// illegal "schedule_check") makes the output non-conformant to the frozen schema.
const CHECK_IDS = [
  "nti_check", "allergy_check", "interaction_check", "renal_dosing_check",
  "hepatic_check", "pregnancy_check", "schedule_8_check",
  "age_appropriateness_check", "route_appropriateness_check",
];

const FLAG_TYPES = [
  "nti", "allergy_confirmed", "allergy_cross_reactivity", "interaction_severe",
  "interaction_moderate", "renal_adjustment_required", "renal_contraindicated",
  "hepatic_adjustment_required", "hepatic_contraindicated", "pregnancy_category_x",
  "pregnancy_category_d", "schedule_8_pdmp_required", "schedule_8_authority_required",
  "age_beers_criteria", "age_paediatric_weight_based", "route_not_achievable_in_setting",
  "stewardship_narrow_spectrum_preferred", "stewardship_culture_pending",
];

// ---- PharmIntent (input) ----
const DrugIntentSchema = z.object({
  drug_name: z.string(),
  drug_class: z.string(),
  amt_snomed_code: z.string().optional(),
  terminology_receipt_id: z.string().optional(),
  route: z.string().optional(),
  pbs_code: z.string().optional(),
  schedule: z.enum(["S2", "S3", "S4", "S4D", "S8", "unscheduled", "unknown"]).optional(),
  is_nti_candidate: z.boolean().optional(),
  description: z.string().optional(),
});

export const PharmIntentSchema = z.object({
  intent_id: z.string(),
  session_ref: z.string().min(6),
  intent_type: z.enum([
    "new_prescription", "dose_continuation", "dose_review", "cessation",
    "drug_class_consideration", "analgesia_consideration", "antibiotic_consideration", "emergency_medication",
  ]),
  drug_intent: DrugIntentSchema,
  indication: z.record(z.unknown()).optional(),
  patient_facts_ref: z.record(z.unknown()),
  checks_requested: z.array(z.string()).optional(),
  clinical_context: z
    .object({ patient_age_years: z.number().optional(), patient_weight_kg: z.number().optional() })
    .optional(),
  blocking_reasons_from_trunk: z.array(z.string()).optional(),
  mode: z.enum(MODE),
  created_at_utc: z.string().optional(),
});

// ---- PharmCheck (output) ----
const CheckResultSchema = z
  .object({
    check_id: z.enum(CHECK_IDS),
    status: z.enum(["PASS", "WARN", "HARD_FAIL", "NOT_RUN"]),
    severity: z.enum(SEVERITY).optional(),
    reason: z.string().optional(),
    missing_facts_required: z.array(z.string()).optional(),
    sources_used: z.array(z.string()).optional(),
  })
  .strict();

const FlagSchema = z
  .object({
    flag_id: z.string(),
    flag_type: z.enum(FLAG_TYPES),
    severity: z.enum(SEVERITY),
    description: z.string(),
    drug_a: z.string().optional(),
    drug_b: z.string().optional(),
    allergen_snomed_code: z.string().optional(),
    reaction_snomed_code: z.string().optional(),
    // Frozen schema types renal_threshold as an OBJECT, not a bare number.
    renal_threshold: z
      .object({
        patient_egfr: z.number().optional(),
        contraindicated_below: z.number().optional(),
        dose_reduction_below: z.number().optional(),
      })
      .strict()
      .optional(),
    au_reference: z.string().optional(),
  })
  .strict();

const ReceiptSchema = z
  .object({
    request_id: z.string().min(8),
    timestamp_utc: z.string().datetime(),
    upstream: z.string().min(1),
    mode: z.enum(MODE),
    tool: z.string().optional(),
    server: z.string().optional(),
  })
  .strict();

export const PharmCheckSchema = z
  .object({
    check_id: z.string(),
    intent_id: z.string(),
    session_ref: z.string().min(6),
    status: z.enum(["PASS", "WARN", "HARD_FAIL", "BLOCKED_NO_PROOF"]),
    check_results: z.array(CheckResultSchema),
    flags: z.array(FlagSchema),
    dose_guidance: z
      .object({
        safe_dose_range: z.string().optional(),
        adjustment_required: z.boolean().optional(),
        adjustment_reason: z.string().optional(),
        monitoring_required: z.union([z.string(), z.array(z.string())]).optional(),
        duration_guidance: z.string().optional(),
        pbs_authority_required: z.boolean().optional(),
        pbs_item_code: z.string().optional(),
      })
      .strict()
      .optional(),
    next_data_requests: z.array(z.string()).optional(),
    receipt: ReceiptSchema,
    vendor_reference: z.string().optional(),
    mode: z.enum(MODE).optional(),
    checked_at_utc: z.string().optional(),
  })
  .strict();

export function validatePharmIntent(v) {
  const r = PharmIntentSchema.safeParse(v);
  if (!r.success) throw new Error("Invalid PharmIntent: " + r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

export function validatePharmCheck(v) {
  const r = PharmCheckSchema.safeParse(v);
  if (!r.success) throw new Error("Invalid PharmCheck — refusing to emit safety result: " + r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}
