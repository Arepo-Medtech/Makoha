/**
 * Evidence Broker arbiter of model output (MI-14 / MI-04; execution plan §5).
 *
 * The grounding spine: "no model output reaches a patient except through the
 * Evidence Broker, which strips any receipt-less claim to `unknown`." The reasoner
 * (MedGemma) never self-asserts — every claim it makes is resolved through the
 * Broker here. A claim the Broker cannot back with a resolvable receipt is stripped
 * to `unknown`; it is never asserted as fact.
 *
 * composeArbitration() folds the result into the verification report using the SAME
 * monotone-AND discipline as combineVerification()/composeTriage(): it can only ADD
 * a failure (a receipt-less claim → pass:false), never rescue one, and it leaves the
 * five verifier checks (`results`) untouched so the VerificationReport contract is
 * unchanged. Pure except for the Broker calls (which are injected).
 */

/**
 * Resolve every model-asserted claim through the Broker. A claim that resolves to a
 * receipt is grounded; anything else (unknown, ineligible, jurisdiction-barred, or an
 * arbiter error) is stripped to `unknown` — fail closed, never fabricate.
 * @param {{ claims: Array<{claim: string, query_intent: string}>, broker: { resolveClaim: Function }, patient_path?: boolean }} args
 * @returns {Promise<{ grounded: object[], unknown: object[], receipts: object[], all_grounded: boolean }>}
 */
export async function arbitrateModelClaims({ claims, broker, patient_path = true }) {
  const grounded = [];
  const unknown = [];
  for (const c of claims || []) {
    let r;
    try {
      // jurisdiction "AU" = the patient path; the Broker applies the E6 STOP itself.
      r = await broker.resolveClaim({ claim: c.claim, query_intent: c.query_intent, jurisdiction: "AU" });
    } catch (e) {
      unknown.push({ claim: c.claim, reason: `arbiter_error: ${(e && e.message) || e}` });
      continue;
    }
    if (r && r.receipt && r.result !== "unknown") {
      grounded.push({ claim: c.claim, receipt: r.receipt, evidence: r.evidence });
    } else {
      unknown.push({ claim: c.claim, reason: (r && r.reason) || "no_resolvable_receipt" });
    }
  }
  return { grounded, unknown, receipts: grounded.map((g) => g.receipt), all_grounded: unknown.length === 0 };
}

/**
 * Fold arbitration into the verification result — monotone-AND, mirrors
 * combineVerification(). A receipt-less claim strips pass to false and is surfaced in
 * missing_receipts; a fully-grounded set leaves pass unchanged. Never rescues a
 * failing base. Leaves `results` (the five checks) untouched.
 * @param {{ pass: boolean, results: object[], missing_receipts?: string[] }} verification
 * @param {{ grounded?: object[], unknown?: object[] }} arbitration
 */
export function composeArbitration(verification, arbitration) {
  const unknown = (arbitration && arbitration.unknown) || [];
  const misses = unknown.map((u) => `evidence broker: model claim stripped to unknown (no resolvable receipt): "${u.claim}" — ${u.reason}`);
  return {
    ...verification,
    results: verification.results, // unchanged five verifier checks — report schema stable
    pass: verification.pass && unknown.length === 0, // monotone: strengthen only
    missing_receipts: [...(verification.missing_receipts || []), ...misses],
    // Structured side-field for callers/tests; not written to the report by the
    // named-field builders (same treatment as integrity_detectors).
    evidence_arbitration: { grounded: (arbitration && arbitration.grounded) || [], unknown, all_grounded: unknown.length === 0 },
  };
}
