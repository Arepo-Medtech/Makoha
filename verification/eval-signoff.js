/**
 * eval-signoff — resolve the clinician sign-off ref that an AUTHORITATIVE live
 * eval run must carry (FL-40). Fail-closed: an authoritative live run may only
 * arm the release gate against a rubric that is CLINICIAN-SIGNED for the exact
 * version in use. This is the mechanical form of "an authoritative live run
 * requires a clinician sign-off" — the EvalRunReport's clinician_signoff_ref
 * cannot be stamped from an unsigned or placeholder rubric.
 *
 * Replay/CI runs do NOT need this — they validate the machinery and never
 * certify a release (see eval-run-report.schema.json). Only mode='live' does.
 */
import { readFileSync, existsSync } from "node:fs";

/** A ref that still contains draft/placeholder text is NOT a signed ref. */
const PLACEHOLDER = /<initials>|to be appended|placeholder|_\(/i;

/**
 * @param {{ rubricVersion: string, rubricPath?: string, override?: string }} args
 *   rubricVersion — the version the run cites (e.g. "eval-rubric:v1.0").
 *   rubricPath    — the rubric doc to read the recorded §8 sign-off from.
 *   override      — an explicit operator-supplied ref (--signoff-ref); validated
 *                   the same way. Use only for a deliberate out-of-doc affirmation.
 * @returns {{ ref: string|null, reason?: string }}
 *   ref=null with a reason when the rubric is not validly signed for the version.
 */
export function resolveClinicianSignoff({ rubricVersion, rubricPath, override } = {}) {
  const validate = (raw, src) => {
    const ref = String(raw || "").trim();
    if (!ref) return { ref: null, reason: `no clinician_signoff_ref (${src})` };
    if (PLACEHOLDER.test(ref)) return { ref: null, reason: `clinician_signoff_ref from ${src} is a placeholder — rubric not signed` };
    // The ref must reference the exact rubric version this run cites, so a
    // sign-off for an older/other version cannot arm a run against a new rubric.
    if (!rubricVersion || !ref.includes(rubricVersion)) {
      return { ref: null, reason: `clinician_signoff_ref "${ref}" (${src}) does not reference rubric ${rubricVersion} — unsigned for this version` };
    }
    return { ref };
  };

  if (override) return validate(override, "--signoff-ref");

  if (!rubricPath || !existsSync(rubricPath)) return { ref: null, reason: `rubric doc not found: ${rubricPath}` };
  const text = readFileSync(rubricPath, "utf8");
  // A sign-off table row: `| `clinician_signoff_ref` | `signoff:…` |`. A rubric
  // doc may carry MORE THAN ONE — e.g. v1.0 in §8 and v1.1 in §9. Collect every
  // recorded ref and select the one that references the version this run cites,
  // NOT merely the first in document order. Selecting by document order would
  // let an older section (v1.0 §8) shadow a newer signed version (v1.1 §9) and
  // silently arm a run against the wrong rubric — a fail-OPEN we must not permit.
  const refs = [...text.matchAll(/`clinician_signoff_ref`\s*\|\s*`(signoff:[^`]+)`/g)].map((m) => m[1]);
  if (!refs.length) return { ref: null, reason: `no recorded clinician_signoff_ref in ${rubricPath} (rubric not signed)` };
  const forVersion = rubricVersion ? refs.find((r) => r.includes(rubricVersion)) : undefined;
  if (!forVersion) {
    return { ref: null, reason: `no clinician_signoff_ref in ${rubricPath} references rubric ${rubricVersion} (found: ${refs.join(", ")}) — unsigned for this version` };
  }
  return validate(forVersion, rubricPath);
}
