/**
 * Contract test for THE EVIDENCE PLANE (E3, R-47b).
 *
 * WHAT THIS SUITE DEFENDS, on both sides:
 *
 *  A. THE EVIDENCE LANDS. R-47b's claim is that a consulting clinician must SEE every non_congruent
 *     dose's US/EU comparators verbatim — the AU-primacy ruling ships a differing AU dose on the
 *     stated assumption that the clinician weighed the divergence, and "weighed it" presumes they
 *     were shown it. Before E3 nothing showed it at runtime. Silence here is the failure mode.
 *
 *  B. THE AUTHORITATIVE FIELD STAYS SEALED. Advisory evidence must never become the AU dose.
 *     `PharmCheck.dose_guidance` remains the clinician-signed AU record alone. A US label reaching
 *     that field is the jurisdiction inversion the engine isolation exists to prevent.
 *
 * And the structural property both rest on: `engine.js` must NEVER gain a path to a foreign label.
 * That isolation is not enforced by a comment — it holds because no engine accessor exists. This
 * suite pins it, because it is exactly the kind of guarantee a later convenience import dissolves.
 *
 * Run from repo root: node test/contract-dose-evidence-plane.js
 */
import { readFileSync } from "node:fs";
import { DEFAULT_KM_SET } from "../mcp/servers/pharmacology/cds-adapter/opencds-client.js"; // the km_set rides into evidence as a PROVENANCE label — it must name the set that really produced it
import { assembleDoseEvidence, assertNoAdvisoryInDose, EVIDENCE_KINDS } from "../mcp/servers/pharmacology/dose-evidence-plane.js";
import { composeCdsVerdict } from "../mcp/servers/pharmacology/cds-adapter/index.js";
import { buildReviewBundle, verifyReviewBundle } from "../portal/review-bundle.js";
import { renderBundle, assertDoseEvidenceRendered } from "../portal/server.js";
import { runPharmCheck } from "../mcp/servers/pharmacology/engine.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// ---- 1. The AU dose reaches the clinician, with who signed it ----------------------------------
const mtx = assembleDoseEvidence("methotrexate");
const auDose = mtx.find((e) => e.kind === "au_dose_signed");
expect(!!auDose, "the clinician-signed AU dose must reach the evidence plane");
expect(auDose?.authority === "authoritative", "an ATTESTED AU dose is the one authoritative kind");
expect(auDose?.attested_by === "Kenneth Lee", "the AU dose must carry WHO attested it — an unattributed dose is not an attested one");
expect(auDose?.jurisdiction === "AU", "the AU dose must be labelled AU");
expect(auDose?.patient_facing === false, "no evidence-plane item is patient-facing");

// ---- 2. R-47b: the US/EU comparators are DISPLAYED, verbatim ------------------------------------
const labels = mtx.filter((e) => e.kind === "international_label");
expect(labels.length > 0, "R-47b: methotrexate's US/EU comparators must reach the clinician — the AU-primacy ruling assumes they saw them");
expect(labels.every((l) => l.authority === "advisory"), "a foreign label is ADVISORY — evidence beside the AU dose, never a verdict on it");
expect(labels.every((l) => ["US", "EU"].includes(l.jurisdiction)), "every foreign label must carry its jurisdiction");
expect(labels.every((l) => l.text && l.text.length > 10), "a comparator must carry its VERBATIM dose text, not a summary");
expect(labels.every((l) => /NOT an AU dose|NOT a current label/.test(l.note || "")), "every foreign label must state that it is not an AU dose");

// Verbatim, byte-for-byte against the register — a paraphrased label is a different claim.
const intlRegister = JSON.parse(readFileSync("mcp/servers/pharmacology/data/international-dose-guidance.json", "utf8")).records;
for (const l of labels) {
  const src = intlRegister.find((r) => r.amass_id === l.amass_id);
  expect(src && src.dose_statement === l.text, `${l.jurisdiction} comparator must be VERBATIM from the register, not rewritten`);
}

