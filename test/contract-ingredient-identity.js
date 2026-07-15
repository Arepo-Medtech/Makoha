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

  // E7 (operator ruling) fixed this AT THE ROOT rather than leaving it guarded: the INN name is now
  // the primary identity and the old spelling is a recorded alias, canonicalised ONCE at the engine
  // boundary. So the expected behaviour changed — the splits no longer BLOCK, they RESOLVE. The
  // INVARIANT did not change, and this is now the sharper way to state it:
  //
  //     A MISNOMER MUST NOT CHANGE THE ANSWER.
  //
  // If two names for one drug ever produce different statuses or different flags again, something is
  // split — whatever the mechanism. That is a stronger assertion than "the six known splits block",
  // and it catches splits nobody has thought of yet.
  const PAIRS = [
    ["frusemide", "furosemide"], ["chlorthalidone", "chlortalidone"], ["eformoterol", "formoterol"],
    ["cholecalciferol", "colecalciferol"], ["beclomethasone", "beclometasone"],
    ["hexamine hippurate", "methenamine hippurate"], ["thyroxine", "levothyroxine"],
  ];
  for (const [alias, primary] of PAIRS) {
    const a = runPharmCheck(intent(alias), facts);
    const p = runPharmCheck(intent(primary), facts);
    expect(a.status === p.status,
      `'${alias}' and '${primary}' are one drug — a misnomer must NOT change the answer (got ${a.status} vs ${p.status})`);
    expect(JSON.stringify(a.flags.map((f) => f.flag_type).sort()) === JSON.stringify(p.flags.map((f) => f.flag_type).sort()),
      `'${alias}' and '${primary}' must raise the SAME flags — a link lost to a misnomer is the E1 defect`);
    expect(!!a.dose_guidance === !!p.dose_guidance,
      `'${alias}' and '${primary}' must agree on whether a dose exists`);
    if (a.status !== p.status) continue;
    // The resolution must be REPORTED — a silent identity change is its own failure.
    expect(a.next_data_requests.some((r) => /identity resolved/i.test(r)),
      `'${alias}': the identity resolution must be REPORTED, never silent`);
  }

  // THE E1 REGRESSION ITSELF: frusemide + digoxin/lithium once returned PASS with a dose and
  // interaction_check PASS. It must HARD_FAIL on the real interaction, under EITHER spelling.
  for (const d of ["frusemide", "furosemide"]) {
    const pc = runPharmCheck(intent(d), facts);
    expect(pc.status === "HARD_FAIL", `${d} + digoxin/lithium must HARD_FAIL on the real interaction — got ${pc.status}`);
    expect(pc.flags.some((f) => f.flag_type === "interaction_severe"), `${d}: the severe interaction must be flagged`);
    expect(!pc.dose_guidance, `${d}: no dose on a HARD_FAIL`);
  }

  // And the change must be NARROW: an unaffected drug still emits its clinician-signed dose. An
  // over-broad block is its own failure — it would bin signed content behind a naming concern.
  const ok = runPharmCheck({ ...intent("amoxicillin"), clinical_context: { patient_age_years: 45 } },
    { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true, egfr_ml_min: 90 });
  expect(ok.status === "PASS" && !!ok.dose_guidance, "an unaffected drug must still emit its signed dose");

  // AN UNKNOWN NAME STILL FAILS SAFE — canonicalisation adds reach, it never invents an identity.
  const unknown = runPharmCheck(intent("totally-made-up-drug"), facts);
  expect(unknown.status === "BLOCKED_NO_PROOF", "an unknown name must still BLOCK — resolution never invents a drug");

  // THE JURISDICTION GUARD, on the real data: no US-only name may have entered. RxNorm's canonical
  // for paracetamol is "acetaminophen"; had the reconcile taken rxnorm_name as "the INN" it would
  // have Americanised an Australian clinical system. The reconcile may only pick names the datastore
  // already held, so this must hold forever.
  {
    const dose = JSON.parse(readFileSync("mcp/servers/pharmacology/data/dose-guidance.json", "utf8")).records;
    const names = new Set(dose.map((r) => String(r.ingredient).toLowerCase()));
    for (const au of ["paracetamol", "salbutamol", "adrenaline"]) {
      const us = { paracetamol: "acetaminophen", salbutamol: "albuterol", adrenaline: "epinephrine" }[au];
      expect(!names.has(us), `'${us}' must NEVER appear — RxNorm's canonical is the USAN, not the INN; an AU system must not be Americanised by a "standardisation"`);
    }
    expect(names.has("paracetamol"), "paracetamol must survive the reconcile untouched");
  }
}

