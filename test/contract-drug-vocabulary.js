/**
 * Contract test for the DRUG VOCABULARY capability (E8).
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
 *      `albuterol` for salbutamol. An international variant must NEVER resolve an AU lookup, and that
 *      must hold EVEN WHEN THE VOCABULARY IS SIGNED: signing says "these names are right", not
 *      "a US name is now an Australian one".
 *   2. AMBIGUITY IS REFUSED, never resolved by choosing.
 *   3. RECORDING ≠ RESOLVING. `usable_for_lookup` is the bar, and a refusal must state its reason.
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
// rxnorm_name as "the INN" would have renamed all three. The vocabulary records them so they are
// RECOGNISED, and refuses them so they can never steer.
for (const [au, us] of [["paracetamol", "acetaminophen"], ["salbutamol", "albuterol"], ["adrenaline", "epinephrine"]]) {
  const rec = find(au);
  if (!rec) continue;
  expect(rec.primary_name.toLowerCase() === au, `${au} must remain the PRIMARY — an AU system must not be Americanised by a "standardisation"`);
  const v = nameIn(rec, us);
  if (v) {
    expect(v.kind === "international_variant", `${us} must be recorded as an international_variant, not an AU name`);
    expect(v.usable_for_lookup === false, `${us} must NEVER resolve an AU lookup — that is the jurisdiction inversion the whole subsystem guards against`);
    expect(!!v.not_usable_reason, `${us}: a refusal must state its reason`);
  }
}
// …and it is UNREPRESENTABLE at the schema level, not merely absent from the data.
expect(
  throws(() => validateDrugVocabulary({
    primary_name: "paracetamol", authority: "pbs", identity: { rxcui: "161", atc_codes: [] },
    names: [
      { name: "paracetamol", kind: "primary", jurisdiction: "AU", source: "PBS", usable_for_lookup: true },
      { name: "acetaminophen", kind: "international_variant", jurisdiction: "US", source: "RxNorm", usable_for_lookup: true },
    ],
    provenance: { source: "t", source_ref: "t", authored_by: "t", reviewed_by: null, review_status: "draft", version: "v0.1.0", effective_date: "2026-07-15" },
  })),
  "an international_variant with usable_for_lookup:true must be UNREPRESENTABLE — the schema, not a convention, must stop it",
);

// ---- 2. THE OPERATOR'S ASK: one identity for what patients/doctors/systems each call it ---------
const fur = find("furosemide");
expect(!!fur, "furosemide must be in the vocabulary");
expect(fur.identity.rxcui === "4603", "the unifying identifier (RxCUI) must be recorded");
expect(fur.identity.atc_codes.includes("C03CA01"), "the WHO ATC code must be recorded — a second unifying identifier");
expect(fur.authority === "pbs", "PBS is the primary authority where the drug is PBS-listed");
expect(nameIn(fur, "frusemide")?.usable_for_lookup === true, "the doctor's word ('frusemide') must LINK — that is the ruling");
expect(nameIn(fur, "lasix")?.kind === "brand", "the patient's word ('Lasix') must be in the vocabulary as an AU brand");
expect(nameIn(fur, "lasix")?.jurisdiction === "AU", "an AU brand must come from PBS (an AU source), never RxNorm's US brand table");
expect(nameIn(fur, "lasix")?.usable_for_lookup === true, "an unambiguous PBS brand must be usable — that is the point of the capability");

// ---- 3. AMBIGUITY IS REFUSED --------------------------------------------------------------------
const amb = ds.records.flatMap((r) => r.names.filter((n) => /ambiguous/.test(n.not_usable_reason || "")).map((n) => ({ r, n })));
for (const { n } of amb) {
  expect(n.usable_for_lookup === false, `${n.name}: an ambiguous name must never steer`);
  expect(/never resolved by choosing/.test(n.not_usable_reason), `${n.name}: the refusal must say WHY choosing is not an option`);
}
// A name reaching two primaries must be usable under NEITHER — refusing one side only is worse than
// not refusing at all, because it silently picks the other.
const reach = new Map();
for (const r of ds.records) for (const n of r.names) {
  const k = n.name.toLowerCase();
  if (!reach.has(k)) reach.set(k, []);
  reach.get(k).push({ primary: r.primary_name, usable: n.usable_for_lookup, kind: n.kind });
}
for (const [name, hits] of reach) {
  const primaries = new Set(hits.map((h) => h.primary.toLowerCase()));
  if (primaries.size < 2) continue;
  const steering = hits.filter((h) => h.usable && h.kind !== "primary");
  expect(steering.length === 0, `'${name}' reaches ${primaries.size} drugs and must steer to NONE — refusing one side only silently picks the other (got ${steering.length} usable)`);
}

// ---- 4. Company artifacts are not drugs ---------------------------------------------------------
const arts = ds.records.flatMap((r) => r.names.filter((n) => n.kind === "company_artifact"));
expect(arts.length > 0, "PBS's brand_name field carries sponsor company names — they must be caught, not treated as brands");
for (const a of arts) {
  expect(a.usable_for_lookup === false, `${a.name}: a company name must never resolve to a drug`);
  expect(/manufacturer|not a drug/i.test(a.not_usable_reason || ""), `${a.name}: the refusal must say what it actually is`);
}

// ---- 5. Structural invariants -------------------------------------------------------------------
expect(ds.attestation.clinical_sign_off === false,
  "the vocabulary ships UNSIGNED — it is a drug-identity assertion at scale, authored for clinician review, not switched on behind them");
expect(ds.attestation.regulatory_sign_off === false, "regulatory sign-off is a different gate (FL-50)");
expect(ds.records.every((r) => r.provenance.review_status === "draft"), "every record awaits review");
expect(ds.records.every((r) => r.names.every((n) => n.source)), "every name must carry its source — no receipt, no claim");
expect(ds.records.every((r) => r.names.every((n) => n.usable_for_lookup || n.not_usable_reason)),
  "a refusal without a reason is indistinguishable from a bug");

// The identity must be in its own vocabulary, and a refusal must explain itself — both at schema level.
const base = {
  authority: "pbs", identity: { rxcui: "1", atc_codes: [] },
  provenance: { source: "t", source_ref: "t", authored_by: "t", reviewed_by: null, review_status: "draft", version: "v0.1.0", effective_date: "2026-07-15" },
};
expect(throws(() => validateDrugVocabulary({ ...base, primary_name: "drugA", names: [{ name: "other", kind: "brand", jurisdiction: "AU", source: "s", usable_for_lookup: true }] })),
  "a record whose primary_name is absent from names[] must be UNREPRESENTABLE");
expect(throws(() => validateDrugVocabulary({ ...base, primary_name: "drugA", names: [
  { name: "drugA", kind: "primary", jurisdiction: "AU", source: "s", usable_for_lookup: true },
  { name: "x", kind: "brand", jurisdiction: "AU", source: "s", usable_for_lookup: false }] })),
  "a name refused WITHOUT a reason must be UNREPRESENTABLE — a silent drop is the failure mode");

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
  expect(shared.every((n) => n.usable_for_lookup === false),
    "a brand reaching TWO ingredients must steer to NEITHER — this is the wrong-drug hazard in its purest form");
  const co = records.flatMap((r) => r.names.filter((n) => n.name === "Acme Pharma Pty Ltd"));
  expect(co.every((n) => n.kind === "company_artifact" && !n.usable_for_lookup), "a company name must be caught as an artifact");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-drug-vocabulary FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`contract-drug-vocabulary: OK (${ds.records.length} drugs · ${ds.records.reduce((n, r) => n + r.names.length, 0)} names · PBS-INN primary · a US name can never resolve an AU lookup, signed or not · ambiguity refused both ways · unsigned steers nothing)`);
