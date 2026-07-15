/**
 * AU_OSS_CDS client (Track A, Phase A3) — the validated-vendor client for the cds-adapter
 * slot when PHARM_CDS=AU_OSS_CDS. Speaks the JSON gateway contract (opencds-contract.js) to
 * an external OpenCDS gateway; the gateway speaks CDS Hooks R4 to OpenCDS internally (the
 * Phase C shim maps between the two) and loads the clinician-signed FL-30 knowledge base as
 * knowledge modules — 9 as of FL-34 Phase B: the 8 accessor-backed checks plus an advisory
 * dose candidate. (Corrected 2026-07-15, F2: this said "native DSS/vMR", which was the A1
 * planning assumption; Phase A settled on the CDS Hooks R4 service, and Phase B's KMs
 * implement CdsHooksExecutionEngine. There is no DSS/vMR path.)
 *
 * FAIL-CLOSED, DEFENCE-IN-DEPTH. This client never trusts the gateway:
 *   - a malformed request never leaves (validateOpenCdsRequest throws → BLOCKED_NO_PROOF);
 *   - any transport failure (unreachable / non-200 / timeout) → BLOCKED_NO_PROOF, no content;
 *   - a malformed / off-enum response → BLOCKED_NO_PROOF (validateOpenCdsResponse fail-closed);
 *   - a KB-version mismatch (gateway ran a different knowledge set) → BLOCKED_NO_PROOF;
 *   - the hard rules are RE-APPLIED locally: dose guidance is dropped unless the composed
 *     verdict is PASS/WARN — the gateway can never make us emit a dose on a HARD_FAIL /
 *     NOT_RUN / BLOCKED result;
 *   - receipt mode stays 'mock' until staging validation (A4). Selection + a live endpoint do
 *     NOT make it 'live' — mock-as-live discipline (Guardrail 4). OpenCDS supplies execution,
 *     not new knowledge, so it never lifts clinician-signed content to regulator-signed.
 *
 * Not-content shape mirrors the empty slot (queryCds): {available, verdict, reason,
 * dose_guidance, interactions, contraindications} — extended with structured check_results,
 * flags, receipt_mode, provider for the future firewall composition.
 */
import { validateOpenCdsRequest, validateOpenCdsResponse } from "./opencds-contract.js";

/**
 * The FL-30 knowledge set this client requests, and cross-checks on every response. MUST equal
 * `KM_SET` in the gateway's `tools/export-fl30-kb.mjs` and `Fl30KnowledgeBase.EXPECTED_KM_SET`.
 *
 * v1 → v2 (2026-07-15): v1 was exported while the drug vocabulary was UNSIGNED, so the gateway KB
 * matched by NAME only. KL signed it, which populated the identity sidecar (522 RxCUIs) — a change in
 * how a KM resolves WHICH DRUG a request is about, i.e. a knowledge change, so it gets a new version
 * rather than silently riding along inside v1.
 *
 * The version is what makes the transition safe in BOTH directions: a gateway still serving v1 to a
 * v2 client, or the reverse, fails the cross-check below and BLOCKS (BLOCKED_NO_PROOF) rather than
 * answering from knowledge nobody asked for.
 *
 * EXPORTED so tests assert the PROPERTY (the client cross-checks whatever it requested) instead of
 * hardcoding a literal. Three suites pinned "fl30-kb:v1" and would have gone red on this bump for no
 * safety reason — the same state-pinning defect that made the vocabulary suites red when it was
 * signed. A test that breaks on a version bump is not testing the version check.
 */
export const DEFAULT_KM_SET = "fl30-kb:v2";
// The core safety checks the in-process engine runs — the default request when the intent
// does not name checks_requested. All members are within the frozen check_id enum.
const DEFAULT_CHECKS = ["allergy_check", "interaction_check", "renal_dosing_check", "nti_check", "age_appropriateness_check"];

/** A fail-closed non-content result (no dose/interaction/contraindication ever emitted). */
function blocked(verdict, reason) {
  return { available: false, verdict, reason, dose_guidance: null, interactions: null, contraindications: null, provider: "au_oss_cds", receipt_mode: "mock" };
}

/**
 * Fold per-check statuses into one overall verdict — same monotone severity order the
 * engine uses. A NOT_RUN (missing proof) forces BLOCKED_NO_PROOF, never a silent PASS.
 * @param {string[]} statuses
 */
