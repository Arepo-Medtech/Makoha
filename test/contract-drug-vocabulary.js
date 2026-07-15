/**
 * Contract test for the DRUG VOCABULARY capability (E8).
 *
 * OPERATOR RULING 2026-07-15 (second): *"Do not harvest RxNorm US Brands — but when a US Generic is
 * only spelling variant or near synonym based on the same INN-RXCUI this should be place in the
 * drug_vocabulary bucket — as the mix of the two still occurs frequently — if the system is ever in
 * doubt — a question should return to patient or doctor — to confirm the exact medication they
 * intended."* The first cut made "in doubt" a reason to REFUSE. It is a reason to ASK.
 *
 * OPERATOR TASK: one bucket holding every name, synonym, brand, international and spelling variant
 * that gets used interchangeably — linked to one unifying identifier, with the PBS INN Australian
 * name as the primary authority.
 *
 * WHAT THIS DEFENDS. A vocabulary entry REDIRECTS A LOOKUP. Get one wrong and a dose request for drug
 * X is answered with drug Y's data — the worst failure this system can produce, and E6 showed it is
 * not hypothetical (a misnomer already inerted an interaction check on live data). So four axes:
 *
 *   1. JURISDICTION. RxNorm's canonical is the USAN, NOT the INN — `acetaminophen` for paracetamol,
 *      `albuterol` for salbutamol. A US generic is RECORDED (the mix is frequent, so the name must
 *      not dead-end) but may only ever ASK — never steer silently, EVEN WHEN SIGNED. Signing says
 *      "these names are right", never "a US name is now an Australian one".
 *   2. US BRANDS ARE NOT HARVESTED — enforced from RxNorm's own TTY (IN/PIN/MIN only), not from a
 *      guess about which strings look like brands.
 *   3. IN DOUBT → ASK. Ambiguity presents every candidate and chooses none. "Refuse" is reserved for
 *      the one case where asking is nonsense: a manufacturer's name is not a drug.
 *   4. AN UNSIGNED VOCABULARY STEERS NOTHING — the same gate every dataset here passes.
 *
 * Run from repo root: node test/contract-drug-vocabulary.js
 */
import { readFileSync } from "node:fs";
import { validateDrugVocabulary } from "../mcp/servers/pharmacology/domain/model.js";
import { CAPABILITY_FILE } from "../scripts/pharm-author.mjs";
import { buildVocabulary } from "../scripts/pharm-vocabulary-build.mjs";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const VOCAB = "mcp/servers/pharmacology/data/drug-vocabulary.json";
const ds = JSON.parse(readFileSync(VOCAB, "utf8"));
const find = (n) => ds.records.find((r) => r.primary_name.toLowerCase() === n);
const nameIn = (rec, n) => rec?.names.find((x) => x.name.toLowerCase() === n);

// ---- 1. THE JURISDICTION GUARD — the trap that would have Americanised an AU system -------------
// RxNorm canonical: paracetamol→acetaminophen, salbutamol→albuterol, adrenaline→epinephrine. Taking
// rxnorm_name as "the INN" would have renamed all three across an Australian clinical system. The
// vocabulary RECORDS them (people genuinely mix them) and makes them ASK — so the name resolves for a
// human who confirms it, and never silently for a machine that assumed.
for (const [au, us] of [["paracetamol", "acetaminophen"], ["salbutamol", "albuterol"], ["adrenaline", "epinephrine"]]) {
  const rec = find(au);
  if (!rec) continue;
  expect(rec.primary_name.toLowerCase() === au, `${au} must remain the PRIMARY — an AU system must not be Americanised by a "standardisation"`);
  const v = nameIn(rec, us);
  if (v) {
    expect(v.kind === "international_generic", `${us} must be recorded as an international_generic — the operator's ruling says record it, the mix is frequent`);
    expect(v.lookup_disposition === "confirm", `${us} must ASK, never steer silently and never dead-end — a US name becomes an AU one only when a human says so`);
    expect(/is ".*" the medication you intend/i.test(v.confirm_prompt || ""), `${us}: the question must actually be a question, in the patient's words`);
    expect(v.rxnorm_tty && ["IN", "PIN", "MIN"].includes(v.rxnorm_tty), `${us}: admitted only as a GENERIC concept (TTY IN/PIN/MIN) — US brands are not harvested`);
  }
}
// …and it is UNREPRESENTABLE at the schema level, not merely absent from the data.
expect(
  throws(() => validateDrugVocabulary({
    primary_name: "paracetamol", authority: "pbs", identity: { rxcui: "161", atc_codes: [] },
    names: [
      { name: "paracetamol", kind: "primary", jurisdiction: "AU", source: "PBS", lookup_disposition: "steer" },
      { name: "acetaminophen", kind: "international_generic", jurisdiction: "US", source: "RxNorm", rxnorm_tty: "IN", lookup_disposition: "steer" },
    ],
    provenance: { source: "t", source_ref: "t", authored_by: "t", reviewed_by: null, review_status: "draft", version: "v0.1.0", effective_date: "2026-07-15" },
  })),
  "an international_generic that STEERS must be UNREPRESENTABLE — it may ask, never resolve silently. The schema, not a convention, must stop it.",
);

