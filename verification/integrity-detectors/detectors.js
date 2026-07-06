/**
 * Integrity detectors (FLOW_PLAN H2, #8 Aperivue/medsci-skills — PATTERN-LIFT,
 * MIT, NO copied code / NO runtime dependency). Each detector is a PURE function
 *   detect(output, evidence) -> { detector, passed, severity, reason? }
 * with NO network and NO side effects. They are machine-decided checks that
 * STRENGTHEN the verifier's five mechanical checks (ARCH C1) — they can only ADD
 * a reason to fail; they never rescue an output the verifier failed (see
 * combineVerification() in index.js: pass is a monotone AND).
 *
 * Design rule (mirrors verifier.js): detection is conservative and low-false-
 * positive — a detector fires only when a violation pattern is present AND the
 * grounding that would justify it is absent, so grounded, code-free output (e.g.
 * the pipeline's clean stub) passes untouched. Under-triage (a missed integrity
 * violation) outranks over-triage, but a detector that flags ordinary grounded
 * prose would break every legitimate run, so each is scoped tightly.
 *
 * severity uses the same vocabulary as verifier.js CHECK_SEVERITY
 * (critical | fail | warning) so a combined report reads uniformly.
 */

/** True when the evidence carries at least one grounding artifact (citation or
 *  live/terminology receipt). Used to let grounded output pass claim-shaped
 *  patterns that would otherwise look fabricated. */
function hasAnyGrounding(evidence = {}) {
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  return (
    n(evidence.citations) > 0 ||
    n(evidence.live_receipts) > 0 ||
    n(evidence.terminology_receipts) > 0 ||
    n(evidence.terminology) > 0
  );
}

// A dosing INSTRUCTION: a number+unit adjacent to a frequency/route directive.
// This is what a dose looks like when written for a patient — distinct from the
// word "dosage" appearing in a disclaimer ("no dosages are given").
const DOSE_INSTRUCTION_RE =
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|microgram|milligram|g|ml|iu|units?)\b[^.\n]{0,24}\b(?:daily|once|twice|thrice|bd|tds|qid|qds|od|mane|nocte|prn|hourly|q\d+h|per\s+day|a\s+day|every\s+\d+\s*h)\b/i;
// Advisory / interaction / guideline framing — the context #15 output carries.
const ADVISORY_CONTEXT_RE = /\b(?:advisory|interaction|guideline|paediatric|contraindicat|recommend)\w*/i;

/**
 * advisory_dose_leak (critical) — reinforces the §1 dose-source-singular boundary
 * (G9) at the verification layer. If output frames content as advisory/interaction/
 * guideline AND carries a dosing INSTRUCTION, that is a dose escaping the
 * pharmacology firewall through advisory text. The firewall (Trunk 8.0 PharmCheck)
 * is the ONLY dose source — advisory evidence may never instruct a dose.
 */
export function advisoryDoseLeak(output) {
  const hasDose = DOSE_INSTRUCTION_RE.test(output);
  const advisory = ADVISORY_CONTEXT_RE.test(output);
  const passed = !(hasDose && advisory);
  return {
    detector: "advisory_dose_leak",
    passed,
    severity: "critical",
    reason: passed ? undefined : "advisory/guideline text carries a dosing instruction — doses come only from the pharmacology firewall (Trunk 8.0), never advisory evidence",
  };
}

// A DOI or PMID presented as a source.
const CITATION_MARKER_RE = /\b(?:10\.\d{4,9}\/[^\s"'<>]+|PMID:?\s?\d{3,})\b/i;

/**
 * fabricated_citation_marker (fail) — a DOI/PMID citation marker in output with NO
 * grounding artifact in evidence is a fabricated source. Strengthens the
 * no-invented-guidelines check (which keys off guideline PHRASES, not raw
 * identifiers). Grounded output (any citation/receipt present) passes.
 */
export function fabricatedCitationMarker(output, evidence = {}) {
  const hasMarker = CITATION_MARKER_RE.test(output);
  const passed = !hasMarker || hasAnyGrounding(evidence);
  return {
    detector: "fabricated_citation_marker",
    passed,
    severity: "fail",
    reason: passed ? undefined : "output cites a DOI/PMID with no citation or receipt in evidence — citation markers must resolve to a grounded artifact",
  };
}

// A quantitative clinical claim: a percentage, or an "N in M" / "1 in N" risk.
const STAT_CLAIM_RE = /(\b\d{1,3}(?:\.\d+)?\s?%|\b\d+\s+in\s+\d+\b)/i;

/**
 * unsupported_statistic (fail) — a quantitative clinical statistic without any
 * grounding is an invented fact. Deterministic and conservative: only fires when
 * a stat is present AND evidence has no citation/receipt. This catches
 * "40% of patients respond" style fabrication the code/guideline checks miss.
 */
export function unsupportedStatistic(output, evidence = {}) {
  const hasStat = STAT_CLAIM_RE.test(output);
  const passed = !hasStat || hasAnyGrounding(evidence);
  return {
    detector: "unsupported_statistic",
    passed,
    severity: "fail",
    reason: passed ? undefined : "output states a clinical statistic with no citation or receipt — quantitative claims must be grounded",
  };
}

// Over-confident diagnostic certainty — contrary to augmented-not-autonomous.
const OVERCONFIDENT_DX_RE = /\b(?:definitely|certainly|conclusively|without\s+doubt|100%\s+certain)\b[^.\n]{0,40}\b(?:diagnos|confirmed|is\s+the\s+cause)/i;

/**
 * overconfident_diagnosis (warning) — flags definitive diagnostic language. The
 * system is clinical decision support, not a diagnostician: every diagnostic
 * output is provisional and clinician-confirmed (§1 augmented-not-autonomous).
 * Lowest severity (surfaced-but-gating, like verifier no_repo_invention).
 */
export function overconfidentDiagnosis(output) {
  const passed = !OVERCONFIDENT_DX_RE.test(output);
  return {
    detector: "overconfident_diagnosis",
    passed,
    severity: "warning",
    reason: passed ? undefined : "output asserts a definitive diagnosis — diagnostic output must remain provisional and clinician-confirmed (augmented, not autonomous)",
  };
}

/** The ordered detector set. Add new detectors here; each must be pure. */
export const DETECTORS = [
  advisoryDoseLeak,
  fabricatedCitationMarker,
  unsupportedStatistic,
  overconfidentDiagnosis,
];
