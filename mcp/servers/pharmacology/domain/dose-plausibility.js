/**
 * Dose plausibility — a PURE, OFFLINE, FAIL-SAFE order-of-magnitude guard.
 *
 * WHY THIS EXISTS (register: dose-plausibility-guard-unbuilt, opened by the C0 amendment).
 * The original schema binned an AU dose whose FDA/EMA label differed. That gate was removed as wrong
 * — it inverted the jurisdiction rule and conflated "different jurisdiction" with "wrong". But it was
 * incidentally catching ONE real thing: a transcription typo. Channel B is manual clinician entry from
 * APF22, and "5000 mg" for "500 mg" is the classic catastrophic med-error. This module recovers that
 * catch WITHOUT resurrecting the veto.
 *
 * THE DISTINCTION THAT MATTERS — and conflating it is what produced the bad gate:
 *   - CONGRUENCE is a clinical judgement: "the EU approved a different indication" is a legitimate,
 *     shippable difference. Not this module's business; it stays authored, with the foreign label's
 *     dose_statement carried verbatim so the clinician can judge it themselves.
 *   - PLAUSIBILITY is arithmetic: 500 mg vs 5000 mg is not a jurisdictional difference, it is a
 *     misplaced zero. That is what this module looks for, and ALL it looks for.
 * So the output is a WARN for a human, never a bin. A genuine >10x difference between jurisdictions is
 * possible (loading vs maintenance dosing), which is exactly why this cannot be allowed to block.
 *
 * FAIL-SAFE BY CONSTRUCTION. Dose statements are messy free text ("500 mg every 8 hours", "3.75–7.5 mg
 * before bedtime", "8 mg/kg twice daily"). A guard that guesses is worse than no guard, so anything it
 * cannot read confidently returns `unassessable` — NEVER a silent all-clear. In particular a
 * weight/BSA-based dose (mg/kg, mg/m²) is on a different scale entirely and is never compared against
 * a flat mg dose; that comparison would manufacture a false 100x alarm (or hide a real one).
 */

/** mg multipliers. Units outside this map make a statement unassessable rather than assumed. */
const UNIT_MG = {
  mg: 1, milligram: 1, milligrams: 1,
  g: 1000, gram: 1000, grams: 1000,
  microgram: 0.001, micrograms: 0.001, mcg: 0.001, "µg": 0.001, ug: 0.001,
};

// A dose amount: a number (incl. decimals) followed by a mass unit. The unit alternation is
// LONGEST-FIRST so "microgram" cannot be partially matched as "g".
const AMOUNT_RE = /(\d+(?:[.,]\d+)?)\s*(micrograms|microgram|milligrams|milligram|grams|gram|mcg|µg|ug|mg|g)\b/gi;

// A per-weight / per-surface-area basis anywhere in the statement makes flat-mg comparison meaningless.
const WEIGHT_BASIS_RE = /(?:\/|\s+per\s+)\s*(?:kg|kilogram|m²|m2|m\^2)\b|\bmg\s*\/\s*kg\b|\bmg\s*\/\s*m/i;

// "units" (insulin, heparin) are not a mass and cannot be converted to mg.
const NON_MASS_RE = /\b(?:international\s+)?units?\b|\biu\b|\bmL\b|\b%\b/i;

/**
 * Extract the LARGEST mass amount mentioned, in mg.
 *
 * The maximum (not the first) is deliberate: a statement often carries an escalation or a cap
 * ("50 mg daily, increasing to 100 mg three times daily. Maximum daily dose 600 mg"), and for an
 * order-of-magnitude typo check the top of the range is the number that matters — a misplaced zero
 * lands there. This is a coarse instrument by design; it is not a dosing calculator.
 *
 * @param {string} statement
 * @returns {{ mg: number|null, reason?: string, amounts?: number[] }}
 */