// ---- 2. THE OPERATOR'S ASK: one identity for what patients/doctors/systems each call it ---------
const fur = find("furosemide");
expect(!!fur, "furosemide must be in the vocabulary");
expect(fur.identity.rxcui === "4603", "the unifying identifier (RxCUI) must be recorded");
expect(fur.identity.atc_codes.includes("C03CA01"), "the WHO ATC code must be recorded — a second unifying identifier");
expect(fur.authority === "pbs", "PBS is the primary authority where the drug is PBS-listed");
expect(nameIn(fur, "frusemide")?.lookup_disposition === "steer", "the doctor's word ('frusemide') must LINK — that is the ruling");
expect(nameIn(fur, "lasix")?.kind === "brand", "the patient's word ('Lasix') must be in the vocabulary as an AU brand");
expect(nameIn(fur, "lasix")?.jurisdiction === "AU", "an AU brand must come from PBS (an AU source), never RxNorm's US brand table");
expect(nameIn(fur, "lasix")?.lookup_disposition === "steer", "an unambiguous PBS brand must resolve — that is the point of the capability");

// ---- 3. AMBIGUITY ASKS, AND NEVER PICKS --------------------------------------------------------------------
const amb = ds.records.flatMap((r) => r.names.filter((n) => /ambiguous/.test(n.disposition_reason || "")).map((n) => ({ r, n })));
for (const { n } of amb) {
  expect(n.lookup_disposition === "confirm", `${n.name}: in doubt → ASK. A flat refusal dead-ends a name a human could resolve in one answer.`);
  expect((n.confirm_candidates || []).length > 1, `${n.name}: an ambiguous question must present EVERY candidate`);
  expect(/which one do you mean/i.test(n.confirm_prompt || ""), `${n.name}: the question must ask which medication was meant`);
  expect(/does not choose/i.test(n.disposition_reason), `${n.name}: the reason must state that the system never picks`);
}
// A name reaching two primaries must STEER to neither — asking is fine, choosing never is.
const reach = new Map();
for (const r of ds.records) for (const n of r.names) {
  const k = n.name.toLowerCase();
  if (!reach.has(k)) reach.set(k, []);
  reach.get(k).push({ primary: r.primary_name, disp: n.lookup_disposition, kind: n.kind });
}
for (const [name, hits] of reach) {
  const primaries = new Set(hits.map((h) => h.primary.toLowerCase()));
  if (primaries.size < 2) continue;
  const steering = hits.filter((h) => h.disp === "steer" && h.kind !== "primary");
  expect(steering.length === 0, `'${name}' reaches ${primaries.size} drugs and must STEER to none — steering one side silently picks it (got ${steering.length})`);
}

// ---- 4. Company artifacts are not drugs ---------------------------------------------------------
const arts = ds.records.flatMap((r) => r.names.filter((n) => n.kind === "company_artifact"));
expect(arts.length > 0, "PBS's brand_name field carries sponsor company names — they must be caught, not treated as brands");
for (const a of arts) {
  expect(a.lookup_disposition === "refuse", `${a.name}: a company name is the ONE case that refuses rather than asks — "did you mean Pfizer?" is nonsense`);
  expect(/manufacturer|not a drug/i.test(a.disposition_reason || ""), `${a.name}: the refusal must say what it actually is`);
}
// US BRANDS ARE NOT HARVESTED — from RxNorm's own TTY, not from a guess about which strings look
// like brands. Every international generic must be an ingredient concept.
const intl = ds.records.flatMap((r) => r.names.filter((n) => n.kind === "international_generic"));
expect(intl.length > 0, "US generics sharing an INN-RxCUI must be recorded — the operator's ruling");
for (const g of intl) {
  expect(["IN", "PIN", "MIN"].includes(g.rxnorm_tty), `${g.name}: TTY ${g.rxnorm_tty} — only GENERIC concepts (IN/PIN/MIN) may enter; a brand (BN) must never be harvested`);
  expect(g.lookup_disposition === "confirm", `${g.name}: a US generic asks — it never steers and never dead-ends`);
}

