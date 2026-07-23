#!/usr/bin/env node
/**
 * MedProbeBench runner (Mechanical Inventory B2) — loads the claim corpora, scores the
 * grounded citation verifier over the ATTESTED items, and records a SEPARATE, first-party
 * benchmark score artifact (benchmark/medprobe/scores/latest.json). The medicolegal audit
 * ledger is NOT touched (benchmark metadata is not a verification record).
 *
 * B2.1b wires the scorer/adapter. The score is computed over ATTESTED items only; the seed
 * corpus is DEV/SYNTHETIC unattested, so the benchmark is ARMED-BUT-INERT (armed:false,
 * SKIP-green) until a clinician attests — the MIRAGE idiom. The scoring LOGIC + gate teeth
 * are exercised in test/bench-medprobe-gate.js over attested fixture corpora.
 *
 * Never sets any patient-eligibility flag; benchmark-eligible is necessary, not sufficient.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadAllClaims } from "./corpus-loader.js";
import { groundedAdapter, VERDICT_TO_EXPECTED } from "./adapter.js";
import { runMedProbe, DEFAULT_THRESHOLD } from "./run-medprobe.js";
import { validateMedProbeScore } from "./score-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPORA_DIR = join(__dirname, "corpora");
const SCORES_DIR = join(__dirname, "scores");
export { DEFAULT_THRESHOLD };

/**
 * Build the score artifact: run the grounded verifier over the corpus (attested-only).
 * armed = the corpus has attested items (so the score gates). Until then it is inert.
 * @param {{ threshold?: number, nowIso: string }} opts
 */
export function buildScore({ threshold = DEFAULT_THRESHOLD, nowIso } = {}) {
  const { items, evidence, checksum, corpus_version, counts } = loadAllClaims(CORPORA_DIR);
  const scored = runMedProbe(groundedAdapter(evidence), { items, evidence }, { threshold });
  const armed = counts.attested > 0 && counts.unattested === 0;
  const record = {
    schema_version: "1.0.0",
    benchmark: "medprobe",
    milestone: "Mechanical Inventory B2.1b (scorer wired)",
    harness: "first-party MedProbeBench-style clean-room (no upstream dataset lifted)",
    generated_utc: nowIso || "1970-01-01T00:00:00.000Z",
    corpus_version,
    corpus_checksum: checksum,
    corpus_counts: counts,
    threshold,
    armed,
    benchmark_passed: armed && scored.benchmark_passed,
    reason: armed
      ? "scorer wired and corpus clinician-attested — the benchmark gates over attested items."
      : "scorer wired (grounded verifier); corpus is DEV/SYNTHETIC unattested — ARMED-BUT-INERT (SKIP-green) until a clinician attests.",
    citation_accountability_rate: scored.citation_accountability_rate,
    hallucination_catch_rate: scored.hallucination_catch_rate,
    counts: scored.counts,
  };
  validateMedProbeScore(record); // schema-first: never write a malformed artifact
  return record;
}

/** Write the score artifact (latest.json). */
export function writeScores(record) {
  mkdirSync(SCORES_DIR, { recursive: true });
  writeFileSync(join(SCORES_DIR, "latest.json"), JSON.stringify(record, null, 2) + "\n");
  return join(SCORES_DIR, "latest.json");
}

// CLI: node benchmark/medprobe/index.js → load + score + write scores/latest.json.
// Decoded-path compare so a repo path with spaces still triggers the CLI.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const record = buildScore({ nowIso: new Date().toISOString() });
    const p = writeScores(record);
    console.log("MedProbeBench (Mechanical Inventory B2.1b) — first-party clean-room, scorer wired");
    console.log(`  corpus_version: ${record.corpus_version} (${record.corpus_checksum.slice(0, 22)}…)`);
    console.log(`  counts: ${JSON.stringify(record.corpus_counts)}`);
    const acc = record.citation_accountability_rate;
    const cat = record.hallucination_catch_rate;
    console.log(`  over ATTESTED: accountability=${acc === null ? "n/a" : acc.toFixed(2)} hallucination_catch=${cat === null ? "n/a" : cat.toFixed(2)}`);
    console.log(`  armed=${record.armed} benchmark_passed=${record.benchmark_passed}`);
    console.log(`  reason: ${record.reason}`);
    console.log(`  scores → ${p.replace(process.cwd() + "/", "")}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
