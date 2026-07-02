/**
 * Contract tests for the cross-trunk sequencer (integration/trunk-sequencer.js)
 * — ARCH_PLAN C6 / FMEA F2, F8, F10 (the DEAD_END-1 fix).
 * <test_and_evaluation_gates> requires deterministic safety code to be tested.
 *
 * Asserts:
 *   - DEFAULT OFF: with HEYDOC_SEQUENCER unset, nothing runs (rollback state);
 *   - next_trunks is CONSUMED: routed trunks execute in plan order;
 *   - a pharmacology HARD_FAIL halts the sequence — later trunks never run,
 *     with no override path (F2: HARD_FAIL now propagates across trunks);
 *   - BLOCKED_NO_PROOF halts the same way (missing proof never degrades);
 *   - Trunk 1.0 escalate_now safety gate halts BEFORE any routed trunk (F8);
 *   - escalate_now / T5 in a mid-sequence trunk output short-circuits the rest;
 *   - a verification failure (pass=false) halts — a rejected output is never
 *     upstream context for the next trunk;
 *   - a malformed routing plan (unknown trunk id) throws — never part-runs;
 *   - the execution record conforms to the §3.5.5 contract shape.
 * Run from repo root: node test/contract-sequencer.js
 */
import { runTrunkSequence, detectEscalation, TRUNK_IDS } from "../integration/trunk-sequencer.js";
import { runTrunkSequence as reexported } from "../integration/trunk-pipeline.js";

const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

const CLEAN = "Proceeding per protocol on the provided context. No diagnosis or dosages.";
const plan = (ids) => ({ routing_plan: { next_trunks: ids }, safety_gate: { status: "clear" } });
const hardFailIntent = { intent_id: "int-seq-1", session_ref: "enc-seq-001", intent_type: "new_prescription", drug_intent: { drug_name: "oxycodone", drug_class: "opioid" }, patient_facts_ref: {}, clinical_context: { patient_age_years: 45 }, mode: "mock" };

