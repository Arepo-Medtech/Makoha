/**
 * Integration: run a Trunk agent through the grounding pipeline and verification layer.
 * Trunk agents call this so all outputs are routed, context-injected, and verified.
 *
 * CROSS-TRUNK SEQUENCING (C6/DEAD_END-1 fix): runTrunkWithGrounding runs ONE
 * trunk. To walk Trunk 1.0's routing_plan.next_trunks across trunks, use
 * runTrunkSequence (re-exported below; gated behind HEYDOC_SEQUENCER, default
 * off). The sequencer halts UNCONDITIONALLY on continuation_blocked (HARD_FAIL /
 * BLOCKED_NO_PROOF propagate across the sequence — no override), on
 * escalate_now / T5, and on a failed verification. Until a caller opts into the
 * sequencer, anyone chaining trunks manually MUST honour continuation_blocked
 * themselves.
 */
import { runPipeline } from "../verification/pipeline.js";
import { verify } from "../verification/verifier.js";
import { validateReport } from "../verification/report-schema.js";
import { recordRun } from "../verification/audit-store.js";
import { appendPppTttEntry, ledgerCoreFromRecord } from "../verification/ppp-ttt/ledger.js";
import { recordRunMetrics } from "../verification/metrics.js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFICATION_DIR = join(__dirname, "..", "verification");
const TRUNK_PROMPTS_DIR = join(__dirname, "..", "trunk", "prompts");

/**
 * Trunk-specific constraints (from architecture). Expand as trunks are implemented.
 */
const TRUNK_CONSTRAINTS = {
  "1.0": ["no diagnosis", "no dosages", "triage only"],
  "2.0": ["no diagnosis", "no dosages", "triage protocol only"],
  "3.0": ["no diagnosis", "no dosages", "history enrichment only"],
  "4.0": ["no diagnosis", "no dosages", "problem representation and risk framing only"],
  "5.0": ["no diagnosis", "no dosages", "Axis B rule-out per template"],
  "6.0": ["no diagnosis", "no dosages", "investigation interpretation only", "LOINC-derived"],
  "7.0": ["no diagnosis", "no dosages", "code lock-in requires terminology receipt", "benign registry gating"],
  "8.0": ["no diagnosis", "no dosages", "no autonomous prescribing", "pharmacology firewall HARD_FAIL blocks"],
  "9.0": ["no diagnosis", "no dosages", "red-flag questionnaires keyed by SNOMED"],
};

/**
 * Run the full grounding pipeline for a given trunk and write verification artifacts.
 * Use this from any Trunk agent after generating (or before submitting) output.
 *
 * @param {string} trunkId - Trunk version (e.g. "2.0", "7.0")
 * @param {string} userInput - User/patient input for the turn
 * @param {{ candidateOutput?: string, sessionRef?: string, writeArtifacts?: boolean }} options
 * @returns {Promise<{ pass: boolean, report: object, packet: object, verification: object }>}
 */
