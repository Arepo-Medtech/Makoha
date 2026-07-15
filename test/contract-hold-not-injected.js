/**
 * Contract test — HELD GUIDANCE MUST NEVER REACH THE MODEL (D-A-3).
 *
 * OPERATOR, 2026-07-15: *"no context injection allowed — not to affect posture stability."*
 *
 * ══ THE RISK THIS GUARDS, AND WHY IT IS NOT §1.1's ══
 * §1.1 protects the CLINICIAN from acting on a dose the firewall blocked. It says nothing about the
 * MODEL, and until this bar existed, nothing did.
 *
 * A dose in a context packet is not a disclosure — it is an ANCHOR. It does not inform the model, it
 * SETS it, and the output flows back to the clinician wearing the authority of an independent read.
 * That is the correlated-bias loop the whole trunk risk model exists to break. M1 blocks a
 * clinical_assessment anchor; this blocks a DOSE anchor — a number, which is the most anchoring thing
 * you can hand a next-token predictor.
 *
 * ══ WHY THE BAR EXISTS AT ALL, GIVEN THE PROPERTY ALREADY HOLDS ══
 * `contextInjection(plan, receipts, meta)` is never handed `dose_evidence`. The planes cannot meet.
 * That is an argument's worth of safety resting on a FUNCTION SIGNATURE — the M1 shape exactly:
 * *"the property holds TODAY, BY CONSTRUCTION — and nothing asserts it. That is an accident, not a
 * guarantee."* The day someone widens the packet to "give the model more context", this throws.
 *
 * And unlike a rendering leak, this one is INVISIBLE: an anchored model does not look anchored. It
 * looks confident. There is no downstream symptom to notice.
 *
 * Run from repo root: node test/contract-hold-not-injected.js
 */
import { assertHoldNotInjected, assertMemoUnactionable, assembleDoseEvidence } from "../mcp/servers/pharmacology/dose-evidence-plane.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const HELD_TEXT = "Initially 5-10 mg daily; maintenance 1-10 mg in accordance with INR.";
const held = (extra = {}) => ({
  kind: "held", authority: "advisory", ingredient: "warfarin", status: "dose_text_withheld:HARD_FAIL",
  source: "dose-evidence-plane (firewall gate)", released: false,
  quarantined: [{ of: "au_dose_signed", quarantined_text: HELD_TEXT, by: "KL" }],
  note: "DOSE TEXT WITHHELD, NOT DISCARDED — held in quarantine.", patient_facing: false, ...extra,
});

// ---- 1. THE BAR BITES. A held dose in a packet must THROW. ------------------------------------
{
  const anchored = { trunk_id: "8.0", facts: [{ fact_id: "f-1", category: "medication", label: "warfarin", value: HELD_TEXT }], evidence: [] };
  expect(throws(() => assertHoldNotInjected(anchored, [held()])),
    "a held dose in the context packet MUST throw. This is the only bar between the quarantine and the model — and an anchored model has no symptom: it does not look anchored, it looks confident.");
}

// ---- 2. …wherever it hides. The packet is searched whole, not field by field. -----------------
{
  // A future 'helpful' wiring would not put it in a tidy field. It would arrive inside an evidence
  // note, a constraint string, a summary — anywhere. Field-scoped checking is how a leak survives.
  const sneaky = { trunk_id: "8.0", facts: [], evidence: [{ claim: `Prior guidance: ${HELD_TEXT}`, supports: [] }] };
  expect(throws(() => assertHoldNotInjected(sneaky, [held()])),
    "the whole packet is the surface — a held dose buried in an evidence claim anchors exactly as hard as one in a fact");
}

// ---- 3. A RELEASED item is not held, and must NOT trip the bar --------------------------------
{
  // The quarantine's whole purpose is delivery when the block clears. If release did not lift the
  // bar, the bar would forbid the thing the design exists to permit.
  const packet = { trunk_id: "8.0", facts: [{ fact_id: "f-1", category: "medication", label: "warfarin", value: HELD_TEXT }], evidence: [] };
  expect(!throws(() => assertHoldNotInjected(packet, [held({ released: true })])),
    "a RELEASED item is no longer held — the bar must not fire on it, or 'in-waiting to deliver' becomes 'never deliverable'");
}

