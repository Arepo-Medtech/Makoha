#!/usr/bin/env node
/**
 * Trunk 5.0 stub: runs one turn through grounding pipeline and verification layer.
 * Uses getTrunkSystemPrompt("5.0") and a deterministic Axis B rule-out style output.
 * Set HEYDOC_USE_MCP=1 for live MCP retrieval.
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "5.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain for 2 weeks, no red flags.";
const STUB_LLM_OUTPUT = `axis_b_ruleout_matrix:
  required_negatives:
  - neurologic deficit: unknown
  - bowel_or_bladder_red_flag: unknown
  required_confirmations:
  - pain_duration: confirmed (2 weeks)
  - red_flags_reported: confirmed (none reported in current context)
  required_evidence:
  - triage_protocol_reference: citation cw-au:imaging-lbp:2024-01

blocking_gaps:
- Neurologic deficit status must be explicitly confirmed or negated.
- Bowel/bladder red-flag status must be explicitly confirmed or negated.

next_data_requests:
- Any leg weakness, numbness, or new neurologic symptoms?
- Any bowel or bladder control changes?

evidence_refs: [citation cw-au:imaging-lbp:2024-01]. No diagnosis or dosages. Axis B rule-out framing only.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-005",
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
