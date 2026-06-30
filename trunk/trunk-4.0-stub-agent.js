#!/usr/bin/env node
/**
 * Trunk 4.0 stub: runs one turn through grounding pipeline and verification layer.
 * Uses getTrunkSystemPrompt("4.0") and a stub output matching problem representation contract.
 * Set HEYDOC_USE_MCP=1 for live MCP retrieval.
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "4.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain for 2 weeks, no red flags.";
const STUB_LLM_OUTPUT = `problem_representation: Adult with 2-week history of non-specific lower back pain and no reported red-flag symptoms in current context.

risk_frame:
  immediate_concerns:
  - No evidence of immediate red-flag concern in provided facts.
  routine_follow_up:
  - Continue structured red-flag screening and monitor symptom progression.

data_gaps:
- Neurologic radiation details are unknown.
- Functional impact and sleep disruption are not yet documented.

evidence_refs: [citation cw-au:imaging-lbp:2024-01]. No diagnosis or dosages. Problem representation and risk framing only.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-004",
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