// ---- 5. Structural invariants -------------------------------------------------------------------
//
// THESE TWO ASSERTIONS USED TO PIN "UNSIGNED", and they went red the moment KL signed on 2026-07-15 —
// correctly, because they pinned A STATE rather than A PROPERTY. The property was never "this file is
// unsigned"; it was "this file does not switch ITSELF on, and steers nothing until a clinician says
// so". A state-pinning test does not survive the thing it is waiting for, and worse: it would have
// gone quietly green again if the GATE broke while the data happened to be unsigned.
//
// So the gate is now proven against the FLAG, both directions, below — and what is asserted about the
// shipped file is what an attestation must actually carry.
expect(ds.attestation.clinical_sign_off === true,
  "the vocabulary is SIGNED (KL, 2026-07-15). If this is ever false again, an attestation was removed — find out by whom and why before touching anything else.");
expect(ds.attestation.regulatory_sign_off === false,
  "regulatory sign-off is a DIFFERENT gate (FL-50) and clinical sign-off must never be mistaken for it — this dataset remains -dev and non-patient-facing");
expect(ds.records.every((r) => r.provenance.review_status === "approved"),
  "a signed vocabulary must have every record approved per-record — the dataset flag is not the attestation, the records are");
expect(/Kenneth Lee \(MED0001857758\)/.test(ds.attestation.reviewer_id || ""),
  "the attestation must name the practitioner and their registration — an unattributable signature is not one");

// THE ATTESTATION MUST STATE ITS OWN SCOPE HONESTLY. He did not read 5,196 rows and the statement must
// not imply he did: the whole design rests on him having ruled on two SOURCES plus the names that
// actually steer. A statement that overclaimed would be the fabrication this subsystem exists to
// prevent, wearing his name.
expect(/did NOT mark 5,196 rows/.test(ds.attestation.statement),
  "the attestation statement must state plainly what was NOT read — an overclaimed scope is a fabricated attestation");
expect(/PBS as the Australian naming authority/.test(ds.attestation.statement) && /RxNorm's concept id as the identity key/.test(ds.attestation.statement),
  "the statement must record the two AUTHORITY rulings — they are what covers the 3,635 brands");
expect(/erythropoietin/.test(ds.attestation.statement),
  "the statement must record the ATC-sibling evidence and the defect it caught — that is why the review was not a formality");
expect(Array.isArray(ds.attestation.reseal_history) && ds.attestation.reseal_history.some((h) => /R-46/.test(h.reason || "")),
  "applying the sign-off MUTATES every record's provenance and invalidates the seal — the re-seal must be recorded in the same pass (R-46), not left to memory");

// ---- 5b. THE GATE IS THE FLAG, NOT THE CALENDAR — proven in BOTH directions ---------------------
{
  const { SyntheticSelfDevelopedSource } = await import("../mcp/servers/pharmacology/sources/pharm-data-source.js");

  // SIGNED (the live path): the vocabulary now steers, asks, and carries codes.
  const signed = new SyntheticSelfDevelopedSource();
  expect(signed.canonicalise("Lasix").canonical === "furosemide", "SIGNED: a brand must now reach its ingredient — this is what the sign-off unlocked");
  expect(signed.identityCode("furosemide") === "4603", "SIGNED: the code must now travel to the CDS gateway (B0b)");
  expect(!!signed.canonicalise("erythropoietin").confirm, "SIGNED: KL's ruling must be LIVE — erythropoietin asks and never picks");

  // UNSIGNED: same data, same names, one flag flipped — and everything must go inert.
  const unsigned = new SyntheticSelfDevelopedSource();
  unsigned._store.vocabulary = { ...unsigned._store.vocabulary, attestation: { ...unsigned._store.vocabulary.attestation, clinical_sign_off: false } };
  unsigned._codeIndex = null; unsigned._vocabIndex = null;
  expect(unsigned.canonicalise("Lasix").from === null,
    "UNSIGNED: a brand must steer NOTHING. An unsigned identity map may BLOCK, but it must never STEER — that asymmetry is the gate, and it must depend on the flag rather than on which day it is.");
  expect(unsigned.identityCode("furosemide") === null, "UNSIGNED: no code may travel — a code the gateway answers with a dose IS steering");
  expect(!unsigned.canonicalise("erythropoietin").confirm, "UNSIGNED: even the ruling is inert — recording is not resolving");
}
expect(ds.records.every((r) => r.names.every((n) => n.source)), "every name must carry its source — no receipt, no claim");
expect(ds.records.every((r) => r.names.every((n) => n.lookup_disposition === "steer" || n.disposition_reason)),
  "a name that does not steer must record WHY — an unexplained hesitation is indistinguishable from a bug");