// ---- 9. B0 (FL-34 Phase B): BOTH EXECUTORS GET THE SAME IDENTITY ------------------------------
// There are two executors on the pipeline path — the in-process engine and the CDS slot (the OpenCDS
// gateway). The engine canonicalises at its own boundary (E7), but the pipeline was handing queryCds
// the RAW intent. Demonstrated before the fix, with a recording fake gateway:
//
//     engine canonicalises to  : furosemide     (and the OpenCDS KB is exported from those records)
//     gateway actually receives: "frusemide"    ← the raw intent name
//
// The E6 defect rebuilt one layer out. Fail-SAFE (a gateway miss folds to BLOCKED_NO_PROOF — the fold
// is monotone) but it would make the OSS CDS path unusable for exactly the aliased names E7/E8 exist
// to handle, and it would make Phase D's A/B parity measure a SPELLING rather than an implementation
// difference. This is the assertion that stops it coming back.
{
  const { runPipeline } = await import("../verification/pipeline.js");
  const prevState = process.env.HEYDOC_PHARM_CDS;
  const prevEp = process.env.HEYDOC_PHARM_CDS_ENDPOINT;
  process.env.HEYDOC_PHARM_CDS = "AU_OSS_CDS";
  process.env.HEYDOC_PHARM_CDS_ENDPOINT = "https://gateway.example.test";

  const seen = [];
  const gateway = async (_url, opts) => {
    seen.push(JSON.parse(opts.body).drug.drug_name);
    return { ok: true, json: async () => ({ request_id: "resp-0001", engine: "opencds-dss", knowledge_module_set: "fl30-kb:v1", check_verdicts: [{ check_id: "allergy_check", status: "PASS" }], flags: [] }) };
  };
  const run = (drug) => runPipeline({
    trunk: "8.0", cds_fetch: gateway,
    pharm_intent: { intent_id: "i-b0", session_ref: "enc-b0-test", intent_type: "new_prescription", drug_intent: { drug_name: drug, drug_class: "x" }, patient_facts_ref: {}, clinical_context: { patient_age_years: 60 }, mode: "mock" },
    resolved_facts: { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true, egfr_ml_min: 90 },
  });

  await run("frusemide");
  expect(seen[0] === "furosemide",
    `the GATEWAY must receive the canonical identity, not the raw name — the KB is INN-keyed, so a raw name looks up something it does not hold (got "${seen[0]}")`);

  // An already-canonical name is unchanged — canonicalisation is idempotent, not a rewrite.
  seen.length = 0;
  await run("furosemide");
  expect(seen[0] === "furosemide", "an already-canonical name must reach the gateway untouched");

  // An UNKNOWN name is NOT rewritten — resolution adds reach, it never invents an identity. The
  // gateway sees exactly what was asked, and the engine's fail-safe stands.
  seen.length = 0;
  await run("totally-made-up-drug");
  expect(seen[0] === "totally-made-up-drug", "an unknown name must reach the gateway as written — never silently replaced");

  // ---- B0b: the CODE, not just the name ---------------------------------------------------------
  // Operator: "is it more pragmatic to use a code ... and just maintain strict canonical names for all
  // internal functions?" Yes. A code is unambiguous by construction; a name makes correctness depend
  // on two systems agreeing on a spelling — the class of defect F6 was.
  seen.length = 0;
  const seenDrug = [];
  const recordingGw = async (_u, opts) => { seenDrug.push(JSON.parse(opts.body).drug); return gateway(_u, opts); };
  const runCode = (drug) => runPipeline({
    trunk: "8.0", cds_fetch: recordingGw,
    pharm_intent: { intent_id: "i-b0b", session_ref: "enc-b0b-test", intent_type: "new_prescription", drug_intent: { drug_name: drug, drug_class: "x" }, patient_facts_ref: {}, clinical_context: { patient_age_years: 60 }, mode: "mock" },
    resolved_facts: { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true, egfr_ml_min: 90 },
  });

  // THE NAME reaches the gateway canonicalised, signed or not — that is B0, and it is what makes the
  // name path correct on its own.
  await runCode("frusemide");
  expect(seenDrug[0].drug_name === "furosemide", "the canonical NAME must reach the gateway (B0)");

  // THE CODE IS GATED ON SIGN-OFF, and the gate is proven MECHANICALLY — in both directions, against
  // fixtures, not against whatever the shipped datastore happens to be today.
  //
  // This assertion used to read "an UNSIGNED vocabulary must not send a code" and was checked against
  // the live datastore, which was unsigned at the time. KL signed it on 2026-07-15 and the test went
  // red — correctly, because it was pinning A STATE rather than A PROPERTY. A state-pinning test does
  // not survive the thing it is waiting for, and worse, it would have gone quietly green again if the
  // gate broke while the data happened to be unsigned. So: fixtures, both directions.
  {
    const { SyntheticSelfDevelopedSource } = await import("../mcp/servers/pharmacology/sources/pharm-data-source.js");
    const src = new SyntheticSelfDevelopedSource();

    // The gate's real subject: the vocabulary's OWN attestation flag.
    expect(src._store.vocabulary.attestation.clinical_sign_off === true,
      "fixture: the shipped vocabulary is signed (KL 2026-07-15) — so the SIGNED direction below is the live path");
    expect(src.identityCode("furosemide") === "4603",
      "SIGNED: the code must now travel — this is what the clinician's sign-off unlocked, and what turns 937 name-only gateway subjects into code-keyed ones");

    // Flip the flag on a fresh source and the code must vanish. Same data, same names, one flag.
    const unsigned = new SyntheticSelfDevelopedSource();
    unsigned._store.vocabulary = { ...unsigned._store.vocabulary, attestation: { ...unsigned._store.vocabulary.attestation, clinical_sign_off: false } };
    unsigned._codeIndex = null;
    unsigned._vocabIndex = null;
    expect(unsigned.identityCode("furosemide") === null,
      "UNSIGNED: no code may travel. Sending a code the gateway answers with a DOSE keyed on it IS steering — the same act the vocabulary gate refuses. The gate must be the FLAG, not the calendar.");
    expect(unsigned.canonicalise("Lasix").from === null,
      "UNSIGNED: a brand must steer nothing either — an unsigned identity map may BLOCK, but it must never STEER");
  }

  // ATC must NEVER be sent as an identity. It is a therapeutic CLASSIFICATION: V07AY alone covers ~70
  // distinct products (every bandage and dressing), B03AC four iron preparations. It sits in the
  // record looking like a candidate; keying identity on it would answer with the wrong drug.
  expect(!seenDrug[0].atc_code, "ATC must never be sent as an identity — it is a classification, not a key");

  if (prevState === undefined) delete process.env.HEYDOC_PHARM_CDS; else process.env.HEYDOC_PHARM_CDS = prevState;
  if (prevEp === undefined) delete process.env.HEYDOC_PHARM_CDS_ENDPOINT; else process.env.HEYDOC_PHARM_CDS_ENDPOINT = prevEp;
}

