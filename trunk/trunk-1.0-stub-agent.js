#!/usr/bin/env node
/**
 * Trunk 1.0 (master/originating) stub: intake routing + safety gate only.
 * Set HEYDOC_USE_MCP=1 to use live MCP retrieval (docs + identity-au + terminology).
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "1.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain for 2 weeks, no red flags.";
const STUB_LLM_OUTPUT = `Intake summary: persistent low back pain for 2 weeks, no reported red flags. Safety gate: clear. Routing plan: next trunks [2.0, 3.0] for triage and structured history enrichment. Missing inputs: none at this stage. Evidence refs: citation cw-au:imaging-lbp:2024-01.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-001",
    writeArtifacts: true,
    useMcp: process.env.HEYDOC_USE_MCP === "1",
  });
  console.log("Trunk:", TRUNK_ID, "| System prompt length:", SYSTEM_PROMPT.length);
  console.log("Pass:", result.pass);
  console.log("Report written to verification/report.json");
  console.log("Evidence tree written to verification/evidence_tree.md");
  process.exit(result.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
