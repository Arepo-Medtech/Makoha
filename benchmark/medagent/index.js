#!/usr/bin/env node
/**
 * MedAgentBench runner (Mechanical Inventory B2, MA.2) — loads the task corpora, seeds the
 * benchmark-scoped virtual FHIR EHR per task, drives the reference agent, scores task-success
 * + invariant-adherence over the ATTESTED tasks, and records a SEPARATE, first-party score
 * artifact (benchmark/medagent/scores/latest.json). The medicolegal audit ledger is NOT touched.
 *
 * MA.2 wires the driver + scorer. The score is over ATTESTED tasks only; the seed corpus is
 * DEV/SYNTHETIC unattested, so the benchmark is ARMED-BUT-INERT (armed:false, SKIP-green) until
 * a clinician attests. The scoring LOGIC + invariant HARD gate are exercised in
 * test/bench-medagent-gate.js over attested fixture tasks + scripted breach agents.
 *
 * Never sets any patient-eligibility flag; benchmark-eligible is necessary, not sufficient.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadAllTasks } from "./task-loader.js";
import { createVirtualEhr } from "./virtual-ehr.js";
import { referenceAgent } from "./agents.js";
import { runMedAgent, DEFAULT_THRESHOLD } from "./run-medagent.js";
import { validateMedAgentScore } from "./score-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPORA_DIR = join(__dirname, "corpora");
const SCORES_DIR = join(__dirname, "scores");
export { DEFAULT_THRESHOLD };

/**
 * Build the score artifact: seed each task's sandbox (proving AU-Core conformance) and score
 * the reference agent over the attested tasks. armed = corpus attested. Until then, inert.
 * @param {{ threshold?: number, nowIso: string }} opts
 */
export async function buildScore({ threshold = DEFAULT_THRESHOLD, nowIso } = {}) {
  const { items, checksum, corpus_version, counts } = loadAllTasks(CORPORA_DIR);

  // Seed-conformance proof (every task's sandbox validates), independent of attestation.
  let seeded = 0;
  let conformant = 0;
  for (const task of items) {
    const ehr = createVirtualEhr();
    for (const rep of ehr.seed(task.ehr_seed)) {
      seeded++;
      if (rep.status === "conformant") conformant++;
    }
  }

  const scored = await runMedAgent(referenceAgent(), items, { threshold, nowIso });
  const armed = counts.attested > 0 && counts.unattested === 0;
  const record = {
    schema_version: "1.0.0",
    benchmark: "medagent",
    milestone: "Mechanical Inventory MA.2 (driver + scorer wired)",
    harness: "first-party MedAgentBench-style clean-room (no upstream dataset lifted)",
    generated_utc: nowIso || "1970-01-01T00:00:00.000Z",
    corpus_version,
    corpus_checksum: checksum,
    corpus_counts: counts,
    ehr_conformance: { seeded, conformant, non_conformant: seeded - conformant },
    threshold,
    armed,
    benchmark_passed: armed && scored.benchmark_passed,
    reason: armed
      ? "driver + scorer wired and corpus clinician-attested — the benchmark gates over attested tasks."
      : "driver + scorer wired (reference agent over the sandbox); corpus is DEV/SYNTHETIC unattested — ARMED-BUT-INERT (SKIP-green) until a clinician attests.",
    task_success_rate: scored.task_success_rate,
    invariant_adherence_rate: scored.invariant_adherence_rate,
    counts: scored.counts,
  };
  validateMedAgentScore(record); // schema-first: never write a malformed artifact
  return record;
}

/** Write the score artifact (latest.json). */
export function writeScores(record) {
  mkdirSync(SCORES_DIR, { recursive: true });
  writeFileSync(join(SCORES_DIR, "latest.json"), JSON.stringify(record, null, 2) + "\n");
  return join(SCORES_DIR, "latest.json");
}

// CLI: node benchmark/medagent/index.js → load + seed + score + write scores/latest.json.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildScore({ nowIso: new Date().toISOString() })
    .then((record) => {
      const p = writeScores(record);
      console.log("MedAgentBench (Mechanical Inventory MA.2) — first-party clean-room, driver + scorer wired");
      console.log(`  corpus_version: ${record.corpus_version} (${record.corpus_checksum.slice(0, 22)}…)`);
      console.log(`  counts: ${JSON.stringify(record.corpus_counts)}`);
      console.log(`  virtual-EHR: seeded=${record.ehr_conformance.seeded} conformant=${record.ehr_conformance.conformant}`);
      const ts = record.task_success_rate;
      const ia = record.invariant_adherence_rate;
      console.log(`  over ATTESTED: task_success=${ts === null ? "n/a" : ts.toFixed(2)} invariant_adherence=${ia === null ? "n/a" : ia.toFixed(2)}`);
      console.log(`  armed=${record.armed} benchmark_passed=${record.benchmark_passed}`);
      console.log(`  reason: ${record.reason}`);
      console.log(`  scores → ${p.replace(process.cwd() + "/", "")}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
