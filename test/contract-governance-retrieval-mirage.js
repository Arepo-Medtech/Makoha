/**
 * contract-governance-retrieval-mirage (FLOW_PLAN H7 / G7) — the H3 MIRAGE-gated
 * retrieval path (benchmark/mirage) is fail-closed to the portal gate. The
 * harness never sets patient_eligible (MIRAGE-pass is necessary, not sufficient);
 * governance is the enforced second precondition. The offline benchmark emits no
 * patient_eligible flag of its own, so the release verdict is the guarantee here.
 *
 * Run from repo root: node test/contract-governance-retrieval-mirage.js
 */
import { governedRelease } from "../benchmark/mirage/index.js";
import { runGovernanceContract } from "./governance-path-contract.js";

runGovernanceContract({
  pathId: "retrieval-mirage",
  milestone: "H3",
  governedRelease,
  nativeAssertions: [],
});
