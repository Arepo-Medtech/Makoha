/**
 * Contract tests for the ContextPacket `conversation[]` field (FL-40 packet
 * amendment). Asserts:
 *   - a packet WITHOUT conversation validates unchanged (byte-identical posture);
 *   - a well-formed conversation validates;
 *   - malformed conversation is rejected (bad role, extra key, non-array, bad turn);
 *   - contextInjection() OMITS the key when no conversation is supplied, and
 *     INCLUDES it verbatim when supplied (the byte-identical guarantee + wiring);
 *   - runPipeline threads options.conversation into the packet the generator sees.
 * Run from repo root: node test/contract-context-packet-conversation.js
 */
import { validateContextPacket } from "../verification/pipeline-schemas.js";
import { contextInjection, runPipeline } from "../verification/pipeline.js";

function base() {
  // The minimal valid packet shape (matches contextInjection's required output).
  return { facts: [], evidence: [], constraints: ["no diagnosis"], receipts: [] };
}
const CONVO = [
  { role: "patient", turn: 0, text: "My chest feels tight and I can't breathe." },
  { role: "assistant", turn: 1, text: "When did the breathlessness start?" },
  { role: "patient", turn: 2, text: "About half a day ago, getting worse." },
];

function expectThrow(fn, label, errors) {
  try {
    fn();
    errors.push(`${label}: expected a throw, got none`);
  } catch (_) {
    /* expected */
  }
}

async function run() {
  const errors = [];

  // 1. No conversation → validates unchanged.
  try {
    validateContextPacket(base());
  } catch (e) {
    errors.push("base packet (no conversation) rejected: " + e.message);
  }

  // 2. Well-formed conversation validates.
  try {
    validateContextPacket({ ...base(), conversation: CONVO });
  } catch (e) {
    errors.push("valid conversation rejected: " + e.message);
  }

  // 3. Malformed conversations rejected.
  expectThrow(() => validateContextPacket({ ...base(), conversation: [{ role: "doctor", turn: 0, text: "x" }] }), "bad role", errors);
  expectThrow(() => validateContextPacket({ ...base(), conversation: [{ role: "patient", turn: 0, text: "x", spoiler: 1 }] }), "extra key", errors);
  expectThrow(() => validateContextPacket({ ...base(), conversation: [{ role: "patient", turn: -1, text: "x" }] }), "negative turn", errors);
  expectThrow(() => validateContextPacket({ ...base(), conversation: "not an array" }), "non-array", errors);

  // 4. contextInjection omits the key when absent, includes it when present.
  const withoutConvo = contextInjection({ steps: [] }, [], { run_id: "r", trunk_id: "6.0" });
  if ("conversation" in withoutConvo) errors.push("contextInjection added a conversation key when none was supplied (breaks byte-identical guarantee)");
  const withConvo = contextInjection({ steps: [] }, [], { run_id: "r", trunk_id: "6.0", conversation: CONVO });
  if (JSON.stringify(withConvo.conversation) !== JSON.stringify(CONVO)) errors.push("contextInjection did not pass conversation through verbatim");

  // 5. runPipeline threads options.conversation into the sealed packet.
  const result = await runPipeline({ user_input: "chest pain", trunk: "6.0", conversation: CONVO, candidate_output: "provisional draft, no diagnosis" });
  if (JSON.stringify(result.packet.conversation) !== JSON.stringify(CONVO)) errors.push("runPipeline did not thread conversation into the packet");
  // and a pipeline run WITHOUT conversation must not carry the key
  const plain = await runPipeline({ user_input: "chest pain", trunk: "6.0", candidate_output: "provisional draft, no diagnosis" });
  if ("conversation" in plain.packet) errors.push("runPipeline added a conversation key when none was supplied");

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-context-packet-conversation: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