// ---- 4. The honest case passes ----------------------------------------------------------------
{
  const clean = { trunk_id: "8.0", facts: [{ fact_id: "f-1", category: "medication", label: "warfarin", value: "taking warfarin" }], evidence: [] };
  expect(!throws(() => assertHoldNotInjected(clean, [held()])),
    "a packet that does not carry the held text must pass — a bar that fires on clean input gets switched off, and then the real leak ships");
}

// ---- 5. THE LIVE PIPELINE: the two planes really are separate ---------------------------------
// Not asserted from the call signature — MEASURED, on a real run that produces a real hold.
{
  const r = await runPipeline({
    trunk: "8.0",
    pharm_intent: {
      intent_id: "i-000001", session_ref: "enc-000001", intent_type: "new_prescription",
      drug_intent: { drug_name: "warfarin", drug_class: "anticoagulant" },
      patient_facts_ref: {}, clinical_context: { patient_age_years: 60 }, mode: "mock",
    },
    resolved_facts: { allergens: [], current_medications: ["amiodarone"], egfr_ml_min: 90, patient_age_years: 60 },
  });

  const heldItems = (r.dose_evidence || []).filter((e) => !e.released && Array.isArray(e.quarantined));
  expect(heldItems.length > 0, "fixture: this run must produce a real hold (warfarin + amiodarone → HARD_FAIL), or the test proves nothing");

  const packetBlob = JSON.stringify(r.packet ?? {});
  for (const e of heldItems) {
    for (const q of e.quarantined) {
      expect(!packetBlob.includes(q.quarantined_text),
        `LIVE: a ${q.of} dose is held for ${e.ingredient} AND its text is in the packet the model sees. The clinician plane has leaked into the model plane.`);
    }
  }
  expect(heldItems.some((e) => e.quarantined.length > 0), "the hold must actually carry the guidance — an empty hold would pass this test while delivering nothing");
}

// ---- 6. The bar RUNS IN THE PIPELINE — not merely available ----------------------------------
// A bar a caller must remember is a bar that stops running. Proven by construction rather than by
// reading the source: a pipeline that did NOT call it would let this poisoned run through.
{
  const src = await import("node:fs").then((fs) => fs.readFileSync("verification/pipeline.js", "utf8"));
  expect(/assertHoldNotInjected\(packet, dose_evidence\)/.test(src),
    "runPipeline must call the bar between sealing the packet and generation — that is the last moment both planes are in scope, and the only place the check can be made");
  const beforeGen = src.indexOf("assertHoldNotInjected(packet, dose_evidence)") < src.indexOf("generate_candidate");
  expect(beforeGen, "…and it must run BEFORE generation: a bar that fires after the model has already read the packet is an audit note, not a firewall");
}

// ---- 7. D-A-2: the hold DECLARES what it is ---------------------------------------------------
// These were conventions dressed as mechanisms — the distinction lived in a field NAME and a
// comment. An enum a validator can read, and a declared bar a test can enforce, are not the same
// kind of thing as a naming habit.
{
  const ev = assembleDoseEvidence("warfarin", { firewallStatus: "HARD_FAIL", ageYears: 60 });
  const h = ev.find((e) => e.kind === "held");
  expect(!!h, "fixture: a blocked firewall must produce a hold");
  expect(h.hold_class === "cds_pre_load_hypothesis",
    "the hold must DECLARE its class. `hypothesis` is not a new register — M4 already established it: a claim the model cannot anchor is a hypothesis, not a finding. `pre_load` names the STATE (staged, not delivered), which is what makes 'in-waiting' a property of the data rather than a promise in prose.");
  expect(h.context_injection === "forbidden",
    "the hold must DECLARE the posture bar. assertHoldNotInjected enforces it; declaring it means a reader — and a schema — can see the rule without reading the enforcement.");
  expect(h.released === false && h.patient_facing === false,
    "a hold is never released and never patient-facing on its own — those are the two flags every downstream gate keys on");
}

