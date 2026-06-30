/**
 * Zod contract for an AuditLedgerEntry (the append-only medicolegal ledger record).
 *
 * Mirrors mcp/schemas/audit-ledger-entry.schema.json. validateLedgerEntry() is
 * called by the audit store before every append: a malformed or PHI-bearing
 * record must never enter the ledger.
 *
 * CRITICAL DATA RULE (enforced by .strict() + the field set): this record holds
 * NO patient-identifiable information — only audit anchors, run metadata, the
 * pass gate, per-check booleans, and receipt metadata. The exact output text
 * lives only in the separately-governed, synthetic-only content store. Keep this
 * in lockstep with the JSON schema; the JSON schema is the source of truth.
 */
import { z } from "zod";
import { SHA256_HASH } from "./report-schema.js";

const MODE = ["live", "dry_run", "mock"];

const CheckResultSchema = z
  .object({
    check: z.enum([
      "no_invented_codes",
      "no_invented_guidelines",
      "no_invented_operations",
      "no_repo_invention",
      "hard_stop_enforcement",
    ]),
    passed: z.boolean(),
  })
  .strict();

/** Receipt METADATA only — never a payload (no PHI / retrieved content). */
const ReceiptMetaSchema = z
  .object({
    request_id: z.string().min(1),
    upstream: z.string().min(1),
    mode: z.enum(MODE),
    timestamp_utc: z.string().datetime().optional(),
  })
  .strict();

export const LedgerEntrySchema = z
  .object({
    seq: z.number().int().min(0),
    entry_id: z.string().min(8),
    recorded_at_utc: z.string().datetime(),
    prev_hash: z.string().regex(SHA256_HASH, "prev_hash must be 'sha256:' + 64 hex"),
    entry_hash: z.string().regex(SHA256_HASH, "entry_hash must be 'sha256:' + 64 hex"),
    run_id: z.string().min(8),
    trunk_id: z.enum(["1.0", "2.0", "3.0", "4.0", "5.0", "6.0", "7.0", "8.0", "9.0"]).optional(),
    session_ref: z.string().min(6).optional(),
    candidate_output_hash: z.string().regex(SHA256_HASH, "candidate_output_hash must be 'sha256:' + 64 hex"),
    pass: z.boolean(),
    check_results: z.array(CheckResultSchema),
    receipts: z.array(ReceiptMetaSchema),
    mode: z.enum(MODE),
    content_persisted: z.boolean(),
  })
  .strict()
  // Patient-data-minimisation guard at the contract level: content may only be
  // persisted for synthetic (non-live) data. A live entry claiming persisted
  // content is a defect, not a valid record.
  .refine((e) => !(e.mode === "live" && e.content_persisted === true), {
    message: "content_persisted must be false for mode='live' (no real-patient output persistence)",
    path: ["content_persisted"],
  });

/**
 * Validate a ledger entry, throwing on failure. Called before every append.
 * @param {unknown} entry
 * @returns {object} the parsed entry
 * @throws {Error} if the entry is not a valid, PHI-free ledger record
 */
export function validateLedgerEntry(entry) {
  const result = LedgerEntrySchema.safeParse(entry);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid AuditLedgerEntry — refusing to append. ${issues}`);
  }
  return result.data;
}
