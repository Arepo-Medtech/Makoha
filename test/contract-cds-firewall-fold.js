/**
 * Contract test for Track A / Phase A3b — composing the CDS-adapter slot into the live
 * firewall (verification/pipeline.js). The fold is MONOTONE and CONDITIONAL:
 *   - mock/dev with no provider (the default) → NO fold; the deterministic engine verdict
 *     stands (status quo — this is what keeps the existing firewall tests green);
 *   - a selected provider (FILLED / AU_OSS_CDS) OR a patient-facing run (context_mode
 *     'live') → the CDS verdict folds in monotonically (can only ADD severity);
 *   - an empty slot at 'live' forces HARD_FAIL (the E7 floor biting at patient-facing);
 *   - a provider PASS can never rescue an engine HARD_FAIL.
 * Fully offline: the OpenCDS gateway is injected via options.cds_fetch. Run from repo root:
 * node test/contract-cds-firewall-fold.js
 */
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

// A fully-resolved, safe intent → the ENGINE returns PASS (proven recipe from
// contract-pharmacology's "safe" case). Lets us distinguish "fold engaged" (→ HARD_FAIL)
// from "fold skipped" (→ PASS stands).
const safeIntent = {
  intent_id: "int-fold-1",
  session_ref: "enc-fold-01",
  intent_type: "new_prescription",
  drug_intent: { drug_name: "amoxicillin", drug_class: "penicillin" },
  patient_facts_ref: {},
  clinical_context: { patient_age_years: 45 },
  mode: "mock",
};
const safeFacts = { allergens: ["paracetamol"], current_medications: ["paracetamol"], s8_pdmp_checked: true };
// An S8 intent with no PDMP proof → the ENGINE returns HARD_FAIL.
const s8Intent = { ...safeIntent, intent_id: "int-fold-s8", drug_intent: { drug_name: "oxycodone", drug_class: "opioid" } };

const KM = "fl30-kb:v1";
const gatewayReturning = (respObj) => async () => ({ ok: true, status: 200, json: async () => respObj });
const passResp = { request_id: "resp-0001", engine: "opencds-dss", knowledge_module_set: KM, check_verdicts: [{ check_id: "allergy_check", status: "PASS" }], flags: [] };
const hardFailResp = { request_id: "resp-0002", engine: "opencds-dss", knowledge_module_set: KM, check_verdicts: [{ check_id: "interaction_check", status: "HARD_FAIL", severity: "critical", reason: "warfarin + NSAID" }], flags: [] };

// Save/restore the process-env keys the fold reads (context_mode + provider selection).
const savedMode = process.env.HEYDOC_MODE_DEFAULT;
const savedCds = process.env.HEYDOC_PHARM_CDS;
const savedEndpoint = process.env.HEYDOC_PHARM_CDS_ENDPOINT;
const setEnv = ({ mode, cds, endpoint }) => {
  if (mode === undefined) delete process.env.HEYDOC_MODE_DEFAULT; else process.env.HEYDOC_MODE_DEFAULT = mode;
  if (cds === undefined) delete process.env.HEYDOC_PHARM_CDS; else process.env.HEYDOC_PHARM_CDS = cds;
  if (endpoint === undefined) delete process.env.HEYDOC_PHARM_CDS_ENDPOINT; else process.env.HEYDOC_PHARM_CDS_ENDPOINT = endpoint;
};
const restoreEnv = () => {
  savedMode === undefined ? delete process.env.HEYDOC_MODE_DEFAULT : (process.env.HEYDOC_MODE_DEFAULT = savedMode);
  savedCds === undefined ? delete process.env.HEYDOC_PHARM_CDS : (process.env.HEYDOC_PHARM_CDS = savedCds);
  savedEndpoint === undefined ? delete process.env.HEYDOC_PHARM_CDS_ENDPOINT : (process.env.HEYDOC_PHARM_CDS_ENDPOINT = savedEndpoint);
};