// A WITHDRAWN label must be marked as such — metformin's US comparator is withdrawn.
const withdrawn = assembleDoseEvidence("metformin").filter((e) => e.kind === "international_label" && e.status !== "ACTIVE");
expect(withdrawn.every((w) => /NOT a current label/.test(w.note || "")), "a WITHDRAWN label must say so — shown, but never as current");

// ---- 3. The congruence + plausibility reads surface, as flags not vetoes ------------------------
const cong = mtx.find((e) => e.kind === "congruence");
expect(cong?.status === "non_congruent", "methotrexate's congruence appraisal must surface");
expect(/AU has primacy|needs no justification/.test(cong?.text || ""), "the congruence item must state AU primacy — it is not the AU dose that must justify itself");

const carb = assembleDoseEvidence("carbamazepine");
const flag = carb.find((e) => e.kind === "plausibility" && e.status === "implausible");
expect(!!flag, "carbamazepine's order-of-magnitude flag must reach the clinician");
expect(/NOT a block|NOT a judgement/i.test(flag?.note || ""), "the plausibility flag must be a FLAG, never a veto — the clinician disposes");

// ---- 4. The literature reaches the clinician (261 signed PMIDs that reached nobody) -------------
const apix = assembleDoseEvidence("apixaban");
const lit = apix.filter((e) => e.kind === "literature");
expect(lit.length > 0, "clinician-signed literature dose evidence must reach the clinician — engine-isolated was silently doing the work of clinician-isolated");
expect(lit.every((l) => l.authority === "advisory"), "literature is advisory — a study finding is not a dose");
expect(lit.every((l) => l.citation?.identifier), "every literature item must carry its citation — no receipt, no claim");
expect(lit.every((l) => /not prescribing guidance/i.test(l.note || "")), "literature must state that it is not prescribing guidance");

// ---- 5. The CDS gateway's dose candidate now HAS a consumer -------------------------------------
const folded = composeCdsVerdict("PASS", { verdict: "PASS", reason: "ok", dose_guidance: { safe_dose_range: "5 mg daily" }, provider: "au_oss_cds", knowledge_module_set: DEFAULT_KM_SET });
expect(folded.status === "PASS", "the fold must stay monotone on status — unchanged");
expect(folded.evidence?.dose_candidate?.safe_dose_range === "5 mg daily", "the gateway's dose must now reach a consumer instead of the floor");

const withCds = assembleDoseEvidence("methotrexate", { cdsDoseCandidate: { safe_dose_range: "5 mg daily" }, cdsProvider: "au_oss_cds", cdsKmSet: DEFAULT_KM_SET });
const cand = withCds.find((e) => e.kind === "cds_dose_candidate");
expect(!!cand, "a CDS dose candidate must surface as advisory evidence");
expect(cand?.authority === "advisory", "a CDS candidate is a second OPINION, never the AU dose");
expect(/second independent executor/i.test(cand?.note || ""), "the CDS candidate must be framed as what it is");

// The fold must NOT invent evidence when the CDS layer produced no dose (HARD_FAIL drops it).
expect(composeCdsVerdict("PASS", { verdict: "HARD_FAIL", reason: "interaction", dose_guidance: null }).evidence === null,
  "no dose from the CDS layer → no evidence item; a blocked dose must never surface as a candidate");

// ---- 6. THE BAR: advisory evidence may never be the authoritative dose --------------------------
const intent = {
  intent_id: "int-e3-1", session_ref: "enc-e3-probe", intent_type: "new_prescription",
  drug_intent: { drug_name: "methotrexate", drug_class: "unspecified" }, patient_facts_ref: {},
  clinical_context: { patient_age_years: 45 }, mode: "mock",
};
const pc = runPharmCheck(intent, { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true });
expect(!throws(() => assertNoAdvisoryInDose(pc, mtx)), "the real pipeline pairing must pass the bar");

