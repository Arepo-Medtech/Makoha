/**
 * Contract tests for heydoc MCP server: evidence-drug-guideline
 * (FLOW_PLAN H2, #15 JamesANZ/medical-mcp) — ADVISORY, SAFETY-CRITICAL.
 *
 * ══ WHY THIS TEST EXISTS (G9 / §1 dose-source-singular) ═══════════════════════
 * This test proves that NO #15 result can reach a dose field. Harvested drug /
 * guideline evidence is ADVISORY CONTEXT ONLY. The pharmacology firewall
 * (Trunk 8.0 PharmCheck) + verifier check 5 remain the ONLY dose source in the
 * system. #15 output must be structurally barred from ever carrying a dose —
 * this test is the adversarial proof of that boundary, at three layers:
 *   (5) whole-payload: no dose-shaped KEY anywhere in the serialized response.
 *   (6) unit: assertNoDose() throws on dose-shaped keys, passes a clean object.
 *   (7) patient_eligible:false — advisory, mock-gated, not patient-eligible at H2.
 *
 * Asserts:
 *  1. tools/list includes evidence_search.
 *  2. evidence_search(query:"*", mode:"mock") returns a receipt (request_id >=8,
 *     timestamp_utc, upstream, mode==="mock", no `server`) and payload.advisory === true.
 *  3. results non-empty; EVERY result has advisory === true and a category in
 *     {drug-interaction, paediatric, guideline}.
 *  4. EVERY result.evidence_node validates against evidence-node.schema.json AND
 *     supports[0].ref === receipt.request_id.
 *  5. NO-DOSE #1 (whole-payload): serialized response contains no dose-shaped KEY.
 *  6. NO-DOSE #2 (unit): assertNoDose throws on dose-shaped keys, not on a clean object.
 *  7. NO-DOSE #3: patient_eligible === false (the schema-structural bar is proven in #6).
 *
 * Run from repo root: node test/contract-evidence-drug-guideline.js
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import Ajv from "ajv/dist/2020.js";
import { assertNoDose } from "../mcp/servers/_shared/evidence-map.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const serverPath = join(repoRoot, "mcp/servers/evidence-drug-guideline/index.js");
const evidenceNodeSchemaPath = join(repoRoot, "mcp/schemas/evidence-node.schema.json");

// Draft 2020-12; strict:false so unknown formats (date-time) are ignored (ajv-formats
// is not a declared dependency). Structure/required/enums still validate.
const ajv = new Ajv({ strict: false });
const evidenceNodeSchema = JSON.parse(readFileSync(evidenceNodeSchemaPath, "utf8"));
const validateEvidenceNode = ajv.compile(evidenceNodeSchema);

const ADVISORY_CATEGORIES = ["drug-interaction", "paediatric", "guideline"];

// Whole-payload dose-shaped KEY detector (NO-DOSE #1). Matches a dose-naming key
// followed by a JSON colon anywhere in the serialized response.
const DOSE_KEY_JSON_RE =
  /"(?:dose|doses|dosage|dosing|posology|strength|frequency|freq|mg|mcg|microgram|milligram|max_dose|dose_guidance|recommended_dose|titration)"\s*:/i;

function sendRequest(proc, req) {
  proc.stdin.write(JSON.stringify(req) + "\n");
}

function readResponse(proc) {
  return new Promise((resolve, reject) => {
    const rl = createInterface(proc.stdout);
    rl.once("line", (line) => {
      rl.close();
      try {
        resolve(JSON.parse(line));
      } catch (e) {
        reject(e);
      }
    });
  });
}

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

async function run() {
  const proc = spawn("node", [serverPath], {
    cwd: repoRoot,
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const errors = [];
  proc.stderr.on("data", (d) => process.stderr.write(d));

  // ── (6) NO-DOSE unit checks on assertNoDose (no server needed) ──────────────
  // Adversarial: every dose-shaped key, at every nesting depth, must THROW.
  if (!throws(() => assertNoDose({ dose: "1g" }))) errors.push("assertNoDose did NOT throw for { dose }");
  if (!throws(() => assertNoDose({ nested: { dosage_mg: 500 } }))) errors.push("assertNoDose did NOT throw for nested { dosage_mg }");
  if (!throws(() => assertNoDose({ list: [{ max_dose: "x" }] }))) errors.push("assertNoDose did NOT throw for array { max_dose }");
  if (!throws(() => assertNoDose({ frequency: "QID" }))) errors.push("assertNoDose did NOT throw for { frequency }");
  // A clean advisory object must NOT throw.
  if (throws(() => assertNoDose({ category: "guideline", advisory: true, locator: "x", claim: "y" }))) {
    errors.push("assertNoDose wrongly threw for a clean advisory object");
  }

  try {
    // MCP init sequence.
    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "contract-test", version: "0.1.0" } },
    });
    const initResp = await readResponse(proc);
    if (initResp.error) throw new Error(initResp.error.message || "init failed");

    sendRequest(proc, { jsonrpc: "2.0", method: "notifications/initialized" });

    // (1) tools/list includes evidence_search.
    sendRequest(proc, { jsonrpc: "2.0", id: 3, method: "tools/list" });
    const listResp = await readResponse(proc);
    if (listResp.error) throw new Error(listResp.error.message || "tools/list failed");
    const names = (listResp.result?.tools ?? []).map((t) => t.name);
    if (!names.includes("evidence_search")) errors.push("Missing tool: evidence_search");

    // Wildcard mock search.
    sendRequest(proc, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "evidence_search", arguments: { query: "*", mode: "mock" } },
    });
    const callResp = await readResponse(proc);
    if (callResp.error) throw new Error(callResp.error.message || "tools/call failed");
    const content = callResp.result?.content?.[0]?.text;
    if (!content) {
      errors.push("evidence_search returned no content");
    } else {
      const payload = JSON.parse(content);
      const r = payload.receipt;

      // (2) Receipt shape; advisory:true; no `server` field.
      if (!r) {
        errors.push("evidence_search response missing receipt");
      } else {
        if (!r.request_id || String(r.request_id).length < 8) errors.push("receipt request_id missing or <8 chars");
        if (!r.timestamp_utc) errors.push("receipt missing timestamp_utc");
        if (!r.upstream || String(r.upstream).length < 1) errors.push("receipt missing non-empty upstream");
        if (r.mode !== "mock") errors.push("receipt mode expected mock, got " + r.mode);
        if (r.server !== undefined) errors.push("receipt should OMIT `server` (harvested server not in enum), got " + r.server);
      }
      if (payload.advisory !== true) errors.push("payload.advisory expected true, got " + payload.advisory);

      // (3) results non-empty; every result advisory + valid category.
      const results = payload.results;
      if (!Array.isArray(results) || results.length === 0) {
        errors.push("results is not a non-empty array");
      } else {
        results.forEach((res, i) => {
          if (res.advisory !== true) errors.push(`result[${i}].advisory !== true`);
          if (!ADVISORY_CATEGORIES.includes(res.category)) errors.push(`result[${i}].category "${res.category}" not in advisory set`);

          // (4) evidence_node validates against schema and is grounded on the receipt.
          const node = res.evidence_node;
          if (!node) {
            errors.push(`result[${i}] missing evidence_node`);
          } else {
            if (!validateEvidenceNode(node)) {
              errors.push(`result[${i}].evidence_node fails schema: ${ajv.errorsText(validateEvidenceNode.errors)}`);
            }
            const s0 = node.supports?.[0];
            if (!s0 || s0.kind !== "live_data_receipt") errors.push(`result[${i}].evidence_node supports[0].kind !== live_data_receipt`);
            else if (r && s0.ref !== r.request_id) errors.push(`result[${i}].evidence_node supports[0].ref !== receipt.request_id`);
          }
        });
      }

      // (5) NO-DOSE #1 — whole-payload: no dose-shaped KEY anywhere.
      const serialized = JSON.stringify(payload);
      if (DOSE_KEY_JSON_RE.test(serialized)) {
        errors.push("NO-DOSE #1 BREACH: a dose-shaped KEY appears in the serialized #15 response");
      }

      // (7) NO-DOSE #3 — advisory output is mock-gated, not patient-eligible at H2.
      if (payload.patient_eligible !== false) errors.push("payload.patient_eligible expected false, got " + payload.patient_eligible);
    }
  } finally {
    proc.kill("SIGTERM");
  }

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-evidence-drug-guideline: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
