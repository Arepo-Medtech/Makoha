/**
 * Contract test — the A/B parity comparison rules (FL-34 Phase D / D2).
 *
 * THE HARNESS IS ONLY AS GOOD AS WHAT IT CALLS A DIVERGENCE. Two ways it fails, and both end the same
 * way — with the harness switched off, and the real drift shipping:
 *
 *   TOO LOUD  — it reports the CONTRACT SHAPE as a knowledge divergence. The locked wire is
 *               deliberately narrower than the frozen pharm-check, so a raw object diff fails every
 *               case, and a harness that cries wolf on its own configuration gets disabled in a week.
 *   TOO QUIET — it misses a real disagreement. Then it is a green light nobody earned.
 *
 * These rules are proven HERE, at the desk, without a container — so the live run
 * (parity-opencds-gateway.js) is only the data, never the definitions.
 *
 * Run from repo root: node test/contract-executor-parity.js
 */
import { compareExecutors, ALL_CHECKS } from "../verification/executor-parity.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };

const engine = (over = {}) => ({
  status: "HARD_FAIL",
  check_results: [
    { check_id: "allergy_check", status: "PASS" },
    { check_id: "interaction_check", status: "HARD_FAIL", severity: "critical" },
  ],
  flags: [{ flag_id: "flag-ddi-0", flag_type: "interaction_severe", severity: "critical", description: "warfarin + amiodarone: CYP2C9", drug_a: "warfarin", drug_b: "amiodarone" }],
  ...over,
});
const gateway = (over = {}) => ({
  verdict: "HARD_FAIL",
  check_results: [
    { check_id: "allergy_check", status: "PASS" },
    { check_id: "interaction_check", status: "HARD_FAIL", severity: "critical" },
  ],
  flags: [{ flag_type: "interaction_severe", severity: "critical", description: "warfarin + amiodarone: CYP2C9", drug_a: "warfarin", drug_b: "amiodarone" }],
  dose_guidance: null,
  ...over,
});
const REQ = ["allergy_check", "interaction_check"];

// ---- 1. Agreement is agreement, DESPITE the contract shapes differing --------------------------
{
  // The engine's flag carries flag_id; the gateway's cannot (OpenCdsFlagSchema is .strict()). That is
  // the CONTRACT, not the knowledge. If this reports a divergence, every case fails and the harness
  // is worthless from day one.
  const r = compareExecutors(engine(), gateway(), { checksRequested: REQ });
  expect(r.agree, `identical findings must AGREE despite flag_id existing on one side only — that field is contract packaging, and the wire is locked. Divergences: ${JSON.stringify(r.divergences)}`);
}

// ---- 2. …and the same for the dose's narrower key set (F-C1) ----------------------------------
{
  const e = engine({ status: "PASS", check_results: [{ check_id: "allergy_check", status: "PASS" }], flags: [],
    dose_guidance: { safe_dose_range: "5 mg daily", pbs_authority_required: true, pbs_item_code: "1234K" } });
  const g = gateway({ verdict: "PASS", check_results: [{ check_id: "allergy_check", status: "PASS" }], flags: [],
    dose_guidance: { safe_dose_range: "5 mg daily" } });
  const r = compareExecutors(e, g, { checksRequested: ["allergy_check"] });
  expect(r.agree, "the PBS keys exist on the engine's dose and are FORBIDDEN on the wire (F-C1). Their absence is the contract, not a divergence.");
}

// ---- 3. A REAL status disagreement is caught ---------------------------------------------------
{
  const r = compareExecutors(engine(), gateway({ verdict: "PASS" }), { checksRequested: REQ });
  expect(!r.agree && r.divergences.some((d) => d.axis === "status"),
    "one executor blocking and the other passing is the single most important thing this harness exists to notice");
}

// ---- 4. A per-check disagreement is caught ----------------------------------------------------
{
  const g = gateway({ check_results: [{ check_id: "allergy_check", status: "HARD_FAIL" }, { check_id: "interaction_check", status: "HARD_FAIL" }] });
  const r = compareExecutors(engine(), g, { checksRequested: REQ });
  expect(!r.agree && r.divergences.some((d) => d.axis === "check" && /allergy_check/.test(d.detail)),
    "the two executors disagreeing on a single check must be caught even when the composed status happens to match — a matching headline can hide a broken check");
}

// ---- 5. A check the gateway was NOT ASKED FOR is NOT a divergence (F-D2) -----------------------
{
  // The engine runs every APPLICABLE check; the gateway runs only what was requested. warfarin has a
  // pregnancy record, so the engine emits pregnancy_check — but DEFAULT_CHECKS does not include it.
  // Reporting that would make the harness's first finding its own configuration.
  const e = engine({ check_results: [...engine().check_results, { check_id: "pregnancy_check", status: "PASS" }] });
  const r = compareExecutors(e, gateway(), { checksRequested: REQ });
  expect(r.agree, "a check outside checks_requested must be ignored — the gateway was never asked, so its silence is the REQUEST, not a defect");
}

