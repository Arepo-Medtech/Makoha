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
import { loadIdentityMap, identityCollisions, _resetIdentityCache, doseIdentitySplit, SAFETY_CAPABILITIES } from "../mcp/servers/pharmacology/domain/ingredient-identity.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };

const MAP_PATH = "mcp/servers/pharmacology/data/ingredient-identity.json";

// ══ SECTIONS 1-6 REMOVED 2026-07-15 — resolveIngredient() is gone ══
//
// They tested `resolveIngredient()`: the E6 fix, superseded by E7's aliases and E8's signed
// vocabulary, and by removal it had ZERO production callers. It was removed rather than wired,
// because wiring it would have created a SECOND canonicaliser beside the vocabulary's — which is the
// E6 defect itself, and the reason B0/B0b settle identity ONCE before either executor runs.
//
// THE TESTS WERE MIGRATED, NOT DELETED. "Never fuzzy" (amlodipine/amiodarone, hydralazine/hydroxyzine,
// a typo resolving to nothing, an already-canonical name doing no work) is a property of whatever
// STEERS TODAY — and that is `canonicalise()`. Those assertions now live in
// `contract-drug-vocabulary` §6, aimed at the live steerer, and they were proven to bite there (a
// prefix-matching canonicalise turns that suite red) BEFORE this code was cut.
//
// Deleting a safety test along with the orphan it happened to be attached to would have left the
// property holding by construction and asserted by nobody. That is the M1 shape, and it is exactly how
// a safety property quietly stops being one.

// ---- 6b. doseIdentitySplit — THE LIVE GUARD, AND IT WAS ASSERTED BY NOBODY -------------------
//
// Found while removing resolveIngredient: disabling `doseIdentitySplit` in engine.js reddened NOTHING.
// It fires ZERO times across all 451 dose ingredients — because E7 fixed the root (the INN is the
// primary identity and old spellings are recorded aliases, canonicalised once at the engine boundary),
// so no split EXISTS to detect. The guard is live, correct, and unexercised.
//
// That is the M1 shape exactly: "the property holds TODAY, BY CONSTRUCTION — and nothing asserts it."
// A guard that has never fired, and that no test can make fire, is indistinguishable from a guard that
// does not work. Its whole purpose is the split nobody has created YET — so it is proven on a FIXTURE
// that has one, rather than waiting for a real one to appear on a live path.
{
  // A split: two names, ONE RxNorm concept, and the dose is filed under one while a SAFETY capability
  // is filed under the other. This is the E1 defect in miniature — the check runs, looks up the wrong
  // string, finds nothing, and PASSES.
  const split = {
    present: true, dataset_version: "fixture:v1",
    byName: new Map([["aliasdrug", "999"], ["primarydrug", "999"]]),
    byRxcui: new Map([["999", [
      { name: "aliasdrug", rxcui: "999", held_in: ["dose-guidance.json"] },
      { name: "primarydrug", rxcui: "999", held_in: ["drug-interactions.json", "nti-register.json"] },
    ]]]),
  };
  const d = doseIdentitySplit("aliasdrug", split);
  expect(!!d, "a drug whose DOSE is filed under one spelling while its SAFETY data sits under another MUST be detected — that is the E1 defect, and this guard is the only thing that would catch it recurring");
  expect(d.sibling === "primarydrug", "the finding must name the sibling — a clinician cannot reconcile an identity they are not shown");
  expect(d.rxcui === "999", "…and the concept the two share, which is the evidence they are one drug");
  expect(JSON.stringify(d.capabilities) === JSON.stringify(["drug-interactions.json", "nti-register.json"]),
    "…and WHICH safety checks did not see it — those are the checks whose PASS is not proof");

  // No dose here → nothing to gate. The guard is about a dose reaching a patient past inert checks.
  expect(doseIdentitySplit("primarydrug", split) === null,
    "the sibling holds no dose, so there is no dose to gate — a block here would be over-triage");

  // NOT a split: both names hold the same capabilities. Same concept, nothing divided.
  const whole = {
    present: true, dataset_version: "fixture:v1",
    byName: new Map([["a", "1"], ["b", "1"]]),
    byRxcui: new Map([["1", [
      { name: "a", rxcui: "1", held_in: ["dose-guidance.json", "drug-interactions.json"] },
      { name: "b", rxcui: "1", held_in: ["dose-guidance.json", "drug-interactions.json"] },
    ]]]),
  };
  expect(doseIdentitySplit("a", whole) === null, "two names holding the SAME data are not split — a guard that fires on the whole case gets switched off, and then the real split ships");

  // Only SAFETY capabilities count. A cosmetic capability under a sibling is not a safety split.
  const cosmetic = {
    present: true, dataset_version: "fixture:v1",
    byName: new Map([["x", "2"], ["y", "2"]]),
    byRxcui: new Map([["2", [
      { name: "x", rxcui: "2", held_in: ["dose-guidance.json"] },
      { name: "y", rxcui: "2", held_in: ["counselling-points.json"] },
    ]]]),
  };
  expect(doseIdentitySplit("x", cosmetic) === null,
    `only the eight accessors' capabilities decide whether a CHECK missed data (${SAFETY_CAPABILITIES.length} of them). Counselling points under a sibling name are not a safety split.`);

  expect(doseIdentitySplit("unknown-name", split) === null, "a name not in the map cannot be split — the caller's fail-safe stands");
  expect(doseIdentitySplit("aliasdrug", { present: false, byName: new Map(), byRxcui: new Map() }) === null, "no map → no detection (status quo; never an error)");
}

