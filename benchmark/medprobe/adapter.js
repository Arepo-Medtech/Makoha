/**
 * MedProbeBench citation-verification adapters (Mechanical Inventory B2.1b).
 *
 * The "system under test" is a citation verifier: given a claim (its neutral proposition id
 * claim_ref + the evidence keys it cites) and the evidence store, decide
 *   "supported" | "unsupported" | "fabricated_citation".
 *
 * Two reference adapters — the MIRAGE realPath-vs-scriptedPath pattern:
 *   - groundedAdapter: consults BOTH existence AND the supports/refutes relation, so it
 *     catches a MISATTRIBUTED citation (a real source cited for a claim it refutes). Passes.
 *   - naiveStructuralAdapter: existence-only (cited key present? then "supported"). It
 *     CANNOT catch misattribution — used in the gate to prove the hallucination-catch HARD
 *     gate bites (an honest demonstration that structural checks are insufficient).
 *
 * Neither adapter ever reads an item's expected_verdict — that would make the benchmark a
 * tautology. They see only {claim_ref, cited_evidence} + the evidence store.
 */

/** verdict enum <-> expected_verdict enum mapping (the scorer compares in expected-space). */
export const VERDICT_TO_EXPECTED = {
  supported: "accept",
  unsupported: "flag_unsupported",
  fabricated_citation: "flag_fabricated",
};

/**
 * Grounded verifier: existence + support/refute relation.
 *   - no citations                       -> unsupported
 *   - any cited key absent from the store -> fabricated_citation (nonexistent reference)
 *   - any cited (present) key REFUTES the claim_ref -> fabricated_citation (misattribution)
 *   - at least one cited key SUPPORTS the claim_ref -> supported
 *   - cited real evidence but none supports the claim_ref -> unsupported (ungrounded)
 */
export function groundedAdapter(evidenceStore) {
  return {
    name: "grounded",
    verify({ claim_ref, cited_evidence }) {
      if (!cited_evidence || cited_evidence.length === 0) return "unsupported";
      let anySupport = false;
      for (const k of cited_evidence) {
        const ev = evidenceStore[k];
        if (!ev) return "fabricated_citation"; // cited key does not exist
        if ((ev.refutes || []).includes(claim_ref)) return "fabricated_citation"; // misattributed
        if ((ev.supports || []).includes(claim_ref)) anySupport = true;
      }
      return anySupport ? "supported" : "unsupported";
    },
  };
}

/**
 * Naive existence-only verifier: a cited key that merely EXISTS is treated as support.
 * Correct on S / U / nonexistent-F, but BLIND to misattribution (a real source cited for a
 * claim it refutes reads as "supported"). Ships to prove the gate's teeth, never as the bar.
 */
export function naiveStructuralAdapter(evidenceStore) {
  return {
    name: "naive-structural",
    verify({ cited_evidence }) {
      if (!cited_evidence || cited_evidence.length === 0) return "unsupported";
      for (const k of cited_evidence) {
        if (!evidenceStore[k]) return "fabricated_citation";
      }
      return "supported"; // BLIND to refutation — this is the point being demonstrated
    },
  };
}