// Force the inversion: a US label emitted as the AU dose must THROW.
const usLabel = labels[0];
expect(
  throws(() => assertNoAdvisoryInDose({ dose_guidance: { safe_dose_range: usLabel.text } }, mtx)),
  "a US label emitted as PharmCheck.dose_guidance must THROW — that is the jurisdiction inversion the isolation prevents",
);
// The genuine AU dose in that field is fine — it is exactly what belongs there.
expect(
  !throws(() => assertNoAdvisoryInDose({ dose_guidance: { safe_dose_range: auDose.text } }, mtx)),
  "the clinician-signed AU dose IS the authoritative dose — the bar must not fire on it",
);

// ---- 7. STRUCTURAL: engine.js must have no path to a foreign label ------------------------------
// Not a style rule. international_dose_guidance's isolation holds because NO engine accessor exists;
// its own status field says the hard limit is "preserved by construction, not by wording". A single
// convenience import here would dissolve it silently, and every test above would still pass.
const engineSrc = readFileSync("mcp/servers/pharmacology/engine.js", "utf8");
expect(!/dose-evidence-plane/.test(engineSrc), "engine.js must NOT import the evidence plane — the plane reads foreign labels; the engine must never have a path to one");
expect(!/international/i.test(engineSrc), "engine.js must not reference international dose guidance at all");
const sourceSrc = readFileSync("mcp/servers/pharmacology/sources/pharm-data-source.js", "utf8");
expect(!/getInternationalDose|international-dose-guidance/.test(sourceSrc), "PharmDataSource must expose NO accessor for foreign labels — that absence IS the isolation");

// ---- 8. The bundle carries it, inside the hash --------------------------------------------------
const bundle = buildReviewBundle({
  run_id: "run-e3-00001",
  timestamp_utc: new Date().toISOString(),
  output: "candidate text",
  verification: { pass: true, results: [], missing_receipts: [], candidate_output_hash: "sha256:" + "a".repeat(64) },
  packet: { mode: "mock", receipts: [], evidence: [] },
  firewall_status: "PASS",
  continuation_blocked: false,
  hard_stops: [],
  dose_evidence: mtx,
});
expect(Array.isArray(bundle.dose_evidence) && bundle.dose_evidence.length === mtx.length, "the ReviewBundle must carry the evidence plane");
expect(verifyReviewBundle(bundle), "the bundle hash must verify");

// The hash must COVER it — that is what makes "the clinician saw the divergence" provable rather
// than presumed. If dose_evidence rode outside the hash, a surface could drop a comparator and the
// gate record would still look identical.
const tampered = { ...bundle, dose_evidence: bundle.dose_evidence.filter((e) => e.kind !== "international_label") };
expect(!verifyReviewBundle(tampered), "removing a comparator must BREAK bundle_sha256 — the evidence must be inside the medicolegal hash");

// An item cannot opt into being patient-facing.
expect(
  throws(() => buildReviewBundle({
    run_id: "run-e3-00002", timestamp_utc: new Date().toISOString(), output: "x",
    verification: { pass: true, results: [], missing_receipts: [], candidate_output_hash: "sha256:" + "b".repeat(64) },
    packet: { mode: "mock", receipts: [], evidence: [] }, continuation_blocked: false, hard_stops: [],
    dose_evidence: [{ ...labels[0], patient_facing: true }],
  })),
  "patient_facing:true must be UNREPRESENTABLE — the gate is the only route to a patient",
);

