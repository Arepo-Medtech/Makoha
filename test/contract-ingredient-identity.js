/**
 * Contract test for ingredient-identity resolution (E6/FL-06).
 *
 * WHAT THIS DEFENDS. Resolving a drug name to a different drug name is the single most dangerous
 * mechanical act in this subsystem: get it wrong and you dose the wrong drug. So the resolver is
 * asserted on four axes, and each is a way it could kill someone:
 *
 *   1. NEVER FUZZY. Similar names must NOT resolve to each other. amlodipine/amiodarone,
 *      hydralazine/hydroxyzine, clonidine/clonazepam are the classic wrong-drug pairs.
 *   2. NEVER GUESS. An ambiguous name (two datastore ingredients sharing a concept) is REFUSED, not
 *      picked. A typo resolves to nothing.
 *   3. NEVER SELF-APPROVE. A name→ingredient map is a drug-IDENTITY assertion. An UNSIGNED map must
 *      not steer a dose lookup — the same gate every other dataset here passes.
 *   4. FAIL-SAFE. Unresolved → null → the caller's existing BLOCKED_NO_PROOF stands. Resolution can
 *      only ADD reach to content a clinician already signed; it can never invent one.
 *
 * Run from repo root: node test/contract-ingredient-identity.js
 */
import { existsSync, readFileSync } from "node:fs";
import { resolveIngredient, loadIdentityMap, identityCollisions, _resetIdentityCache } from "../mcp/servers/pharmacology/domain/ingredient-identity.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };

const MAP_PATH = "mcp/servers/pharmacology/data/ingredient-identity.json";

/** A fixture map — the tests must not depend on a live harvest. */
function fixture({ signed }) {
  const recs = [
    { name: "amoxicillin", rxcui: "723", resolution: "resolved", held_in: ["dose-guidance.json", "drug-interactions.json"] },
    { name: "amoxycillin", rxcui: "723", resolution: "resolved", held_in: ["apf"] },
    { name: "amlodipine", rxcui: "17767", resolution: "resolved", held_in: ["drug-interactions.json"] },
    { name: "amiodarone", rxcui: "703", resolution: "resolved", held_in: ["drug-interactions.json"] },
    { name: "clomiphene", rxcui: "2596", resolution: "resolved", held_in: ["dose-guidance.json"] },
    { name: "clomifene", rxcui: "2596", resolution: "resolved", held_in: ["pbs-formulary.json"] },
    // an ambiguous case: TWO canonical datastore names share one concept → must be REFUSED
    { name: "twinA", rxcui: "999", resolution: "resolved", held_in: ["dose-guidance.json"] },
    { name: "twinB", rxcui: "999", resolution: "resolved", held_in: ["dose-guidance.json"] },
    { name: "ambiguous-name", rxcui: "999", resolution: "resolved", held_in: ["apf"] },
    // never usable, whatever happens
    { name: "unresolvable-thing", rxcui: null, resolution: "unresolved", held_in: ["apf"] },
    { name: "two-concepts", rxcui: null, resolution: "ambiguous", held_in: ["apf"] },
  ];
  const byName = new Map(), byRxcui = new Map();
  for (const r of recs) {
    if (r.resolution !== "resolved" || !r.rxcui) continue;
    byName.set(r.name.toLowerCase(), r.rxcui);
    if (!byRxcui.has(r.rxcui)) byRxcui.set(r.rxcui, []);
    byRxcui.get(r.rxcui).push(r);
  }
  return { path: "fixture", present: true, signed, dataset_version: "fixture:v1", byName, byRxcui };
}

// The datastore's canonical names, for the fixture.
const CANON = new Set(["amoxicillin", "amlodipine", "amiodarone", "clomiphene", "twina", "twinb"]);
const isCanonical = (n) => CANON.has(String(n).toLowerCase());

// ---- 1. THE GATE: an unsigned identity map must not steer a dose lookup ------------------------
const unsigned = fixture({ signed: false });
expect(resolveIngredient("amoxycillin", isCanonical, { map: unsigned }) === null,
  "an UNSIGNED identity map must NOT redirect a lookup — a name→ingredient map is a drug-identity assertion and passes the same gate as every other dataset");
