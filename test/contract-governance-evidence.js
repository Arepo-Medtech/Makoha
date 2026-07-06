/**
 * contract-governance-evidence (FLOW_PLAN H7 / G7) — the H2 evidence taps
 * (#14/#15/#1, crossing mcp/servers/_shared/evidence-map.js) are fail-closed to
 * the portal gate. Native check: the shared PATIENT_ELIGIBLE flag stays false —
 * governance is a SEPARATE, later precondition on top of the H3 MIRAGE gate.
 *
 * Run from repo root: node test/contract-governance-evidence.js
 */
import { governedRelease, PATIENT_ELIGIBLE } from "../mcp/servers/_shared/evidence-map.js";
import { runGovernanceContract } from "./governance-path-contract.js";

runGovernanceContract({
  pathId: "evidence",
  milestone: "H2",
  governedRelease,
  nativeAssertions: [
    ["evidence PATIENT_ELIGIBLE flag stays false", PATIENT_ELIGIBLE === false],
  ],
});
