/**
 * ppp-ttt verdict contracts — zod mirror of mcp/schemas/ppp-ttt-verdict.schema.json.
 *
 * Step 1 of PPP-TTT (graded triage) is a VERACITY INTERROGATION: a raised safety
 * flag is graded against the clinician-attested scope-registry discriminators and
 * resolved to exactly one of GO | CAUTION | STOP. These schemas gate every module
 * boundary in verification/ppp-ttt/ (schema-first: no data crosses a step without
 * a validated contract).
 *
 * WHY .strict() everywhere: unknown keys on a triage artefact are either drift or
 * smuggling (e.g. a free-text patient field riding into the audit trail). Default-
 * deny mirrors the repo's zod convention (context-allowlist, report-schema).
 *
 * WHY tier is a closed 3-value enum: the plan forbids tier proliferation
 * ("no fourth tier, no sub-tiers"). GO/CAUTION/STOP map 1:1 onto the attested
 * scope-registry triage_model (PROCEED_TO_SIGNOFF / middle state / IMMEDIATE).
 */
import { z } from "zod";

/** Severity ordinal — the monotone lattice. Tier may only RISE within a run. */
export const TIER_ORDER = { GO: 0, CAUTION: 1, STOP: 2 };

/** Ordinal max of two tiers (the "never downgrade" primitive). */
export function maxTier(a, b) {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b;
}

export const Tier = z.enum(["GO", "CAUTION", "STOP"]);

/** A discriminator answer. A missing answer is treated as "unknown" upstream,
 *  and "unknown" ALWAYS fails closed to STOP (when in doubt, escalate). */
export const Answer = z.enum(["present", "absent", "unknown"]);

/** A raised safety concern, as asserted by an upstream trunk / firewall. */
export const RaisedFlag = z
  .object({
    source: z.enum(["trunk_1.0", "trunk_6.0", "trunk_9.0", "pharmacology_firewall", "other"]),
    area_id: z.string().min(1), // scope-registry areas[].id
    condition: z.string().min(1), // scope-registry exclusions[].condition
  })
  .strict();

export const GradeConcernInput = z
  .object({
    flags: z.array(RaisedFlag).min(1),
    // Pinned registry version — a drifted registry is NOT a valid grading basis.
    scope_registry_version: z.literal("1.3.0").default("1.3.0"),
    // Read-only view of the pipeline's evidence bundle (for evidence_considered).
    evidence: z
      .object({
        citations: z.array(z.string()).default([]),
        terminology_receipts: z.array(z.string()).default([]),
      })
      .partial()
      .strict()
      .default({}),
    // discriminatorId → answer. Missing = unknown = fail-closed.
    patient_answers: z.record(z.string(), Answer).default({}),
    // Step-2 (ABCDE) inputs — only consulted when Step 1 yields CAUTION.
    abcde_input: z
      .object({
        patient_decision: z.enum(["proceed", "decline", "undecided"]).default("undecided"),
        practicality_benefit: z.string().optional(),
        // A red flag reported mid-ABCDE upgrades the run to STOP (state machine).
        red_flag_reported: z.boolean().default(false),
      })
      .strict()
      .default({}),
  })
  .strict();

export const DiscriminatorAsked = z
  .object({
    id: z.string().min(1),
    source: z.enum([
      "universal_high_acuity_override",
      "condition_specific.escalate_to_immediate_if",
      "condition_specific.refer_if",
      "always_immediate",
      "safeguarding_always_report",
    ]),
    text: z.string().min(1),
    answer: Answer,
    // Optional SNOMED binding — ONLY ever populated from a terminology lookup
    // receipt (never minted in-module). Absent in Step 1.
    snomed: z.string().optional(),
  })
  .strict();

/** How the interrogation classified the flagged entity. always_immediate /
 *  safeguarding conditions typify their class by definition; unknowns are
 *  indeterminate (and fail closed); everything else is differential_only. */
export const EntityClass = z.enum(["typifies_stigmata", "differential_only", "indeterminate"]);

/** tier_model vocabulary: the three attested scope-registry models, plus
 *  "unresolved" for the fail-closed default branch (module error, off-registry
 *  condition, malformed input) where no attested model could be read. */
export const TierModel = z.enum([
  "always_immediate",
  "acuity_dependent",
  "safeguarding_always_report",
  "unresolved",
]);

/** Per-flag interrogation verdict. */
export const ConcernVerdict = z
  .object({
    area_id: z.string().min(1),
    condition: z.string().min(1),
    tier: Tier,
    tier_model: TierModel,
    entity_class: EntityClass,
    discriminators_asked: z.array(DiscriminatorAsked),
    reason: z.string().min(5),
    fail_closed: z.boolean(),
    // safeguarding_always_report verdicts carry a mandatory-report action.
    mandatory_report: z.boolean().default(false),
  })
  .strict();

/** Aggregate Step-1 verdict for the run: ordinal MAX across all graded flags.
 *  `abcde` is present only when the aggregate tier is CAUTION (Step 2 ran). */
export const Step1Verdict = z
  .object({
    tier: Tier,
    tier_model: TierModel, // of the highest-tier flag
    entity_class: EntityClass, // of the highest-tier flag
    concerns: z.array(ConcernVerdict).min(1),
    discriminators_asked: z.array(DiscriminatorAsked), // concatenated, per-flag order
    evidence_considered: z.array(z.string()),
    scope_registry_version: z.string().min(1),
    reason: z.string().min(5),
    fail_closed: z.boolean(),
    // Human-readable blocking reasons — non-empty ONLY for STOP. Each carries the
    // literal token "escalate_now" so the untouched sequencer's detectEscalation
    // halts on any surface that renders them (defense in depth, Seam B).
    reasons_if_blocking: z.array(z.string().min(5)),
  })
  .strict();

/** Validate a Step-1 verdict, throwing a readable error on contract failure. */
export function validateStep1Verdict(verdict) {
  const r = Step1Verdict.safeParse(verdict);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid PPP-TTT Step1Verdict: ${issues}`);
  }
  return r.data;
}