expect(resolveIngredient("amoxycillin", isCanonical, { map: unsigned, allowUnsigned: true })?.canonical === "amoxicillin",
  "…and allowUnsigned must be an EXPLICIT opt-in, so review can happen before behaviour changes");

// ---- 2. Signed map: the real variant resolves --------------------------------------------------
const signed = fixture({ signed: true });
const r = resolveIngredient("amoxycillin", isCanonical, { map: signed });
expect(r?.canonical === "amoxicillin", "the AU spelling must reach the signed AU dose");
expect(r?.rxcui === "723", "the resolution must carry the RxCUI it rests on — an unauditable mapping is not an authoritative one");
expect(r?.via === "rxnorm-nlm", "the resolution must name its source");

// ---- 3. NEVER FUZZY — the wrong-drug pairs ------------------------------------------------------
// These share a prefix and are the classic confusions. Different RxCUI → they must NOT resolve to
// each other. This is the assertion that makes the whole approach safe rather than clever.
expect(resolveIngredient("amiodarone", isCanonical, { map: signed }) === null,
  "amiodarone is canonical — it must resolve to nothing, and certainly never to amlodipine");
for (const [a, b] of [["amlodipine", "amiodarone"], ["amiodarone", "amlodipine"]]) {
  const res = resolveIngredient(a, isCanonical, { map: signed });
  expect(res === null || res.canonical !== b, `${a} must NEVER resolve to ${b} — different RxNorm concepts are different drugs`);
}

// ---- 4. NEVER GUESS ----------------------------------------------------------------------------
expect(resolveIngredient("ambiguous-name", isCanonical, { map: signed }) === null,
  "a name whose concept maps to TWO canonical ingredients must be REFUSED, never picked — ambiguity is not resolved by choosing");
expect(resolveIngredient("unresolvable-thing", isCanonical, { map: signed }) === null,
  "an UNRESOLVED record must never be used to redirect");
expect(resolveIngredient("two-concepts", isCanonical, { map: signed }) === null,
  "an AMBIGUOUS record (RxNorm returned >1 concept) must never be used to redirect");
expect(resolveIngredient("amoxicilin", isCanonical, { map: signed }) === null,
  "a typo must resolve to NOTHING — there is no similarity matching anywhere in this path");
expect(resolveIngredient("totally-made-up", isCanonical, { map: signed }) === null, "an unknown name must resolve to nothing");
expect(resolveIngredient("", isCanonical, { map: signed }) === null, "empty → nothing");

// ---- 5. The common path does no work and takes no risk ------------------------------------------
expect(resolveIngredient("amoxicillin", isCanonical, { map: signed }) === null,
  "an ALREADY-canonical name must return null — the resolver never touches the ordinary lookup");

// ---- 6. Absent map = no behaviour change --------------------------------------------------------
expect(resolveIngredient("amoxycillin", isCanonical, { map: { present: false, signed: false, byName: new Map(), byRxcui: new Map() } }) === null,
  "no map → no resolution → the caller's existing fail-safe stands");

// ---- 7. The real harvested dataset, if present --------------------------------------------------
if (existsSync(MAP_PATH)) {
  _resetIdentityCache();
  const m = loadIdentityMap(MAP_PATH);
  const ds = JSON.parse(readFileSync(MAP_PATH, "utf8"));

  expect(m.present, "the harvested map must load");
  expect(ds.attestation.clinical_sign_off === false,
    "the harvested map ships UNSIGNED — it is authored for clinician review, not switched on behind them");
  expect(ds.attestation.regulatory_sign_off === false, "regulatory sign-off is a different gate (FL-50)");
  expect(ds.records.every((x) => x.provenance?.source_ref === "rxnorm-nlm"),
    "every record must carry its source — no receipt, no claim");
  expect(ds.records.every((x) => x.resolution !== "resolved" || x.rxcui),
    "a 'resolved' record without an RxCUI is unrepresentable — the RxCUI IS the resolution");

  // NOTHING BINNED: unresolved names are recorded with a reason, not dropped.
  const unres = ds.records.filter((x) => x.resolution === "unresolved");
  expect(unres.every((x) => x.reason), "every unresolved name must record WHY — a name we could not resolve is a fact about our lookup, not about the drug");

  // THE SAFETY PROPERTY, on the real data: no two DIFFERENT canonical drugs share a concept id.
  // If this ever fires it means RxNorm considers two of our ingredients the same thing, which is
  // either a real duplicate in the datastore or a mapping we must not act on.
  const cols = identityCollisions(m);
  for (const c of cols) {
    expect(c.names.length >= 2, "a collision must name its members");
  }
  // The known-dangerous pairs must never appear in the same collision group.
  const DANGER = [["amlodipine", "amiodarone"], ["hydralazine", "hydroxyzine"], ["clonidine", "clonazepam"],
                  ["vinblastine", "vincristine"], ["chlorpromazine", "chlorpropamide"], ["carbamazepine", "oxcarbazepine"]];
  for (const [a, b] of DANGER) {
    const together = cols.some((c) => c.names.includes(a) && c.names.includes(b));
    expect(!together, `${a} and ${b} must NEVER share an RxNorm concept — if this fires, the map is unsafe and must not be signed`);
  }
  console.log(`  (real map: ${ds.records.length} names · ${ds.records.filter((x) => x.resolution === "resolved").length} resolved · ${cols.length} collision group(s) · unsigned)`);
}

