/**
 * Shared evidence-server helpers (FLOW_PLAN H2) — the safety-critical seam every
 * harvested evidence tap (#14 evidence-fda-pubmed, #15 evidence-drug-guideline,
 * #1 docs override) crosses. Fable-5-authored: this file defines the no-dose
 * structural boundary (G9) and the EvidenceNode mapping (no schema churn), so it
 * is intentionally NOT part of any MCP server's transport plumbing.
 *
 * TWO invariants live here:
 *
 * 1. NO SCHEMA CHURN. Every evidence result maps onto the EXISTING
 *    mcp/schemas/evidence-node.schema.json. That schema's supports[].kind enum is
 *    { static_doc | live_data_receipt | structured_dataset | kg_node } — it has NO
 *    "literature"/"graded_evidence" kind (those appear only in FLOW_PLAN prose).
 *    An evidence_search result is grounded on the search's Receipt, so it maps to
 *    kind:"live_data_receipt" with ref = receipt.request_id. The literature
 *    locator (PMID / FDA id / trial id / URL) rides in supports[].excerpt (a hint,
 *    not the proof — the ref is the proof). The verifier binds the receipt.
 *
 * 2. DOSE SOURCE IS SINGULAR (§1 / ARCH C2 / G9). Harvested evidence servers are
 *    ADVISORY. #15's drug-interaction / paediatric / guideline output carries
 *    advisory:true and is STRUCTURALLY BARRED from ever populating a dose field.
 *    The pharmacology firewall's deterministic PharmCheck (Trunk 8.0) + verifier
 *    check 5 remain the ONLY dose source. assertNoDose() is the mechanical guard:
 *    any dose-shaped key anywhere in an object THROWS before it can leave the
 *    server — a fail-closed bar, not a filter.
 */

/** Retrieval paths are mock-gated and NOT patient-eligible until the H3 MIRAGE
 *  benchmark scores them at/above threshold (FLOW_PLAN §1 evidence-verified-trust;
 *  H3 is itself blocked on #20's licence). Every evidence server exports this so
 *  the contract tests can assert no path claims patient-eligibility at H2. */
export const PATIENT_ELIGIBLE = false;

// Governance seam import (FLOW_PLAN H7). Placed here (not in transport plumbing)
// because this shared module is the single seam all three evidence taps cross.
import { releaseHarvestedOutput } from "../../../portal/harvested-release.js";

/**
 * GOVERNANCE SEAM (FLOW_PLAN H7 / G7). Any patient-directed release of evidence
 * (#14/#15/#1, H2) MUST route here — it defers to the fail-closed portal gate
 * (ARCH_PLAN C9) and REFUSES without a clinician-attested VerificationGateRecord
 * bound to the exact output hash. This is ADDITIONAL to PATIENT_ELIGIBLE (which
 * stays false pending H3 MIRAGE): governance is a separate, later precondition.
 * Opens no patient path; never sets patient_eligible; unreached today.
 * @param {string} output - the exact evidence text a patient-facing build would release
 */
export function governedRelease(output) {
  return releaseHarvestedOutput("evidence", output);
}

/**
 * Dose-shaped key detector for the #15 structural bar. Deliberately conservative
 * (over-blocks): matches any key that names or abbreviates a dose/strength/
 * frequency, because under-triage (a leaked dose) outranks over-triage (a
 * wrongly-refused advisory field). Not applied to VALUES — advisory text may
 * legitimately mention a drug's existence; it may never carry a dose in a FIELD
 * that downstream code could read as a dose.
 */
const DOSE_KEY_RE = /(?:^|_|\b)(?:dose|doses|dosage|dosing|posology|strength|frequency|freq|mg|mcg|microgram|milligram|units_per|mg_per|mL_per|titration|max_dose|dose_guidance|recommended_dose|amount_per)(?:$|_|\b)/i;

/**
 * Fail-closed structural guard: throw if any dose-shaped KEY appears anywhere in
 * `obj` (recursively, including inside arrays). Used by the advisory (#15) server
 * on every result BEFORE it is serialised — a dose can never structurally exist
 * in advisory output. Returns `obj` unchanged when clean (so it composes inline).
 *
 * @param {unknown} obj
 * @param {string} [where] context label for the thrown error
 * @returns {unknown} obj (when no dose-shaped key is present)
 */
export function assertNoDose(obj, where = "advisory evidence result") {
  const visit = (node, path) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${path}[${i}]`));
      return;
    }
    for (const key of Object.keys(node)) {
      if (DOSE_KEY_RE.test(key)) {
        throw new Error(
          `NO-DOSE BOUNDARY (G9): dose-shaped key "${key}" at ${path}.${key} in ${where}. ` +
            `Harvested evidence is ADVISORY ONLY — the pharmacology firewall (Trunk 8.0 PharmCheck) ` +
            `is the sole dose source. This output is structurally barred from carrying a dose.`
        );
      }
      visit(node[key], `${path}.${key}`);
    }
  };
  visit(obj, "$");
  return obj;
}

/**
 * Clamp a claim string to the EvidenceNode schema's 1..500 char bound, present-
 * tense and declarative by construction at the call site. Never invents content.
 */
function clampClaim(s) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  if (!t) return "Evidence result returned with no summarisable claim text.";
  return t.length > 500 ? t.slice(0, 499) + "…" : t;
}

/**
 * Map a single evidence_search result onto a conformant EvidenceNode
 * (evidence-node.schema.json). The result is grounded on the search Receipt:
 * supports[0] = { kind:"live_data_receipt", ref: receipt.request_id, excerpt }.
 *
 * The node is created `unverified` — the verifier (Step 5) transitions it to
 * verified/rejected after confirming the receipt resolves in the session store.
 * No code/dose fields are populated here: snomed_ref is left absent (codes bind
 * only through a terminology receipt, not an evidence tap), and dose never exists.
 *
 * @param {object} args
 * @param {string} args.creator         e.g. "mcp-evidence-fda-pubmed"
 * @param {string|number} args.seq      stable per-result sequence
 * @param {string} args.claim           atomic, falsifiable, present-tense claim
 * @param {{request_id:string}} args.receipt  the search Receipt (its request_id is the proof ref)
 * @param {string} [args.locator]       literature locator (PMID/FDA id/trial id/URL) → excerpt hint
 * @param {string} [args.created_at_utc]
 * @returns {object} EvidenceNode
 */
export function toEvidenceNode({ creator, seq, claim, receipt, locator, created_at_utc }) {
  if (!receipt || !receipt.request_id) {
    // Fail-safe: an evidence node with no receipt to ground it is not emitted.
    throw new Error(`toEvidenceNode: missing receipt.request_id for ${creator} result ${seq} — cannot ground an ungrounded claim`);
  }
  const excerpt = locator ? String(locator).slice(0, 300) : undefined;
  const support = { kind: "live_data_receipt", ref: receipt.request_id };
  if (excerpt) support.excerpt = excerpt;
  return {
    id: `ev-${creator}-${String(seq)}`,
    claim: clampClaim(claim),
    supports: [support],
    provenance: {
      created_at_utc: created_at_utc || new Date().toISOString(),
      created_by: creator,
      verification: { status: "unverified" },
    },
  };
}
