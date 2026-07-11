/**
 * trunk-sequencer — the cross-trunk outer loop (ARCH_PLAN C6; FMEA F2/F8/F10;
 * DEAD_END-1 fix). Consumes Trunk 1.0's routing_plan.next_trunks — previously
 * produced by the Trunk 1.0 output contract and consumed by NO code — and runs
 * the five-step grounding pipeline for each routed trunk in order.
 *
 * HALT RULES (unconditional — there is no override path):
 *   1. Trunk 1.0's safety_gate signals escalate_now / safety tier T5
 *      → halt BEFORE any routed trunk runs (the trunk 1.0 contract forbids
 *        routing before the safety gate).
 *   2. Any executed trunk returns continuation_blocked
 *      → halt. This is how a pharmacology HARD_FAIL (and BLOCKED_NO_PROOF)
 *        propagates ACROSS trunks: the no-HARD_FAIL-override hard limit applies
 *        to the whole sequence, not just the trunk that tripped it.
 *   3. Any executed trunk's output signals escalate_now / T5 → halt (emergency
 *      escalation short-circuits the remaining sequence).
 *   4. Any executed trunk FAILS verification (pass=false) → halt. A rejected
 *      output must never become upstream context for the next trunk (fail-safe;
 *      building on unverified output would bypass Step 5 of the spine).
 *   5. Any executed trunk's PPP-TTT graded triage is a STRUCTURED STOP
 *      (verification.ppp_ttt.tier === "STOP") → halt with the triage reason
 *      (LIVE_PLAN L4 / PPP-TTT plan Step 2). Additive defence in depth on top
 *      of rules 3 and 4 — a STOP already carries the escalate_now token and
 *      forces pass=false, but the structured field is checked directly so the
 *      halt never depends on text rendering.
 *
 * Escalation detection is deliberately CONSERVATIVE: it scans the trunk's
 * structured output (or raw text) for escalate_now / a T5 safety-tier signal and
 * over-halts on ambiguity — halting too eagerly is safe (over-triage); running
 * past an escalation is not (under-triage outranks over-triage).
 *
 * ROLLBACK / FEATURE FLAG (LIVE_PLAN L4 graduation, 2026-07-11): the sequencer
 * is ON BY DEFAULT. HEYDOC_SEQUENCER remains the rollback lever — an explicit
 * "0" | "off" | "false" disables it, and runTrunkSequence() then runs NOTHING
 * and returns a disabled record (pre-L4 status quo: callers run single trunks
 * via runTrunkWithGrounding and must honour continuation_blocked themselves).
 *
 * The sequencer adds the missing OUTER loop only — each trunk still runs the
 * full five-step pipeline (Route→Retrieve→Inject→Generate→Verify) inside
 * runTrunkWithGrounding; no step is bypassed.
 */
import { z } from "zod";
import { runTrunkWithGrounding } from "./trunk-pipeline.js";

/** The nine trunks — the only ids a routing plan may sequence. */
export const TRUNK_IDS = ["1.0", "2.0", "3.0", "4.0", "5.0", "6.0", "7.0", "8.0", "9.0"];

/** Trunk 1.0 routing_plan input contract (§3.5.5). Unknown trunk ids are
 *  rejected up front (throw) so a malformed plan never part-runs. */
const RoutingPlan = z
  .object({
    next_trunks: z.array(z.enum(TRUNK_IDS)).max(TRUNK_IDS.length),
    why: z.string().optional(),
  })
  .strict();

/** Ordered execution record (§3.5.5): what ran, and why the walk stopped. */
const ExecutedEntry = z
  .object({
    trunk_id: z.enum(TRUNK_IDS),
    pass: z.boolean(),
    firewall_status: z.string().optional(),
    continuation_blocked: z.boolean(),
  })
  .strict();
const SequenceRecord = z
  .object({
    enabled: z.boolean(),
    executed: z.array(ExecutedEntry),
    halted_at: z.enum(TRUNK_IDS).optional(),
    halt_reason: z.string().optional(),
    completed: z.boolean(),
  })
  .strict();

/** Feature flag — DEFAULT ON since L4 graduation; explicit "0"/"off"/"false"
 *  is the rollback (an unrecognised value also disables — fail toward the
 *  known-good single-trunk status quo rather than guessing). */
export function isSequencerEnabled() {
  const v = String(process.env.HEYDOC_SEQUENCER ?? "").trim().toLowerCase();
  if (v === "") return true; // graduated default (LIVE_PLAN L4)
  return v === "1" || v === "on" || v === "true";
}

const ESCALATE_NOW_RE = /\bescalate_now\b/i;
// T5 in a safety-tier/status position — matched conservatively in text
// ("safety tier T5", "tier: T5") and exactly on structured status-like fields.
const T5_TEXT_RE = /\b(?:safety\s+)?tier\s*[:\s]\s*T5\b/i;
const T5_FIELD_RE = /"(?:status|tier|safety_tier|risk_outcome|escalation_signal)"\s*:\s*"\s*T5\s*"/i;

/**
 * Conservative escalation scan over a trunk output (string or structured
 * object). Over-detection halts the sequence — the safe direction.
 */
export function detectEscalation(output) {
  if (output === undefined || output === null) return false;
  if (typeof output === "string") return ESCALATE_NOW_RE.test(output) || T5_TEXT_RE.test(output);
  const s = JSON.stringify(output);
  return ESCALATE_NOW_RE.test(s) || T5_TEXT_RE.test(s) || T5_FIELD_RE.test(s);
}

