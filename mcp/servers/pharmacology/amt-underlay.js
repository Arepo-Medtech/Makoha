/**
 * Pharmacology AMT medicines-vocabulary underlay (MI-08; execution plan §4.4).
 *
 * The free, correct medicines vocabulary that sits UNDER a future CDS: a drug intent's
 * AMT code is validated through the Terminology Service (MI-05 Ontoserver client) and,
 * on a validate-pass, carries a coding + receipt. This is purely the coding layer — it
 * adds NO dosing/interaction/contraindication content (that is the CDS slot, MI-09).
 *
 * INVARIANT (reuses MI-06/07): an AMT code is coded ONLY on a $validate-code pass; an
 * unvalidated code is never fabricated into a coding. The firewall (engine.js) is
 * untouched — this is an additive vocabulary check.
 */
import { codeOrQuarantine } from "../terminology/coding-gate.js";

/**
 * Validate a drug intent's AMT code via the Terminology Service.
 * @param {{ drug_name?: string, amt_snomed_code?: string }} drugIntent
 * @param {{ validate?: (q: { system: string, code: string, text?: string }) => Promise<{ validated: boolean, display?: string, version?: string, reason?: string }> }} [opts]
 * @returns {Promise<{ validated: boolean, coding: { system: string, code: string, display: string }|null, terminology_receipt_id?: string, version?: string, reason?: string }>}
 */
export async function validateDrugAmt(drugIntent, { validate } = {}) {
  const code = drugIntent && drugIntent.amt_snomed_code;
  if (!code) return { validated: false, coding: null, reason: "no AMT code on the drug intent — medicines vocabulary not asserted" };
  let v = null;
  if (validate) {
    try { v = await validate({ system: "AMT", code, text: drugIntent.drug_name }); } catch { v = null; }
  }
  const g = codeOrQuarantine({ text: drugIntent.drug_name, system: "AMT", code }, v);
  if (g.coded) {
    return { validated: true, coding: { system: "AMT", code, display: g.coded.display }, terminology_receipt_id: `term-amt-${code}`, version: v && v.version };
  }
  return { validated: false, coding: null, reason: (v && v.reason) || "AMT code not validated — not coded (no fabrication)" };
}