// ---- 8. D-A-4: the memo carries no dose -------------------------------------------------------
{
  const ev = assembleDoseEvidence("warfarin", { firewallStatus: "HARD_FAIL", ageYears: 60,
    cdsDoseCandidate: { safe_dose_range: HELD_TEXT }, cdsProvider: "au_oss_cds", cdsKmSet: "fl30-kb:v2" });
  const h = ev.find((e) => e.kind === "held");
  expect(!!h.memo, "a hold must carry a memo — the abbreviated account is what a clinician reads");
  for (const q of h.quarantined) {
    expect(!h.memo.includes(q.quarantined_text), `the memo must not quote the ${q.of} dose it withholds`);
    expect(!h.note.includes(q.quarantined_text), `the note must not quote the ${q.of} dose it withholds`);
  }
  expect(/held/.test(h.memo) && /released when the block clears/.test(h.memo),
    "the memo must say what is held AND that it is in-waiting — 'withheld' must read as neither 'absent' nor 'destroyed'");

  // The bar bites on a memo built wrong.
  expect(throws(() => assertMemoUnactionable([{ ...h, memo: `held: ${HELD_TEXT}` }])),
    "a memo that quotes its own held dose must THROW. This is defence in depth: assertQuarantineHeld only runs on surfaces that call it, and a future export will not — a memo that CANNOT contain a dose is safe on a surface that forgot the bar.");
  expect(!throws(() => assertMemoUnactionable([{ ...h, released: true, memo: `held: ${HELD_TEXT}` }])),
    "…but a RELEASED item is not withholding anything, so the bar must not fire on it");
}

// ---- 9. The memo bar RUNS in the pipeline ------------------------------------------------------
{
  const src = await import("node:fs").then((fs) => fs.readFileSync("verification/pipeline.js", "utf8"));
  expect(/assertMemoUnactionable\(dose_evidence\)/.test(src),
    "runPipeline must call the memo bar — a bar a caller must remember to invoke is a bar that stops running the first time someone assembles evidence another way");
}

// ---- 10. D-A-1: §1.1 MAY NOT NAME A BAR THAT DOES NOT EXIST -----------------------------------
// The trunk lesson, applied to the principle itself. The trunks claimed "(enforced by verification)"
// for `no diagnosis` and it was FALSE — the verifier has no such check. contract-trunk-claims now
// makes that structural: a prompt cannot name a bar verifier.js does not have.
//
// §1.1 now carries a MECHANICAL list. The same rule applies to it, and for the same reason: an
// overclaiming constraint is worse than an honest one, because people trust it. If someone deletes a
// bar, §1.1 must go red rather than keep promising it.
{
  const fs = await import("node:fs");
  const doc = fs.readFileSync(".planning/SHOW-EVIDENCE-PRINCIPLE.md", "utf8");
  const mech = doc.slice(doc.indexOf("**MECHANICAL —"), doc.indexOf("**CONVENTIONAL —"));
  expect(mech.length > 0, "§1.1 must carry a MECHANICAL list — the honest count is the amendment's whole point");

  const named = [...mech.matchAll(/`(assert[A-Za-z]+)\(\)`/g)].map((m) => m[1]);
  expect(named.length >= 4, `§1.1's MECHANICAL list must name its bars (found ${named.length})`);

  const plane = fs.readFileSync("mcp/servers/pharmacology/dose-evidence-plane.js", "utf8");
  const portal = fs.readFileSync("portal/server.js", "utf8");
  const pipeline = fs.readFileSync("verification/pipeline.js", "utf8");
  for (const fn of named) {
    expect(new RegExp(`export function ${fn}\\(`).test(plane) || new RegExp(`export function ${fn}\\(`).test(portal),
      `§1.1 names \`${fn}()\` as MECHANICAL, but no such function is exported. A principle that names a bar which does not exist is exactly the defect the trunk rewrite found — and worse here, because §1.1 is what everyone quotes when they want to know whether the firewall holds.`);
    expect(new RegExp(`${fn}\\(`).test(pipeline) || new RegExp(`${fn}\\(html, bundle\\)`).test(portal),
      `§1.1 names \`${fn}()\` as MECHANICAL, but nothing CALLS it. An uncalled bar is a promise, and §1.1's MECHANICAL list is the one place a promise must never appear.`);
  }

  // …and the CONVENTIONAL list must still exist. Deleting it would restore the overclaim.
  expect(/nobody is watching but you/.test(doc),
    "§1.1 must keep saying plainly where nobody is watching — the trunk pattern. Removing that line is how 'four mechanisms and two promises' silently becomes 'no override, no exception' again.");
  expect(/dose-hold-surface-unenforced/.test(doc),
    "the conventional gap must carry its register id, the way trunk-constraint-claims-unenforced does — a gap without an id is a gap nobody tracks");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-hold-not-injected FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-hold-not-injected: OK (D-A-3 — held guidance never reaches the model · the whole packet is the surface · release lifts the bar · proven LIVE on a real hold · the bar runs in the pipeline, before generation)");
