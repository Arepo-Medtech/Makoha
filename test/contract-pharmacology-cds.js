/**
 * Contract test for MI-08 / MI-09 — pharmacology AMT underlay + empty CDS slot.
 *
 * MI-09 (E7 hard STOP): the empty CDS slot returns HARD_FAIL, never any
 * dosing/interaction/contraindication content, and folds monotonically so it can only
 * ADD a HARD_FAIL — an empty slot blocks even a PASS engine. MI-08: an AMT code is
 * validated via Terminology and coded only on a validate-pass (never fabricated).
 * Run from repo root: node test/contract-pharmacology-cds.js
 */
import { queryCds, cdsVendorAvailable, composeCdsVerdict } from "../mcp/servers/pharmacology/cds-adapter/index.js";
import { validateDrugAmt } from "../mcp/servers/pharmacology/amt-underlay.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

// A3: an injectable fake OpenCDS gateway — keeps the test fully OFFLINE (no live call).
import { DEFAULT_KM_SET as KM } from "../mcp/servers/pharmacology/cds-adapter/opencds-client.js"; // never a literal: a test that breaks on a version bump is not testing the version check
const gatewayReturning = (respObj, { ok = true, status = 200 } = {}) => async () => ({ ok, status, json: async () => respObj });
const gatewayThrows = () => async () => { throw new Error("ECONNREFUSED"); };
const ossEnv = { HEYDOC_PHARM_CDS: "AU_OSS_CDS", HEYDOC_PHARM_CDS_ENDPOINT: "https://opencds-gateway/v1" };
const ossIntent = { drug_intent: { drug_name: "warfarin", drug_class: "anticoagulant" }, mode: "mock" };

