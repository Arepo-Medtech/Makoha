/**
 * Contract test — THE DESCENT GUARD (M2): no trunk inherits another trunk's conclusion.
 *
 * OPERATOR, 2026-07-15: *"A human-in-the-loop system that lets the clinician's anchor propagate into
 * the model, and the model's sycophancy back into the clinician, has engineered the correlation it
 * should have been built to break."* And the mountain: **most Everest deaths are on the descent** — not
 * the climb. 6.0–9.0 run downhill from 5.0's summit, which is exactly where anchoring propagates,
 * premature closure bites and sycophancy compounds.
 *
 * ══ M2's PREMISE WAS FALSE, AND THIS SUITE IS WHAT THE RESEARCH LEFT ══
 *
 * `.planning/TRUNK-RISK-MODEL.md` §4 said *"T6–T9 currently inherit the frame."* **They do not.**
 * Verified BEHAVIOURALLY, not by reading signatures: run 5.0 → 6.0 through the real sequencer with a
 * marker in 5.0's output, capture 6.0's packet through the generator hook, and the marker is absent.
 * There is no trunk-to-trunk output flow at all — `runTrunkWithGrounding` accepts no upstream-context
 * parameter, and the sequencer's `executed` array is an accumulating RECORD, never fed forward.
 *
 * So there was no frame to guard. Building the guard anyway would have been a wall across a gate
 * nobody uses — precisely the failure the whole trunk-risk-model exercise exists to correct.
 *
 * ══ WHAT IS ACTUALLY WORTH DOING ══
 *
 * The property "no trunk inherits another's conclusion" holds TODAY, BY CONSTRUCTION — and nothing
 * asserts it. That is the M1 shape exactly: an accident, not a guarantee. And this one is *load-bearing*
 * and *temporary*: a pipeline whose trunks never see each other's work is not the target state. 7.0 must
 * eventually code what 4.0/5.0 framed. The day someone wires that up, they will do it the easy way — pass
 * the output — and the sycophancy compounds silently down the descent.
 *
 * **This suite fails when that happens, and says how to do it instead:** a conclusion reaches a
 * downstream trunk as an `EvidenceNode` in `packet.evidence[]` — a CLAIM someone made, carrying a
 * receipt — never as a premise in `packet.facts[]`. Then, and only then, is a `downstream_independence`
 * verifier check worth building (agreement with an upstream conclusion must cite support that is not
 * merely that conclusion).
 *
 * The evidence channel already exists and is the correct home. Nothing here needs to be invented — it
 * needs to be routed.
 *
 * Run from repo root: node test/contract-descent-guard.js
 */
import { readFileSync } from "node:fs";
import { runTrunkSequence } from "../integration/trunk-sequencer.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };

const MARKER = "ZZQX-UPSTREAM-CONCLUSION-MARKER";

// ---- 1. BEHAVIOURAL: an upstream conclusion must not reach a downstream trunk's packet -----------
// The packet is ALL a trunk ever sees — generation is packet-only by contract. So capturing the packet
// through the generator hook is the whole truth about what a trunk inherited.
const packets = {};
let n = 0;
await runTrunkSequence(
  { routing_plan: { next_trunks: ["5.0", "6.0"], why: "descent-guard test" }, safety_gate: { safety_tier: "T1" } },
  "back pain",
  {
    writeArtifacts: false,
    outputs: { "5.0": `axis_b_ruleout_matrix concludes ${MARKER}` },
    generateCandidate: async (packet) => { packets[packet.trunk_id] = JSON.stringify(packet); return { candidate_output: `downstream-out-${++n}` }; },
  },
);

expect(Object.keys(packets).length > 0, "fixture: at least one downstream packet must be captured");
for (const [trunkId, json] of Object.entries(packets)) {
  expect(!json.includes(MARKER),
    `T${trunkId} inherited an upstream trunk's CONCLUSION as packet content. On this mountain the deaths are on the descent: a downstream trunk that receives 5.0's frame as a premise will confirm it — anchoring, premature closure and sycophancy compound downhill. Route it as an EvidenceNode in packet.evidence[] (a CLAIM, with a receipt), never as a fact, and build the downstream_independence check before relying on it.`);
}

// ---- 2. Generation is PACKET-ONLY — the property the above rests on ------------------------------
// If a generator ever saw userInput or an upstream output directly, the packet would stop being the
// whole truth and section 1 would be measuring the wrong thing.
const genSrc = readFileSync("integration/generation-backend.js", "utf8");
expect(/packet-only/i.test(genSrc),
  "the generation contract must remain packet-only — the packet is the ONLY thing a trunk sees, and section 1's proof depends on it");
const pipelineSrc = readFileSync("verification/pipeline.js", "utf8");
expect(/generate_candidate\(packet\)/.test(pipelineSrc),
  "generate_candidate must receive the packet and nothing else — no user_input, no upstream output");

// ---- 3. The correct future home EXISTS ----------------------------------------------------------
// This is not a wall. When trunk-to-trunk flow is built (and it must be — 7.0 has to code what 5.0
// framed), the channel is already there and already carries the right semantics: a claim + its support.
const packetSchema = JSON.parse(readFileSync("mcp/schemas/context-packet.schema.json", "utf8"));
expect("evidence" in packetSchema.properties,
  "packet.evidence[] must exist — it is where an upstream conclusion belongs: a CLAIM someone made, with a receipt, not a fact of the world");
expect("facts" in packetSchema.properties && packetSchema.properties.facts.items.additionalProperties === false,
  "packet.facts[] must stay closed — a conclusion smuggled in as a 'fact' is the premise-not-evidence failure this suite names");

// ---- 4. The sequencer's own stated rationale ----------------------------------------------------
// Halt rule 4 says a rejected output "must never become upstream context for the next trunk". Today NO
// output becomes upstream context, so the rule is currently guarding a flow that does not exist. That
// is fine — it is the right rule for the target state — but it should not be mistaken for evidence
// that the flow is safe. It is evidence that someone INTENDED the flow.
const seqSrc = readFileSync("integration/trunk-sequencer.js", "utf8");
expect(/upstream context for the next trunk/.test(seqSrc),
  "the sequencer's halt-rule-4 rationale must remain — it is the recorded intent that outputs will one day flow, and the reason this suite exists");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-descent-guard FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-descent-guard: OK (M2 — no trunk inherits another's conclusion, proven behaviourally through the real sequencer; generation stays packet-only; packet.evidence[] is the correct home for when the flow is built)");
