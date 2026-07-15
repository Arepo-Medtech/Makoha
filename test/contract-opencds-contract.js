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
  resolved_facts: { allergens: [], current_medications: [], patient_age_years: 40 },
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

// ---- W1 / F-C8: THE WIRE MUST CARRY EVERY FACT THE CHECKS READ ---------------------------------
//
// This is asserted against engine.js's OWN `resolved.*` reads, not a hand-written list — a hand-list
// is what drifts, and drift here is invisible: zod's z.object() STRIPS unknown keys silently, so a
// fact the wire forgot simply never arrives and the check reports NOT_RUN forever.
//
// That is not hypothetical. The wire carried `allergy_status` — the LABEL engine.js uses for the
// MISSING fact (`missing_facts_required: ["allergy_status"]`) — while the fact itself is
// `resolved.allergens`. So the gateway never saw an allergy history; allergy_check is a
// DEFAULT_CHECK; NOT_RUN folds to BLOCKED_NO_PROOF; and the OSS CDS route could not return PASS for
// ANY drug, ever. Safe and useless. No test saw it because no test called a real KM until Phase C.
{
  const engineSrc = readFileSync("mcp/servers/pharmacology/engine.js", "utf8");
  const reads = [...engineSrc.matchAll(/\bresolved\.([a-z_0-9]+)/g)].map((m) => m[1]);
  const needed = [...new Set(reads)].sort();
  expect(needed.length >= 7, `fixture: expected engine.js to read >=7 resolved facts, found ${needed.length}`);

  const sent = { request_id: "req-00000001", drug: { drug_name: "warfarin" }, checks_requested: ["allergy_check"], knowledge_module_set: "fl30-kb:v2", mode: "mock" };
  const facts = {};
  const sample = { allergens: ["penicillin"], current_medications: ["amiodarone"], egfr_ml_min: 90, hepatic_impairment: false, nti_monitoring_documented: true, patient_age_years: 60, pregnancy_status: "not_pregnant", s8_pdmp_checked: true };
  for (const f of needed) facts[f] = sample[f];
  const out = validateOpenCdsRequest({ ...sent, resolved_facts: facts });

  for (const f of needed) {
    expect(f in out.resolved_facts,
      `engine.js reads resolved.${f}, but the wire STRIPS it — the gateway would never receive it and its check could only ever return NOT_RUN. zod strips unknown keys SILENTLY, so this fails nowhere else.`);
  }

  // …and the label is not the fact. Pinned so nobody re-adds it "for compatibility".
  const stripped = validateOpenCdsRequest({ ...sent, resolved_facts: { allergy_status: "none_known", allergens: [] } });
  expect(!("allergy_status" in stripped.resolved_facts),
    "`allergy_status` is the label engine.js uses for the MISSING fact, not the fact. It must not sit on the wire beside `allergens` — a field that LOOKS like the allergy fact but is never populated is exactly what hid F-C8.");
  expect("allergens" in stripped.resolved_facts, "`allergens` is the fact the checks read");

  // A pregnancy typo must FAIL, not silently become "unknown" — that branch relaxes a teratogen gate.
  expect(throws(() => validateOpenCdsRequest({ ...sent, resolved_facts: { pregnancy_status: "Pregnant" } })),
    "pregnancy_status is an enum: engine.js compares against exactly 'pregnant'/'not_pregnant', and anything else falls to the D-FL05-1 UNKNOWN branch. A typo must be a validation failure here, not a quiet relaxation of the teratogen fail-safe.");
}

if (errors.length) {
  console.error("contract-opencds-contract FAILED:\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log(`contract-opencds-contract OK (${OPENCDS_CHECK_IDS.length} checks, ${OPENCDS_FLAG_TYPES.length} flag types, lockstep verified)`);
