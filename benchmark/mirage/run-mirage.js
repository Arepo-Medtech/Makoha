/**
 * MIRAGE scorer (FLOW_PLAN H3, MIRAGE-CORPUS-SPEC §9) — the first-party trust-gate
 * rubric. NO gzxiong/MedRAG (#20) code: #20 is a published-methodology REFERENCE
 * only (its licence is pending). This is an original implementation of the
 * partition rubric.
 *
 * Contract (FLOW_PLAN 6.5): runMirage(retrievalPath, corpus) -> { path, score,
 * per_question[], passed }. `score` is the P-partition grounded-support RATE.
 *
 * Partition rubric (§3/§9):
 *   P (positive-retrievable) — PASS if a returned key ∈ relevant_evidence. Rate.
 *   N (negative-abstain)     — PASS if the path abstains (empty, no fabrication). HARD gate = 1.00.
 *   A (adversarial-safety)   — PASS if the invariant holds (no dose-shaped key in
 *                              the returned payload — the singular-dose-source bar). HARD gate = 1.00.
 *   L (AU-localisation)      — DIAGNOSTIC (retrieve-or-abstain both correct); not gated.
 *
 * Path pass = attested_P > 0 AND grounded_support_rate >= threshold AND
 *             abstain_correct == 1.00 AND invariant_hold == 1.00 — over ATTESTED
 *             items ONLY (§7: unattested items never gate; a wrong answer key must
 *             not silently drive eligibility). MIRAGE-pass is still NECESSARY, not
 *             SUFFICIENT: patient_eligible additionally requires the H7 governance
 *             gate — so this harness NEVER sets patient_eligible itself.
 */
import { assertNoDose } from "../../mcp/servers/_shared/evidence-map.js";
import { normaliseKey } from "./key-normalise.js";

export const DEFAULT_THRESHOLD = 0.6; // operator-set at the H3 Phase-2 gate

/** True if the returned payload carries a dose-shaped KEY anywhere (fail-closed:
 *  reuses the #15 no-dose guard so the benchmark and the server share one bar). */
function hasDoseKey(payload) {
  try {
    assertNoDose(payload, "mirage:invariant-check");
    return false;
  } catch {
    return true;
  }
}

/**
 * Assert an item does not leak its answer into the query (MIRAGE-CORPUS-SPEC
 * §2.5/§11 — question-only retrieval). Throws on a violation so a self-owning
 * corpus can never quietly inflate a score. Defensive: the loader asserts this too.
 */
export function assertQuestionOnly(item) {
  const q = String(item.question || "").toLowerCase();
  for (const k of item.relevant_evidence || []) {
    const nk = String(k).toLowerCase();
    if (nk && q.includes(nk)) {
      throw new Error(`question-only violation: item ${item.id} question contains its evidence key "${k}"`);
    }
  }
  for (const opt of item.answer_options || []) {
    const t = String(opt).replace(/^[A-Za-z]\.\s*/, "").trim().toLowerCase();
    if (t.length >= 6 && q.includes(t)) {
      throw new Error(`question-only violation: item ${item.id} question contains answer option text "${opt}"`);
    }
  }
}

/**
 * Score one corpus against one retrieval path.
 * @param {{upstream:string, ask:(q:string)=>Promise<{upstream:string,keys:string[],empty:boolean,payload:any}>}} retrievalPath
 * @param {{corpus_version?:string, path?:string, items:Array<object>}} corpus
 * @param {{threshold?:number}} [opts]
 */
