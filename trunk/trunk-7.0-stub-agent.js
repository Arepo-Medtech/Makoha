#!/usr/bin/env node
/**
 * Trunk 7.0 stub: runs one turn through grounding pipeline and verification layer.
 * Uses getTrunkSystemPrompt("7.0") and a code-lock style output with terminology receipt references.
 * Set HEYDOC_USE_MCP=1 for live MCP retrieval.
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "7.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain for 2 weeks, no red flags.";
const STUB_LLM_OUTPUT = `candidate_codes:
- SNOMED_CT_Code: 279039003 (Low back pain)

code_lock_status: locked

blocking_reasons:
- none

benign_registry_gate:
  status: review_required
  rationale: benign registry evidence not provided in this context packet.

evidence_refs:
- terminology receipt: term-mock-1
- citation: cw-au:imaging-lbp:2024-01

No diagnosis or dosages. Code lock-in requires terminology receipt.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-007",
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