export function foldOssStatuses(statuses) {
  if (statuses.some((s) => s === "HARD_FAIL")) return "HARD_FAIL";
  if (statuses.some((s) => s === "NOT_RUN")) return "BLOCKED_NO_PROOF";
  if (statuses.some((s) => s === "WARN")) return "WARN";
  return "PASS";
}

/**
 * Build the wire `drug` block.
 *
 * F7 (B0b) — TWO OF THESE READS WERE DEAD, AND ONE WOULD HAVE BEEN SMUGGLING. `drug_intent` in the
 * FROZEN `pharm-intent.schema.json` is `additionalProperties:false` and has NO `rxnorm_code` and NO
 * `atc_code`; the zod mirror (a plain z.object) silently STRIPS them:
 *
 *   in : {drug_name, drug_class, rxnorm_code:"4603", atc_code:"C03CA01", amt_snomed_code:"123"}
 *   out: {drug_name, drug_class, amt_snomed_code:"123"}          ← the other two are gone
 *
 * So `di.rxnorm_code` / `di.atc_code` could never be populated through a validated intent — dead reads
 * that created the ILLUSION the codes flow. Putting a code on the intent to "fix" that would be worse:
 * the pipeline hands us the un-revalidated object, so the field WOULD reach the gateway — a value the
 * frozen contract forbids, riding out because it bypassed validation. That is smuggling, and a frozen
 * contract exists to stop exactly that.
 *
 * So the CODE arrives as an explicit ARGUMENT: the WIRE contract has `rxnorm_code`, the INTENT does
 * not, and `pharm-intent` stays byte-frozen. `amt_snomed_code` IS on the frozen intent (it is the
 * AU-native code) and is read from it — AMT is simply not harvested yet.
 *
 * @param {object} intent
 * @param {{ rxnormCode?: string|null }} codes - settled by the caller from a SIGNED source, or null.
 */
function extractDrug(intent, { rxnormCode = null } = {}) {
  const di = intent && intent.drug_intent ? intent.drug_intent : {};
  return {
    drug_name: di.drug_name || intent.drug_name || intent.drug || "",
    drug_class: di.drug_class || intent.drug_class,
    // ATC is a therapeutic CLASSIFICATION, never an identity — V07AY alone covers ~70 distinct
    // products (every bandage and dressing). It is not sent as a key and must never become one.
    ...(rxnormCode ? { rxnorm_code: rxnormCode } : {}),
    amt_snomed_code: di.amt_snomed_code, // the only code the frozen intent can actually carry
    route: di.route,
    schedule: di.schedule,
  };
}

/**
 * Query the OpenCDS gateway for a pharmacology verdict.
 * @param {object} intent - PharmIntent-shaped (or a loose {drug}); only coded fields are sent.
 * @param {object} resolvedFacts - the sanitised facts the checks consume, named as engine.js names
 *   them: allergens, current_medications, egfr_ml_min, hepatic_impairment, nti_monitoring_documented,
 *   patient_age_years, pregnancy_status, s8_pdmp_checked.
 * @param {object} opts
 * @param {string} opts.endpoint - validated gateway base URL (from cdsVendorAvailable).
 * @param {Function} [opts.fetchImpl] - injectable fetch (tests pass a fake gateway; default global fetch).
 * @param {string} [opts.knowledgeModuleSet] - required KB version; response must echo it.
 * @param {boolean} [opts.validated] - true only once staging-validated (A4). Drives receipt_mode.
 * @param {number} [opts.timeoutMs]
 */