// ---- 7. The real harvested dataset, if present --------------------------------------------------
if (existsSync(MAP_PATH)) {
  _resetIdentityCache();
  const m = loadIdentityMap(MAP_PATH);
  const ds = JSON.parse(readFileSync(MAP_PATH, "utf8"));

  expect(m.present, "the harvested map must load");
  // THIS PINNED A STATE, NOT A PROPERTY — and went red the moment the ruling was recorded (2026-07-15).
  // The fourth time today: "ships unsigned" is not the safety property. The property is that the map
  // does not switch ITSELF on, and that an unsigned map STEERS NOTHING — both proven by fixture below,
  // in both directions, so they survive the thing they were waiting for.
  expect(ds.attestation.clinical_sign_off === true,
    "the map is SIGNED (KL, 2026-07-15) — but note what that signature IS: his vocabulary ruling #2 ('RxNorm's concept id is the identity key') recorded against the harvest it was about. It closes a PROVENANCE CHAIN (a signed vocabulary built from an unsigned input is a traceability gap) and unlocks NOTHING — behaviour is A/B-identical signed vs unsigned.");
  expect(/did NOT review these 1473 individual lookups/.test(ds.attestation.statement),
    "the statement must say plainly what he did NOT do. He ruled on the SOURCE, not on 1473 rows, and an attestation that implied otherwise would be a fabrication wearing his name.");
  expect(/WHAT THIS UNLOCKS: nothing/.test(ds.attestation.statement),
    "…and that it unlocks nothing — so nobody later reads this signature as having switched something on");
  expect(/regulatory \(TGA\) sign-off NOT given/.test(ds.attestation.statement), "clinical only — regulatory is FL-50, a different gate");
  expect(ds.attestation.regulatory_sign_off === false, "regulatory sign-off is a different gate (FL-50)");
  expect(ds.records.every((x) => x.provenance?.review_status === "approved"),
    "a signed map must carry the ruling per-record — the dataset flag is not the attestation, the records are");
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
  console.log(`  (real map: ${ds.records.length} names · ${ds.records.filter((x) => x.resolution === "resolved").length} resolved · ${cols.length} collision group(s) · SIGNED — provenance only, gates nothing)`);
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
    return { ok: true, json: async () => ({ request_id: "resp-0001", engine: "opencds-dss", knowledge_module_set: DEFAULT_KM_SET, check_verdicts: [{ check_id: "allergy_check", status: "PASS" }], flags: [] }) };
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
// The summary must claim only what THIS file still tests. It used to say "never fuzzy · ambiguity
// REFUSED · an unsigned map cannot steer" — all three were resolveIngredient's, and all three moved to
// contract-drug-vocabulary with it. A summary that keeps claiming a departed test's coverage is the
// same overclaim this project has spent the day removing, in a place nobody would think to check.
console.log("contract-ingredient-identity: OK (the map's attestation is honest — the ruling is on the SOURCE, states what was NOT reviewed, and unlocks nothing · no dangerous pair shares a concept · unresolved names record WHY · the E1 regression: a misnomer must not change the answer)\n  never-fuzzy + ambiguity-refused now live in contract-drug-vocabulary §6, aimed at canonicalise() — the live steerer.");