// ---- 10. F7: the frozen intent CANNOT carry a code — and must not be smuggled -------------------
// `drug_intent` in the FROZEN pharm-intent.schema.json is additionalProperties:false with NO
// rxnorm_code and NO atc_code. The zod mirror silently STRIPS them, so extractDrug's di.rxnorm_code /
// di.atc_code could never be populated through a validated intent — dead reads that created the
// ILLUSION the codes flow. The fix is to pass the code as an ARGUMENT (the WIRE contract has the
// field; the intent does not). This pins that nobody later "fixes" F7 by putting the code on the
// intent, which would smuggle a contract-forbidden field to the gateway by bypassing validation.
{
  const { validatePharmIntent } = await import("../mcp/servers/pharmacology/schemas.js");
  const v = validatePharmIntent({
    intent_id: "i", session_ref: "enc-f7-0001", intent_type: "new_prescription", patient_facts_ref: {}, mode: "mock",
    drug_intent: { drug_name: "furosemide", drug_class: "d", rxnorm_code: "4603", atc_code: "C03CA01", amt_snomed_code: "123" },
  });
  expect(!("rxnorm_code" in v.drug_intent), "the frozen intent must NOT carry rxnorm_code — it is stripped, so putting it there is a silent no-op at best and smuggling at worst");
  expect(!("atc_code" in v.drug_intent), "the frozen intent must NOT carry atc_code");
  expect(v.drug_intent.amt_snomed_code === "123", "amt_snomed_code IS on the frozen intent — the AU-native code, simply not harvested yet");

  // And the frozen contract itself is untouched by B0b.
  const schema = JSON.parse(readFileSync("mcp/schemas/pharm-intent.schema.json", "utf8"));
  const di = schema.properties.drug_intent;
  expect(di.additionalProperties === false, "drug_intent stays closed");
  expect(!("rxnorm_code" in di.properties), "B0b must NOT have widened the frozen intent — the code rides the WIRE, not the contract");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-ingredient-identity FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-ingredient-identity: OK (never fuzzy · ambiguity REFUSED not picked · an unsigned identity map cannot steer a dose lookup · unresolved → fail-safe)");