async function main() {
  // MI-09 — empty CDS slot (B4 uncontracted).
  expect(cdsVendorAvailable({}).available === false, "CDS vendor unavailable by default (B4)");
  expect(cdsVendorAvailable({ HEYDOC_PHARM_CDS: "FILLED" }).available === false, "PHARM_CDS=FILLED alone does NOT unlock content (endpoint required)");

  const cds = await queryCds({ drug: "oxycodone" }, { env: {} });
  expect(cds.verdict === "HARD_FAIL", "empty slot → HARD_FAIL");
  expect(cds.dose_guidance === null && cds.interactions === null && cds.contraindications === null, "empty slot emits NO dosing/interaction/contraindication content");
  expect(/not contracted \(B4\)/.test(cds.reason), "reason cites B4");

  // E7 — the empty slot blocks even a PASS engine; can only strengthen, never rescue.
  const onPass = composeCdsVerdict("PASS", cds);
  expect(onPass.status === "HARD_FAIL" && onPass.blocks === true, "E7: empty slot forces HARD_FAIL over a PASS engine (blocks)");
  const onWarn = composeCdsVerdict("WARN", cds);
  expect(onWarn.status === "HARD_FAIL", "E7: empty slot forces HARD_FAIL over a WARN engine");
  // A hypothetically-available PASS CDS never downgrades an engine HARD_FAIL.
  const engineHardFail = composeCdsVerdict("HARD_FAIL", { verdict: "PASS" });
  expect(engineHardFail.status === "HARD_FAIL", "monotone: CDS never rescues an engine HARD_FAIL");

  // PHARM_CDS=FILLED + endpoint but no validated client → fail-closed (still blocks).
  const filledNoClient = await queryCds({}, { env: { HEYDOC_PHARM_CDS: "FILLED", HEYDOC_PHARM_CDS_ENDPOINT: "https://cds/v1" } });
  expect(filledNoClient.verdict === "BLOCKED_NO_PROOF" && filledNoClient.dose_guidance === null, "configured-but-unbuilt CDS → BLOCKED_NO_PROOF, no content");

  // ---- A3: AU_OSS_CDS (OpenCDS) client, fully offline via an injected fake gateway ----
  // Availability: selecting AU_OSS_CDS without an endpoint stays fail-closed → HARD_FAIL.
  expect(cdsVendorAvailable({ HEYDOC_PHARM_CDS: "AU_OSS_CDS" }).available === false, "AU_OSS_CDS without an endpoint is unavailable");
  const ossNoEndpoint = await queryCds(ossIntent, { env: { HEYDOC_PHARM_CDS: "AU_OSS_CDS" } });
  expect(ossNoEndpoint.verdict === "HARD_FAIL" && ossNoEndpoint.dose_guidance === null, "AU_OSS_CDS no endpoint → HARD_FAIL, no content");
  // A placeholder endpoint (example.invalid) is treated as unset → still HARD_FAIL.
  const ossPlaceholder = await queryCds(ossIntent, { env: { HEYDOC_PHARM_CDS: "AU_OSS_CDS", HEYDOC_PHARM_CDS_ENDPOINT: "https://opencds.example.invalid/v1" } });
  expect(ossPlaceholder.verdict === "HARD_FAIL", "AU_OSS_CDS placeholder endpoint → HARD_FAIL");
  expect(cdsVendorAvailable(ossEnv).provider === "au_oss_cds", "a real endpoint resolves the au_oss_cds provider");

  // A gateway PASS → verdict PASS, and receipt mode stays 'mock' (not staging-validated).
  const passResp = { request_id: "resp-0001", engine: "opencds-dss", knowledge_module_set: KM, check_verdicts: [{ check_id: "allergy_check", status: "PASS" }, { check_id: "interaction_check", status: "PASS" }], flags: [] };
  const ossPass = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayReturning(passResp), resolvedFacts: { allergy_status: "none_known", current_medications: [] } });
  expect(ossPass.verdict === "PASS" && ossPass.provider === "au_oss_cds", "AU_OSS_CDS gateway PASS → verdict PASS");
  expect(ossPass.receipt_mode === "mock", "AU_OSS_CDS receipt stays 'mock' until staging validation (never mock-as-live)");

  // Dose guidance is honoured only on PASS/WARN.
  const passWithDose = { ...passResp, dose_candidate: { safe_dose_range: "5 mg daily", adjustment_required: false } };
  const ossDose = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayReturning(passWithDose), resolvedFacts: {} });
  expect(ossDose.dose_guidance && ossDose.dose_guidance.safe_dose_range === "5 mg daily", "dose surfaces on a PASS verdict");

  // HARD_FAIL verdict + a dose_candidate → dose is DROPPED (re-applied hard rule).
  const hardFailWithDose = { request_id: "resp-0001", engine: "opencds-dss", knowledge_module_set: KM, check_verdicts: [{ check_id: "interaction_check", status: "HARD_FAIL", severity: "critical", reason: "warfarin + NSAID" }], flags: [{ flag_type: "interaction_severe", severity: "critical", description: "warfarin + ibuprofen" }], dose_candidate: { safe_dose_range: "5 mg daily" } };
  const ossHardFail = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayReturning(hardFailWithDose) });
  expect(ossHardFail.verdict === "HARD_FAIL", "AU_OSS_CDS gateway HARD_FAIL → verdict HARD_FAIL");
  expect(ossHardFail.dose_guidance === null, "no dose is ever emitted on a HARD_FAIL, even if the gateway offered one");

  // NOT_RUN (missing proof) → BLOCKED_NO_PROOF, no dose.
  const notRunResp = { request_id: "resp-0001", engine: "opencds-dss", knowledge_module_set: KM, check_verdicts: [{ check_id: "renal_dosing_check", status: "NOT_RUN" }], flags: [] };
  const ossNotRun = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayReturning(notRunResp) });
  expect(ossNotRun.verdict === "BLOCKED_NO_PROOF" && ossNotRun.dose_guidance === null, "AU_OSS_CDS NOT_RUN → BLOCKED_NO_PROOF");

  // Transport failure → BLOCKED_NO_PROOF, no content (fail-closed).
  const ossUnreachable = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayThrows() });
  expect(ossUnreachable.verdict === "BLOCKED_NO_PROOF" && ossUnreachable.dose_guidance === null, "gateway unreachable → BLOCKED_NO_PROOF, no content");

  // Malformed/off-enum response → BLOCKED_NO_PROOF (never a fabricated verdict).
  const offEnum = { request_id: "resp-0001", engine: "opencds-dss", knowledge_module_set: KM, check_verdicts: [{ check_id: "schedule_check", status: "PASS" }] };
  const ossOffEnum = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayReturning(offEnum) });
  expect(ossOffEnum.verdict === "BLOCKED_NO_PROOF", "off-enum gateway response → BLOCKED_NO_PROOF");

  // KB-version mismatch → BLOCKED_NO_PROOF (gateway ran a different knowledge set).
  const wrongKb = { ...passResp, knowledge_module_set: "someone-elses-kb:v9" };
  const ossWrongKb = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayReturning(wrongKb) });
  expect(ossWrongKb.verdict === "BLOCKED_NO_PROOF", "KB-version mismatch → BLOCKED_NO_PROOF");

  // Non-200 → BLOCKED_NO_PROOF.
  const oss500 = await queryCds(ossIntent, { env: ossEnv, fetchImpl: gatewayReturning(passResp, { ok: false, status: 500 }) });
  expect(oss500.verdict === "BLOCKED_NO_PROOF", "gateway HTTP 500 → BLOCKED_NO_PROOF");

  // E7 monotone still holds with a real OSS verdict: a PASS OSS never rescues an engine HARD_FAIL.
  const engineHardFailVsOss = composeCdsVerdict("HARD_FAIL", ossPass);
  expect(engineHardFailVsOss.status === "HARD_FAIL", "monotone: an AU_OSS_CDS PASS never rescues an engine HARD_FAIL");

  // MI-08 — AMT underlay validates via Terminology; coded only on validate-pass.
  const validated = await validateDrugAmt({ drug_name: "paracetamol", amt_snomed_code: "23628011000036104" }, { validate: async () => ({ validated: true, display: "paracetamol 500 mg tablet", version: "AMT" }) });
  expect(validated.validated === true && validated.coding.code === "23628011000036104" && validated.terminology_receipt_id, "MI-08: AMT code validates → coding + receipt");

  const noCode = await validateDrugAmt({ drug_name: "paracetamol" }, { validate: async () => ({ validated: true }) });
  expect(noCode.validated === false && noCode.coding === null, "MI-08: no AMT code → not asserted (no fabrication)");

  const notValidated = await validateDrugAmt({ drug_name: "x", amt_snomed_code: "999" }, { validate: async () => ({ validated: false, reason: "unknown" }) });
  expect(notValidated.validated === false && notValidated.coding === null, "MI-08: unvalidated AMT code → NOT coded (no fabrication)");

  if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-08/MI-09 pharmacology-cds FAIL (${errors.length})`); process.exit(1); }
  console.log("MI-08/MI-09 pharmacology-cds PASS");
  process.exit(0);
}

main().catch((e) => { console.error("MI-08/MI-09 pharmacology-cds ERROR:", e); process.exit(1); });
