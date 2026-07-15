/**
 * Contract test for DoseGuidanceSchema (FL dose-guidance C0).
 *
 * dose_guidance is THE sensitive capability: it is the only datastore content that becomes a
 * dose, so the "no dosages from the LLM" / "no autonomous prescription" hard limits are only as
 * strong as this schema. These tests assert the bars are MECHANICAL — that a bad record fails to
 * PARSE — rather than relying on a convention an authoring pass could forget.
 *
 * The four things proven here:
 *  1. an agent cannot author a dose (entered_by must be an AHPRA id on the clinician channel);
 *  2. a channel cannot be laundered (APF attestation must cite apf22; PI must cite a PI doc + when);
 *  3. a NON-CONGRUENT AU dose SHIPS, carrying its appraisal — because AU, US and EU labels
 *     legitimately differ, and letting a foreign regulator veto an AU dose would invert the
 *     jurisdiction rule (operator ruling 2026-07-15, superseding the original binning gate);
 *  4. the appraisal cannot be skipped silently, faked against nothing, or mis-stamped;
 *  5. a foreign label cannot masquerade as an AU dose (InternationalDoseGuidanceSchema).
 *
 * Run from repo root: node test/contract-dose-guidance-schema.js
 */
import { DoseGuidanceSchema, validateDoseGuidance, InternationalDoseGuidanceSchema, validateInternationalDoseGuidance, CAPABILITY_VALIDATORS } from "../mcp/servers/pharmacology/domain/model.js";
import { CAPABILITY_FILE } from "../scripts/pharm-author.mjs";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

/** Assert a record PARSES. */
const ok = (rec, msg) => {
  const r = DoseGuidanceSchema.safeParse(rec);
  expect(r.success, `${msg} — expected parse OK, got: ${r.success ? "" : r.error.issues.map((i) => i.message).join("; ")}`);
};
/** Assert a record is REJECTED, and that the rejection mentions `hint` (so a record can't fail
 *  for an unrelated reason and let us believe the intended bar is holding). */
const rejects = (rec, hint, msg) => {
  const r = DoseGuidanceSchema.safeParse(rec);
  if (r.success) { errors.push(`${msg} — expected REJECT, but it parsed`); return; }
  const all = r.error.issues.map((i) => i.message).join("; ");
  expect(all.toLowerCase().includes(hint.toLowerCase()), `${msg} — rejected, but not for the expected reason (wanted /${hint}/, got: ${all})`);
};

const provenance = {
  source: "APF22 Section D (facts, cited)",
  source_ref: "apf22",
  authored_by: "clinician worksheet entry",
  reviewed_by: "Kenneth Lee",
  review_status: "approved",
  version: "v0.1.0",
  effective_date: "2026-07-15",
};

/** A minimal VALID record: clinician-entered APF22 fact, AMASS-agreed. */
const SRC = "500 mg every 8 hours";
const base = () => ({
  ingredient: "amoxicillin",
  context: "adult — APF22 Section D common dosage range",
  source_statement: SRC,
  indication_status: "absent",
  dose_lines: [{ indication: null, route: null, statement: SRC, basis: "flat_mg", plausibility: "plausible" }],
  safe_dose_range: SRC,
  origin: {
    channel: "clinician_apf_attestation",
    reference: "apf22",
    entered_by: "MED0001857758",
  },
  au_congruence: {
    status: "congruent",
    appraised_utc: "2026-07-15T00:00:00Z",
    comparators: [{ jurisdiction: "US", agency: "FDA", amass_id: "AMRC_example", dose_statement: "500 mg every 8 hours" }],
  },
  provenance,
});

// ---- 0. the happy paths parse -------------------------------------------------------------
ok(base(), "valid clinician_apf_attestation record");
ok({ ...base(), origin: { channel: "tga_pi", reference: "PI-AUST-R-12345-v3", entered_by: "tga-pi-fetch-job", retrieved_utc: "2026-07-15T00:00:00Z" } },
  "valid tga_pi record");
ok({ ...base(), au_congruence: { status: "no_comparator", appraised_utc: "2026-07-15T00:00:00Z", comparators: [], appraisal_note: "AU-only product; no FDA/EMA authorisation exists" } },
  "valid record where no US/EU comparator exists");
ok({ ...base(), corroborating_evidence: [{ identifier: "37712551", id_type: "pmid" }] },
  "valid record linking the signed dose-evidence register");

// ---- 1. AN AGENT CANNOT AUTHOR A DOSE -----------------------------------------------------
// The core bar. entered_by must be an AHPRA registration id; no agent string can match it.
for (const impostor of ["claude-fable-5 (agent)", "claude-fable-5", "agent", "Kenneth Lee", "KL", "med0001857758", "MED123"]) {
  rejects({ ...base(), origin: { ...base().origin, entered_by: impostor } }, "AHPRA",
    `agent/non-AHPRA entered_by "${impostor}" must be rejected`);
}
ok({ ...base(), origin: { ...base().origin, entered_by: "PHA0001234567" } },
  "a different valid AHPRA prefix (pharmacist) is accepted");

