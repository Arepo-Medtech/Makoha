/**
 * AU pharmacology CDS slot — EXPLICIT-BUT-EMPTY (MI-09; execution plan §4.4, §8 E7).
 *
 * This is the stable interface for the AU clinical-decision-support vendor (MIMS-AU /
 * SafeScript WA). It is the ONLY authoritative source of dosing / interaction /
 * contraindication content for a patient-facing path. It is UNCONTRACTED (blocker B4),
 * so the slot is EMPTY: queryCds() returns HARD_FAIL and NEVER emits any
 * dosing/interaction/contraindication content. The hard STOP (E7): any request that
 * needs authoritative CDS content routes here, gets HARD_FAIL, and blocks the pipeline
 * unconditionally — no override, no substitution from a context signal or the mock core.
 *
 * The PHARM_CDS flag being "FILLED" does NOT by itself unlock content — a vendor
 * endpoint must also be connected AND validated. Until then this stays HARD_FAIL.
 */
import { pharmCdsState } from "../../../../config/flags.js";
import { queryOpenCds } from "./opencds-client.js";

/**
 * Is a connected CDS provider available? Default NO (B4 uncontracted). Two provider
 * classes reach the slot, both requiring a validated endpoint:
 *   - FILLED     → a contracted COMMERCIAL vendor (MIMS-AU / SafeScript).
 *   - AU_OSS_CDS → the open-source OpenCDS provider (Track A) executing the FL-30 KB.
 * SYNTHETIC_SELF_DEVELOPED feeds only the in-process engine and NEVER reaches this slot;
 * EMPTY (default) is uncontracted. Selection alone is never enough — a validated endpoint
 * is required, and even then the client stays fail-closed until staging validation.
 */
export function cdsVendorAvailable(env = process.env) {
  const state = pharmCdsState(env);
  if (state !== "FILLED" && state !== "AU_OSS_CDS") {
    // SYNTHETIC_SELF_DEVELOPED (FL-30) selects the engine's data source but is NOT a
    // provider that fills this authoritative content slot. Only FILLED or AU_OSS_CDS may.
    const reason = state === "SYNTHETIC_SELF_DEVELOPED"
      ? "PHARM_CDS=SYNTHETIC_SELF_DEVELOPED — self-developed source feeds the engine only; the authoritative CDS content slot stays EMPTY (not a provider). E7 HARD_FAIL floor holds pending staging validation + clinical sign-off"
      : "PHARM_CDS is EMPTY (default) — AU CDS vendor not contracted (B4)";
    return { available: false, reason };
  }
  const provider = state === "AU_OSS_CDS" ? "au_oss_cds" : "commercial";
  const raw = (env.HEYDOC_PHARM_CDS_ENDPOINT || "").trim();
  if (!raw || raw.startsWith("<") || raw.includes("example.invalid")) {
    const which = provider === "au_oss_cds" ? "OpenCDS gateway" : "vendor";
    return { available: false, reason: `PHARM_CDS=${state} but HEYDOC_PHARM_CDS_ENDPOINT unset — ${which} endpoint required and validated` };
  }
  return { available: true, endpoint: raw.replace(/\/$/, ""), provider };
}

/**
 * Query the CDS slot. EMPTY → HARD_FAIL, never any content. Fail-closed.
 * @returns {Promise<{ available: boolean, verdict: string, reason: string, dose_guidance: null, interactions: null, contraindications: null }>}
 */
export async function queryCds(intent, { env = process.env, resolvedFacts = {}, fetchImpl, knowledgeModuleSet, validated } = {}) {
  const avail = cdsVendorAvailable(env);
  if (!avail.available) {
    // Keep the B4 wording when the reason is the uncontracted floor; otherwise surface the
    // provider-specific reason (e.g. OSS gateway endpoint unset) verbatim.
    const reason = avail.reason.includes("(B4)") ? `AU CDS source not contracted (B4): ${avail.reason}` : avail.reason;
    return { available: false, verdict: "HARD_FAIL", reason, dose_guidance: null, interactions: null, contraindications: null };
  }
  if (avail.provider === "au_oss_cds") {
    // Track A: route to the OpenCDS client. It is fail-closed and re-applies the hard rules;
    // receipt mode stays 'mock' until staging validation (A4).
    return queryOpenCds(intent, resolvedFacts, { endpoint: avail.endpoint, fetchImpl, knowledgeModuleSet, validated });
  }
  // Commercial FILLED path: a validated vendor client would run here. Not built in this
  // increment — fail closed rather than emit unvalidated content.
  return { available: false, verdict: "BLOCKED_NO_PROOF", reason: "CDS vendor endpoint configured but the validated client is not built in this increment", dose_guidance: null, interactions: null, contraindications: null };
}

const SEVERITY = { HARD_FAIL: 3, BLOCKED_NO_PROOF: 2, WARN: 1, PASS: 0 };

/**
 * Fold the CDS verdict into the firewall's engine status — monotone: takes the MORE
 * severe of the two, so the CDS layer can only ADD severity (an empty slot forces
 * HARD_FAIL), never rescue or downgrade the firewall.
 * @param {string} engineStatus - the pharmacology engine's PASS/WARN/HARD_FAIL/BLOCKED_NO_PROOF
 * @param {{ verdict: string, reason?: string }} cdsResult
 */
export function composeCdsVerdict(engineStatus, cdsResult) {
  const cds = cdsResult || { verdict: "HARD_FAIL", reason: "no CDS result" };
  const status = (SEVERITY[cds.verdict] ?? 3) > (SEVERITY[engineStatus] ?? 0) ? cds.verdict : engineStatus;
  return {
    status,
    blocks: status === "HARD_FAIL" || status === "BLOCKED_NO_PROOF",
    cds_verdict: cds.verdict,
    blocking_reasons: status === cds.verdict && cds.verdict !== engineStatus ? [cds.reason] : [],
    // E3 — the gateway's dose reaches its consumer instead of the floor.
    //
    // The fold above is unchanged and stays monotone on STATUS: the safety property is that a CDS
    // provider can only ADD severity, never rescue the engine. That is untouched.
    //
    // What changed is what happens to the EVIDENCE. The client maps the gateway's `dose_candidate`
    // into `cds.dose_guidance` (opencds-client.js), and this function used to read only `verdict` and
    // `reason` — so the pipeline folded the status and threw the dose away. It had no consumer, which
    // was then cited as the reason not to build the KM that would produce it. That is circular: the
    // dose was discarded because nothing consumed it, and nothing consumed it because it was
    // discarded. `evidence` is the consumer. It is ADVISORY, it rides to the CLINICIAN plane (the
    // ReviewBundle), and it never enters PharmCheck.dose_guidance — a second executor's opinion over
    // the same clinician-signed records, for a practitioner to weigh. Agreement corroborates;
    // divergence is exactly what they should see.
    //
    // Null unless the CDS layer actually produced a dose AND its own hard rules allowed one: the
    // client already drops the dose on HARD_FAIL/NOT_RUN, so nothing here can surface a dose the
    // firewall blocked.
    evidence: cds.dose_guidance
      ? { dose_candidate: cds.dose_guidance, provider: cds.provider ?? null, km_set: cds.knowledge_module_set ?? null }
      : null,
  };
}