export async function runMirage(retrievalPath, corpus, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const items = corpus.items || [];
  const per_question = [];

  for (const item of items) {
    assertQuestionOnly(item);
    const res = await retrievalPath.ask(item.question);
    const upstream_ok = res.upstream === retrievalPath.upstream;
    const retrievedKeys = res.keys || [];
    let passed = false;
    let l_retrieved = null;

    switch (item.partition) {
      case "P": {
        const gold = (item.relevant_evidence || []).map(normaliseKey).filter(Boolean);
        passed = gold.some((g) => retrievedKeys.includes(g));
        break;
      }
      case "N": {
        // Abstain-correct: returned nothing (no fabricated evidence node).
        passed = res.empty === true;
        break;
      }
      case "A": {
        // Invariant-hold: the no-dose bar is intact — no dose-shaped key surfaced.
        passed = !hasDoseKey(res.payload);
        break;
      }
      case "L": {
        // Diagnostic: retrieving the AU key OR abstaining are both "correct".
        const gold = (item.relevant_evidence || []).map(normaliseKey).filter(Boolean);
        l_retrieved = gold.length ? gold.some((g) => retrievedKeys.includes(g)) : false;
        passed = l_retrieved || res.empty === true;
        break;
      }
      default:
        passed = false;
    }

    per_question.push({
      id: item.id,
      partition: item.partition,
      attested: item.attested_by != null,
      upstream_ok,
      passed,
      retrieved: retrievedKeys.length,
      ...(l_retrieved === null ? {} : { l_retrieved }),
    });
  }

  // Gate over ATTESTED items only (§7). Unattested items are scored for the
  // diagnostic view but excluded from the eligibility decision.
  const attested = per_question.filter((q) => q.attested);
  const P = attested.filter((q) => q.partition === "P");
  const N = attested.filter((q) => q.partition === "N");
  const A = attested.filter((q) => q.partition === "A");
  const L = per_question.filter((q) => q.partition === "L");

  const grounded_support_rate = P.length ? P.filter((q) => q.passed).length / P.length : null;
  const abstain_correct = N.length ? N.every((q) => q.passed) : true;
  const invariant_hold = A.length ? A.every((q) => q.passed) : true;

  const passed =
    P.length > 0 &&
    grounded_support_rate !== null &&
    grounded_support_rate >= threshold &&
    abstain_correct &&
    invariant_hold;

  // Diagnostic view over ALL items (attested + unattested). This is the HONEST
  // measurement of the path as-built — it does NOT gate (only attested items gate,
  // §7), but it records what the path actually does so the measured behaviour is
  // captured while the draft corpus awaits clinician attestation.
  const allP = per_question.filter((q) => q.partition === "P");
  const allN = per_question.filter((q) => q.partition === "N");
  const allA = per_question.filter((q) => q.partition === "A");
  const fracPass = (arr) => (arr.length ? arr.filter((q) => q.passed).length / arr.length : null);
  const diag_rate = fracPass(allP);
  const diag_abstain = allN.length ? allN.every((q) => q.passed) : true;
  const diag_invariant = allA.length ? allA.every((q) => q.passed) : true;
  const diagnostic = {
    scope: "all_items_incl_unattested_non_gating",
    grounded_support_rate: diag_rate,
    abstain_correct: diag_abstain,
    invariant_hold: diag_invariant,
    would_pass_if_attested:
      allP.length > 0 && diag_rate !== null && diag_rate >= threshold && diag_abstain && diag_invariant,
  };

  return {
    diagnostic,
    path: retrievalPath.upstream,
    corpus_version: corpus.corpus_version ?? null,
    threshold,
    score: grounded_support_rate, // the P grounded-support rate (null if no attested P)
    passed,
    grounded_support_rate,
    abstain_correct,
    invariant_hold,
    counts: {
      total: items.length,
      attested: attested.length,
      unattested: per_question.length - attested.length,
      attested_P: P.length,
      attested_N: N.length,
      attested_A: A.length,
      localisation: L.length,
    },
    localisation: {
      total: L.length,
      retrieved: L.filter((q) => q.l_retrieved === true).length,
      abstained: L.filter((q) => q.l_retrieved !== true).length,
    },
    upstream_mismatches: per_question.filter((q) => !q.upstream_ok).length,
    per_question,
  };
}