expect(ds.records.every((r) => r.names.every((n) => n.lookup_disposition !== "confirm" || n.confirm_prompt)),
  "'ask' without a question is just a block");

// The identity must be in its own vocabulary, and a refusal must explain itself — both at schema level.
const base = {
  authority: "pbs", identity: { rxcui: "1", atc_codes: [] },
  provenance: { source: "t", source_ref: "t", authored_by: "t", reviewed_by: null, review_status: "draft", version: "v0.1.0", effective_date: "2026-07-15" },
};
expect(throws(() => validateDrugVocabulary({ ...base, primary_name: "drugA", names: [{ name: "other", kind: "brand", jurisdiction: "AU", source: "s", lookup_disposition: "steer" }] })),
  "a record whose primary_name is absent from names[] must be UNREPRESENTABLE");
expect(throws(() => validateDrugVocabulary({ ...base, primary_name: "drugA", names: [
  { name: "drugA", kind: "primary", jurisdiction: "AU", source: "s", lookup_disposition: "steer" },
  { name: "x", kind: "brand", jurisdiction: "AU", source: "s", lookup_disposition: "refuse" }] })),
  "a name refused WITHOUT a reason must be UNREPRESENTABLE — a silent drop is the failure mode");
expect(throws(() => validateDrugVocabulary({ ...base, primary_name: "drugA", names: [
  { name: "drugA", kind: "primary", jurisdiction: "AU", source: "s", lookup_disposition: "steer" },
  { name: "x", kind: "brand", jurisdiction: "AU", source: "s", lookup_disposition: "confirm", disposition_reason: "r" }] })),
  "a 'confirm' WITHOUT a question must be UNREPRESENTABLE — 'ask' with nothing to ask is just a block");

// ---- 6. NOT INGEST-ROUTABLE ---------------------------------------------------------------------
// The same bar dose_guidance has, for the same reason: a vocabulary entry redirects a lookup, so an
// agent able to author one through the generic round-trip could map 'amoxicillin' → 'warfarin'.
expect(CAPABILITY_FILE.drug_vocabulary === undefined,
  "drug_vocabulary must NOT be routable through pharm-ingest — an agent able to author a vocabulary entry could steer a dose lookup to the wrong drug");

// ---- 7. The builder refuses ambiguity on a hostile fixture --------------------------------------
{
  const pbs = [
    { ingredient: "drugone", brand_name: "SharedBrand", atc_code: "A01" },
    { ingredient: "drugtwo", brand_name: "SharedBrand", atc_code: "A02" },
    { ingredient: "drugthree", brand_name: "Acme Pharma Pty Ltd", atc_code: "A03" },
  ];
  const { records } = buildVocabulary({ pbs, identity: [], datastoreNames: new Map(), utc: "2026-07-15" });
  const shared = records.flatMap((r) => r.names.filter((n) => n.name === "SharedBrand"));
  expect(shared.length === 2, "fixture: the shared brand appears under both drugs");
  expect(shared.every((n) => n.lookup_disposition === "confirm"),
    "a brand reaching TWO ingredients must ASK, never steer — this is the wrong-drug hazard in its purest form, and the human resolves it in one answer");
  expect(shared.every((n) => (n.confirm_candidates || []).length === 2), "the question must present both candidates");
  const co = records.flatMap((r) => r.names.filter((n) => n.name === "Acme Pharma Pty Ltd"));
  expect(co.every((n) => n.kind === "company_artifact" && n.lookup_disposition === "refuse"), "a company name must be caught as an artifact and refused");
}