// ---- 9. THE §1.1 LIMIT: no dose text past a blocked firewall -----------------------------------
// The operator's own limit, in the section titled "Where the principle does NOT apply — the limits,
// held": "'Show the clinician everything' never becomes 'show a dose the firewall blocked'. No
// override, no exception." The first cut of the evidence plane surfaced the AU dose, both foreign
// labels and the literature doses on a HARD_FAIL — the principle does not dissolve the firewall.
for (const status of ["HARD_FAIL", "BLOCKED_NO_PROOF"]) {
  const gated = assembleDoseEvidence("methotrexate", { firewallStatus: status });
  expect(!gated.some((e) => e.kind === "au_dose_signed"), `${status}: the AU dose must NOT be shown past a blocked firewall`);
  expect(!gated.some((e) => e.kind === "international_label"), `${status}: a foreign label must NOT be shown past a blocked firewall — it is dose text`);
  expect(!gated.some((e) => e.kind === "literature"), `${status}: literature dose statements must NOT be shown past a blocked firewall`);
  expect(!gated.some((e) => e.kind === "cds_dose_candidate"), `${status}: a CDS candidate must NOT be shown past a blocked firewall`);
  // ── W2 (operator ruling 2026-07-15): RETAIN, do not destroy ──────────────────────────────────
  // *"Keep all guidance in an on-hold quarantine pathway, in-waiting to deliver when appropriate."*
  //
  // THIS CHANGES ONE BAR AND STRENGTHENS ANOTHER, and the difference is worth stating plainly because
  // it is the difference between the old design and this one:
  //
  //   BEFORE — the text was ABSENT from the payload. Safe by destruction: nothing to leak, and
  //            nothing to deliver either. A block meant the guidance was gone, and re-deriving it
  //            meant re-running the pipeline.
  //   NOW    — the text is HELD, in `quarantined_text`, with `released:false`. §1.1 is UNCHANGED:
  //            no dose is DISPLAYED past a blocked firewall. What changed is that "not displayed" no
  //            longer means "annihilated".
  //
  // Retention is only defensible because the refusal to display is MECHANICAL: portal
  // assertQuarantineHeld throws on any quarantined text that reaches the HTML, and renderBundle
  // self-verifies through it, so a page rendered another way cannot skip it.
  //
  // The FIELD NAME is the barrier. `text` means "R-47b DEMANDS this renders"; `quarantined_text`
  // means "assertQuarantineHeld DEMANDS it does not". Held guidance in `text` would make the two bars
  // fight — and R-47b would win, putting a blocked dose on screen.
  const blob = JSON.stringify(gated);
  expect(!gated.some((e) => e.text), `${status}: NOTHING may occupy the renderable \`text\` field past a blocked firewall — R-47b would force it onto the clinician's page`);
  expect(gated.every((e) => e.released === false), `${status}: every held item must be marked released:false — that flag is what the display bar keys on`);

  // The text IS retained — and is reachable ONLY through the quarantine channel.
  const q = gated.flatMap((e) => e.quarantined || []);
  expect(q.some((x) => x.quarantined_text === auDose.text), `${status}: the AU dose must be HELD (retained for delivery), not destroyed`);
  expect(q.some((x) => x.quarantined_text === labels[0].text), `${status}: the US label must be held too — all guidance, one pathway`);
  const outsideQuarantine = JSON.stringify(gated.map((e) => ({ ...e, quarantined: undefined })));
  expect(!outsideQuarantine.includes(auDose.text), `${status}: the AU dose text must exist ONLY inside the quarantine channel — never loose in the payload where a renderer could find it`);
  expect(!outsideQuarantine.includes(labels[0].text), `${status}: the US label text must exist ONLY inside the quarantine channel`);
  void blob;
}
// …AND the withholding is STATED. A gated action is legitimate; a silent drop is the exact failure
// the show-evidence principle names — "withheld" must never be indistinguishable from "we hold nothing".
const gatedHF = assembleDoseEvidence("methotrexate", { firewallStatus: "HARD_FAIL" });
expect(gatedHF.length === 1 && gatedHF[0].kind === "held", "a block must yield an ACCOUNT of what is withheld, not silence");
expect(/WITHHELD/.test(gatedHF[0].note) && /HARD_FAIL/.test(gatedHF[0].note), "the account must name the reason");
expect(/HELD IN QUARANTINE/.test(gatedHF[0].note), "the account must say the guidance is HELD — 'withheld' must not read as 'destroyed' either");
expect(/au_dose_signed/.test(gatedHF[0].note), "the account must state WHAT is held behind the block, so withheld is never read as absent");
expect(/delivered in full the moment the block is resolved/.test(gatedHF[0].note), "…and that it is in-waiting: the clinician must know resolving the block delivers it, not that it is gone");

