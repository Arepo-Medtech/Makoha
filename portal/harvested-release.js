/**
 * harvested-release — the single governance seam every HARVESTED path
 * (FLOW_PLAN H1–H5) routes patient-directed output through (FLOW_PLAN H7 /
 * FMEA G7 "governance-gate bypass"; ARCH_PLAN C9).
 *
 * WHY this exists: the harvest (record-spine, evidence taps, MIRAGE-gated
 * retrieval, case factory, ToolUniverse gateway) added capability that COULD,
 * in a future patient-facing build, be directed at a patient. §1's governance
 * floor is absolute: "Every adopted element that could touch a patient path
 * routes through the governance layer before it does. Nothing reaches a patient
 * without the human-in-the-loop checkpoint." This module is that route — one
 * fail-closed seam, so a bypass cannot hide in per-path plumbing.
 *
 * WHAT it does NOT do: it opens NO patient path and flips NOTHING to
 * patient_eligible. It is pure refusal machinery. Today NOTHING in the repo
 * calls a harvested path toward a patient (correct — no patient path exists),
 * so these wrappers are unreached in production; their job is to guarantee that
 * IF such a path is ever built, it is mechanically forced through the gate.
 *
 * HOW it stays honest: it owns no release logic of its own. It computes the
 * medicolegal hash from the EXACT output bytes (hashCandidateOutput — the RETAIN
 * hasher) and defers the entire decision to releaseToPatient() (the RETAIN
 * portal gate, ARCH_PLAN C9). The gate is fail-closed: it refuses without a
 * clinician-attested VerificationGateRecord on that exact hash, refuses outside
 * a live-enforced context, and re-derives the hash it trusts. This module adds
 * only a default-deny allow-list of known harvested paths on top — an unknown
 * pathId is refused, never released.
 *
 * FULL eligibility precondition (stated so no caller mistakes this for "done"):
 * a retrieval path is patient-eligible ONLY when ALL of —
 *   (1) MIRAGE-passed (H3)         (2) governance-gated (H7 — THIS seam)
 *   (3) corpus attested (spec §7)  (4) a real Portal UI gate record exists (M5 remainder)
 * H7 delivers exactly (2). The other three remain open; the gate stays
 * fail-closed until all four hold.
 *
 * RETAIN boundary: this module imports releaseToPatient / hashCandidateOutput
 * and modifies NEITHER. verification-gate.js and audit-store.js are byte-frozen.
 */
import { hashCandidateOutput } from "../verification/hash.js";
import { releaseToPatient } from "./verification-gate.js";

/**
 * The closed set of harvested paths (FLOW_PLAN 6.2 Adoption Sequence). A patient-
 * directed release may be requested ONLY for one of these ids; any other id is
 * default-denied. Each carries its milestone + a one-line description for logs.
 */
export const HARVESTED_PATHS = Object.freeze({
  "record-spine": Object.freeze({ milestone: "H1", description: "SMART-on-FHIR record ingestion (integration/record-sources)" }),
  "evidence": Object.freeze({ milestone: "H2", description: "evidence taps #14/#15/#1 (mcp/servers/_shared/evidence-map)" }),
  "retrieval-mirage": Object.freeze({ milestone: "H3", description: "MIRAGE-gated retrieval eligibility (benchmark/mirage)" }),
  "case-factory": Object.freeze({ milestone: "H4", description: "synthetic case generation (case-factory)" }),
  "tooluniverse": Object.freeze({ milestone: "H5", description: "ToolUniverse gateway tool output (mcp/servers/tooluniverse-gateway)" }),
});

/** True iff `pathId` names a known harvested path. */
export function isHarvestedPath(pathId) {
  return typeof pathId === "string" && Object.prototype.hasOwnProperty.call(HARVESTED_PATHS, pathId);
}

/**
 * THE HARVESTED-PATH RELEASE SEAM. Decide whether a harvested path may direct
 * `output` at a patient. Fail-closed: an unknown path, a missing/empty output,
 * or any gate refusal returns { released:false, reasons }. Never throws on
 * refusal; never returns patient_eligible.
 *
 * The candidate_output_hash is computed HERE from the exact bytes — the seam
 * never accepts a caller-supplied hash (a hash the gate did not derive is not
 * trusted), matching the gate's own "trusts hashes it computes" rule.
 *
 * @param {string} pathId - one of HARVESTED_PATHS
 * @param {string} output - the exact text the path intends to release
 * @returns {{ released: boolean, reasons: string[], path?: string, milestone?: string,
 *             candidate_output_hash?: string, gate_record?: object, released_hash?: string }}
 */
export function releaseHarvestedOutput(pathId, output) {
  // Default-deny on an unknown harvested path — never release something we
  // cannot attribute to a governed, benchmarked path.
  if (!isHarvestedPath(pathId)) {
    return { released: false, reasons: [`unknown harvested path "${String(pathId)}" — default-deny; only ${Object.keys(HARVESTED_PATHS).join(", ")} may request a patient release`] };
  }
  // Fail-closed on a missing/empty output before we hash — the gate binds to
  // exact bytes, so there must be bytes.
  if (typeof output !== "string" || output.length === 0) {
    return { released: false, reasons: [`${pathId}: output text missing — a harvested path cannot release without exact bytes to bind`], path: pathId, milestone: HARVESTED_PATHS[pathId].milestone };
  }

  const candidate_output_hash = hashCandidateOutput(output);
  // Defer the entire decision to the RETAIN portal gate (fail-closed, hash-bound,
  // dev-modes-never-release). We add attribution fields; we never override its verdict.
  const verdict = releaseToPatient({ candidate_output_hash, output });
  return { ...verdict, path: pathId, milestone: HARVESTED_PATHS[pathId].milestone, candidate_output_hash };
}