// ---- 2. A CHANNEL CANNOT BE LAUNDERED -----------------------------------------------------
rejects({ ...base(), origin: { ...base().origin, reference: "tga-pi" } }, "apf22",
  "APF attestation citing a non-apf22 reference must be rejected (would launder a non-APF number through the APF attestation)");
rejects({ ...base(), origin: { channel: "tga_pi", reference: "apf22", entered_by: "job", retrieved_utc: "2026-07-15T00:00:00Z" } }, "not \"apf22\"",
  "tga_pi citing apf22 must be rejected");
rejects({ ...base(), origin: { channel: "tga_pi", reference: "PI-AUST-R-12345-v3", entered_by: "tga-pi-fetch-job" } }, "retrieved_utc",
  "tga_pi without retrieved_utc must be rejected (a versioned document needs a retrieval time to be re-verifiable)");
rejects({ ...base(), origin: { ...base().origin, retrieved_utc: "2026-07-15T00:00:00Z" } }, "not a retrieval",
  "a clinician attestation carrying retrieved_utc must be rejected");
rejects({ ...base(), origin: { channel: "amass", reference: "apf22", entered_by: "MED0001857758" } }, "invalid",
  "a third origin channel must not exist — AMASS can never be an origin");

// ---- 3. A NON-CONGRUENT AU DOSE SHIPS (the 2026-07-15 reversal) ---------------------------
// The original schema OMITTED "diverges" so a differing AU dose could not be written. That
// inverted the jurisdiction rule: an AU dose's authority is APF22/TGA PI, and a US/EU label has
// no standing to veto it. Divergence is the NORMAL case (different approved indications), so
// binning on it was over-triage. These tests pin the reversal so it is not silently undone.
ok({ ...base(), au_congruence: { status: "non_congruent", appraised_utc: "2026-07-15T00:00:00Z",
      comparators: [{ jurisdiction: "US", agency: "FDA", amass_id: "AMRC_x", dose_statement: "875 mg twice daily" }],
      appraisal_note: "US label is dosed for a different approved indication; the AU range follows the APF22 respiratory-infection entry." } },
  "a NON-CONGRUENT AU dose must SHIP, carrying its appraisal — a foreign label may not veto an AU dose");
ok({ ...base(), au_congruence: { status: "non_congruent", appraised_utc: "2026-07-15T00:00:00Z",
      comparators: [
        { jurisdiction: "US", agency: "FDA", amass_id: "AMRC_x", dose_statement: "875 mg twice daily" },
        { jurisdiction: "EU", agency: "EMA", amass_id: "AMRC_y", dose_statement: "1 g three times daily" },
      ],
      appraisal_note: "AU, US and EU labels all differ; AU follows APF22." } },
  "non-congruence against BOTH US and EU still ships");
// AU PRIMACY (operator ruling 2026-07-15, second correction): non_congruent needs NO note. An AU
// dose does not justify itself to a foreign regulator — demanding an explanation would make the
// foreign label the default and AU the deviation, the same inversion the veto removal fixed. And in
// Channel B the explainer would be the AGENT, authoring clinical reasoning it does not have.
ok({ ...base(), au_congruence: { status: "non_congruent", appraised_utc: "2026-07-15T00:00:00Z",
      comparators: [{ jurisdiction: "US", agency: "FDA", amass_id: "AMRC_x", dose_statement: "875 mg twice daily" }] } },
  "non_congruent WITHOUT an appraisal_note must SHIP — the AU clinician is the final authority and does not explain themselves to the FDA");
ok({ ...base(), au_congruence: { status: "congruent", appraised_utc: "2026-07-15T00:00:00Z",
      comparators: [{ jurisdiction: "US", agency: "FDA", amass_id: "AMRC_x", dose_statement: "500 mg every 8 hours" }],
      appraisal_note: "identical" } },
  "an appraisal_note remains ALLOWED when someone chooses to record context");

// ---- 4. THE APPRAISAL CANNOT BE SKIPPED, FAKED, OR MIS-STAMPED ------------------------------
rejects({ ...base(), au_congruence: undefined }, "required",
  "au_congruence is mandatory — you must have looked, even to record that no comparator exists");
rejects({ ...base(), au_congruence: { status: "congruent", appraised_utc: "2026-07-15T00:00:00Z", comparators: [] } }, "unfalsifiable",
  '"congruent" against no comparator must be rejected');
rejects({ ...base(), au_congruence: { status: "no_comparator", appraised_utc: "2026-07-15T00:00:00Z", comparators: [] } }, "must state why",
  '"no_comparator" without a reason must be rejected — unlike non_congruent, this is a claim about THE SEARCH (mechanical, verifiable) and is what stops anyone claiming "no comparator" to skip the appraisal');