export async function runTrunkWithGrounding(trunkId, userInput, options = {}) {
  const { candidateOutput, sessionRef, writeArtifacts = true, useMcp, pharmIntent, resolvedFacts, raisedFlags, patientAnswers, abcdeInput, generateCandidate } = options;
  const constraints = TRUNK_CONSTRAINTS[trunkId] ?? ["no diagnosis", "no dosages"];

  const result = await runPipeline({
    user_input: userInput,
    trunk: trunkId,
    candidate_output: candidateOutput,
    use_mcp: useMcp,
    pharm_intent: pharmIntent,
    resolved_facts: resolvedFacts,
    // PPP-TTT graded triage (additive; no flags = byte-identical behaviour).
    raised_flags: raisedFlags,
    patient_answers: patientAnswers,
    abcde_input: abcdeInput,
    // Step-4 generation hook (LIVE_PLAN L3): sees ONLY the sealed packet.
    generate_candidate: generateCandidate,
  });

  // Override packet constraints with trunk-specific ones
  result.packet.constraints = constraints;

  const hardFail = result.firewall_status === "HARD_FAIL";
  const out = {
    pass: result.verification.pass,
    // continuation_blocked: pharmacology firewall (HARD_FAIL — no override
    // path — and BLOCKED_NO_PROOF) OR a fail-closed Step-4 generation block
    // (LIVE_PLAN L3). Both block in the same fail-safe direction.
    firewall_status: result.firewall_status,
    continuation_blocked: !!result.continuation_blocked,
    // The exact candidate text (generated or supplied) + the generation audit —
    // callers/sequencer need the text for escalation detection when the
    // pipeline generated it in-place.
    output: result.output,
    generation: result.generation ?? null,
    report: {
      run_id: result.run_id,
      timestamp_utc: result.timestamp_utc,
      trunk_id: trunkId,
      session_ref: sessionRef,
      pass: result.verification.pass,
      results: result.verification.results,
      missing_receipts: result.verification.missing_receipts,
      // Medicolegal anchor — required field; computed in verify().
      candidate_output_hash: result.verification.candidate_output_hash,
      mock_receipt_flags: result.verification.mock_receipt_flags,
      ...(result.hard_stops && result.hard_stops.length ? { hard_stops: result.hard_stops, overall_severity: "critical" } : {}),
    },
    packet: result.packet,
    verification: result.verification,
  };

  if (writeArtifacts) {
    // Gate the audit record on its contract before persisting (throws on failure).
    validateReport(out.report);
    if (!existsSync(VERIFICATION_DIR)) mkdirSync(VERIFICATION_DIR, { recursive: true });
    writeFileSync(join(VERIFICATION_DIR, "report.json"), JSON.stringify(out.report, null, 2));

    // Append to the append-only medicolegal ledger (+ synthetic content store).
    recordRun(result, { trunkId, sessionRef });
    // PPP-TTT parallel trail (LIVE_PLAN L1 wiring): PHI-free triage record,
    // cross-linked by run_id + candidate_output_hash.
    if (result.abcde_record) appendPppTttEntry(ledgerCoreFromRecord(result.abcde_record));
    // Charter metrics (LIVE_PLAN L2) — observability only, never a gate change.
    recordRunMetrics(result);
    const evidenceTree = [
      "# Evidence tree",
      "",
      `**Run ID:** ${result.run_id} | **Trunk:** ${trunkId}`,
      `**Timestamp:** ${result.timestamp_utc}`,
      "",
      "## Claims → proofs",
      "",
      ...(result.packet.evidence || []).flatMap((node) => [
        `- **${node.claim}**`,
        ...(node.supports || []).map((s) => `  - ${s.kind}: \`${s.ref}\``),
        "",
      ]),
      "## Verification",
      "",
      out.pass ? "**PASS**" : "**FAIL**",
      "",
      ...result.verification.results.map((r) => `- ${r.check}: ${r.passed ? "pass" : "fail"}${r.reason ? ` — ${r.reason}` : ""}`),
    ].join("\n");
    writeFileSync(join(VERIFICATION_DIR, "evidence_tree.md"), evidenceTree);
  }

  return out;
}

/**
 * Verify only (no full pipeline). Use when you already have context packet and output.
 */
export function verifyTrunkOutput(output, evidence) {
  return verify(output, evidence);
}

// Cross-trunk sequencer (C6) — the one integration surface trunk agents import.
// Graduated default-ON (LIVE_PLAN L4); HEYDOC_SEQUENCER=0 is the single-trunk rollback.
export { runTrunkSequence, isSequencerEnabled } from "./trunk-sequencer.js";

/**
 * Load the system prompt for a trunk. Used when building LLM context (e.g. system message).
 * @param {string} trunkId - Trunk version (e.g. "2.0")
 * @returns {string} System prompt text, or a fallback message if the file is missing.
 */
export function getTrunkSystemPrompt(trunkId) {
  const normalized = String(trunkId).replace(/^v/i, "").trim();
  const path = join(TRUNK_PROMPTS_DIR, `trunk-${normalized}-system.md`);
  try {
    if (existsSync(path)) return readFileSync(path, "utf8");
  } catch (_) {}
  return `You are Trunk ${trunkId}. Operate within the injected context packet. Do not diagnose or prescribe. Cite only from provided evidence.`;
}
