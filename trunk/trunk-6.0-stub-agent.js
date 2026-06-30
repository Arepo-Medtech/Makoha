#!/usr/bin/env node
/**
 * Trunk 6.0 stub: runs one turn through grounding pipeline and verification layer.
 * Uses getTrunkSystemPrompt("6.0") and a LOINC-grounded investigation interpretation style output.
 * Set HEYDOC_USE_MCP=1 for live MCP retrieval.
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "6.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain; preliminary labs returned without critical flag in current context.";
const STUB_LLM_OUTPUT = `finding_summary:
  critical:
  - none identified in provided investigation summary
  abnormal_noncritical:
  - mild inflammatory marker elevation (requires trend context)
  normal_or_expected:
  - no critical derangement reported in supplied summary
  insufficient_data:
  - full LOINC-coded panel values not present in current context

escalation_signal:
  requires_urgent_escalation: false
  reason: No critical finding is evidenced in the supplied investigation summary.

next_data_requests:
- Provide full LOINC-coded panel values and timestamps for trend interpretation.
- Confirm any red-flag symptom progression since sample collection.

evidence_refs: [citation cw-au:imaging-lbp:2024-01]. No diagnosis or dosages. Investigation interpretation only.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-006",
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