// ---- 9b. THE QUARANTINE BAR MUST ACTUALLY RUN INSIDE renderBundle ------------------------------
// A bar nobody invokes is decoration. Deleting `assertQuarantineHeld(html, bundle)` from renderBundle
// left this suite GREEN until this test existed — the tamper sweep is the only reason I know.
//
// Proving the WIRING (not just the bar) needs a quarantined string the renderer genuinely puts on the
// page. The ingredient name is exactly that: it is rendered, so a bundle whose held text IS the
// ingredient must make renderBundle THROW — which it can only do if it calls the bar.
{
  const { renderBundle } = await import("../portal/server.js");
  const { buildReviewBundle } = await import("../portal/review-bundle.js");
  const { runPipeline } = await import("../verification/pipeline.js");
  const ID = { verified: true, clinician_id: "KL", ahpra_registration: "MED0001857758", idp: "test" };
  const base = buildReviewBundle(await runPipeline({ trunk: "8.0" }));

  // The probe must be a string the renderer GENUINELY PRINTS, or the bar is not exercised and the
  // test proves nothing. My first attempt used the ingredient name — which renderDoseEvidence does not
  // print for a held row, so nothing leaked, the bar correctly stayed silent, and the "wiring test"
  // was itself decoration. It prints `status`, `note` and `source`; `source` is the honest probe.
  const leaking = {
    ...base,
    dose_evidence: [{
      kind: "held", authority: "advisory", ingredient: "warfarin", status: "dose_text_withheld:HARD_FAIL",
      source: "ZZ-LEAK-PROBE-ZZ", released: false,   // ← rendered, so this simulates a real leak
      // Direction of error, deliberately: this bar false-POSITIVES toward throwing, which fails safe
      // (no page). A missed leak fails unsafe. Given the choice, it throws.
      quarantined: [{ of: "au_dose_signed", quarantined_text: "ZZ-LEAK-PROBE-ZZ", by: "KL" }],
      note: "DOSE TEXT WITHHELD, NOT DISCARDED — held in quarantine, delivered when the block clears.",
      patient_facing: false,
    }],
  };
  expect(throws(() => renderBundle(leaking, ID)),
    "renderBundle MUST self-verify through assertQuarantineHeld. If it does not, retaining blocked dose text is one rendering bug from a §1.1 violation — and retention is only defensible because the refusal to display is mechanical.");

  // …and the honest case still renders: held text absent, the ACCOUNT present.
  const honest = { ...base, dose_evidence: [{ ...leaking.dose_evidence[0], quarantined: [{ of: "au_dose_signed", quarantined_text: "ZZ-HELD-DOSE-TEXT-ZZ", by: "KL" }] }] };
  const html = renderBundle(honest, ID);
  expect(!html.includes("ZZ-HELD-DOSE-TEXT-ZZ"), "the held dose text must not be on the page");
  expect(html.includes("WITHHELD"), "…but the clinician MUST be told it is held — silence is the failure the principle names");
}

// Paediatric — same shape, same reason (threshold is <16 per the 2026-07-24 clinical decision).
const paed = assembleDoseEvidence("methotrexate", { firewallStatus: "PASS", ageYears: 9 });
expect(!paed.some((e) => e.kind === "au_dose_signed"), "paediatric: no dose text — no paediatric tables exist, under-16 is flagged for in-person review");
expect(/under 16|paediatric/i.test(paed[0]?.note || ""), "paediatric: the reason must be stated");
expect(assembleDoseEvidence("methotrexate", { firewallStatus: "PASS", ageYears: 45 }).some((e) => e.kind === "au_dose_signed"),
  "an adult on a PASS must still see the dose — the gate is the firewall, not age alone");