/**
 * Walk Trunk 1.0's routing plan through the grounded pipeline, halting
 * unconditionally per the rules above.
 *
 * @param {{ routing_plan: { next_trunks: string[], why?: string }, safety_gate?: object }} trunkOneOutput
 *   The PARSED Trunk 1.0 output (its routing_plan + safety_gate per the trunk
 *   1.0 contract). The sequencer consumes structure, never prose.
 * @param {string} userInput - The user/patient input threaded to every trunk.
 * @param {{
 *   outputs?: Record<string, string|object>,      // per-trunk candidate output (stubs/tests)
 *   generate?: (trunkId: string, userInput: string) => Promise<string|object>, // Step 4 external generation (legacy text hook)
 *   generateCandidate?: (packet: object) => Promise<object>, // Step 4 packet-only generation (LIVE_PLAN L3 llm-adapter hook)
 *   triageByTrunk?: Record<string, { raisedFlags?: Array<object>, patientAnswers?: object, abcdeInput?: object }>, // PPP-TTT inputs per trunk (L4)
 *   pharmIntents?: Record<string, object>,        // per-trunk PharmIntent (Trunk 8.0)
 *   resolvedFacts?: object,
 *   sessionRef?: string,
 *   useMcp?: boolean,
 *   writeArtifacts?: boolean,                     // default false: per-trunk report.json would overwrite; ledger opt-in
 * }} [options]
 * @returns {Promise<{ enabled: boolean, executed: Array<{trunk_id, pass, firewall_status?, continuation_blocked}>, halted_at?: string, halt_reason?: string, completed: boolean }>}
 */
export async function runTrunkSequence(trunkOneOutput, userInput, options = {}) {
  if (!isSequencerEnabled()) {
    // OFF is the rollback state: run NOTHING (never partially engage).
    return SequenceRecord.parse({
      enabled: false,
      executed: [],
      halt_reason: "sequencer_disabled (HEYDOC_SEQUENCER off)",
      completed: false,
    });
  }

  // Contract gate first — a malformed routing plan never part-runs (throws).
  const plan = RoutingPlan.parse(trunkOneOutput?.routing_plan ?? {});

  const executed = [];
  const record = (fields) => SequenceRecord.parse({ enabled: true, executed, completed: false, ...fields });

  // HALT RULE 1 — the originating safety gate outranks routing (trunk 1.0
  // contract: never route past an urgent red flag).
  if (detectEscalation(trunkOneOutput?.safety_gate)) {
    return record({ halted_at: "1.0", halt_reason: "escalate_now: Trunk 1.0 safety gate signalled emergency escalation before routing" });
  }

  for (const trunkId of plan.next_trunks) {
    // Resolve this trunk's candidate output: fixed map, else external generator,
    // else the pipeline's own stub. Structured outputs are serialised for the
    // pipeline (hash + verifier operate on the exact text) and kept structured
    // for escalation detection.
    let output = options.outputs?.[trunkId];
    if (output === undefined && options.generate) output = await options.generate(trunkId, userInput);
    const candidateOutput = typeof output === "object" && output !== null ? JSON.stringify(output) : output;
    const triage = options.triageByTrunk?.[trunkId];

    const result = await runTrunkWithGrounding(trunkId, userInput, {
      candidateOutput,
      sessionRef: options.sessionRef,
      writeArtifacts: options.writeArtifacts ?? false,
      useMcp: options.useMcp,
      pharmIntent: options.pharmIntents?.[trunkId],
      resolvedFacts: options.resolvedFacts,
      // Step-4 packet-only generation (L3): used only when no fixed output /
      // legacy generator supplied a candidate for this trunk.
      generateCandidate: candidateOutput === undefined ? options.generateCandidate : undefined,
      // PPP-TTT graded triage inputs for this trunk (L4).
      raisedFlags: triage?.raisedFlags,
      patientAnswers: triage?.patientAnswers,
      abcdeInput: triage?.abcdeInput,
    });

    executed.push({
      trunk_id: trunkId,
      pass: result.pass,
      ...(result.firewall_status ? { firewall_status: result.firewall_status } : {}),
      continuation_blocked: !!result.continuation_blocked,
    });

    // HALT RULE 2 — firewall block propagates across the sequence (no override).
    if (result.continuation_blocked) {
      return record({
        halted_at: trunkId,
        halt_reason: `continuation_blocked: pharmacology firewall ${result.firewall_status || "block"} at Trunk ${trunkId} — sequence halted, no override path`,
      });
    }
    // HALT RULE 3 — emergency escalation short-circuits the rest. Scans the
    // supplied output, or the in-pipeline generated text (L3) when generation
    // produced the candidate.
    if (detectEscalation(output ?? candidateOutput ?? result.output)) {
      return record({ halted_at: trunkId, halt_reason: `escalate_now: Trunk ${trunkId} output signalled emergency escalation` });
    }
    // HALT RULE 5 — a STRUCTURED PPP-TTT STOP halts with the graded-triage
    // reason (LIVE_PLAN L4). Checked before rule 4 so the halt reason carries
    // the clinical grading, not just the generic verification failure a STOP
    // also forces (monotone-AND). Additive: no STOP → identical behaviour.
    if (result.verification?.ppp_ttt?.tier === "STOP") {
      return record({ halted_at: trunkId, halt_reason: `ppp_ttt_stop: Trunk ${trunkId} graded triage is STOP (escalate_now) — mandatory escalation, sequence halted with no override path` });
    }
    // HALT RULE 4 — a rejected output never grounds the next trunk.
    if (!result.pass) {
      return record({ halted_at: trunkId, halt_reason: `verification_failed: Trunk ${trunkId} output rejected by the verifier — sequence halted (fail-safe)` });
    }
  }

  return SequenceRecord.parse({ enabled: true, executed, completed: true });
}
