/**
 * Contract test for Track A / Phase A2 — the AU_OSS_CDS flag state + the OpenCDS gateway
 * wire contract. Contract-lock only: asserts the shapes, the fail-closed validators, and
 * the frozen-enum lockstep. It does NOT exercise any client logic (that is A3) — and it
 * PROVES A2 did not open the slot: AU_OSS_CDS is a selectable state but still leaves the
 * cds-adapter unavailable (fail-closed) until A3 wires a validated endpoint + client.
 * Run from repo root: node test/contract-opencds-contract.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pharmCdsState, isPharmAuOssCds, isPharmSyntheticSelfDeveloped } from "../config/flags.js";
import { cdsVendorAvailable } from "../mcp/servers/pharmacology/cds-adapter/index.js";
import {
  OPENCDS_CHECK_IDS,
  OPENCDS_FLAG_TYPES,
  validateOpenCdsRequest,
  validateOpenCdsResponse,
} from "../mcp/servers/pharmacology/cds-adapter/opencds-contract.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// --- 1. AU_OSS_CDS is a real, self-resolving, fail-safe flag state ---
expect(pharmCdsState({ HEYDOC_PHARM_CDS: "AU_OSS_CDS" }) === "AU_OSS_CDS", '"AU_OSS_CDS" must resolve to itself');
expect(isPharmAuOssCds({ HEYDOC_PHARM_CDS: "AU_OSS_CDS" }) === true, "isPharmAuOssCds true for the OSS state");
expect(isPharmAuOssCds({ HEYDOC_PHARM_CDS: "FILLED" }) === false, "isPharmAuOssCds false for FILLED");
expect(isPharmAuOssCds({ HEYDOC_PHARM_CDS: "SYNTHETIC_SELF_DEVELOPED" }) === false, "isPharmAuOssCds false for the synthetic engine state");
expect(isPharmSyntheticSelfDeveloped({ HEYDOC_PHARM_CDS: "AU_OSS_CDS" }) === false, "OSS state is distinct from the synthetic engine state");
expect(pharmCdsState({ HEYDOC_PHARM_CDS: "au_oss_cds" }) === "EMPTY", "case-mismatch fails safe to EMPTY (exact-match enum)");
expect(pharmCdsState({ HEYDOC_PHARM_CDS: "bogus" }) === "EMPTY", "garbage still fails safe to EMPTY");

// --- 2. A2 did NOT open the slot: OSS state alone leaves cds-adapter unavailable ---
// (queryCds/cdsVendorAvailable still gate on FILLED; A3 adds the AU_OSS_CDS route.)
expect(cdsVendorAvailable({ HEYDOC_PHARM_CDS: "AU_OSS_CDS" }).available === false, "E7: AU_OSS_CDS does NOT unlock the CDS slot at contract-lock (fail-closed until A3 + validation)");

// --- 3. Frozen-enum lockstep: the mirrored enums equal the JSON-schema source of truth ---
const frozen = JSON.parse(readFileSync(join(__dirname, "..", "mcp", "schemas", "pharm-check.schema.json"), "utf8"));
const frozenCheckIds = frozen.properties.check_results.items.properties.check_id.enum;
const frozenFlagTypes = frozen.properties.flags.items.properties.flag_type.enum;
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
expect(sameList(OPENCDS_CHECK_IDS, frozenCheckIds), "OPENCDS_CHECK_IDS must be byte-equal to the frozen check_id enum (lockstep)");
expect(sameList(OPENCDS_FLAG_TYPES, frozenFlagTypes), "OPENCDS_FLAG_TYPES must be byte-equal to the frozen flag_type enum (lockstep)");

// --- 4. Request validator: valid parses, malformed throws ---
const goodReq = {
  request_id: "req-000001",
  drug: { drug_name: "amoxicillin", drug_class: "penicillin", atc_code: "J01CA04" },
  resolved_facts: { allergy_status: "none_known", current_medications: [], patient_age_years: 40 },
  checks_requested: ["allergy_check", "interaction_check"],
  knowledge_module_set: "fl30-kb:v1",
  mode: "mock",
};
expect(!throws(() => validateOpenCdsRequest(goodReq)), "a well-formed request validates");
expect(throws(() => validateOpenCdsRequest({ ...goodReq, request_id: "short" })), "request_id under 8 chars rejected");
expect(throws(() => validateOpenCdsRequest({ ...goodReq, checks_requested: ["not_a_real_check"] })), "off-enum check in request rejected");
expect(throws(() => validateOpenCdsRequest({ ...goodReq, checks_requested: [] })), "empty checks_requested rejected");
expect(throws(() => { const { knowledge_module_set, ...rest } = goodReq; validateOpenCdsRequest(rest); }), "missing knowledge_module_set rejected");

// --- 5. Response validator: fail-closed (returns ok:false, never throws) ---
const goodResp = {
  request_id: "req-000001",
  engine: "opencds-dss",
  knowledge_module_set: "fl30-kb:v1",
  check_verdicts: [
    { check_id: "allergy_check", status: "PASS" },
    { check_id: "interaction_check", status: "HARD_FAIL", severity: "critical", reason: "warfarin + NSAID" },
  ],
  flags: [{ flag_type: "interaction_severe", severity: "critical", description: "warfarin + ibuprofen" }],
};
const okParse = validateOpenCdsResponse(goodResp);
expect(okParse.ok === true, "a well-formed response validates ok");

// off-enum check_id → fail-closed (the whole response is rejected, no partial trust)
const badCheck = validateOpenCdsResponse({ ...goodResp, check_verdicts: [{ check_id: "schedule_check", status: "PASS" }] });
expect(badCheck.ok === false, "off-enum check_id in a verdict → response rejected (fail-closed)");
// off-enum flag_type → rejected
const badFlag = validateOpenCdsResponse({ ...goodResp, flags: [{ flag_type: "made_up", severity: "low", description: "x" }] });
expect(badFlag.ok === false, "off-enum flag_type → response rejected");
// garbage payload → ok:false, does NOT throw (can't crash the firewall path)
let threw = false;
try { validateOpenCdsResponse(null); } catch { threw = true; }
expect(threw === false && validateOpenCdsResponse(null).ok === false, "garbage response returns ok:false without throwing");
// empty verdict list rejected (a response must carry at least one verdict)
expect(validateOpenCdsResponse({ ...goodResp, check_verdicts: [] }).ok === false, "empty check_verdicts rejected");

if (errors.length) {
  console.error("contract-opencds-contract FAILED:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`contract-opencds-contract OK (${OPENCDS_CHECK_IDS.length} checks, ${OPENCDS_FLAG_TYPES.length} flag types, lockstep verified)`);
