/**
 * ppp-ttt ABCDE contracts — zod mirror of mcp/schemas/ppp-ttt-abcde-record.schema.json.
 *
 * Step 2 of PPP-TTT runs ONLY for a CAUTION verdict: a light, fixed A→B→C→D→E
 * protocol that characterises the concern, caveats the output, safety-nets the
 * patient, and records a bounded patient decision — all SUBORDINATE to human
 * sign-off. Nothing in this record can authorise a diagnosis, a dose, or a
 * release; it is audit-channel material (rides the pipeline result, never the
 * ContextPacket).
 *
 * WHY several fields are z.literal(true): "no diagnosis", "no decisions",
 * "bounded choice", and "subordinate to sign-off" are INVARIANTS, not options.
 * Making them literals means a record that tries to negate one is not merely
 * wrong — it is unrepresentable and throws at the contract gate.
 */
import { z } from "zod";
import { Step1Verdict } from "./verdict-schema.js";

/** A — Assessment for Plausible Continued Passage. */
export const APP = z
  .object({
    graded_verdict: z.enum(["plausibly_safe", "not_safe"]), // not_safe forces STOP
    residual_discriminators_open: z.array(z.string()),
  })
  .strict();

/** B — Balancing Practicalities with Precautions. */
export const BPP = z
  .object({
    pathway: z.enum(["continue_with_safety_net", "refer", "escalate"]), // escalate forces STOP
    // RiskAssessment.prediction_qualitative vocabulary (digital tablet omnibus).
    residual_risk: z.enum(["negligible", "low", "moderate", "high"]),
    practicality_benefit: z.string().min(1),
  })
  .strict();

/** C — Caveats on Provisionality in Plain Language. Exactly one provisionality
 *  statement + the two fixed declarations — no caveat inflation. */
export const CPP = z
  .object({
    provisionality: z.string().min(1),
    no_diagnosis: z.literal(true), // MUST be true — suggestion-only
    no_decisions: z.literal(true),
    plain_language: z.string().min(1),
  })
  .strict();

export const SafetyNetDescriptor = z
  .object({
    id: z.string().min(1),
    descriptor: z.string().min(1),
    watch_for: z.array(z.string().min(1)).min(1),
    when_urgent: z.string().min(1),
    // Optional SNOMED binding — only from a terminology receipt, never minted.
    snomed: z.string().optional(),
    // Safety-tier VOCABULARY NAME only (e.g. "T4-T5") — never content read from
    // the sealed safety-netting scoring node (node 13; scoring-store firewall).
    tier_ref: z.string().optional(),
  })
  .strict();

/** D — Descriptor-based Pitfall Pathways if proceeding. */
export const DPP = z
  .object({
    safety_net: z.array(SafetyNetDescriptor).min(1),
    coded_pitfalls: z.array(
      z.object({ label: z.string().min(1), snomed: z.string().optional() }).strict()
    ),
  })
  .strict();

/** E — Education / Explanations for a Patient Potestative Position. The choice
 *  is bounded to continued passage in CAUTION only, and is ALWAYS subordinate
 *  to professional sign-off. Declining never changes the clinical tier. */
export const EPP = z
  .object({
    explanation_plain: z.string().min(1),
    bounded_choice_offered: z.literal(true),
    patient_decision: z.enum(["proceed", "decline", "undecided"]),
    decision_recorded_at_utc: z.string().datetime(),
    subordinate_to_signoff: z.literal(true), // ALWAYS true; never overrides a gate
    potestative_scope: z.literal("continued_passage_only"), // never authorises dx/rx
  })
  .strict();

export const ABCDE = z
  .object({
    A_plausible_passage: APP,
    B_balance: BPP,
    C_caveats: CPP,
    D_pitfalls: DPP,
    E_education: EPP,
  })
  .strict();

/** The digital-tablet self-describing header idiom (`_digitalTablet` /
 *  `_pppTtt`): the record names its own schema, version, and meta.tag. */
export const PppTttHeader = z
  .object({
    schema: z.literal("ppp-ttt-abcde-record"),
    version: z.literal("1.0"),
    meta: z
      .object({
        tag: z
          .array(
            z
              .object({
                system: z.literal("urn:au:digital-tablet"),
                code: z.literal("ppp-ttt-v1"),
                display: z.string().min(1),
              })
              .strict()
          )
          .min(1),
      })
      .strict(),
  })
  .strict();

/** The full self-describing ABCDE record (audit channel / parallel ledger). */
export const AbcdeRecord = z
  .object({
    _pppTtt: PppTttHeader,
    run_id: z.string().min(8), // join key to the main audit ledger
    trunk_id: z.string().optional(),
    // Anchors the record to the exact verified output bytes.
    candidate_output_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    scope_registry_version: z.string().min(1),
    // Structured-dataset proofs for everything the record derives from (receipt
    // discipline: no receipt, no claim).
    dataset_receipts: z
      .object({
        scope_registry_sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        omnibus_ref: z.string().min(1),
      })
      .strict(),
    // Composition section codes PROVEN against the pinned omnibus (never minted);
    // omitted (withheld) if the omnibus subtree does not resolve.
    _composition_section_LOINC: z
      .object({ Assessment: z.string().min(1), Plan: z.string().min(1) })
      .strict()
      .optional(),
    step1_verdict: Step1Verdict,
    abcde: ABCDE.optional(), // present only when step1_verdict.tier === "CAUTION"
    provenance: z
      .object({
        agent_types: z.array(z.enum(["verifier", "reviewer", "attester"])).min(1),
        created_at_utc: z.string().datetime(),
        created_by: z.literal("verification/ppp-ttt/record.js"),
      })
      .strict(),
  })
  .strict();

/** Validate a full ABCDE record, throwing a readable error on failure. */
export function validateAbcdeRecord(record) {
  const r = AbcdeRecord.safeParse(record);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid PPP-TTT ABCDE record: ${issues}`);
  }
  return r.data;
}