export function parseMaxDoseMg(statement) {
  const s = String(statement || "").trim();
  if (!s) return { mg: null, reason: "empty statement" };
  if (WEIGHT_BASIS_RE.test(s)) return { mg: null, reason: "weight- or BSA-based dose (mg/kg, mg/m²) — not comparable to a flat mg dose" };

  const amounts = [];
  for (const m of s.matchAll(AMOUNT_RE)) {
    const n = Number(String(m[1]).replace(",", "."));
    const mult = UNIT_MG[m[2].toLowerCase()];
    if (Number.isFinite(n) && mult !== undefined) amounts.push(n * mult);
  }
  if (!amounts.length) {
    return { mg: null, reason: NON_MASS_RE.test(s) ? "dose expressed in non-mass units (units/IU/mL/%) — not convertible to mg" : "no mass amount found" };
  }
  return { mg: Math.max(...amounts), amounts };
}

/** How far apart two magnitudes are, order-of-magnitude wise (always >= 1). */
function ratio(a, b) { return a >= b ? a / b : b / a; }

/**
 * Assess an AU dose statement against the US/EU comparator label doses.
 *
 * @param {string} auStatement - the candidate AU dose (safe_dose_range)
 * @param {Array<{jurisdiction?: string, agency?: string, dose_statement: string}>} comparators
 * @param {{ threshold?: number }} [opts] - threshold defaults to 10x (a misplaced zero)
 * @returns {{ status: "plausible"|"implausible"|"unassessable", note: string,
 *             au_mg?: number|null, worst?: { jurisdiction?: string, agency?: string, comparator_mg: number, ratio: number } }}
 */
export function assessPlausibility(auStatement, comparators = [], { threshold = 10 } = {}) {
  const au = parseMaxDoseMg(auStatement);
  if (au.mg === null) {
    return { status: "unassessable", au_mg: null, note: `AU dose not comparable: ${au.reason}. No plausibility claim is made — this is NOT an all-clear.` };
  }
  const list = (Array.isArray(comparators) ? comparators : []).filter(Boolean);
  if (!list.length) {
    return { status: "unassessable", au_mg: au.mg, note: "no comparator label to compare against. No plausibility claim is made — this is NOT an all-clear." };
  }

  let worst = null;
  let comparable = 0;
  for (const c of list) {
    const p = parseMaxDoseMg(c.dose_statement);
    if (p.mg === null || p.mg === 0) continue;
    comparable++;
    const r = ratio(au.mg, p.mg);
    if (!worst || r > worst.ratio) worst = { jurisdiction: c.jurisdiction, agency: c.agency, comparator_mg: p.mg, ratio: r };
  }
  if (!comparable) {
    return { status: "unassessable", au_mg: au.mg, note: "no comparator dose could be read as a flat mass amount. No plausibility claim is made — this is NOT an all-clear." };
  }

  // NOTE the asymmetry: "implausible" is a WARN for a human, never a bin. A real >10x difference
  // between jurisdictions is possible (loading vs maintenance), so this must not be allowed to block.
  if (worst.ratio >= threshold) {
    return {
      status: "implausible", au_mg: au.mg, worst,
      note: `AU dose (max ${au.mg} mg) differs from the ${worst.jurisdiction || worst.agency || "foreign"} label (max ${worst.comparator_mg} mg) by ${worst.ratio.toFixed(1)}x — at or beyond the ${threshold}x threshold. This is an ORDER-OF-MAGNITUDE flag for a human (a misplaced zero looks exactly like this), NOT a judgement that the AU dose is wrong and NOT a block. Confirm the entry against the source before attesting.`,
    };
  }
  return {
    status: "plausible", au_mg: au.mg, worst,
    note: `AU dose (max ${au.mg} mg) is within ${threshold}x of the closest foreign label (max ${worst.comparator_mg} mg, ${worst.ratio.toFixed(1)}x). No order-of-magnitude entry error detected. This says NOTHING about clinical congruence — jurisdictions legitimately differ.`,
  };
}
