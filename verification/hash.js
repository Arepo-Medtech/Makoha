/**
 * Medicolegal hashing for trunk output.
 *
 * candidate_output_hash is the immutable audit anchor required by the prime
 * directive: "Every trunk output is hashed (candidate_output_hash, SHA-256) in
 * the VerificationReport. That hash is the medicolegal record of exactly what was
 * generated."
 *
 * WHY exact bytes, no normalisation: the hash must prove *exactly* what the trunk
 * produced. Trimming, re-encoding, or normalising whitespace would mean the hash
 * no longer matches the literal output a clinician (or a court) is reviewing. We
 * hash the unmodified UTF-8 bytes of the output string and nothing else.
 *
 * WHY throw on non-string: a missing/undefined output is a defect, not something
 * to paper over by hashing the string "undefined". Fail loud — a blocked status
 * beats a fabricated audit record.
 */
import { createHash } from "node:crypto";

/**
 * Compute the SHA-256 medicolegal hash of a candidate output string.
 * @param {string} output - the exact trunk candidate output text
 * @returns {string} `sha256:<64 lowercase hex chars>`
 * @throws {TypeError} if output is not a string
 */
export function hashCandidateOutput(output) {
  if (typeof output !== "string") {
    throw new TypeError(
      `hashCandidateOutput requires a string; received ${output === null ? "null" : typeof output}`
    );
  }
  const digest = createHash("sha256").update(output, "utf8").digest("hex");
  return `sha256:${digest}`;
}
