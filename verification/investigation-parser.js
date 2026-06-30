/**
 * deterministic-investigation-parser — the sanitiser.
 *
 * Converts a raw numeric investigation result into a SANITISED ContextPacket
 * `lab_result` fact: an HL7 interpretation code (N/H/L/HH/LL/U) plus a qualitative
 * value string. THE RAW NUMBER NEVER APPEARS IN THE OUTPUT.
 *
 * WHY this exists (hard limit, <non_negotiable_invariants>): "No raw lab numbers
 * to LLM context — raw numeric values must be sanitised by the investigation
 * parser before injection." A bare "Troponin I = 250 ng/L" in the packet invites
 * the LLM to hallucinate on it; the sanitised "Troponin I critically elevated"
 * cannot be misread as a different number.
 *
 * Determinism + fail-safe: bands come from a fixed, versioned reference table; an
 * unknown analyte or non-numeric input yields interpretation "U" and a qualitative
 * "not sanitised" note — never a pass-through of the raw value.
 *
 * The reference ranges are DEV/SYNTHETIC-ONLY and NOT clinically authoritative
 * (see lab-reference-ranges.json status). Clinical + regulatory sign-off is
 * required before any patient-facing use.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Prefixed } from "./hash.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET = JSON.parse(readFileSync(join(__dirname, "data", "lab-reference-ranges.json"), "utf8"));
const DATASET_CHECKSUM = sha256Prefixed(JSON.stringify(DATASET.analytes));
const SANITISER = `deterministic-investigation-parser@${DATASET.dataset_version}`;

/** Build the dataset receipt (receipt discipline: dataset_version + checksum). */
function datasetReceipt(recognised) {
  return {
    kind: "dataset",
    upstream: "deterministic-investigation-parser",
    dataset_version: DATASET.dataset_version,
    checksum: DATASET_CHECKSUM,
    recognised,
  };
}

/** Find a reference entry by LOINC (preferred) or analyte name (case-insensitive). */
function lookup({ loinc, analyte }) {
  if (loinc) {
    const byLoinc = DATASET.analytes.find((a) => a.loinc === String(loinc));
    if (byLoinc) return byLoinc;
  }
  if (analyte) {
    const name = String(analyte).trim().toLowerCase();
    return DATASET.analytes.find((a) => a.analyte.toLowerCase() === name) || null;
  }
  return null;
}

/** Map a numeric value to an HL7 interpretation band using the analyte's thresholds. */
function band(value, r) {
  if (r.critical_low != null && value < r.critical_low) return "LL";
  if (r.low != null && value < r.low) return "L";
  if (r.critical_high != null && value > r.critical_high) return "HH";
  if (r.high != null && value > r.high) return "H";
  return "N";
}

const PHRASE = {
  N: (n) => `${n} within normal limits`,
  H: (n) => `${n} elevated (high)`,
  HH: (n) => `${n} critically elevated`,
  L: (n) => `${n} low`,
  LL: (n) => `${n} critically low`,
};

let seq = 0;

/**
 * Sanitise one raw investigation result into a ContextPacket lab_result fact.
 * @param {{ loinc?: string, analyte?: string, value: number, unit?: string }} input
 * @returns {{ fact: object, receipt: object, recognised: boolean, interpretation: string }}
 */
export function sanitiseInvestigation(input = {}) {
  const { loinc, analyte, value } = input;
  const r = lookup({ loinc, analyte });
  const label = (r && r.analyte) || analyte || loinc || "unknown analyte";
  const fact_id = `fact-lab-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

  // Fail-safe: unknown analyte or non-numeric input → never emit the raw value.
  if (!r || typeof value !== "number" || !Number.isFinite(value)) {
    return {
      fact: {
        fact_id,
        category: "lab_result",
        label,
        value: `${label}: result could not be sanitised (analyte not in reference table or non-numeric); raw value withheld`,
        interpretation: "U",
        sanitised_by: SANITISER,
      },
      receipt: datasetReceipt(false),
      recognised: false,
      interpretation: "U",
    };
  }

  const hl7 = band(value, r);
  return {
    fact: {
      fact_id,
      category: "lab_result",
      label,
      // Qualitative only — deliberately contains no digit from the raw value.
      value: PHRASE[hl7](label),
      interpretation: hl7,
      sanitised_by: SANITISER,
    },
    receipt: datasetReceipt(true),
    recognised: true,
    interpretation: hl7,
  };
}

export const REFERENCE_DATASET_VERSION = DATASET.dataset_version;
