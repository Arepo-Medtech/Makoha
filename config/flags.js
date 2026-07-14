/**
 * Feature-flag registry (MI-17; execution plan §6/§8 E8).
 *
 * This is the single feature-flag registry for the repo. THE load-bearing rule
 * (E8): every flag reads FAIL-SAFE — an unset, invalid, or mis-typed env value
 * resolves to the flag's SAFE value, NEVER the permissive one. A mis-set imaging
 * flag (a typo, a truthy-looking value like "true"/"1"/"yes", or an empty string)
 * must fail to OFF, not silently enable interpretation output.
 *
 * IMAGING_PIXEL_INTERPRETATION gates INTERPRETATION OUTPUT specifically: when this
 * flag is dark (OFF, the safe default), the multimodal branch that would otherwise
 * interpret image pixels must route its result to `unknown` rather than emit a
 * finding (E8).
 *
 * PHARM_CDS selects which pharmacology CDS content path is wired; it NEVER bypasses
 * the firewall. The pharmacology firewall (Trunk 8.0 / the pharmacology server)
 * remains the sole enforcer of whether a dose may reach output. Three states:
 *   - EMPTY (safe default) — no CDS content path; the cds-adapter slot is empty and
 *     folds a HARD_FAIL (E7). This is the current release-blocker state (B4).
 *   - FILLED — a contracted COMMERCIAL CDS vendor (MIMS-AU / SafeScript). Still does
 *     not authorise output by itself: a validated endpoint + validated client are also
 *     required (see cds-adapter/index.js).
 *   - SYNTHETIC_SELF_DEVELOPED (FL-30) — Breath-Ezy's own provenanced synthetic source
 *     feeds the deterministic ENGINE via the PharmDataSource seam. This is DISTINCT from
 *     FILLED so a self-built source is never conflatable with a commercial vendor, and
 *     distinct from EMPTY/mock so it is never mistaken for "no source". CRITICAL: this
 *     state does NOT equal "FILLED", so it does NOT by itself unlock the authoritative
 *     cds-adapter content slot and does NOT clear the E7 monotone HARD_FAIL — permitting
 *     the synthetic engine verdict to stand is a Step-5 clinical decision gated on
 *     staging validation + registered-pharmacist sign-off, never a flag flip.
 *   - AU_OSS_CDS (Track A) — an open-source, standards-based CDS PROVIDER: the OpenCDS
 *     engine (Apache-2.0, an external network peer — no source vendored) executing the
 *     clinician-signed FL-30 knowledge base and returning structured verdicts through the
 *     cds-adapter. DISTINCT from FILLED (not a contracted COMMERCIAL vendor) and from
 *     SYNTHETIC_SELF_DEVELOPED (which feeds only the in-process engine). CRITICAL: like the
 *     other non-FILLED states it does NOT by itself authorise output — a validated OpenCDS
 *     endpoint + validated client + staging validation are all required (cds-adapter/index.js),
 *     and the E7 monotone HARD_FAIL floor still holds. OpenCDS supplies EXECUTION + standards
 *     packaging, never new knowledge, so it never lifts the clinician-signed content to
 *     regulator-signed: green stays gated on FL-50 (TGA) + FL-52.
 *
 * Pure module — no I/O beyond reading the passed-in `env` object (defaults to
 * `process.env`), so callers can inject a fake env in tests.
 */

/** On/off flags share the same allowed-value shape and safe default. */
const ONOFF = { allowed: ["ON", "OFF"], safeDefault: "OFF", kind: "onoff" };

/**
 * The flag registry. Each entry: env var name, allowed resolved values, the
 * fail-safe default, and the flag kind ("onoff" | "enum").
 * @type {Record<string, { env: string, allowed: string[], safeDefault: string, kind: "onoff" | "enum" }>}
 */
