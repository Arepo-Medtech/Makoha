/**
 * contract-governance-tooluniverse (FLOW_PLAN H7 / G7) — the H5 ToolUniverse
 * gateway (mcp/servers/tooluniverse-gateway) is fail-closed to the portal gate.
 * Native check: the gateway's PATIENT_ELIGIBLE flag stays false (retrieval tools
 * are MIRAGE/governance-gated; the code-executor is disabled). Governance is the
 * additional release precondition.
 *
 * Run from repo root: node test/contract-governance-tooluniverse.js
 */
import { governedRelease, PATIENT_ELIGIBLE } from "../mcp/servers/tooluniverse-gateway/tool-gateway.js";
import { runGovernanceContract } from "./governance-path-contract.js";

runGovernanceContract({
  pathId: "tooluniverse",
  milestone: "H5",
  governedRelease,
  nativeAssertions: [
    ["tooluniverse PATIENT_ELIGIBLE flag stays false", PATIENT_ELIGIBLE === false],
  ],
});
