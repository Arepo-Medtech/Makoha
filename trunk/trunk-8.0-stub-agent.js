#!/usr/bin/env node
/**
 * Trunk 8.0 stub: runs one turn through grounding pipeline and verification layer.
 * Uses getTrunkSystemPrompt("8.0") with pharmacology firewall style output.
 * Set HEYDOC_USE_MCP=1 for live MCP retrieval.
 */
import { runTrunkWithGrounding, getTrunkSystemPrompt } from "../integration/trunk-pipeline.js";

const TRUNK_ID = "8.0";
const SYSTEM_PROMPT = getTrunkSystemPrompt(TRUNK_ID);
const USER_INPUT = "Patient reports lower back pain and asks for pain medication advice.";
const STUB_LLM_OUTPUT = `pharm_intent_payload:
  intent_type: analgesia_consideration
  diagnosis_ref: unresolved_non_specific_back_pain
  patient_facts_ref: enc-stub-008

firewall_status: BLOCKED_NO_PROOF

blocking_reasons:
- No pharmacology firewall receipt available in current context.
- Allergy and renal-function facts required for deterministic safety check are missing.

next_data_requests:
- Provide verified allergy status.
- Provide renal function context required by pharmacology firewall.

evidence_refs:
- citation: cw-au:imaging-lbp:2024-01

No diagnosis or dosages. Pharmacology firewall governs continuation.`;

async function main() {
  const result = await runTrunkWithGrounding(TRUNK_ID, USER_INPUT, {
    candidateOutput: STUB_LLM_OUTPUT,
    sessionRef: "enc-stub-008",
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
