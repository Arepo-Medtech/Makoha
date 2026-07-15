/**
 * Contract test — applying the vocabulary sign-off (V3).
 *
 * THIS SCRIPT TURNS A SPREADSHEET INTO A MEDICOLEGAL SIGNATURE. It is the point where a clinician's
 * name gets attached to 5,196 identity assertions, so every way it could attach that name to
 * something he did not read is a defect of the first order:
 *
 *   - TEXT DRIFT: he signed the rows the worksheet showed him. If the datastore moved, his signature
 *     does not transfer — applying it anyway launders new mappings through an old signature.
 *   - A BLANK: "I could not read his mark" must never become "approved".
 *   - AMEND/REJECT: his words, or his refusal. Neither is something a script gets to interpret.
 *   - THE RE-SEAL: applying MUTATES records, which invalidates the seal. R-46 is what happens when
 *     that is left to someone's memory.
 *
 * Run from repo root: node test/contract-vocabulary-apply.js
 */
import { apply } from "../scripts/pharm-vocabulary-apply-signoff.mjs";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };
const grab = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const ID = { reviewer: "Kenneth Lee", ahpra: "MED0001857758", utc: "2026-07-15" };
const AUTH_PBS = "PBS is the AU naming authority for brand → ingredient";
const AUTH_RX = "RxNorm's concept id (RxCUI) is the identity key";

/** A two-drug vocabulary: one steering former name, one brand, one ask. */
const recs = () => ([
  {
    primary_name: "furosemide",
    authority: "pbs",
    identity: { rxcui: "4603", atc_codes: ["C03CA01"] },
    names: [
      { name: "furosemide", kind: "primary", lookup_disposition: "steer", source: "PBS" },
      { name: "frusemide", kind: "former_name", lookup_disposition: "steer", source: "datastore" },
      { name: "Lasix", kind: "brand", lookup_disposition: "steer", source: "PBS brand_name" },
    ],
    provenance: { reviewed_by: null, review_status: "draft" },
  },
  {
    primary_name: "paracetamol",
    authority: "pbs",
    identity: { rxcui: "161", atc_codes: ["N02BE01"] },
    names: [
      { name: "paracetamol", kind: "primary", lookup_disposition: "steer", source: "PBS" },
      { name: "acetaminophen", kind: "international_generic", lookup_disposition: "confirm", confirm_prompt: "Is paracetamol what you mean?", source: "RxNorm" },
    ],
    provenance: { reviewed_by: null, review_status: "draft" },
  },
]);

const marks = (over = {}) => ({
  authority: [{ row: 2, key: AUTH_PBS, decision: "Attest", note: "" }, { row: 3, key: AUTH_RX, decision: "Attest", note: "" }],
  former: [{ row: 2, key: "frusemide", primary: "furosemide", decision: "Attest", note: "" }],
  ask: [{ row: 2, key: "acetaminophen", primary: "paracetamol", prompt: "Is paracetamol what you mean?", decision: "Attest", note: "" }],
  refuse: [],
  brands: [{ row: 2, key: "Lasix", primary: "furosemide", decision: "", note: "" }],
  ...over,
});

// ---- 1. The happy path: a fully-marked worksheet approves everything ---------------------------
{
  const r = apply(recs(), marks(), ID);
  expect(r.approved === 2 && r.held === 0, `a fully-marked worksheet must approve both records — got ${r.approved} approved / ${r.held} held`);
  expect(r.records.every((x) => x.provenance.review_status === "approved" && x.provenance.reviewed_by === "Kenneth Lee"),
    "every approved record must carry the reviewer and the approved status — that IS the attestation");
}

// ---- 2. TEXT DRIFT aborts the WHOLE apply, not just the drifted row ----------------------------
{
  // The datastore renamed the alias after the worksheet was signed.
  const moved = recs();
  moved[0].names[1].name = "furosemide-old";
  const msg = grab(() => apply(moved, marks(), ID));
  expect(!!msg && /TEXT DRIFT/.test(msg),
    "a name that changed since signing must abort — the clinician approved different words, so his signature does not transfer");
  expect(/refusing the WHOLE apply/.test(msg),
    "drift must abort the WHOLE apply, not skip the row: a partial apply signs the rows that happened to still match while hiding that the dataset moved underneath the signature");
}

// ---- 3. A CHANGED QUESTION is drift too — the question IS the artifact -------------------------
{
  const moved = recs();
  moved[1].names[1].confirm_prompt = "Did you mean something else entirely?";
  const msg = grab(() => apply(moved, marks(), ID));
  expect(!!msg && /TEXT DRIFT/.test(msg) && /QUESTION has changed/.test(msg),
    "an ask-prompt edited after signing must abort — what a patient gets asked is exactly what was attested, not a detail beside it");
}

