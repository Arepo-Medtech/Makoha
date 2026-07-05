/**
 * Mode-normaliser (ARCH_PLAN C16 / FMEA F4 — mode-flag leakage).
 *
 * The repo has TWO mode vocabularies that were never mapped:
 *   - environment names in HEYDOC_MODE_DEFAULT: mock | staging | production (+ dry_run)
 *   - the receipt/packet/ledger MODE enum:      mock | dry_run | live
 *
 * Before this module, enforcement fired only on the exact string "live"
 * (verifier.js enforceLive) and the ledger classified anything !== "live" as
 * synthetic (audit-store.js recordRun). A HEYDOC_MODE_DEFAULT=staging run would
 * therefore (a) accept mock receipts as valid grounding proof and (b) persist
 * output content as if synthetic — both violations of the mock-never-presented-
 * as-live rule. This module is the single place the mapping lives.
 *
 * Mapping (ARCH_PLAN §3.4):
 *   mock       → mock     (dev default: mock proof is FLAGGED, not blocked)
 *   dry_run    → dry_run  (dev: query validated, upstream not called; flagged, not blocked)
 *   staging    → live     (mock proof BLOCKED — enforce_live)
 *   production → live     (mock proof BLOCKED — enforce_live)
 *   live       → live     (mock proof BLOCKED — enforce_live)
 *   <unset>    → mock     (the documented HEYDOC_MODE_DEFAULT convention; every
 *                          existing seam already defaulted absence to mock)
 *   anything else → live  (DEFAULT-DENY: an unrecognised mode is treated as live
 *                          so mock proof is blocked — fail-safe, never fail-open)
 */

/** The only mode values the receipt / context-packet / ledger contracts accept. */
export const ENFORCEMENT_MODES = ["mock", "dry_run", "live"];

/** Environment-name → enforcement-mode mapping. Unlisted names default-deny to "live". */
const ENV_TO_ENFORCEMENT = {
  mock: "mock",
  dry_run: "dry_run",
  staging: "live",
  production: "live",
  live: "live",
};

/**
 * Normalise a raw mode string (typically HEYDOC_MODE_DEFAULT, or the
 * context_mode a caller threads into verify()) to the enforcement vocabulary.
 *
 * @param {string|undefined|null} rawMode
 * @returns {{ context_mode: "mock"|"dry_run"|"live", enforce_live: boolean, source_mode: string, recognised: boolean }}
 *   context_mode — enum-valid value for receipts, packets, and the ledger
 *   enforce_live — true ⇒ mock receipts are BLOCKED (dropped from effective proof)
 *   source_mode  — what was actually supplied (for logs/reports)
 *   recognised   — false ⇒ the input hit the default-deny branch
 */
export function normaliseMode(rawMode) {
  // Absence is the documented dev default (HEYDOC_MODE_DEFAULT unset ⇒ mock),
  // preserved so every pre-existing `|| "mock"` seam keeps its semantics. Only
  // an EXPLICIT unrecognised value hits default-deny below.
  if (rawMode === undefined || rawMode === null || String(rawMode).trim() === "") {
    return { context_mode: "mock", enforce_live: false, source_mode: "(unset)", recognised: true };
  }

  const source_mode = String(rawMode);
  const key = source_mode.trim().toLowerCase();
  const mapped = ENV_TO_ENFORCEMENT[key];

  if (mapped === undefined) {
    // DEFAULT-DENY: unknown mode ⇒ treat as live ⇒ mock proof is blocked.
    return { context_mode: "live", enforce_live: true, source_mode, recognised: false };
  }
  return { context_mode: mapped, enforce_live: mapped === "live", source_mode, recognised: true };
}
