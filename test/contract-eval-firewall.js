/**
 * Contract tests for the EVAL-PATH scoring-store firewall (FL-40, Phase 2).
 * The firewall (context-allowlist.js) already default-denies at the packet
 * boundary; these tests lock the EVAL additions to it:
 *   - the patient simulator HARD-STOPS on any sealed node (10_–13_);
 *   - node 02 (the simulator's dialogue) NEVER becomes a ContextPacket fact;
 *   - a real multi-turn drive never puts sealed-answer content (the gold
 *     diagnosis name, gold "should-NOT" drug names) into the patient's mouth;
 *   - the simulator's entire output/state carries no sealed-node key.
 * Node 10 is read HERE only to assert its content is ABSENT downstream — the
 * scorer-side read pattern, never a packet path.
 * Run from repo root: node test/contract-eval-firewall.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { contextAllowList, injectableFacts } from "../verification/context-allowlist.js";
import { createPatientSimulator } from "../verification/patient-simulator.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE_DIR = join(HERE, "..", "data", "cases", "SPEC-CARD-01-00023");
const load = (n) => JSON.parse(readFileSync(join(CASE_DIR, n), "utf8"));

function expectThrow(fn, label, errors) {
  try {
    fn();
    errors.push(`${label}: expected a throw, got none`);
  } catch (_) {
    /* expected */
  }
}

function run() {
  const errors = [];
  const presentation = load("01_presentation_layer.json");
  const policy = load("02_conversational_policy.json");
  const sealedGround = load("10_ground_truth_node.json"); // read scorer-side ONLY

  // 1. Firewall regression lock on the eval path: contextAllowList throws on any
  //    sealed node reaching it.
  for (const sealed of ["10_ground_truth_node", "11_symptom_links_node", "12_management_plan_node", "13_safety_netting_node"]) {
    expectThrow(() => contextAllowList({ [sealed]: { case_id: "x" } }), `contextAllowList(${sealed})`, errors);
  }

  // 2. The patient simulator hard-stops if handed a sealed node.
  expectThrow(
    () => createPatientSimulator({ presentation, policy, "10_ground_truth_node": sealedGround }),
    "simulator handed sealed node",
    errors,
  );

  // 3. Node 02 is EXCHANGE material, never a packet fact.
  const facts02 = injectableFacts(contextAllowList({ "02_conversational_policy": policy }));
  if (facts02.length !== 0) errors.push(`02 produced ${facts02.length} packet facts — must be 0 (exchange channel only)`);
  // sanity: 01 DOES produce packet facts (the allowlist isn't just refusing everything)
  const facts01 = injectableFacts(contextAllowList({ "01_presentation_layer": presentation }));
  if (facts01.length === 0) errors.push("01 produced 0 packet facts — allowlist appears to reject everything");

  // 4. Drive a real multi-turn consult and assert no sealed-answer content leaks
  //    into the patient's utterances.
  const sim = createPatientSimulator({ presentation, policy });
  const turns = [];
  turns.push(sim.openingTurn());
  // A plausible AI history sequence hitting general + specific + targeted gates.
  for (const q of [
    "Is there any position that makes it better or worse?",
    "Have you felt faint or like you might pass out?",
    "How do his hands and skin look and feel?",
    "Has the type of chest discomfort changed?",
    "What medications is he taking right now?",
  ]) {
    turns.push(sim.respondTo(q));
  }
  const allPatientText = turns.map((t) => t.patient_text).join("\n").toLowerCase();

  // 4a. The gold diagnosis name (node 10) must never appear in patient text.
  const goldDx = String(sealedGround.primary_diagnosis.snomed_display || "").toLowerCase(); // "cardiac tamponade"
  if (goldDx && allPatientText.includes(goldDx)) {
    errors.push(`sealed diagnosis "${goldDx}" leaked into patient dialogue`);
  }
  if (allPatientText.includes("tamponade")) errors.push('sealed term "tamponade" leaked into patient dialogue');

  // 4b. Gold "should-NOT-recommend" drug names (node 12) are answer-key content —
  //     the patient (on ibuprofen) never names them.
  for (const spoiler of ["glyceryl trinitrate", "furosemide", "beta-blocker"]) {
    if (allPatientText.includes(spoiler)) errors.push(`sealed management term "${spoiler}" leaked into patient dialogue`);
  }

  // 5. The simulator's turn objects carry no sealed-node key anywhere.
  const serialized = JSON.stringify(turns) + JSON.stringify(sim.elicitationReport());
  if (/"1[0-3]_[a-z_]+"/.test(serialized)) errors.push("a sealed-node key appears in simulator output");

  // 6. Behavioural sanity (proves the drive actually worked, so 4a/4b aren't
  //    vacuously true): volunteered item elicited at turn 0; gated items opened.
  const opening = turns[0];
  if (!opening.revealed.includes("DI-001")) errors.push("volunteered DI-001 not revealed at turn 0");
  const report = sim.elicitationReport();
  const elicitedIds = new Set(report.elicited.map((e) => e.item_id));
  for (const id of ["DI-002", "DI-003", "DI-004", "DI-005", "DI-006"]) {
    if (!elicitedIds.has(id)) errors.push(`expected ${id} to be elicited by the question sequence`);
  }
  if (opening.patient_text.length < 20) errors.push("opening turn produced no presenting complaint");

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-eval-firewall: OK");
}

run();