// Nothing held + blocked → nothing declared. A phantom "withheld" for a drug we hold nothing on
// would imply knowledge we do not have.
expect(assembleDoseEvidence("not-a-real-drug-xyz", { firewallStatus: "HARD_FAIL" }).length === 0,
  "a drug we hold nothing on must not declare a withholding — that would imply knowledge we lack");

// ---- 10. Absence is honest ---------------------------------------------------------------------
expect(assembleDoseEvidence("not-a-real-drug-xyz").length === 0, "a drug we hold nothing on yields NO evidence — never a fabricated one");
expect(assembleDoseEvidence("").length === 0, "no drug → no evidence");
expect(mtx.every((e) => EVIDENCE_KINDS.includes(e.kind)), "every item must be a declared kind");
expect(mtx.every((e) => e.source), "every item must carry provenance — no receipt, no claim");

// ---- 11. R-47b: THE RUNTIME SURFACE actually DISPLAYS it ---------------------------------------
// Carrying dose_evidence in the bundle is NOT R-47b. R-47's whole point is that an appraisal
// RECORDED but never DISPLAYED satisfies every schema, reads as done because the data is right there
// in the JSON, and quietly defeats Guardrail 2. The first cut of E3 did exactly that: the bundle
// carried the comparators and the portal's HTML rendered none of them. So the SURFACE is asserted.
{
  const ev = assembleDoseEvidence("methotrexate", { firewallStatus: "PASS" });
  const b = buildReviewBundle({
    run_id: "run-r47b-t01", timestamp_utc: new Date().toISOString(),
    output: "candidate", verification: { pass: true, results: [], missing_receipts: [], candidate_output_hash: "sha256:" + "d".repeat(64) },
    packet: { mode: "mock", receipts: [], evidence: [] },
    firewall_status: "PASS", continuation_blocked: false, hard_stops: [], dose_evidence: ev,
  });

  // The real rendered page, through the real server path.
  const html = renderBundle(b, { verified: true, clinician_id: "KL", ahpra_registration: "MED0001857758", idp: "test" });
  // Every item's text displayed — asserted by the exported bar, which compares against the ESCAPED
  // form (what actually reaches the browser). Using it here rather than a local copy of the escaper
  // means the test cannot drift from the real rendering.
  expect(!throws(() => assertDoseEvidenceRendered(html, b)), "R-47b: every dose-evidence item the bundle carries must be DISPLAYED on the runtime surface");
  expect(/JYLAMVO/.test(html), "R-47b: the US comparator's verbatim label text must reach the page — this is the divergence the AU-primacy ruling assumes was seen");
  expect(/once weekly/.test(html), "R-47b: the clinician-signed AU dose must be DISPLAYED");
  expect(/AU has primacy/.test(html), "R-47b: the surface must state AU primacy — a foreign label must not read as questioning the AU dose");
  expect(/never a verdict on the AU dose/.test(html), "R-47b: foreign labels must be framed as evidence, never as a verdict");
  expect(/authoritative/.test(html) && /advisory/.test(html), "R-47b: the surface must distinguish the authoritative dose from advisory evidence");

  // THE BAR: a surface that drops a comparator must THROW, not ship.
  expect(
    throws(() => assertDoseEvidenceRendered("<html>everything except the foreign label</html>", b)),
    "R-47b: a surface that RECORDS a comparator but does not DISPLAY it must THROW — that is the whole failure mode",
  );
  expect(!throws(() => assertDoseEvidenceRendered(html, b)), "the real rendered surface must pass its own bar");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-dose-evidence-plane FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`contract-dose-evidence-plane: OK (R-47b — comparators DISPLAYED verbatim · advisory can never be the AU dose · engine has no path to a foreign label · evidence inside bundle_sha256)`);
