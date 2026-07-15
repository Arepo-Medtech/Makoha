/**
 * review-bundle — what the clinician reviewer is SHOWN, as a hashed contract
 * (LIVE_PLAN L1; gap `clinician-verification-portal-unbuilt`).
 *
 * The gate binds the clinician's decision to the exact output bytes
 * (candidate_output_hash). This module extends that discipline one level up:
 * the ENTIRE review workspace — output, verification results, receipts,
 * evidence claims, PPP-TTT verdict/ABCDE record, history summary, firewall
 * status — is assembled into one schema-gated bundle whose own sha256
 * (`bundle_sha256`) is recorded with the decision. So the audit trail can
 * later prove not only WHAT was approved but WHAT THE REVIEWER WAS LOOKING AT
 * when they approved it.
 *
 * Zod mirror of mcp/schemas/portal-review-bundle.schema.json. Embedded
 * artifacts (ppp_ttt, abcde_record, history_summary, conflict_audit) are
 * schema-gated at their producers; here they ride as opaque objects so this
 * contract never drifts from theirs.
 */
import { z } from "zod";
import { sha256Prefixed } from "../verification/hash.js";

const HASH = /^sha256:[a-f0-9]{64}$/;

const Support = z.object({ kind: z.string().min(1), ref: z.string().min(1) }).strict();

export const ReviewBundleSchema = z
  .object({
    bundle_version: z.literal("1.0"),
    run_id: z.string().min(8),
    trunk_id: z.string().optional(),
    timestamp_utc: z.string().datetime(),
    mode: z.enum(["mock", "dry_run", "live"]),
    // The exact candidate text under review + its medicolegal anchor.
    candidate_output: z.string().min(1),
    candidate_output_hash: z.string().regex(HASH),
    verification: z
      .object({
        pass: z.boolean(),
        results: z.array(
          z.object({ check: z.string(), passed: z.boolean(), reason: z.string().optional(), severity: z.string().optional() }).passthrough()
        ),
        missing_receipts: z.array(z.string()),
        mock_receipt_flags: z.array(z.string()).optional(),
      })
      .passthrough(),
    receipts: z
      .array(z.object({ request_id: z.string(), upstream: z.string(), mode: z.string(), timestamp_utc: z.string().optional() }).strict())
      .default([]),
    evidence_claims: z.array(z.object({ claim: z.string(), supports: z.array(Support) }).strict()).default([]),
    firewall_status: z.string().optional(),
    continuation_blocked: z.boolean().default(false),
    hard_stops: z.array(z.string()).default([]),
    // Producer-gated artifacts, carried opaque (audit-channel material).
    ppp_ttt: z.record(z.unknown()).optional(),
    abcde_record: z.record(z.unknown()).optional(),
    history_summary: z.record(z.unknown()).optional(),
    conflict_audit: z.record(z.unknown()).optional(),
    // THE EVIDENCE PLANE (E3, R-47b). Everything we hold about the dose, for the CLINICIAN.
    // Mirrors mcp/schemas/portal-review-bundle.schema.json. Advisory + provenance-tagged; the
    // authoritative AU dose stays in PharmCheck (frozen) and is the only patient-promotable one.
    // `patient_facing` is a LITERAL false, not a default — an item cannot opt into being
    // patient-facing, and the gate (releaseToPatient) remains the only route to a patient.
    // This rides INSIDE bundle_sha256, which is what turns "the clinician saw the divergence" from
    // an assumption of the AU-primacy ruling into part of the medicolegal record.
    dose_evidence: z
      .array(
        z.object({
          kind: z.enum(["au_dose_signed", "international_label", "cds_dose_candidate", "literature", "congruence", "plausibility", "held"]),
          authority: z.enum(["authoritative", "advisory"]),
          ingredient: z.string().min(1),
          jurisdiction: z.enum(["AU", "US", "EU"]).optional(),
          agency: z.string().optional(),
          text: z.string().optional(),
          status: z.string().optional(),
          source: z.string().min(1),
          attested_by: z.string().nullable().optional(),
          entered_by: z.string().nullable().optional(),
          amass_id: z.string().optional(),
          context: z.string().optional(),
          population: z.string().optional(),
          citation: z.record(z.unknown()).optional(),
          evidence_note: z.string().optional(),
          note: z.string().optional(),
          patient_facing: z.literal(false),
        }).strict(),
      )
      .optional(),
    // Hash over the canonical bundle-without-this-field: what was reviewed.
    bundle_sha256: z.string().regex(HASH),
  })
  .strict();

/** Deterministic JSON (sorted keys) — same idiom as the audit chains. */
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function dropUndefined(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Build + validate a ReviewBundle from a runPipeline()/runTrunkWithGrounding()
 * result. Throws on a malformed result — a review workspace that cannot be
 * proven is not shown to a clinician (fail-closed).
 * @param {object} result - a runPipeline() result (output, verification, packet, …)
 * @returns {object} schema-valid ReviewBundle with bundle_sha256 computed
 */
export function buildReviewBundle(result) {
  const withoutHash = dropUndefined({
    bundle_version: "1.0",
    run_id: result.run_id,
    trunk_id: result.trunk_id || result.packet?.trunk_id || undefined,
    timestamp_utc: result.timestamp_utc || new Date().toISOString(),
    mode: result.packet?.mode || "mock",
    candidate_output: result.output,
    candidate_output_hash: result.verification?.candidate_output_hash,
    verification: {
      pass: result.verification?.pass,
      results: result.verification?.results || [],
      missing_receipts: result.verification?.missing_receipts || [],
      ...(result.verification?.mock_receipt_flags ? { mock_receipt_flags: result.verification.mock_receipt_flags } : {}),
    },
    receipts: (result.packet?.receipts || []).map((r) => ({
      request_id: r.request_id,
      upstream: r.upstream,
      mode: r.mode,
      ...(r.timestamp_utc ? { timestamp_utc: r.timestamp_utc } : {}),
    })),
    evidence_claims: (result.packet?.evidence || []).map((e) => ({
      claim: e.claim,
      supports: (e.supports || []).map((s) => ({ kind: s.kind, ref: s.ref })),
    })),
    ...(result.firewall_status ? { firewall_status: result.firewall_status } : {}),
    continuation_blocked: !!result.continuation_blocked,
    hard_stops: result.hard_stops || [],
    ...(result.ppp_ttt ? { ppp_ttt: result.ppp_ttt } : {}),
    ...(result.abcde_record ? { abcde_record: result.abcde_record } : {}),
    ...(result.history_summary ? { history_summary: result.history_summary } : {}),
    ...(result.conflict_audit ? { conflict_audit: result.conflict_audit } : {}),
    ...(result.dose_evidence?.length ? { dose_evidence: result.dose_evidence } : {}),
  });
  const bundle = { ...withoutHash, bundle_sha256: sha256Prefixed(canonical(withoutHash)) };
  return validateReviewBundle(bundle);
}

/** Recompute + compare the bundle hash (tamper check for stored bundles). */
export function verifyReviewBundle(bundle) {
  const { bundle_sha256, ...withoutHash } = bundle;
  return sha256Prefixed(canonical(withoutHash)) === bundle_sha256;
}

/** Validate against the contract, throwing a readable error on failure. */
export function validateReviewBundle(bundle) {
  const r = ReviewBundleSchema.safeParse(bundle);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid ReviewBundle — refusing to present for review. ${issues}`);
  }
  return r.data;
}
