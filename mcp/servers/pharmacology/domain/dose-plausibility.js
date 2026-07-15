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

// A dose amount: a number, a mass unit, and OPTIONALLY a per-weight / per-BSA denominator.
// The unit alternation is LONGEST-FIRST so "microgram" cannot be partially matched as "g".
// The denominator is captured PER AMOUNT — see parseDoseAmounts for why that matters.
const AMOUNT_RE = /(\d+(?:[.,]\d+)?)\s*(micrograms|microgram|milligrams|milligram|grams|gram|mcg|µg|ug|mg|g)\b(\s*\/\s*(?:kg|kilogram|m²|m2|m\^2)|\s+per\s+(?:kg|kilogram|m²|m2|m\^2)\b)?/gi;

// "units" (insulin, heparin) are not a mass and cannot be converted to mg.
const NON_MASS_RE = /\b(?:international\s+)?units?\b|\biu\b|\bmL\b|\b%\b/i;

/**
 * Classify EVERY mass amount in a statement as flat or weight/BSA-based, and report BOTH.
 *
 * WHY THIS REPLACED A WHOLE-STRING TEST (show-evidence principle, Case 1, 2026-07-15).
 * This module used to test the whole statement for `/kg` and, on a single hit, discard everything.
 * That threw away real evidence. phenytoin's adult range, verbatim:
 *   "Anticonvulsant: Oral, initially 4–5 mg/kg daily … usual maintenance dose 200–500 mg daily.
 *    Maximum daily dose 600 mg. Status epilepticus: IV, 15–20 mg/kg."
 * The 200–500 mg and 600 mg are FLAT, comparable, and are exactly where a misplaced zero lands —
 * and the old rule hid them because the same string also mentioned mg/kg. A bar suppressing the
 * evidence it exists to check is the failure mode this system keeps rediscovering.
 * So: classify PER AMOUNT. A statement can be `mixed` — that is a fact to report, not a reason to
 * go quiet. The clinician sees both methods; plausibility runs on the flat component alone (mg/kg
 * is a different scale and is NEVER compared to a flat mg dose — that would manufacture a false
 * alarm or hide a real one).
 *
 * @param {string} statement
 * @returns {{ basis: "flat_mg"|"weight_based"|"mixed"|"none",
 *             flat_mg: number[], weight_based: string[], max_flat_mg: number|null, reason?: string }}
 */
export function parseDoseAmounts(statement) {
  const s = String(statement || "").trim();
  if (!s) return { basis: "none", flat_mg: [], weight_based: [], max_flat_mg: null, reason: "empty statement" };

  const flat = [];
  const weight = [];
  for (const m of s.matchAll(AMOUNT_RE)) {
    const n = Number(String(m[1]).replace(",", "."));
    const mult = UNIT_MG[m[2].toLowerCase()];
    if (!Number.isFinite(n) || mult === undefined) continue;
    if (m[3]) weight.push(m[0].trim()); // carries a /kg or /m² denominator → different scale
    else flat.push(n * mult);
  }

  const basis = flat.length && weight.length ? "mixed" : flat.length ? "flat_mg" : weight.length ? "weight_based" : "none";
  const out = { basis, flat_mg: flat, weight_based: weight, max_flat_mg: flat.length ? Math.max(...flat) : null };
  if (basis === "none") {
    out.reason = NON_MASS_RE.test(s) ? "dose expressed in non-mass units (units/IU/mL/%) — not convertible to mg" : "no mass amount found";
  } else if (basis === "weight_based") {
    out.reason = "weight- or BSA-based only (mg/kg, mg/m²) — a different scale, never compared to a flat mg dose";
  }
  return out;
}

/**
 * The LARGEST FLAT mass amount, in mg — the comparable component of a statement.
 *
 * The maximum (not the first) is deliberate: a statement often carries an escalation or a cap
 * ("50 mg daily, increasing to 100 mg three times daily. Maximum daily dose 600 mg"), and for an
 * order-of-magnitude typo check the top of the range is the number that matters — a misplaced zero
 * lands there. This is a coarse instrument by design; it is not a dosing calculator.
 *
 * @param {string} statement
 * @returns {{ mg: number|null, reason?: string, amounts?: number[], basis?: string, weight_based?: string[] }}
 */
export function parseMaxDoseMg(statement) {
  const p = parseDoseAmounts(statement);
  if (p.max_flat_mg === null) return { mg: null, reason: p.reason, basis: p.basis, weight_based: p.weight_based };
  return { mg: p.max_flat_mg, amounts: p.flat_mg, basis: p.basis, weight_based: p.weight_based };
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
