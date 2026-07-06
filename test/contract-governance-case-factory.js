/**
 * contract-governance-case-factory (FLOW_PLAN H7 / G7) — the H4 case factory
 * (case-factory/to-casebundle.js) is synthetic-only and non-patient-facing by
 * construction; this makes that guarantee mechanical. Fail-closed to the portal
 * gate. Native check: a generated seed carries synthetic:true (eval corpus, not a
 * patient) and no patient_eligible flag.
 *
 * Run from repo root: node test/contract-governance-case-factory.js
 */
import { governedRelease, toCaseSeed } from "../case-factory/to-casebundle.js";
import { runGovernanceContract } from "./governance-path-contract.js";

// A minimal Synthea-shaped fixture, enough for toCaseSeed to emit a seed whose
// metadata we assert is synthetic. De-anchored: the narrative carries no diagnosis
// label (the shaper is fail-closed on a leaked answer).
const fixture = {
  fhir: {
    resourceType: "Bundle",
    entry: [
      { resource: { resourceType: "Patient", id: "syn-1", birthDate: "1980-01-01", gender: "male" } },
    ],
  },
  narrative: "I have had a dull ache in my lower back for about a week after lifting boxes.",
  profile: { specialty: "CARD", difficulty_tier: "straightforward", primary_diagnosis_name: "Non-specific low back pain", correct_baseline_tier: "T3" },
};

let synthetic = false;
try {
  const { caseseed } = toCaseSeed(fixture);
  synthetic = caseseed && caseseed._seed && caseseed._seed.synthetic === true;
} catch (_) {
  // If the fixture shape drifts, the native assertion simply fails visibly.
  synthetic = false;
}

runGovernanceContract({
  pathId: "case-factory",
  milestone: "H4",
  governedRelease,
  nativeAssertions: [
    ["generated case seed is synthetic:true (never a patient record)", synthetic === true],
  ],
});
