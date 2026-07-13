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
 * PHARM_CDS "FILLED" does NOT by itself authorise dosing output — it only selects
 * which pharmacology CDS content path is wired. The pharmacology firewall
 * (Trunk 8.0 / the pharmacology server) remains the sole enforcer of whether a
 * dose may reach output; this flag never bypasses it.
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
    allowed: ["EMPTY", "FILLED"],
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

/** Resolved pharmacology CDS content state: "EMPTY" | "FILLED". Does not itself
 * authorise dosing output — see module comment. */
export function pharmCdsState(env = process.env) {
  return readFlag("PHARM_CDS", env);
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