// ---- 6. …but a REQUESTED check answered by only one side IS a divergence -----------------------
{
  // This is the sharp edge of rule 5, and it is what stops that rule becoming a hole: the engine found
  // this check applicable and the KM did not (or did not run). That is a disagreement about the
  // knowledge, not about the request.
  const e = engine({ check_results: [...engine().check_results, { check_id: "nti_check", status: "HARD_FAIL" }] });
  const r = compareExecutors(e, gateway(), { checksRequested: [...REQ, "nti_check"] });
  expect(!r.agree && r.divergences.some((d) => d.axis === "check" && /nti_check/.test(d.detail)),
    "a REQUESTED check the engine answered and the gateway did not must be caught — that is the KM not running, or disagreeing about applicability");

  // …and in the other direction, which would mean the KM invented applicability.
  const g2 = gateway({ check_results: [...gateway().check_results, { check_id: "nti_check", status: "PASS" }] });
  const r2 = compareExecutors(engine(), g2, { checksRequested: [...REQ, "nti_check"] });
  expect(!r2.agree && r2.divergences.some((d) => d.axis === "check"),
    "a verdict the GATEWAY produced and the engine did not must also be caught — the KM would be finding a check applicable that the specification does not");
}

// ---- 7. A LOST FINDING is caught — the C1 defect, as a parity failure --------------------------
{
  // The engine emits a flag PER interaction hit. If a KM collapsed N findings into 1, the clinician
  // sees ONE interaction where there are two. That is exactly the C1 defect, and this is the harness
  // that would have caught it.
  const e = engine({ flags: [
    { flag_id: "flag-ddi-0", flag_type: "interaction_severe", severity: "critical", description: "warfarin + amiodarone: CYP2C9", drug_a: "warfarin", drug_b: "amiodarone" },
    { flag_id: "flag-ddi-1", flag_type: "interaction_severe", severity: "critical", description: "warfarin + aspirin: bleeding", drug_a: "warfarin", drug_b: "aspirin" },
  ] });
  const r = compareExecutors(e, gateway(), { checksRequested: REQ });
  expect(!r.agree && r.divergences.some((d) => d.axis === "flags"),
    "TWO findings on one side and ONE on the other must be caught — the client filters flags[] to build the interaction list a clinician READS");
}

// ---- 8. A flag whose SEVERITY was rolled up is caught ------------------------------------------
{
  const g = gateway({ flags: [{ flag_type: "interaction_severe", severity: "moderate", description: "warfarin + amiodarone: CYP2C9", drug_a: "warfarin", drug_b: "amiodarone" }] });
  const r = compareExecutors(engine(), g, { checksRequested: REQ });
  expect(!r.agree && r.divergences.some((d) => d.axis === "flags"),
    "a finding downgraded from critical to moderate must be caught — severity is what a clinician triages on");
}

// ---- 9. DIFFERENT DOSE TEXT from the same signed record ----------------------------------------
{
  const e = engine({ status: "PASS", check_results: [{ check_id: "allergy_check", status: "PASS" }], flags: [], dose_guidance: { safe_dose_range: "5 mg daily" } });
  const g = gateway({ verdict: "PASS", check_results: [{ check_id: "allergy_check", status: "PASS" }], flags: [], dose_guidance: { safe_dose_range: "50 mg daily" } });
  const r = compareExecutors(e, g, { checksRequested: ["allergy_check"] });
  expect(!r.agree && r.divergences.some((d) => d.axis === "dose"),
    "the highest-stakes divergence there is: both read the SAME clinician-signed record and produced different dose text, so one of them is reading it wrong");
}

// ---- 10. A dose on ONE side only ---------------------------------------------------------------
{
  const e = engine({ status: "PASS", check_results: [{ check_id: "allergy_check", status: "PASS" }], flags: [], dose_guidance: { safe_dose_range: "5 mg daily" } });
  const g = gateway({ verdict: "PASS", check_results: [{ check_id: "allergy_check", status: "PASS" }], flags: [], dose_guidance: null });
  const r = compareExecutors(e, g, { checksRequested: ["allergy_check"] });
  expect(!r.agree && r.divergences.some((d) => d.axis === "dose"),
    "a dose from one executor and none from the other is a divergence — on a PASS both should reach the same signed record");
}

// ---- 11. The harness cannot say WHO is wrong, and must not pretend to ---------------------------
{
  const r = compareExecutors(engine(), gateway({ verdict: "PASS" }), { checksRequested: REQ });
  const d = r.divergences[0];
  expect("engine" in d && "gateway" in d, "a divergence must carry BOTH readings — a human adjudicates, and they cannot without the inputs");
  expect(!/engine is wrong|gateway is wrong|should be/i.test(JSON.stringify(r.divergences)),
    "the report must NOT claim which side is at fault. Both executors run the same signed records; this module cannot know which is misreading them, and asserting it would be the fabrication the whole system is built against.");
}

// ---- 12. ALL_CHECKS is the full set — asking for less makes the ask the finding ----------------
{
  expect(ALL_CHECKS.length === 8, `the harness must ask for all 8 checks — got ${ALL_CHECKS.length}. DEFAULT_CHECKS is 5, and comparing against a 5-check answer makes the harness's first 'divergence' its own configuration.`);
  expect(!ALL_CHECKS.includes("route_appropriateness_check"),
    "route_appropriateness_check must NOT be asked for: engine.js implements it zero times (F4), so no KM mirrors it and every case would report a phantom divergence");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-executor-parity FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-executor-parity: OK (contract shape is not a divergence · a real disagreement on status/check/flags/dose IS · an unrequested check is the ASK, a requested-but-unanswered one is a DEFECT · a lost finding is caught (the C1 defect) · the report never claims which side is wrong)");
