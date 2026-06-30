/**
 * Contract tests for the pharmacology MCP server (mock deterministic core).
 * Asserts: tools list includes pharm_check/pharm_intent; the 5 checks drive the
 * right status; dose_guidance appears ONLY on PASS and NEVER on HARD_FAIL /
 * BLOCKED / paediatric; facts-absent -> BLOCKED_NO_PROOF; receipt is mode='mock'.
 * Run from repo root: node test/contract-pharmacology.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/pharmacology/index.js");

async function run() {
  const errors = [];
  const proc = spawn("node", [serverPath], { cwd: repoRoot, env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" }, stdio: ["pipe", "pipe", "pipe"] });
  proc.stderr.on("data", (d) => process.stderr.write(d));

  const pending = new Map();
  const rl = createInterface(proc.stdout);
  rl.on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const rpc = (id, method, params) => new Promise((res) => { pending.set(id, res); proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const notify = (method, params) => proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

  // Adult age by default — an unknown age now fail-safes to BLOCKED_NO_PROOF (no dose).
  const intent = (over = {}) => ({ intent_id: "int-1", session_ref: "enc-stub-008", intent_type: "new_prescription", drug_intent: { drug_name: "amoxicillin", drug_class: "penicillin" }, patient_facts_ref: {}, clinical_context: { patient_age_years: 45 }, mode: "mock", ...over });
  let callId = 100;
  const pharmCheck = async (intentObj, resolved_facts) => {
    const r = await rpc(++callId, "tools/call", { name: "pharm_check", arguments: { intent: intentObj, resolved_facts, mode: "mock" } });
    if (r.error) throw new Error(r.error.message || "pharm_check failed");
    return JSON.parse(r.result.content[0].text);
  };

  try {
    const init = await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "contract-test", version: "0.1.0" } });
    if (init.error) throw new Error(init.error.message || "init failed");
    notify("notifications/initialized");

    const list = await rpc(3, "tools/list");
    const names = (list.result?.tools ?? []).map((t) => t.name);
    if (!names.includes("pharm_check")) errors.push("missing tool: pharm_check");
    if (!names.includes("pharm_intent")) errors.push("missing tool: pharm_intent");

    // safe + fully resolved -> PASS + dose + mock receipt
    const safe = await pharmCheck(intent(), { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true });
    if (safe.status !== "PASS") errors.push("safe expected PASS, got " + safe.status);
    if (!safe.dose_guidance) errors.push("safe PASS should carry dose_guidance");
    if (safe.receipt?.mode !== "mock") errors.push("receipt mode should be mock");

    // facts absent -> BLOCKED_NO_PROOF, no dose
    const blocked = await pharmCheck(intent(), {});
    if (blocked.status !== "BLOCKED_NO_PROOF") errors.push("facts-absent expected BLOCKED_NO_PROOF, got " + blocked.status);
    if (blocked.dose_guidance) errors.push("BLOCKED must not carry dose_guidance");

    // allergy cross-reactivity -> HARD_FAIL, no dose
    const allergy = await pharmCheck(intent(), { allergens: ["penicillin"], current_medications: [] });
    if (allergy.status !== "HARD_FAIL") errors.push("allergy expected HARD_FAIL, got " + allergy.status);
    if (allergy.dose_guidance) errors.push("HARD_FAIL (allergy) must not carry dose_guidance");
    if (!allergy.flags.some((f) => f.flag_type === "allergy_cross_reactivity")) errors.push("allergy flag missing");

    // S8 without PDMP -> HARD_FAIL
    const s8 = await pharmCheck(intent({ drug_intent: { drug_name: "oxycodone", drug_class: "opioid" } }), { allergens: [], current_medications: [] });
    if (s8.status !== "HARD_FAIL") errors.push("S8-no-PDMP expected HARD_FAIL, got " + s8.status);
    if (!s8.flags.some((f) => f.flag_type === "schedule_8_pdmp_required")) errors.push("S8 PDMP flag missing");

    // paediatric -> HARD_FAIL, no dose, age flag
    const paed = await pharmCheck(intent({ clinical_context: { patient_age_years: 10 } }), { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true });
    if (paed.status !== "HARD_FAIL") errors.push("paediatric expected HARD_FAIL, got " + paed.status);
    if (paed.dose_guidance) errors.push("paediatric must NEVER carry dose_guidance");
    if (!paed.flags.some((f) => f.flag_type === "age_paediatric_weight_based")) errors.push("paediatric flag missing");

    // unknown age -> fail-safe BLOCKED_NO_PROOF, no dose (cannot confirm not paediatric)
    const noAge = await pharmCheck(intent({ clinical_context: {} }), { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true });
    if (noAge.status !== "BLOCKED_NO_PROOF") errors.push("unknown-age expected BLOCKED_NO_PROOF, got " + noAge.status);
    if (noAge.dose_guidance) errors.push("unknown-age must NOT carry dose_guidance");

    // intent-declared S8 (not in mock schedule map) still triggers PDMP HARD_FAIL
    const declaredS8 = await pharmCheck(intent({ drug_intent: { drug_name: "tapentadol", drug_class: "opioid", schedule: "S8" } }), { allergens: [], current_medications: [] });
    if (declaredS8.status !== "HARD_FAIL") errors.push("intent-declared S8 expected HARD_FAIL (PDMP), got " + declaredS8.status);
    if (!declaredS8.flags.some((f) => f.flag_type === "schedule_8_pdmp_required")) errors.push("intent-declared S8 PDMP flag missing");
  } finally {
    proc.kill("SIGTERM");
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-pharmacology: OK");
}

run().catch((e) => { console.error(e); process.exit(1); });
