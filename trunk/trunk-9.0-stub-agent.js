#!/usr/bin/env node
/**
 * Trunk 9.0 stub: runs one turn through grounding pipeline and verification layer.
 * Uses getTrunkSystemPrompt("9.0") with a red-flag questionnaire style output.
 * Set HEYDOC_USE_MCP=1 for live MCP retrieval.
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "9.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain, no known red flags yet.";
const STUB_LLM_OUTPUT = `red_flag_questionnaire:
  questions:
  - Any new bowel or bladder control changes?
  - Any progressive leg weakness or saddle anesthesia?
  responses:
  - bowel_or_bladder_change: unknown
  - progressive_neurologic_deficit: unknown

risk_outcome: blocked_incomplete

blocking_items:
- Red-flag responses are missing for critical neurologic and bladder/bowel checks.

next_actions:
- Ask missing red-flag questions immediately and reassess escalation state.

evidence_refs:
- citation: cw-au:imaging-lbp:2024-01

No diagnosis or dosages. Red-flag questionnaire flow only.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-009",
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