// ---- 4. A BLANK on a decision sheet ABORTS ------------------------------------------------------
{
  const msg = grab(() => apply(recs(), marks({ former: [{ row: 2, key: "frusemide", primary: "furosemide", decision: "", note: "" }] }), ID));
  expect(!!msg && /BLANK decision/.test(msg),
    "a blank on the former-names sheet must ABORT — 'I could not read his mark' resolving to 'approved' is a fabricated attestation");
}

// ---- 5. A BLANK on the BRANDS sheet is a DECISION, not a gap -----------------------------------
// The asymmetry, asserted. Blank there means "no exception taken"; the sheet-1 ruling is the
// decision, made once rather than restated 3,635 times. Without this the review is intractable.
{
  const r = apply(recs(), marks(), ID);
  expect(r.approved === 2, "a blank brand cell must NOT block approval — the authority ruling covers it");
}

// ---- 6. …but ONLY because the PBS ruling was ATTESTED -------------------------------------------
// If the ruling is rejected, nothing covers the brands and the record cannot be approved. The
// coverage is checked, never assumed.
{
  const r = apply(recs(), marks({
    authority: [{ row: 2, key: AUTH_PBS, decision: "Reject", note: "PBS is not the authority" }, { row: 3, key: AUTH_RX, decision: "Attest", note: "" }],
  }), ID);
  expect(r.approved === 1 && r.held === 1,
    `rejecting the PBS ruling must HOLD every record carrying a brand — nothing else covers those 3,635 names. Got ${r.approved} approved / ${r.held} held.`);
  expect(r.holdReasons.some((h) => /Lasix/.test(h)), "the held record must name the brand that is now unattested");
}

// ---- 7. AMEND and REJECT are REPORTED, never applied --------------------------------------------
{
  const r = apply(recs(), marks({ former: [{ row: 2, key: "frusemide", primary: "furosemide", decision: "Amend", note: "should ask, not steer" }] }), ID);
  expect(r.amended.length === 1 && r.amended[0].note === "should ask, not steer", "an amendment must be reported with the clinician's own note");
  expect(r.held === 1, "a record with an amended name must be HELD, not approved — the amendment is his new words and goes back through the override table");
  expect(r.records.find((x) => x.primary_name === "furosemide").provenance.review_status === "draft",
    "an amended record must stay DRAFT — it keeps steering nothing, which is the safe default already in force");
}
{
  const r = apply(recs(), marks({ former: [{ row: 2, key: "frusemide", primary: "furosemide", decision: "Reject", note: "not a real alias" }] }), ID);
  expect(r.rejected.length === 1 && r.held === 1, "a rejection must be reported and must hold its record");
}

// ---- 8. An unrecognised mark ABORTS — it is never guessed ---------------------------------------
{
  const msg = grab(() => apply(recs(), marks({ former: [{ row: 2, key: "frusemide", primary: "furosemide", decision: "yes ok fine", note: "" }] }), ID));
  expect(!!msg && /unrecognised decision/.test(msg), "a mark the script cannot read must abort, never be interpreted charitably");
}

// ---- 9. A PRIMARY is never approved by inference ------------------------------------------------
// A name resolving to ITSELF redirects nothing — it is the drug's identity, not a mapping between
// two names. The worksheet never showed one, so nothing may pretend it was signed.
{
  const r = apply(recs(), marks(), ID);
  expect(r.approved === 2, "a primary must not block approval — it was correctly never a decision");
  expect(![...r.attested].some((k) => k.startsWith("furosemide␟")),
    "the primary name must NOT appear in the attested set — it was never on the worksheet, and inventing a signature for it is exactly the fabrication this suite exists to prevent");
}

// ---- 10. A drug the worksheet no longer matches is drift, not a silent skip ---------------------
{
  const gone = recs().slice(1); // furosemide removed from the vocabulary after signing
  const msg = grab(() => apply(gone, marks(), ID));
  expect(!!msg && /no longer in the vocabulary/.test(msg),
    "a signed row whose drug has vanished must abort — silently skipping it would report a clean apply over a vocabulary that moved");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-vocabulary-apply FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-vocabulary-apply: OK (text drift aborts the WHOLE apply · a changed QUESTION is drift · a blank decision aborts · a blank BRAND is the authority ruling, checked not assumed · amend/reject are reported and HELD, never applied · an unreadable mark aborts · a primary is never approved by inference)");
