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

/** Is a contracted, connected CDS vendor available? Default NO (B4 uncontracted). */
export function cdsVendorAvailable(env = process.env) {
  const state = pharmCdsState(env);
  if (state !== "FILLED") {
    // SYNTHETIC_SELF_DEVELOPED (FL-30) selects the engine's data source but is NOT a
    // contracted commercial CDS vendor — it must NOT unlock this authoritative content
    // slot. Only "FILLED" (a contracted, validated vendor) may. Everything else → empty.
    const reason = state === "SYNTHETIC_SELF_DEVELOPED"
      ? "PHARM_CDS=SYNTHETIC_SELF_DEVELOPED — self-developed source feeds the engine only; the authoritative CDS content slot stays EMPTY (not a commercial vendor). E7 HARD_FAIL floor holds pending staging validation + clinical sign-off"
      : "PHARM_CDS is EMPTY (default) — AU CDS vendor not contracted (B4)";
    return { available: false, reason };
  }
  const raw = (env.HEYDOC_PHARM_CDS_ENDPOINT || "").trim();
  if (!raw || raw.startsWith("<") || raw.includes("example.invalid")) {
    return { available: false, reason: "PHARM_CDS=FILLED but HEYDOC_PHARM_CDS_ENDPOINT unset — vendor endpoint required and validated" };
  }
  return { available: true, endpoint: raw.replace(/\/$/, "") };
}

/**
 * Query the CDS slot. EMPTY → HARD_FAIL, never any content. Fail-closed.
 * @returns {Promise<{ available: boolean, verdict: string, reason: string, dose_guidance: null, interactions: null, contraindications: null }>}
 */
export async function queryCds(intent, { env = process.env } = {}) {
  const avail = cdsVendorAvailable(env);
  if (!avail.available) {
    return { available: false, verdict: "HARD_FAIL", reason: `AU CDS source not contracted (B4): ${avail.reason}`, dose_guidance: null, interactions: null, contraindications: null };
  }
  // Deploy path: a validated vendor client would run here. Not built in this increment —
  // fail closed rather than emit unvalidated content.
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
  };
}