rejects({ ...base(), au_congruence: { status: "no_comparator", appraised_utc: "2026-07-15T00:00:00Z",
      comparators: [{ jurisdiction: "US", agency: "FDA", amass_id: "AMRC_x", dose_statement: "875 mg BD" }], appraisal_note: "none" } }, "cannot carry comparators",
  '"no_comparator" carrying a comparator must be rejected');
rejects({ ...base(), au_congruence: { status: "congruent", appraised_utc: "2026-07-15T00:00:00Z",
      comparators: [{ jurisdiction: "EU", agency: "FDA", amass_id: "AMRC_x", dose_statement: "x" }] } }, "must carry agency EMA",
  "a jurisdiction/agency mismatch must be rejected (mis-stamped provenance)");

// ---- 5. envelope discipline ----------------------------------------------------------------
rejects({ ...base(), safe_dose_range: undefined }, "required", "a record without a dose is not a dose record");

// ---- 7. THE SUBSTRING BAR (C2b) — the segmenter may CUT, never WRITE ------------------------
// The one mechanical rule that binds the MACHINE rather than the clinician. It is the inverse of
// the bars removed from this schema: it does not bin a dose or demand justification for one — it
// guarantees everything SHOWN traces to something the clinician actually wrote.
const MULTI = "Ulcerative colitis: 2–4 g daily. Rheumatoid arthritis: Initially 500 mg daily.";
const multi = () => ({ ...base(), source_statement: MULTI, safe_dose_range: MULTI, indication_status: "present",
  dose_lines: [
    { indication: "Ulcerative colitis", route: null, statement: "2–4 g daily.", basis: "flat_mg", plausibility: "plausible" },
    { indication: "Rheumatoid arthritis", route: null, statement: "Initially 500 mg daily.", basis: "flat_mg", plausibility: "plausible" },
  ] });
ok(multi(), "a multi-indication record with verbatim-substring lines parses");
rejects({ ...multi(), dose_lines: [{ indication: "Ulcerative colitis", route: null, statement: "2-4 grams daily", basis: "flat_mg", plausibility: "plausible" }] },
  "VERBATIM SUBSTRING", "a PARAPHRASED dose line must be rejected — the segmenter may not rewrite the clinician's words");
rejects({ ...multi(), dose_lines: [{ indication: "Crohn disease", route: null, statement: "2–4 g daily.", basis: "flat_mg", plausibility: "plausible" }] },
  "indication must be a VERBATIM SUBSTRING", "an INVENTED indication must be rejected — an indication the clinician did not write cannot be attached to their dose");
rejects({ ...base(), safe_dose_range: "500 mg q8h" }, "must BE source_statement verbatim",
  "safe_dose_range must equal source_statement — the engine emits the whole range and selects nothing (getDoseGuidance is indication-blind, so picking a line risks the wrong indication's dose)");
rejects({ ...base(), indication_status: "present" }, "no dose line names an indication", '"present" with no indication-bearing line is rejected');
rejects({ ...multi(), indication_status: "absent" }, "contradicts", '"absent" contradicting an indication-bearing line is rejected');
rejects({ ...base(), dose_lines: [] }, "at least 1", "a record must carry at least one dose line — showing nothing is not an option");

// A "mixed"-basis line is FIRST-CLASS: phenytoin carries both 4–5 mg/kg and a flat 200–500 mg, and
// reporting both is the point. The old rule saw "/kg" and discarded the flat mg — hiding the very
// numbers a misplaced zero lands on.
const PHEN = "Anticonvulsant: Oral, initially 4–5 mg/kg daily. Usual maintenance dose 200–500 mg daily.";
ok({ ...base(), source_statement: PHEN, safe_dose_range: PHEN, indication_status: "present",
  dose_lines: [{ indication: "Anticonvulsant", route: "Oral", statement: "Oral, initially 4–5 mg/kg daily. Usual maintenance dose 200–500 mg daily.", basis: "mixed", plausibility: "plausible" }] },
  "a MIXED-basis line (mg/kg AND flat mg) parses — both dosing methods are shown, neither hidden");
ok({ ...base(), dose_lines: [{ indication: null, route: null, statement: SRC, basis: "flat_mg", plausibility: "unassessable", plausibility_note: "no comparator" }] },
  "an unassessable line still SHIPS — the dose is shown, the absence of a plausibility claim is stated");
rejects({ ...base(), provenance: undefined }, "required", "Guardrail 5 — an anonymous dose fact cannot sit in the store");
rejects({ ...base(), amass_says: "500 mg" }, "Unrecognized", "strict(): an unknown key must not ride along");