// ---- 8. THE E1 REGRESSION — a dose must never emit while its safety checks are inert ------------
// THE DEFECT, verified live before the fix:
//     frusemide  → PASS,      dose EMITTED, interaction_check PASS,      no flags
//     furosemide → HARD_FAIL, no dose,      interaction_check HARD_FAIL, interaction_severe
// Same drug (RxCUI 4603), same patient, same co-medications. The dose lives under the Australian
// name; the interaction + NTI data live under the INN. The check RAN, looked up the wrong string,
// found nothing, and PASSED. E1 introduced this by populating dose-guidance from APF's name-space
// while every other capability uses the INN name-space — turning a fail-safe block into an unsafe
// pass. This is the assertion that stops it coming back.
{
  const { runPharmCheck } = await import("../mcp/servers/pharmacology/engine.js");
  const intent = (d) => ({
    intent_id: "i-split-t", session_ref: "enc-split-test", intent_type: "new_prescription",
    drug_intent: { drug_name: d, drug_class: "unspecified" }, patient_facts_ref: {},
    clinical_context: { patient_age_years: 60 }, mode: "mock",
  });
  const facts = { allergens: ["paracetamol"], current_medications: ["digoxin", "lithium"], s8_pdmp_checked: true, egfr_ml_min: 90 };

  if (existsSync(MAP_PATH)) {
    // The six known splits must NOT emit a dose behind an inert check.
    for (const d of ["frusemide", "chlorthalidone", "eformoterol", "cholecalciferol", "beclomethasone", "hexamine hippurate"]) {
      const pc = runPharmCheck(intent(d), facts);
      expect(pc.status !== "PASS" && pc.status !== "WARN",
        `${d}: a dose must NEVER emit while its safety data sits under a different spelling — got ${pc.status}`);
      expect(!pc.dose_guidance,
        `${d}: no dose may be emitted when the interaction/NTI checks looked up the wrong string`);
      expect(pc.next_data_requests.some((r) => /identity unreconciled/i.test(r)),
        `${d}: the block must EXPLAIN itself and name the sibling — a silent block is its own failure`);
    }

    // The INN spelling still finds the real interaction — the fix must not have masked it.
    const inn = runPharmCheck(intent("furosemide"), facts);
    expect(inn.status === "HARD_FAIL", "furosemide + digoxin/lithium must still HARD_FAIL on the real interaction");
    expect(inn.flags.some((f) => f.flag_type === "interaction_severe"), "the severe interaction must still be flagged");

    // AND the fix must be NARROW: the other 445 doses must still flow. An over-broad block is its
    // own failure mode — it would bin the clinician's signed content behind a naming concern.
    const ok = runPharmCheck({ ...intent("amoxicillin"), clinical_context: { patient_age_years: 45 } },
      { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true, egfr_ml_min: 90 });
    expect(ok.status === "PASS" && !!ok.dose_guidance,
      "an unaffected drug must still emit its clinician-signed dose — the guard must be narrow, not a blanket");
  }
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-ingredient-identity FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-ingredient-identity: OK (never fuzzy · ambiguity REFUSED not picked · an unsigned identity map cannot steer a dose lookup · unresolved → fail-safe)");