async function main() {
  // 1. mock + EMPTY (default): NO fold — the engine PASS stands (proves the fold is gated).
  setEnv({ mode: "mock", cds: undefined, endpoint: undefined });
  const mockEmpty = await runPipeline({ trunk: "8.0", pharm_intent: safeIntent, resolved_facts: safeFacts });
  expect(mockEmpty.firewall_status === "PASS", `mock+EMPTY: engine PASS must stand (no fold), got ${mockEmpty.firewall_status}`);
  expect(mockEmpty.continuation_blocked === false, "mock+EMPTY: a safe PASS is not blocked");

  // 2. live + EMPTY: the empty slot folds → HARD_FAIL (E7 floor bites at patient-facing).
  setEnv({ mode: "production", cds: undefined, endpoint: undefined });
  const liveEmpty = await runPipeline({ trunk: "8.0", pharm_intent: safeIntent, resolved_facts: safeFacts });
  expect(liveEmpty.firewall_status === "HARD_FAIL", `live+EMPTY: empty slot must force HARD_FAIL, got ${liveEmpty.firewall_status}`);
  expect(liveEmpty.continuation_blocked === true, "live+EMPTY: HARD_FAIL blocks continuation");

  // 3. mock + AU_OSS_CDS + endpoint + gateway PASS: fold engages, provider PASS keeps PASS.
  setEnv({ mode: "mock", cds: "AU_OSS_CDS", endpoint: "https://opencds-gateway/v1" });
  const ossPass = await runPipeline({ trunk: "8.0", pharm_intent: safeIntent, resolved_facts: safeFacts, cds_fetch: gatewayReturning(passResp) });
  expect(ossPass.firewall_status === "PASS", `AU_OSS_CDS gateway PASS + engine PASS → PASS, got ${ossPass.firewall_status}`);

  // 4. mock + AU_OSS_CDS + gateway HARD_FAIL: provider strengthens an engine PASS → HARD_FAIL.
  const ossHardFail = await runPipeline({ trunk: "8.0", pharm_intent: safeIntent, resolved_facts: safeFacts, cds_fetch: gatewayReturning(hardFailResp) });
  expect(ossHardFail.firewall_status === "HARD_FAIL", `AU_OSS_CDS gateway HARD_FAIL over engine PASS → HARD_FAIL, got ${ossHardFail.firewall_status}`);
  expect(ossHardFail.continuation_blocked === true, "AU_OSS_CDS HARD_FAIL blocks continuation");

  // 5. mock + AU_OSS_CDS but NO endpoint: selecting a provider without a validated endpoint
  //    fails closed → HARD_FAIL (even though the engine PASSes).
  setEnv({ mode: "mock", cds: "AU_OSS_CDS", endpoint: undefined });
  const ossNoEndpoint = await runPipeline({ trunk: "8.0", pharm_intent: safeIntent, resolved_facts: safeFacts });
  expect(ossNoEndpoint.firewall_status === "HARD_FAIL", `AU_OSS_CDS with no endpoint → HARD_FAIL, got ${ossNoEndpoint.firewall_status}`);

  // 6. Monotone through the pipeline: an engine HARD_FAIL is never rescued by a provider PASS.
  setEnv({ mode: "mock", cds: "AU_OSS_CDS", endpoint: "https://opencds-gateway/v1" });
  const engineHardFail = await runPipeline({ trunk: "8.0", pharm_intent: s8Intent, resolved_facts: { allergens: [], current_medications: [] }, cds_fetch: gatewayReturning(passResp) });
  expect(engineHardFail.firewall_status === "HARD_FAIL", `monotone: engine HARD_FAIL + provider PASS → HARD_FAIL, got ${engineHardFail.firewall_status}`);

  restoreEnv();

  if (errors.length) {
    console.error("contract-cds-firewall-fold FAILED:\n" + errors.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }
  console.log("A3b cds-firewall-fold PASS (mock+EMPTY no-fold · live+EMPTY E7 · provider fold · monotone)");
  process.exit(0);
}

main().catch((e) => { restoreEnv(); console.error("A3b cds-firewall-fold ERROR:", e); process.exit(1); });
