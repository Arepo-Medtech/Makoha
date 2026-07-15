/**
 * ingredient-identity — resolve an inbound drug name to the datastore's canonical ingredient (E6/FL-06).
 *
 * WHAT THIS FIXES, STATED HONESTLY. Not a safety hole. The 451 clinician-signed doses are reachable
 * ONLY under the exact datastore string: a prescriber writing the Australian spelling "amoxycillin"
 * gets BLOCKED_NO_PROOF while a signed dose sits right there. That is fail-safe and visible — the
 * engine blocks, it does not quietly return nothing — but it means attested clinical content is
 * unreachable for want of a spelling. Same shape as the TIER_A array, one level down.
 *
 * THE REGISTER'S FRAMING WAS WRONG, and E6 corrects it rather than inheriting it:
 *   - "the 29% non-match gates coverage" — FALSE. E1 removed a hardcoded array and coverage went
 *     11 → 451 with this unbuilt.
 *   - "a miss is a SILENT no-dose" — FALSE. A miss fails `knownDrug()` → BLOCKED_NO_PROOF. Visible.
 *   - Measured: of 123 dose ingredients absent from every other capability, **120 are genuine coverage
 *     gaps** (we hold a dose but no interaction/scheduling fact) and only **3** are orthographic
 *     variants — and those 3 differ only against unsigned bulk data no accessor reads.
 *
 * WHY THIS IS NOT FUZZY MATCHING — the thing that would make it dangerous. Fuzzy-matching drug names
 * is how you dose the wrong drug. This never compares strings for similarity. It looks a name up in a
 * map harvested from RxNorm by EXACT/registered-synonym lookup (search=0), and two names are the same
 * ingredient ONLY when RxNorm returned the same RxCUI. Verified before the map was built: look-alike
 * pairs stay distinct (0/8 — amlodipine/amiodarone, hydralazine/hydroxyzine, clonidine/clonazepam,
 * vinblastine/vincristine, chlorpromazine/chlorpropamide, carbamazepine/oxcarbazepine,
 * methotrexate/metronidazole, dexamphetamine/dexamethasone); typos refuse ("amoxicilin", "amlodipin"
 * → no match). Normalized search (search=2) was rejected precisely because it DID resolve "amlodipin".
 *
 * ══ THIS MODULE NO LONGER STEERS ANYTHING (2026-07-15) ══
 * It used to export `resolveIngredient()` — the E6 fix, which redirected an AU spelling variant to the
 * canonical dose, gated on the map's `clinical_sign_off`. That function is GONE. It was superseded
 * twice (E7's `also_known_as`, resolved once at the engine's own boundary; then E8's drug vocabulary,
 * which is signed and does the work), and by the time it was removed it had ZERO production callers.
 *
 * It was removed rather than wired, and the reason is the point: wiring it would have created a
 * SECOND canonicaliser beside the vocabulary's. Two things resolving identity independently is the E6
 * defect itself — a dose found under one spelling while the interaction check missed under another —
 * which is why B0/B0b settle identity ONCE, upstream, before either executor runs. An orphan that
 * would be a hazard if reconnected is not a spare part; it is a loaded gun in a drawer.
 *
 * ITS SAFETY TESTS DID NOT GO WITH IT. "Never fuzzy" (amlodipine/amiodarone, hydralazine/hydroxyzine,
 * a typo resolving to nothing) is a property of whatever steers TODAY, and that is now
 * `canonicalise()`. Those assertions were MIGRATED to `contract-drug-vocabulary` before this function
 * was deleted — deleting them with it would have left the property holding by construction and
 * asserted by nobody, which is precisely how a safety property quietly stops being one.
 *
 * ══ WHAT REMAINS, AND WHY ══
 * `doseIdentitySplit()` — the engine's live use, and the opposite risk. It reads this map to BLOCK
 * (fail-safe) when a drug's dose and its safety data sit under different spellings. It reads the map
 * EVEN WHILE UNSIGNED, deliberately: blocking on a suspected identity costs a spurious block a
 * clinician resolves, whereas STEERING on an unverified one doses the wrong drug. Same data, opposite
 * risk, opposite gate. `loadIdentityMap` / `SAFETY_CAPABILITIES` support it; `identityCollisions` is
 * the audit read.
 *
 * The map's `clinical_sign_off` now gates NOTHING — `resolveIngredient` was the only thing it gated.
 * It is pure provenance, which is exactly what its attestation says it is ("WHAT THIS UNLOCKS:
 * nothing"). `loadIdentityMap` no longer surfaces a `signed` field for the same reason `allergy_status`
 * was removed from the wire (F-C8): a field that LOOKS like it gates something, and does not, is how
 * the next reader is misled.
 *
 * FAIL-SAFE DIRECTION, unchanged: an unresolved name returns null and the caller's existing behaviour
 * stands (BLOCKED_NO_PROOF). Nothing here invents a dose, and nothing here picks between two
 * candidates — an ambiguous name is REFUSED.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "ingredient-identity.json");

let _cache = null;

/** Load the identity dataset. Absent → no map → resolution is simply unavailable (never an error). */
export function loadIdentityMap(path = DATA_PATH) {
  if (_cache && _cache.path === path) return _cache;
  let ds;
  try { ds = JSON.parse(readFileSync(path, "utf8")); }
  catch { ds = null; }

  const byName = new Map();     // lowercased name → rxcui
  const byRxcui = new Map();    // rxcui → [names]
  for (const r of ds?.records || []) {
    if (r.resolution !== "resolved" || !r.rxcui) continue; // unresolved/ambiguous are NEVER used
    byName.set(r.name.toLowerCase(), r.rxcui);
    if (!byRxcui.has(r.rxcui)) byRxcui.set(r.rxcui, []);
    byRxcui.get(r.rxcui).push(r);
  }
  _cache = {
    path,
    present: !!ds,
    dataset_version: ds?.dataset_version ?? null,
    byName,
    byRxcui,
  };
  return _cache;
}

