/**
 * contract-governance-record-spine (FLOW_PLAN H7 / G7) — the H1 record-spine
 * (integration/record-sources) is fail-closed to the portal gate. No patient
 * path is opened; the record-spine emits no patient_eligible flag of its own, so
 * the release verdict is the eligibility guarantee here.
 *
 * Run from repo root: node test/contract-governance-record-spine.js
 */
import { governedRelease } from "../integration/record-sources/sources-client.js";
import { runGovernanceContract } from "./governance-path-contract.js";

runGovernanceContract({
  pathId: "record-spine",
  milestone: "H1",
  governedRelease,
  nativeAssertions: [],
});