export async function queryOpenCds(intent, resolvedFacts = {}, { endpoint, fetchImpl, knowledgeModuleSet = DEFAULT_KM_SET, validated = false, timeoutMs = 5000, rxnormCode = null } = {}) {
  if (!endpoint) return blocked("HARD_FAIL", "OpenCDS gateway endpoint not provided");

  // 1. Build + validate the request. A malformed request never leaves the client.
  const drug = extractDrug(intent || {}, { rxnormCode });
  const checks = Array.isArray(intent && intent.checks_requested) && intent.checks_requested.length ? intent.checks_requested : DEFAULT_CHECKS;
  const request = {
    request_id: `oss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    drug,
    // W1 (F-C8): the facts the CHECKS read, named as engine.js names them. This block previously sent
    // `allergy_status`, which nothing populates — so the gateway never saw an allergy history and
    // allergy_check, a DEFAULT_CHECK, could only ever return NOT_RUN → BLOCKED_NO_PROOF.
    resolved_facts: {
      allergens: resolvedFacts.allergens,
      current_medications: resolvedFacts.current_medications,
      egfr_ml_min: resolvedFacts.egfr_ml_min,
      hepatic_impairment: resolvedFacts.hepatic_impairment,
      nti_monitoring_documented: resolvedFacts.nti_monitoring_documented,
      patient_age_years: resolvedFacts.patient_age_years,
      pregnancy_status: resolvedFacts.pregnancy_status,
      s8_pdmp_checked: resolvedFacts.s8_pdmp_checked,
    },
    checks_requested: checks,
    knowledge_module_set: knowledgeModuleSet,
    mode: (intent && intent.mode) || "mock",
  };
  let validReq;
  try {
    validReq = validateOpenCdsRequest(request);
  } catch (e) {
    return blocked("BLOCKED_NO_PROOF", `request build failed: ${e.message}`);
  }

  // 2. Call the gateway. Any transport failure is fail-closed.
  const doFetch = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return blocked("BLOCKED_NO_PROOF", "no fetch implementation available");
  let body;
  try {
    const res = await doFetch(`${endpoint}/pharm-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validReq),
      ...(fetchImpl ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
    });
    if (!res || res.ok !== true) return blocked("BLOCKED_NO_PROOF", `gateway HTTP ${res && res.status}`);
    body = await res.json();
  } catch (e) {
    return blocked("BLOCKED_NO_PROOF", `gateway unreachable: ${e.message}`);
  }

  // 3. Validate the response fail-closed; drop anything off the frozen enums.
  const parsed = validateOpenCdsResponse(body);
  if (!parsed.ok) return blocked("BLOCKED_NO_PROOF", `gateway response invalid: ${parsed.error}`);
  const data = parsed.data;

  // 4. Cross-check the KB version — a gateway that ran a different knowledge set is not trusted.
  if (data.knowledge_module_set !== knowledgeModuleSet) {
    return blocked("BLOCKED_NO_PROOF", `KB version mismatch: requested ${knowledgeModuleSet}, gateway ran ${data.knowledge_module_set}`);
  }

  // 5. Compose the overall verdict and RE-APPLY the hard rules locally.
  const verdict = foldOssStatuses(data.check_verdicts.map((v) => v.status));
  const flags = data.flags || [];
  const canDose = verdict === "PASS" || verdict === "WARN";
  const dose_guidance = canDose && data.dose_candidate ? data.dose_candidate : null; // never a dose on HARD_FAIL/NOT_RUN
  // W2 — RETAIN, do not destroy. Operator ruling 2026-07-15: *"keep all guidance in an on-hold
  // quarantine pathway, in-waiting to deliver when appropriate."* `dose_guidance` above is the ACTION
  // and stays gated exactly as it was (§1.1, untouched). This is the same dose kept as EVIDENCE, held:
  // it rides to the evidence plane's quarantine, is never rendered while blocked
  // (portal assertQuarantineHeld), and is delivered the moment the block clears.
  //
  // Before this, the gateway's candidate was nulled here and the FACT IT EXISTED died with it — the
  // clinician could not tell "a second executor also produced a dose, withheld" from "no second
  // opinion exists". That is the failure the show-evidence principle names, applied to the one field
  // §1.1 gates.
  const dose_candidate_quarantined = !canDose && data.dose_candidate ? data.dose_candidate : null;

  const interactions = flags.filter((f) => f.flag_type === "interaction_severe" || f.flag_type === "interaction_moderate");
  const contraindications = flags.filter((f) =>
    ["renal_contraindicated", "hepatic_contraindicated", "pregnancy_category_x", "allergy_confirmed"].includes(f.flag_type),
  );

  return {
    available: true,
    verdict,
    reason: verdict === "PASS" ? "AU_OSS_CDS (OpenCDS) verdict: PASS" : `AU_OSS_CDS (OpenCDS) verdict: ${verdict}`,
    dose_guidance,
    dose_candidate_quarantined,
    interactions: interactions.length ? interactions : null,
    contraindications: contraindications.length ? contraindications : null,
    check_results: data.check_verdicts,
    flags,
    // A3: not staging-validated → 'mock'. A4 flips this via a real validation signal.
    receipt_mode: validated ? "live" : "mock",
    provider: "au_oss_cds",
    engine: data.engine,
    knowledge_module_set: data.knowledge_module_set,
  };
}