// ---- 5. CLINICIAN OVERRIDES — a ruling the sources cannot derive, and cannot silently lose ------
//
// THE WORKED CASE (V1, ruled by KL 2026-07-15). `erythropoietin` was steering to `epoetin alfa`, and
// NO MECHANICAL TEST COULD HAVE CAUGHT IT:
//   - RxNorm groups 'erythropoietin' under RxCUI 105694, the SAME concept as epoetin alfa. So a
//     "different concept → don't steer" rule is vacuous: all 20 aliases share their primary's
//     concept id (checked — zero mismatches). By that measure it is as sound as frusemide→furosemide.
//   - The ambiguity detector cannot fire: the name reaches exactly ONE primary. Nothing collides.
// RxNorm's grouping reflects US usage ('EPO' = epoetin alfa). In AU practice it is the class term
// covering four marketed agents. That gap between a naming authority and bedside meaning is not in
// the data. It took a clinician — which is the entire argument for the sign-off gate.
{
  const OVERRIDES = JSON.parse(readFileSync("mcp/servers/pharmacology/data/vocabulary-overrides.json", "utf8")).overrides;

  // 5a. The ruling is IN FORCE in the shipped vocabulary — not merely recorded in the ruling file.
  const epo = find("epoetin alfa");
  const ery = epo?.names.find((n) => n.name.toLowerCase() === "erythropoietin");
  expect(!!ery, "fixture: epoetin alfa must carry the erythropoietin alias");
  expect(ery.lookup_disposition === "confirm",
    "'erythropoietin' must ASK, not steer: it is the class term for FOUR agents this datastore holds (epoetin alfa, epoetin lambda, darbepoetin alfa, methoxy PEG-epoetin beta). Steering it picks one arbitrarily — a classification is not an identity.");
  expect((ery.confirm_candidates || []).length === 4, "the question must present all four ESAs and choose none");
  expect(/OVERRIDDEN by clinician ruling/.test(ery.source),
    "the name must carry the ruling's provenance — a reader has to be able to see this was a clinician's call, not the build's, and find who made it");

  // 5b. THE MECHANICAL BAR — an override may never CREATE a steer. This is the asymmetry the whole
  // subsystem runs on: a wrong entry that asks costs a question; a wrong entry that steers doses the
  // wrong drug. Without this, the override table becomes a way to hand-wave a name INTO steering —
  // exactly the act clinical sign-off exists to gate.
  const pbs = [{ ingredient: "Drug A", brand_name: "BrandA", atc_code: "A01AA01" }];
  expect(
    throws(() => buildVocabulary({
      pbs, identity: [], datastoreNames: new Map(), utc: "2026-07-15",
      overrides: [{ name: "BrandA", primary_name: "Drug A", lookup_disposition: "steer", ruled_by: "x", ruled_utc: "2026-07-15", basis: "b" }],
    })),
    "an override that STEERS must THROW. An override may only take a name OUT of silent resolution, never put one in — otherwise the ruling table is a hole straight through the gate.",
  );

  // 5c. Tightening the other way is allowed — that is what a ruling is FOR.
  const tightened = buildVocabulary({
    pbs, identity: [], datastoreNames: new Map(), utc: "2026-07-15",
    overrides: [{ name: "BrandA", primary_name: "Drug A", lookup_disposition: "confirm", confirm_prompt: "which?", confirm_candidates: ["Drug A"], disposition_reason: "ruled ambiguous", ruled_by: "KL", ruled_utc: "2026-07-15", basis: "test" }],
  });
  expect(tightened.records[0].names.find((n) => n.name === "BrandA").lookup_disposition === "confirm",
    "a clinician must be able to take a name out of steering — that is the point of the table");
  expect(tightened.stats.overridden === 1, "the build must COUNT overrides, so a silent no-op is visible in the stats");

  // 5d. A ruling that matches NOTHING must FAIL THE BUILD — R-47's shape, on a clinical ruling.
  // Recorded-but-not-applied: the ruling sits in the file, a reader believes it is in force, and it
  // is not. A drug renamed since the ruling would do exactly this, quietly.
  expect(
    throws(() => buildVocabulary({
      pbs, identity: [], datastoreNames: new Map(), utc: "2026-07-15",
      overrides: [{ name: "a-name-that-does-not-exist", primary_name: "Drug A", lookup_disposition: "confirm", confirm_prompt: "?", disposition_reason: "r", ruled_by: "KL", ruled_utc: "2026-07-15", basis: "b" }],
    })),
    "a ruling that matches nothing must THROW, not pass quietly — recorded-but-not-applied is the failure R-47 named, and a clinical ruling is the worst place for it",
  );

  // 5e. The ruling must survive a REBUILD. This is why the override is data and not a hand-edit: the
  // build regenerates the vocabulary from scratch, so a hand-fix to drug-vocabulary.json would be
  // reverted on the next run with nobody told.
  const identity = [{ name: "erythropoietin", rxcui: "105694", resolution: "resolved", rxnorm_name: "epoetin alfa", rxnorm_tty: "IN" }];
  const rebuilt = buildVocabulary({
    pbs: [{ ingredient: "epoetin alfa", brand_name: "Eprex 1000", atc_code: "B03XA01" }],
    identity,
    datastoreNames: new Map([["epoetin alfa", { aliases: new Set(["erythropoietin"]) }]]),
    utc: "2026-07-15",
    overrides: OVERRIDES,
  });
  const re = rebuilt.records[0].names.find((n) => n.name.toLowerCase() === "erythropoietin");
  expect(re && re.lookup_disposition === "confirm",
    "the ruling must survive a full rebuild from PBS + RxNorm — RxNorm still says these are one concept, and the clinician's ruling must still win");
}