// ---- 5b. A FOREIGN LABEL CANNOT MASQUERADE AS AN AU DOSE ------------------------------------
const intl = () => ({
  ingredient: "methotrexate", jurisdiction: "EU", agency: "EMA",
  context: "Active rheumatoid arthritis in adults", dose_statement: "7.5 mg once weekly",
  amass_id: "AMRC_1b7jWbEDFeccd6RkJS01idTnGGk", authorisation_name: "Jylamvo",
  authorization_status: "ACTIVE",
  retrieved_utc: "2026-07-15T00:00:00Z", not_au_dose_guidance: true,
  provenance: { ...provenance, source: "AMASS RegulatoryCore (EMA SmPC facts, cited)", source_ref: "amass-regulatory" },
});
expect(InternationalDoseGuidanceSchema.safeParse(intl()).success, "a valid EU label record must parse");
expect(!InternationalDoseGuidanceSchema.safeParse({ ...intl(), agency: "FDA" }).success, "EU jurisdiction with FDA agency must be rejected");
expect(!InternationalDoseGuidanceSchema.safeParse({ ...intl(), not_au_dose_guidance: undefined }).success,
  "not_au_dose_guidance is a structural literal — a foreign label must declare it is not an AU dose");
expect(!InternationalDoseGuidanceSchema.safeParse({ ...intl(), not_au_dose_guidance: false }).success,
  "not_au_dose_guidance:false must be rejected");
expect(!InternationalDoseGuidanceSchema.safeParse({ ...intl(), provenance: { ...intl().provenance, source_ref: "apf22" } }).success,
  "a foreign label citing apf22 must be rejected — it must cite the registered amass-regulatory route");
expect(!InternationalDoseGuidanceSchema.safeParse({ ...intl(), safe_dose_range: "7.5 mg weekly" }).success,
  "strict(): a foreign record must not carry safe_dose_range — that key belongs to AU dose_guidance alone");
expect(CAPABILITY_VALIDATORS.international_dose_guidance === validateInternationalDoseGuidance,
  "international_dose_guidance must be registered in CAPABILITY_VALIDATORS");
// authorization_status is REQUIRED and shown (C2c). Several older generics have no ACTIVE
// monosubstance authorisation at all — metformin's only citable FDA label is WITHDRAWN — so a dose
// read as current when its label was withdrawn is exactly the quiet staleness this surfaces.
expect(!InternationalDoseGuidanceSchema.safeParse({ ...intl(), authorization_status: undefined }).success,
  "authorization_status is required — a withdrawn label must not be presented as current");
expect(InternationalDoseGuidanceSchema.safeParse({ ...intl(), authorization_status: "WITHDRAWN_VOLUNTARY" }).success,
  "a WITHDRAWN label record is ACCEPTED — it is real evidence, shown with its status, not hidden");

// ---- 5c. ROUTING (C1) — an AU dose may NEVER enter via the generic agent round-trip ---------
// CAPABILITY_FILE is what scripts/pharm-ingest.mjs routes on. international_dose_guidance IS
// routable: it is agent-retrieved from AMASS and engine-isolated, so ingesting it can never put a
// foreign dose on the AU dose path (the dose_evidence precedent).
expect(CAPABILITY_FILE.international_dose_guidance === "international-dose-guidance.json",
  "international_dose_guidance must be routable through pharm-ingest (agent-retrieved, engine-isolated)");
// dose_guidance must NOT be. This is DEFENCE IN DEPTH behind the AHPRA gate, and it matters: the
// AHPRA check is a PATTERN check, not an identity check — MED0001857758 is committed all over this
// repo, so an agent that could reach the generic round-trip could author a dev-package quoting it and
// pass the schema. Keeping dose_guidance off the ingest route means an AU dose cannot enter that way
// AT ALL: only clinician worksheet entry (Channel B) or a fetched TGA PI (Channel A).
expect(CAPABILITY_FILE.dose_guidance === undefined,
  "dose_guidance must NOT be routable through pharm-ingest — an AU dose enters ONLY via Channel B (clinician worksheet) or Channel A (fetched TGA PI). Adding it here would let an agent author a dose through the generic round-trip quoting a known AHPRA id.");

// ---- 6. wiring ------------------------------------------------------------------------------
expect(CAPABILITY_VALIDATORS.dose_guidance === validateDoseGuidance,
  "dose_guidance must be registered in CAPABILITY_VALIDATORS so the authoring pipeline gates it");
try {
  validateDoseGuidance({ ...base(), origin: { ...base().origin, entered_by: "claude-fable-5 (agent)" } });
  errors.push("validateDoseGuidance must THROW on an agent-authored dose");
} catch (e) {
  expect(/AHPRA/.test(e.message), `validateDoseGuidance threw, but not for the AHPRA bar: ${e.message}`);
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-dose-guidance-schema FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-dose-guidance-schema: OK");
