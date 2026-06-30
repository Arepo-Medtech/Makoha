/**
 * Integration: run a Trunk agent through the grounding pipeline and verification layer.
 * Trunk agents call this so all outputs are routed, context-injected, and verified.
 */
import { runPipeline } from "../verification/pipeline.js";
import { verify } from "../verification/verifier.js";
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
  const { candidateOutput, sessionRef, writeArtifacts = true, useMcp } = options;
  const constraints = TRUNK_CONSTRAINTS[trunkId] ?? ["no diagnosis", "no dosages"];

  const result = await runPipeline({
    user_input: userInput,
    trunk: trunkId,
    candidate_output: candidateOutput,
    use_mcp: useMcp,
  });

  // Override packet constraints with trunk-specific ones
  result.packet.constraints = constraints;

  const out = {
    pass: result.verification.pass,
    report: {
      run_id: result.run_id,
      timestamp_utc: result.timestamp_utc,
      trunk_id: trunkId,
      session_ref: sessionRef,
      pass: result.verification.pass,
      results: result.verification.results,
      missing_receipts: result.verification.missing_receipts,
    },
    packet: result.packet,
    verification: result.verification,
  };

  if (writeArtifacts) {
    if (!existsSync(VERIFICATION_DIR)) mkdirSync(VERIFICATION_DIR, { recursive: true });
    writeFileSync(join(VERIFICATION_DIR, "report.json"), JSON.stringify(out.report, null, 2));
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