// ---- 6. NEVER FUZZY — migrated from contract-ingredient-identity when resolveIngredient was removed
//
// These assertions used to guard `resolveIngredient()`. That function is gone (an ORPHAN: superseded
// by E7's aliases and E8's vocabulary, zero production callers) — but the PROPERTY it guarded did not
// go with it. `canonicalise()` is the live steerer now, and deleting the orphan's tests would have
// left "never fuzzy" holding by construction and asserted by NOBODY. That is the M1 shape, and it is
// exactly how a safety property quietly stops being one.
//
// Resolving a drug name to a DIFFERENT drug name is the most dangerous mechanical act in this
// subsystem: get it wrong and you dose the wrong drug. These are the classic confusion pairs.
{
  const { SyntheticSelfDevelopedSource } = await import("../mcp/servers/pharmacology/sources/pharm-data-source.js");
  const src = new SyntheticSelfDevelopedSource();
  const steersTo = (n) => { const r = src.canonicalise(n); return r.from ? r.canonical : null; };

  // The wrong-drug pairs. Similar spelling, different concept, catastrophic swap.
  for (const [a, b] of [["amlodipine", "amiodarone"], ["amiodarone", "amlodipine"], ["hydralazine", "hydroxyzine"], ["clonidine", "clonazepam"]]) {
    const to = steersTo(a);
    expect(to === null || to !== b, `${a} must NEVER steer to ${b} — different RxNorm concepts are different drugs, and the whole reason there is no similarity matching anywhere on this path`);
  }

  // A typo resolves to NOTHING. There is no fuzzy match, no "did you mean", no nearest neighbour.
  for (const typo of ["amlodipin", "amoxicilin", "clonidin", "warfarn"]) {
    expect(steersTo(typo) === null, `a typo ("${typo}") must steer to NOTHING — it resolves to itself and the caller's fail-safe (BLOCKED_NO_PROOF) stands. A resolver that guesses at a misspelling is a resolver that doses the wrong drug.`);
  }

  // An unknown name resolves to nothing — never invented.
  expect(steersTo("totally-made-up-drug") === null, "an unknown name must resolve to nothing");
  expect(steersTo("") === null, "empty → nothing");

  // The common path does no work: an already-canonical name is not "resolved" to itself.
  expect(steersTo("furosemide") === null, "an ALREADY-canonical name must report no redirection — the ordinary lookup is untouched");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-drug-vocabulary FAIL (${errors.length})`);
  process.exit(1);
}
const d = { steer: 0, confirm: 0, refuse: 0 };
for (const r of ds.records) for (const n of r.names) d[n.lookup_disposition]++;
console.log(`contract-drug-vocabulary: OK (${ds.records.length} drugs · ${d.steer} steer / ${d.confirm} ASK / ${d.refuse} refuse · PBS-INN primary · a US generic asks and never silently becomes AU · no US brands (TTY-gated) · ambiguity asks, never picks)`);