async function main() {
  const saved = process.env.HEYDOC_SEQUENCER;

  try {
    // 1. DEFAULT OFF — the rollback state runs nothing.
    delete process.env.HEYDOC_SEQUENCER;
    const off = await runTrunkSequence(plan(["2.0", "3.0"]), "input", { outputs: { "2.0": CLEAN, "3.0": CLEAN } });
    check("off: enabled=false", off.enabled === false);
    check("off: nothing executed", off.executed.length === 0);
    check("off: not completed", off.completed === false);

    process.env.HEYDOC_SEQUENCER = "1";

    // 2. next_trunks CONSUMED — routed trunks run in plan order to completion.
    const happy = await runTrunkSequence(plan(["2.0", "3.0"]), "back pain, no red flags", { outputs: { "2.0": CLEAN, "3.0": CLEAN } });
    check("happy: enabled", happy.enabled === true);
    check("happy: both trunks executed in order", happy.executed.map((e) => e.trunk_id).join(",") === "2.0,3.0");
    check("happy: completed, no halt", happy.completed === true && happy.halted_at === undefined);
    check("happy: entries carry pass + continuation_blocked", happy.executed.every((e) => typeof e.pass === "boolean" && e.continuation_blocked === false));

    // 3. HARD_FAIL halts — F2: the block propagates across the sequence.
    const hf = await runTrunkSequence(plan(["2.0", "8.0", "3.0"]), "pain meds?", {
      outputs: { "2.0": CLEAN, "8.0": "firewall_status: HARD_FAIL. Firewall blocks continuation. No diagnosis or dosages.", "3.0": CLEAN },
      pharmIntents: { "8.0": hardFailIntent },
      resolvedFacts: { allergens: [], current_medications: [] },
    });
    check("HARD_FAIL: halted at 8.0", hf.halted_at === "8.0");
    check("HARD_FAIL: later trunk never ran", hf.executed.length === 2 && !hf.executed.some((e) => e.trunk_id === "3.0"));
    check("HARD_FAIL: reason names the firewall", /HARD_FAIL/.test(hf.halt_reason || ""));
    check("HARD_FAIL: not completed", hf.completed === false);
    check("HARD_FAIL: blocking entry recorded", hf.executed.at(-1).firewall_status === "HARD_FAIL" && hf.executed.at(-1).continuation_blocked === true);

    // 4. BLOCKED_NO_PROOF halts the same way (Trunk 8.0 with no intent).
    const bnp = await runTrunkSequence(plan(["8.0", "2.0"]), "pain meds?", {
      outputs: { "8.0": "firewall_status: BLOCKED_NO_PROOF. No diagnosis or dosages.", "2.0": CLEAN },
    });
    check("BLOCKED_NO_PROOF: halted at 8.0", bnp.halted_at === "8.0" && /BLOCKED_NO_PROOF/.test(bnp.halt_reason || ""));
    check("BLOCKED_NO_PROOF: 2.0 never ran", bnp.executed.length === 1);

    // 5. Trunk 1.0 escalate gate — halts BEFORE any routed trunk runs (F8).
    const gate = await runTrunkSequence({ routing_plan: { next_trunks: ["2.0", "3.0"] }, safety_gate: { status: "escalate_now", reasons: ["chest pain + syncope"] } }, "chest pain", { outputs: { "2.0": CLEAN } });
    check("gate: nothing executed", gate.executed.length === 0);
    check("gate: halted at 1.0 with escalate reason", gate.halted_at === "1.0" && /escalate_now/i.test(gate.halt_reason || ""));

    // 6. Mid-sequence escalation short-circuits the rest.
    const esc = await runTrunkSequence(plan(["2.0", "9.0", "3.0"]), "red flag follow-up", {
      outputs: { "2.0": CLEAN, "9.0": "Risk outcome: escalate_now. Blocking items: none. No diagnosis or dosages.", "3.0": CLEAN },
    });
    check("escalate: halted at 9.0", esc.halted_at === "9.0" && /escalate_now/i.test(esc.halt_reason || ""));
    check("escalate: 3.0 never ran", esc.executed.length === 2);
    // T5 signalled structurally also halts (conservative detection).
    const t5 = await runTrunkSequence(plan(["2.0", "3.0"]), "input", {
      outputs: { "2.0": { triage_payload: "urgent", safety_tier: "T5" }, "3.0": CLEAN },
    });
    check("T5: structured tier halts", t5.halted_at === "2.0" && t5.executed.length === 1);

    // 7. Verification failure halts — rejected output never grounds the next trunk.
    const vf = await runTrunkSequence(plan(["2.0", "3.0"]), "input", {
      outputs: { "2.0": "SNOMED CT code: 99999999 assigned without any receipt.", "3.0": CLEAN },
    });
    check("verify-fail: halted at 2.0", vf.halted_at === "2.0" && /verification_failed/.test(vf.halt_reason || ""));
    check("verify-fail: entry records pass=false", vf.executed[0].pass === false);
    check("verify-fail: 3.0 never ran", vf.executed.length === 1);

    // 8. Malformed plan throws — never part-runs.
    let threw = false;
    try {
      await runTrunkSequence({ routing_plan: { next_trunks: ["11.0"] } }, "input", {});
    } catch (_) {
      threw = true;
    }
    check("malformed plan (unknown trunk) throws", threw);

    // 9. Empty plan is a valid no-op sequence.
    const empty = await runTrunkSequence(plan([]), "input", {});
    check("empty plan: completed with nothing executed", empty.completed === true && empty.executed.length === 0);

    // Integration seam: trunk-pipeline re-exports the sequencer (single surface).
    check("re-exported from trunk-pipeline", reexported === runTrunkSequence);
    // Escalation detector is conservative on both text and structure.
    check("detectEscalation: text", detectEscalation("we must escalate_now") === true);
    check("detectEscalation: tier text", detectEscalation("safety tier: T5") === true);
    check("detectEscalation: clean", detectEscalation(CLEAN) === false);
    check("TRUNK_IDS covers 1.0–9.0", TRUNK_IDS.length === 9);
  } finally {
    if (saved === undefined) delete process.env.HEYDOC_SEQUENCER;
    else process.env.HEYDOC_SEQUENCER = saved;
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-sequencer: OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