export const FLAGS = {
  IMAGING_PIXEL_INTERPRETATION: {
    env: "HEYDOC_IMAGING_PIXEL_INTERPRETATION",
    ...ONOFF,
  },
  OCR_ENGINE: {
    env: "HEYDOC_OCR_ENGINE",
    allowed: ["paddle", "jsl", "surya"],
    safeDefault: "paddle",
    kind: "enum",
  },
  PHARM_CDS: {
    env: "HEYDOC_PHARM_CDS",
    allowed: ["EMPTY", "FILLED", "SYNTHETIC_SELF_DEVELOPED", "AU_OSS_CDS"],
    safeDefault: "EMPTY",
    kind: "enum",
  },
  STRUCTURED_OCR: {
    env: "HEYDOC_STRUCTURED_OCR",
    ...ONOFF,
  },
};

/**
 * Resolve a flag to its string value. Fail-safe: any value not exactly matching
 * the flag's "on" spelling (on/off flags) or not a member of `allowed` (enum
 * flags) resolves to `safeDefault` — never to a permissive guess. Throws on an
 * unknown flag name so caller misuse fails loud rather than silently returning
 * a wrong default.
 * @param {string} name - key into FLAGS (not the env var name).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function readFlag(name, env = process.env) {
  const flag = FLAGS[name];
  if (!flag) throw new Error(`flags: unknown flag '${name}'`);

  const raw = env[flag.env];
  if (typeof raw !== "string") return flag.safeDefault;

  if (flag.kind === "onoff") {
    return raw.trim().toUpperCase() === "ON" ? "ON" : "OFF";
  }

  // enum: only an exact (trimmed) match against the allowed set is accepted.
  const trimmed = raw.trim();
  return flag.allowed.includes(trimmed) ? trimmed : flag.safeDefault;
}

/** True iff the imaging pixel-interpretation flag is ON. */
export function isImagingPixelInterpretationEnabled(env = process.env) {
  return readFlag("IMAGING_PIXEL_INTERPRETATION", env) === "ON";
}

/** True iff the structured-OCR flag is ON. */
export function isStructuredOcrEnabled(env = process.env) {
  return readFlag("STRUCTURED_OCR", env) === "ON";
}

/** Resolved OCR engine selection: "paddle" | "jsl" | "surya". Selecting jsl/surya
 * still requires a separate licence check enforced elsewhere — this only selects. */
export function ocrEngine(env = process.env) {
  return readFlag("OCR_ENGINE", env);
}

/** Resolved pharmacology CDS content state: "EMPTY" | "FILLED" |
 * "SYNTHETIC_SELF_DEVELOPED" | "AU_OSS_CDS". Does not itself authorise dosing output;
 * only "FILLED" (a contracted commercial vendor) targets the authoritative cds-adapter
 * slot directly — AU_OSS_CDS reaches it only via a validated OpenCDS endpoint + client,
 * and SYNTHETIC_SELF_DEVELOPED never does. See module comment. */
export function pharmCdsState(env = process.env) {
  return readFlag("PHARM_CDS", env);
}

/** True iff the pharmacology content path is the open-source OpenCDS provider (Track A,
 * AU_OSS_CDS). Selection alone does NOT unlock the cds-adapter slot: a validated OpenCDS
 * endpoint + client + staging validation are still required, and the E7 HARD_FAIL floor
 * holds until then (cds-adapter/index.js). */
export function isPharmAuOssCds(env = process.env) {
  return readFlag("PHARM_CDS", env) === "AU_OSS_CDS";
}

/** True iff the pharmacology content path is the self-developed synthetic source
 * (FL-30). Selects the SyntheticSelfDevelopedSource for the engine; never bypasses
 * the firewall or the cds-adapter E7 floor. */
export function isPharmSyntheticSelfDeveloped(env = process.env) {
  return readFlag("PHARM_CDS", env) === "SYNTHETIC_SELF_DEVELOPED";
}

/**
 * Snapshot every flag's resolved value, for structured logging.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, string>}
 */
export function allFlags(env = process.env) {
  const out = {};
  for (const name of Object.keys(FLAGS)) out[name] = readFlag(name, env);
  return out;
}
