/**
 * verification-gate — the Clinician Verification Portal's server-side release
 * gate (ARCH_PLAN C9 / FMEA F13; gap `clinician-verification-portal-unbuilt`;
 * the top patient-facing release blocker).
 *
 * SCOPE (M5): the CONTRACT and the GATE only. This is not the portal UI and
 * not the clinician review workflow — it is the mechanical checkpoint every
 * patient-facing path MUST pass. Nothing in this repo calls releaseToPatient()
 * yet, and that is correct: no patient path exists, and none may be built
 * without routing its output through this gate.
 *
 * THE RULE (prime directive, mechanical form): no generated output reaches a
 * patient without a clinician's attested VerificationGateRecord bound to the
 * EXACT bytes being released.
 *   - "approved"  → only the text hashing to candidate_output_hash releases.
 *   - "amended"   → only the text hashing to amended_output_hash releases
 *                   (the amendment is a new medicolegal artifact; the original
 *                   candidate_output_hash stays the record of what was
 *                   generated).
 *   - "rejected"  → nothing releases.
 * The binding is recomputed from the supplied text at release time — the gate
 * trusts hashes it computes, never hashes it is handed.
 *
 * MODE GUARD: release is additionally refused outside a live-enforced context
 * (mode-normaliser, M1): mock/dry_run are development modes with no patients,
 * so releaseToPatient() in them always refuses. staging releases only to
 * SYNTHETIC patients by policy (<release_and_environments>).
 *
 * FAIL-CLOSED: releaseToPatient() returns { released: false, reasons } naming
 * EVERY unmet condition; it never throws on refusal (a patient path must be
 * able to fall back to clinician escalation), and never releases on ambiguity.
 *
 * DECISION HISTORY: records append per hash; the LATEST decision is effective
 * (a clinician may re-review). Records are never mutated or deleted. Durable
 * (WORM) storage for gate records rides with the M8 audit substrate — the
 * in-memory registry here is the mock-scope seam, and the validated record
 * shape (verification-portal-decision.schema.json) is what will persist.
 *
 * messaging-geo stays UNWIRED (M13, deferred): the gate existing does not
 * open any send path.
 */
import { z } from "zod";
import { hashCandidateOutput } from "../verification/hash.js";
import { normaliseMode } from "../verification/mode.js";

const HASH_RE = /^sha256:[a-f0-9]{64}$/;

/** zod mirror of mcp/schemas/verification-portal-decision.schema.json (§3.5.5). */
export const GateRecordSchema = z
  .object({
    run_id: z.string().min(8),
    candidate_output_hash: z.string().regex(HASH_RE),
    clinician_id: z.string().min(1),
    decision: z.enum(["approved", "rejected", "amended"]),
    decided_at_utc: z.string().datetime(),
    signature_ref: z.string().min(1),
    amended_output_hash: z.string().regex(HASH_RE).optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.decision === "amended" && !r.amended_output_hash) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amended_output_hash"], message: "decision='amended' requires amended_output_hash — the amended text is a new medicolegal artifact with its own hash" });
    }
  });

/** Gate registry: candidate_output_hash → append-only list of records. */
const registry = new Map();

/**
 * Record a clinician's attested decision. Validates against the contract and
 * appends (never overwrites) — the latest record per hash is effective.
 * @returns the frozen, validated record.
 * @throws on a contract violation.
 */
export function recordGateDecision(record) {
  const parsed = GateRecordSchema.parse(record);
  const frozen = Object.freeze({ ...parsed });
  const list = registry.get(frozen.candidate_output_hash) || [];
  list.push(frozen);
  registry.set(frozen.candidate_output_hash, list);
  return frozen;
}

/** Audit read: every recorded decision for a candidate hash, oldest first. */
export function getGateRecords(candidateOutputHash) {
  return [...(registry.get(candidateOutputHash) || [])];
}

/**
 * THE GATE. Decide whether `output` may be released to a patient path.
 * Fail-closed: every unmet condition is named; ambiguity refuses.
 *
 * @param {{ candidate_output_hash: string, output: string }} request
 *   candidate_output_hash — the generated output's medicolegal anchor;
 *   output — the EXACT text the caller intends to release (re-hashed here).
 * @returns {{ released: boolean, reasons: string[], gate_record?: object, released_hash?: string }}
 */
export function releaseToPatient(request = {}) {
  const reasons = [];
  const { candidate_output_hash, output } = request;

  // Mode guard first — development contexts have no patients.
  const mode = normaliseMode(process.env.HEYDOC_MODE_DEFAULT);
  if (!mode.enforce_live) {
    reasons.push(`patient release refused in a non-live context (mode="${mode.context_mode}") — mock/dry_run are development modes`);
  }

  if (typeof candidate_output_hash !== "string" || !HASH_RE.test(candidate_output_hash)) {
    reasons.push("candidate_output_hash missing or not a sha256:<64hex> anchor");
  }
  if (typeof output !== "string" || output.length === 0) {
    reasons.push("output text missing — the gate binds to the exact bytes being released");
  }
  if (reasons.length) return { released: false, reasons };

  const records = registry.get(candidate_output_hash) || [];
  if (records.length === 0) {
    return { released: false, reasons: ["no VerificationGateRecord exists for this candidate_output_hash — clinician review is mandatory before any patient release"] };
  }
  const effective = records[records.length - 1]; // latest decision wins (re-review supported)

  if (effective.decision === "rejected") {
    return { released: false, reasons: [`clinician decision is 'rejected' (${effective.clinician_id}, ${effective.decided_at_utc}) — nothing releases`], gate_record: effective };
  }

  // Hash binding — recomputed from the supplied text, never trusted from input.
  const actualHash = hashCandidateOutput(output);
  const releasedHash = effective.decision === "amended" ? effective.amended_output_hash : effective.candidate_output_hash;
  if (actualHash !== releasedHash) {
    return {
      released: false,
      reasons: [
        effective.decision === "amended"
          ? `output does not hash to the clinician's amended_output_hash — only the attested amended text may release (got ${actualHash})`
          : `output does not hash to the approved candidate_output_hash — only the exact attested text may release (got ${actualHash})`,
      ],
      gate_record: effective,
    };
  }

  return { released: true, reasons: [], gate_record: effective, released_hash: releasedHash };
}