/** Test seam. */
export function _resetIdentityCache() { _cache = null; }

/**
 * The datastore files the engine's eight accessors actually key on. A name split across THESE is not
 * cosmetic: it decides whether a safety check finds its data.
 */
export const SAFETY_CAPABILITIES = [
  "drug-interactions.json", "renal-rules.json", "nti-register.json", "au-scheduling.json",
  "pregnancy-risk.json", "hepatic.json", "allergy-cross-reactivity.json",
];

/**
 * DETECT AN IDENTITY SPLIT: this drug has a dose, and an RxNorm-equivalent name holds SAFETY data
 * that this drug's own name does not.
 *
 * THE DEFECT THIS EXISTS FOR — found 2026-07-15, introduced by E1, verified on the live engine:
 *
 *     frusemide   → PASS,      dose EMITTED, interaction_check PASS,      no flags
 *     furosemide  → HARD_FAIL, no dose,      interaction_check HARD_FAIL, interaction_severe
 *
 * Same drug (RxCUI 4603), same patient, same co-medications (digoxin + lithium). The dose lives under
 * the Australian name `frusemide`; the interaction and NTI data live under the INN `furosemide`. The
 * interaction check RUNS, looks up the wrong string, finds nothing, and PASSES. A dose is emitted
 * while its safety checks are inert. Six drugs are affected: frusemide/furosemide,
 * chlorthalidone/chlortalidone, eformoterol/formoterol, cholecalciferol/colecalciferol,
 * beclomethasone/beclometasone, hexamine hippurate/methenamine hippurate.
 *
 * Before E1 these drugs had no dose, so `knownDrug()` was false and the engine returned
 * BLOCKED_NO_PROOF. **E1 turned a fail-safe block into an unsafe pass** by populating dose-guidance
 * from APF's name-space while every other capability uses the INN name-space. The register's claim
 * that "a miss is a SILENT no-dose (fail-safe direction)" is the exact inverse of what happens here:
 * the miss is a silent no-INTERACTION-CHECK while a dose flows.
 *
 * WHY AN UNSIGNED MAP MAY DO THIS — the asymmetry, and it is the whole point:
 *   - An unsigned identity map may **BLOCK**. "RxNorm says these two names are one drug, so I cannot
 *     prove this check ran against the right identity" is a FAIL-SAFE conclusion. Being wrong costs a
 *     spurious BLOCKED_NO_PROOF, which a clinician resolves.
 *   - An unsigned identity map may **NOT STEER** (the vocabulary's `canonicalise()` holds that gate now;
 *     this module's own steerer was removed 2026-07-15). Redirecting a dose lookup
 *     on an unverified identity claim is not fail-safe: being wrong doses the wrong drug.
 * Same data, opposite risk profile, opposite gate. Blocking needs no sign-off; steering does.
 *
 * @returns {{ rxcui: string, sibling: string, capabilities: string[] } | null}
 */
export function doseIdentitySplit(drug, map = null) {
  const n = String(drug || "").trim().toLowerCase();
  if (!n) return null;
  const m = map || loadIdentityMap();
  if (!m.present) return null; // no map → no detection (status quo; never an error)

  const rxcui = m.byName.get(n);
  if (!rxcui) return null;

  const group = m.byRxcui.get(rxcui) || [];
  const self = group.find((r) => r.name.toLowerCase() === n);
  if (!self || !(self.held_in || []).includes("dose-guidance.json")) return null; // no dose here → nothing to gate

  const mine = new Set((self.held_in || []).filter((f) => SAFETY_CAPABILITIES.includes(f)));
  for (const sib of group) {
    if (sib.name.toLowerCase() === n) continue;
    const theirs = (sib.held_in || []).filter((f) => SAFETY_CAPABILITIES.includes(f) && !mine.has(f));
    if (theirs.length) return { rxcui, sibling: sib.name, capabilities: theirs.sort() };
  }
  return null;
}

/**
 * Every place two distinct names we hold are the same RxNorm concept — i.e. every spelling that can
 * find a fact its twin cannot. The audit output; measured, not assumed.
 * @returns {Array<{ rxcui: string, names: string[], held_in: string[] }>}
 */
export function identityCollisions(map = null) {
  const m = map || loadIdentityMap();
  const out = [];
  for (const [rxcui, rs] of m.byRxcui) {
    if (rs.length < 2) continue;
    out.push({
      rxcui,
      names: rs.map((r) => r.name).sort(),
      held_in: [...new Set(rs.flatMap((r) => r.held_in || []))].sort(),
    });
  }
  return out.sort((a, b) => a.names[0].localeCompare(b.names[0]));
}
