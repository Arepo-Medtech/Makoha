/**
 * Contract tests for the fhir-broker AU Core structural conformance validator.
 * Asserts: tools list includes fhir_validate; a conformant Condition validates
 * 'conformant'; a required element missing → 'non_conformant' with that element's
 * required check failing; resourceType/profile mismatch fails; ValueSet binding is
 * reported 'not_evaluated' (deferred to NCTS); ig_version + mock receipt present.
 * Run from repo root: node test/contract-fhir-conformance.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/fhir-broker/index.js");
const COND_URL = "http://hl7.org.au/fhir/core/StructureDefinition/au-core-condition";

const conformantCondition = () => ({
  resourceType: "Condition",
  meta: { profile: [COND_URL] },
  clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
  category: [{ coding: [{ system: "http://snomed.info/sct", code: "73211009" }] }],
  code: { coding: [{ system: "http://snomed.info/sct", code: "279039003", display: "Low back pain" }] },
  subject: { reference: "Patient/pat-mock-1" },
});

async function run() {
  const errors = [];
  const proc = spawn("node", [serverPath], { cwd: repoRoot, env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" }, stdio: ["pipe", "pipe", "pipe"] });
  proc.stderr.on("data", (d) => process.stderr.write(d));
  const pending = new Map();
  const rl = createInterface(proc.stdout);
  rl.on("line", (line) => { let m; try { m = JSON.parse(line); } catch { return; } if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const rpc = (id, method, params) => new Promise((res) => { pending.set(id, res); proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const notify = (method) => proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  let id = 100;
  const validate = async (resource) => JSON.parse((await rpc(++id, "tools/call", { name: "fhir_validate", arguments: { resource, mode: "mock" } })).result.content[0].text);

  try {
    const init = await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ct", version: "0.1.0" } });
    if (init.error) throw new Error(init.error.message);
    notify("notifications/initialized");
    const names = ((await rpc(3, "tools/list")).result?.tools ?? []).map((t) => t.name);
    if (!names.includes("fhir_validate")) errors.push("missing tool: fhir_validate");

    const good = await validate(conformantCondition());
    if (good.conformance?.status !== "conformant") errors.push("conformant Condition should validate 'conformant', got " + good.conformance?.status);
    if (!good.conformance?.ig_version) errors.push("missing ig_version");
    if (good.receipt?.mode !== "mock") errors.push("receipt mode not mock");
    if (!good.conformance.checks.some((c) => c.result === "not_evaluated")) errors.push("expected a not_evaluated (deferred NCTS) binding check");

    // missing required 'subject' -> non_conformant, subject required check fails
    const noSubject = conformantCondition();
    delete noSubject.subject;
    const bad = await validate(noSubject);
    if (bad.conformance?.status !== "non_conformant") errors.push("missing subject should be non_conformant");
    if (!bad.conformance.checks.some((c) => c.path === "Condition.subject" && /^required/.test(c.requirement) && c.pass === false)) errors.push("subject required check should fail");

    // resourceType vs profile mismatch
    const wrong = await validate({ resourceType: "Patient", meta: { profile: [COND_URL] } });
    if (wrong.conformance?.status !== "non_conformant") errors.push("Patient-as-Condition should be non_conformant");
    if (!wrong.conformance.checks.some((c) => c.requirement === "resourceType_matches_profile" && c.pass === false)) errors.push("resourceType mismatch should fail");
  } finally {
    proc.kill("SIGTERM");
  }
  if (errors.length) { console.error("Contract failures:", errors); process.exit(1); }
  console.log("contract-fhir-conformance: OK");
}
run().catch((e) => { console.error(e); process.exit(1); });
