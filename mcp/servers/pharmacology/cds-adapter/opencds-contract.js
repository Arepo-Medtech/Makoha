/**
 * AU_OSS_CDS gateway wire contract (Track A, Phase A2 — contract lock).
 *
 * This is the JSON request/response contract between our in-repo cds-adapter client
 * (opencds-client.js, built in A3) and the external OpenCDS gateway service. It is
 * DELIBERATELY an INTERMEDIATE contract, narrower than and distinct from the frozen
 * pharm-check output: the client never trusts the gateway to produce the final
 * PharmCheck. The client re-validates this response, re-applies the hard rules
 * (no dose on HARD_FAIL / paediatric / BLOCKED), and maps only recognised, in-enum
 * content into the strict frozen pharm-check shape. Anything off-enum is dropped, not
 * passed through. A response that fails this schema is fail-closed → BLOCKED_NO_PROOF.
 *
 * Transport model (A1 decision): our client speaks JSON/HTTPS to the gateway; the
 * gateway speaks native DSS/vMR to OpenCDS internally. OpenCDS supplies EXECUTION +
 * standards packaging over the clinician-signed FL-30 KB, never new knowledge — so the
 * receipt mode stays 'mock'/AU_OSS_CDS until staging validation, never mock-as-live.
 *
 * LOCKSTEP: OPENCDS_CHECK_IDS / OPENCDS_FLAG_TYPES mirror the FROZEN source of truth
 * (mcp/schemas/pharm-check.schema.json). schemas.js keeps its copies module-local and is
 * itself frozen, so we re-declare here rather than edit it; test/contract-opencds-contract.js
 * asserts these lists stay byte-equal to the frozen JSON-schema enums (drift = test red).
 */
import { z } from "zod";

/** Frozen check_id enum — mirror of pharm-check.schema.json check_results.items.check_id. */
export const OPENCDS_CHECK_IDS = [
  "nti_check",
  "allergy_check",
  "interaction_check",
  "renal_dosing_check",
  "hepatic_check",
  "pregnancy_check",
  "schedule_8_check",
  "age_appropriateness_check",
  "route_appropriateness_check",
];

/** Frozen flag_type enum — mirror of pharm-check.schema.json flags.items.flag_type. */
export const OPENCDS_FLAG_TYPES = [
  "nti",
  "allergy_confirmed",
  "allergy_cross_reactivity",
  "interaction_severe",
  "interaction_moderate",
  "renal_adjustment_required",
  "renal_contraindicated",
  "hepatic_adjustment_required",
  "hepatic_contraindicated",
  "pregnancy_category_x",
  "pregnancy_category_d",
  "schedule_8_pdmp_required",
  "schedule_8_authority_required",
  "age_beers_criteria",
  "age_paediatric_weight_based",
  "route_not_achievable_in_setting",
  "stewardship_narrow_spectrum_preferred",
  "stewardship_culture_pending",
];

const MODE = ["live", "dry_run", "mock"];
const CHECK_STATUS = ["PASS", "WARN", "HARD_FAIL", "NOT_RUN"];
const SEVERITY = ["critical", "moderate", "low"];

// ---- Request: client → gateway ----
// Carries the already-sanitised drug + resolved patient facts the KMs need. No raw
// patient identifiers, no free narrative — only the coded/resolved inputs the frozen
// checks consume. Unknown keys are stripped (lenient input), matching PharmIntent handling.
const OpenCdsDrugSchema = z.object({
  drug_name: z.string().min(1),
  drug_class: z.string().optional(),
  atc_code: z.string().optional(),
  rxnorm_code: z.string().optional(),
  amt_snomed_code: z.string().optional(),
  route: z.string().optional(),
  schedule: z.enum(["S2", "S3", "S4", "S4D", "S8", "unscheduled", "unknown"]).optional(),
});

// Resolved facts mirror what engine.js consumes; all optional because a missing fact must
// surface as NOT_RUN (→ BLOCKED_NO_PROOF), never be defaulted into a permissive value.
const OpenCdsResolvedFactsSchema = z.object({
  allergy_status: z.unknown().optional(),
  current_medications: z.array(z.string()).optional(),
  egfr_ml_min: z.number().optional(),
  nti_monitoring_documented: z.boolean().optional(),
  patient_age_years: z.number().optional(),
});

export const OpenCdsRequestSchema = z.object({
  request_id: z.string().min(8),
  drug: OpenCdsDrugSchema,
  resolved_facts: OpenCdsResolvedFactsSchema,
  checks_requested: z.array(z.enum(OPENCDS_CHECK_IDS)).min(1),
  knowledge_module_set: z.string().min(1), // which FL-30 KB version the gateway must load
  mode: z.enum(MODE),
});

// ---- Response: gateway → client ----
// Per-check verdict is constrained to the FROZEN check_id enum, so an off-enum verdict
// cannot even parse into a recognised result. Strict per item — a malformed verdict entry
// fails the whole response (fail-closed). dose_candidate is ADVISORY only: the client
// honours it solely when the composed verdict is PASS/WARN, never on HARD_FAIL/NOT_RUN.
const OpenCdsVerdictSchema = z
  .object({
    check_id: z.enum(OPENCDS_CHECK_IDS),
    status: z.enum(CHECK_STATUS),
    severity: z.enum(SEVERITY).optional(),
    reason: z.string().optional(),
    sources_used: z.array(z.string()).optional(),
  })
  .strict();

const OpenCdsFlagSchema = z
  .object({
    flag_type: z.enum(OPENCDS_FLAG_TYPES),
    severity: z.enum(SEVERITY),
    description: z.string().min(1),
    drug_a: z.string().optional(),
    drug_b: z.string().optional(),
  })
  .strict();

const OpenCdsDoseCandidateSchema = z
  .object({
    safe_dose_range: z.string().optional(),
    adjustment_required: z.boolean().optional(),
    adjustment_reason: z.string().optional(),
    monitoring_required: z.union([z.string(), z.array(z.string())]).optional(),
    duration_guidance: z.string().optional(),
  })
  .strict();

export const OpenCdsResponseSchema = z.object({
  request_id: z.string().min(8),
  engine: z.string().min(1), // e.g. "opencds-dss"
  knowledge_module_set: z.string().min(1), // the KB version actually executed (client cross-checks)
  check_verdicts: z.array(OpenCdsVerdictSchema).min(1),
  flags: z.array(OpenCdsFlagSchema).default([]),
  dose_candidate: OpenCdsDoseCandidateSchema.optional(),
  executed_at_utc: z.string().min(1).optional(),
});

/**
 * Validate a gateway REQUEST before it leaves the client. Throws on invalid — a
 * malformed request must never reach the gateway.
 */
export function validateOpenCdsRequest(v) {
  const r = OpenCdsRequestSchema.safeParse(v);
  if (!r.success) {
    throw new Error("Invalid OpenCdsRequest: " + r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return r.data;
}

/**
 * Validate a gateway RESPONSE. Returns { ok, data } | { ok:false, error } — fail-closed:
 * the A3 client turns ok:false into BLOCKED_NO_PROOF (never a fabricated verdict). Does
 * not throw, so a hostile/garbled gateway payload can't crash the firewall path.
 */
export function validateOpenCdsResponse(v) {
  const r = OpenCdsResponseSchema.safeParse(v);
  if (!r.success) {
    return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  return { ok: true, data: r.data };
}
