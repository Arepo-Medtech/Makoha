/**
 * consent-record contract — zod mirror of mcp/schemas/consent-record.schema.json
 * (LIVE_PLAN L12 / R-40 / FL-01; plan .planning/CONSENT-PLAN.md).
 *
 * Consent records are PHI-FREE BY CONSTRUCTION: an encounter-scoped
 * session_ref (never demographics/IHI — Trust Boundary 4), closed enums,
 * proven omnibus bindings, and hashes only. The .strict() gate makes a
 * free-text (potentially PHI-bearing) field unrepresentable, and
 * validateConsentRecord() is called BEFORE anything touches the durable log —
 * the same discipline as the other three medicolegal chains.
 *
 * WHY status is an event, not a mutable row: the store is append-only; the
 * CURRENT consent state is derived from the latest event per
 * (session_ref, consent_type). Nothing is ever updated in place — consent
 * history is medicolegal evidence.
 */
import { z } from "zod";

const SHA256_PREFIXED = /^sha256:[a-f0-9]{64}$/;
const SHA256_BARE = /^[a-f0-9]{64}$/;

/** v1 consent-type scope per the approved plan (operator, 2026-07-13). */
export const CONSENT_TYPE_VALUES = ["session_persistence", "mhr_data_sharing", "telehealth_consent"];

/** Keys that may appear on a consent record — used by the PHI-leakage contract
 *  test as well as the runtime gate. */
export const CONSENT_RECORD_KEYS = [
  "seq",
  "consent_id",
  "recorded_at_utc",
  "prev_hash",
  "session_ref",
  "consent_type",
  "type_source",
  "omnibus_binding",
  "status",
  "reason",
  "scope",
  "provision_actions",
  "policy_rule",
  "method",
  "expires",
  "mode",
  "entry_hash",
];

export const ConsentRecordSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    consent_id: z.string().min(8),
    recorded_at_utc: z.string().datetime(),
    prev_hash: z.string().regex(SHA256_PREFIXED),
    // Encounter-scoped ref ONLY — never demographics or IHI (Trust Boundary 4).
    session_ref: z.string().min(8),
    consent_type: z.enum(["session_persistence", "mhr_data_sharing", "telehealth_consent"]),
    type_source: z.enum(["heydoc-first-party", "omnibus"]),
    // Omnibus-sourced types carry the proven path + pinned dataset receipt
    // fields; first-party types carry null. A consent type is never minted.
    omnibus_binding: z
      .object({
        path: z.string().min(1),
        dataset_version: z.string().min(1),
        sha256: z.string().regex(SHA256_BARE),
      })
      .strict()
      .nullable(),
    status: z.enum(["active", "rejected", "inactive"]),
    reason: z.enum(["patient_granted", "patient_declined", "patient_revoked", "session_end"]),
    scope: z.enum(["patient-privacy", "treatment"]),
    provision_actions: z.array(z.enum(["collect", "access", "use", "disclose", "destroy"])).min(1),
    policy_rule: z.literal("OPTIN"), // capture is always opt-in
    method: z.literal("patient_attested_in_session"),
    expires: z.literal("session_end"), // no standing consent in v1
    // Recorded via mode.js normaliseMode — mock is never presented as live.
    mode: z.enum(["mock", "dry_run", "live"]),
    entry_hash: z.string().regex(SHA256_PREFIXED),
  })
  .strict();

/** Validate a consent record, throwing a readable error on contract failure. */
export function validateConsentRecord(record) {
  const r = ConsentRecordSchema.safeParse(record);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid consent record — refusing to append. ${issues}`);
  }
  return r.data;
}
