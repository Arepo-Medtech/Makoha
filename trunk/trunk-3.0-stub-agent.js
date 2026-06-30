#!/usr/bin/env node
/**
 * Trunk 3.0 stub: runs one turn through the grounding pipeline and verification layer.
 * Uses getTrunkSystemPrompt("3.0") and a stub output that matches the history-enrichment contract.
 * Set HEYDOC_USE_MCP=1 for live MCP retrieval.
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "3.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain for 2 weeks, no red flags.";
const STUB_LLM_OUTPUT = `follow_up_questions:
- Can you describe where exactly the pain is (mid back, one side)?
- Any numbness, tingling, or pain going down the leg?

structured_history:
  chief_complaint: lower back pain
  duration: 2 weeks
  red_flags_reported: none
  radiation: unknown

evidence_refs: [citation cw-au:imaging-lbp:2024-01 for triage context]. No diagnosis or dosages. History enrichment only.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-003",
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
