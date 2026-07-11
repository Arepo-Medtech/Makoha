/**
 * ppp-ttt ledger-entry contract — zod mirror of mcp/schemas/ppp-ttt-ledger-entry.schema.json.
 *
 * The PPP-TTT trail is a PARALLEL append-only hash chain (audit-store.js is
 * frozen and its entry shape cannot carry a triage record). Entries are
 * PHI-FREE BY CONSTRUCTION: discriminator IDs, tier codes, caveat codes,
 * safety-net descriptor IDs, and a patient-decision enum — never free-text
 * patient narrative. The .strict() gate makes an extra (potentially PHI-
 * bearing) field unrepresentable, and validatePppTttLedgerEntry() is called
 * BEFORE anything touches the durable log.
 *
 * Cross-link to the main medicolegal ledger: { run_id, candidate_output_hash,
 * trunk_id } — the join key is the hash the frozen verifier already anchors.
 */
import { z } from "zod";

const SHA256 = /^sha256:[a-f0-9]{64}$/;

/** Keys that may appear on a PPP-TTT ledger entry — used by the PHI-leakage
 *  contract test as well as the runtime gate. */
export const PPP_TTT_LEDGER_KEYS = [
  "seq",
  "entry_id",
  "recorded_at_utc",
  "prev_hash",
  "run_id",
  "trunk_id",
  "candidate_output_hash",
  "tier",
  "fail_closed",
  "discriminator_ids",
  "caveat_codes",
  "safety_net_ids",
  "patient_decision",
  "mode",
  "entry_hash",
];

export const PppTttLedgerEntrySchema = z
  .object({
    seq: z.number().int().nonnegative(),
    entry_id: z.string().min(8),
    recorded_at_utc: z.string().datetime(),
    prev_hash: z.string().regex(SHA256),
    run_id: z.string().min(8),
    trunk_id: z.string().optional(),
    candidate_output_hash: z.string().regex(SHA256), // cross-link to main ledger
    tier: z.enum(["GO", "CAUTION", "STOP"]),
    fail_closed: z.boolean(),
    // IDs and codes ONLY — no narrative (PHI-free by construction).
    discriminator_ids: z.array(z.string().min(1)),
    caveat_codes: z.array(z.string().min(1)),
    safety_net_ids: z.array(z.string().min(1)),
    patient_decision: z.enum(["proceed", "decline", "undecided", "n/a"]),
    // Recorded via mode.js normaliseMode — mock is never presented as live.
    mode: z.enum(["mock", "dry_run", "live"]),
    entry_hash: z.string().regex(SHA256),
  })
  .strict();

/** Validate a ledger entry, throwing a readable error on contract failure. */
export function validatePppTttLedgerEntry(entry) {
  const r = PppTttLedgerEntrySchema.safeParse(entry);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Invalid PPP-TTT ledger entry — refusing to append. ${issues}`);
  }
  return r.data;
}
