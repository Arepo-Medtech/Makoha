#!/usr/bin/env node
/**
 * MIRAGE runner (FLOW_PLAN H3) — loads the corpora, scores each of the three built
 * H2 retrieval paths, and records the result to a SEPARATE, first-party,
 * append-only benchmark score artifact (benchmark/mirage/scores/latest.json +
 * timestamped runs). The medicolegal audit ledger (C5) is NOT touched: it is
 * .strict() with a fixed field set and no metadata slot, and MIRAGE scores are
 * benchmark metadata, not verification-run records — so scores live in their own
 * durable artifact, and eligibility is additionally recorded in the manifest +
 * registers. Operator decision at the H3 Phase-2 gate.
 *
 * ELIGIBILITY: this runner never sets `patient_eligible`. A path becomes
 * benchmark-eligible only when it clears the gate over ATTESTED items; and even a
 * benchmark-eligible path is still patient_eligible:false until the H7 governance
 * gate (MIRAGE-pass is necessary, not sufficient).
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadAllCorpora } from "./corpus-loader.js";
import { realPaths } from "./paths.js";
import { runMirage, DEFAULT_THRESHOLD } from "./run-mirage.js";
import { releaseHarvestedOutput } from "../../portal/harvested-release.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPORA_DIR = join(__dirname, "corpora");
const SCORES_DIR = join(__dirname, "scores");

/**
 * Run every path against its corpus. Returns the aggregate result object.
 * @param {{threshold?:number}} [opts]
 */
export async function runCorpus(opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const { corpora, checksum, corpus_version, counts } = loadAllCorpora(CORPORA_DIR);
  const paths = realPaths();
  const results = [];

  for (const path of paths) {
    // Resolve this adapter's corpus by upstream mapping.
    const corpus = Object.values(corpora).find((c) => pathUpstream(c.path) === path.upstream) || {
      corpus_version,
      path: null,
      items: [],
    };
    await path.open();
    try {
      const r = await runMirage(path, corpus, { threshold });
      results.push(r);
    } finally {
      path.close();
    }
  }

  // Benchmark-eligibility is gate-pass; patient-eligibility ALWAYS awaits H7.
  const perPath = results.map((r) => ({
    path: r.path,
    corpus_version: r.corpus_version,
    score: r.score,
    threshold: r.threshold,
    grounded_support_rate: r.grounded_support_rate,
    abstain_correct: r.abstain_correct,
    invariant_hold: r.invariant_hold,
    measured_diagnostic: r.diagnostic,
    counts: r.counts,
    localisation: r.localisation,
    upstream_mismatches: r.upstream_mismatches,
    benchmark_passed: r.passed,
    patient_eligible: false,
    patient_eligible_reason: r.passed
      ? "benchmark-eligible over attested items; patient_eligible pending H7 governance"
      : r.counts.attested === 0
        ? "not eligible: corpus is draft/unattested (no attested items gate) — pending clinician attestation (MIRAGE-CORPUS-SPEC §7) and H7 governance"
        : "not eligible: below threshold or a hard gate (abstain/invariant) failed; pending; and H7 governance",
  }));

  return {
    milestone: "FLOW_PLAN H3",
    generated_utc: new Date().toISOString(),
    harness: "first-party MIRAGE-style (no gzxiong/MedRAG #20 code; #20 methodology-reference only)",
    threshold,
    corpus_version,
    corpus_checksum: checksum,
    corpus_counts: counts,
    corpus_pass: perPath.every((p) => p.benchmark_passed),
    paths: perPath,
    full: results,
  };
}

/** Map a corpus `path` field to the adapter upstream tag. */
function pathUpstream(p) {
  return {
    "evidence-fda-pubmed": "heydoc-mcp-evidence-fda-pubmed",
    "evidence-drug-guideline": "heydoc-mcp-evidence-drug-guideline",
    docs: "heydoc-mcp-docs",
  }[p];
}

/**
 * GOVERNANCE SEAM (FLOW_PLAN H7 / G7). The MIRAGE harness is an offline
 * benchmark and never sets patient_eligible — MIRAGE-pass is necessary, not
 * sufficient. This seam makes governance the enforced second precondition: any
 * patient-directed release built on a MIRAGE-gated retrieval path MUST route
 * through the fail-closed portal gate (ARCH_PLAN C9) and REFUSES without a
 * clinician-attested VerificationGateRecord on the exact output hash. Opens no
 * patient path; never sets patient_eligible; unreached today.
 * @param {string} output - the exact retrieval text a patient-facing build would release
 */
export function governedRelease(output) {
  return releaseHarvestedOutput("retrieval-mirage", output);
}

/** Write the score artifact (latest.json). */
export function writeScores(result) {
  mkdirSync(SCORES_DIR, { recursive: true });
  const { full, ...record } = result; // omit the verbose per_question dump from the artifact
  writeFileSync(join(SCORES_DIR, "latest.json"), JSON.stringify(record, null, 2) + "\n");
  return join(SCORES_DIR, "latest.json");
}

// CLI: node benchmark/mirage/index.js  → run + write scores/latest.json.
if (import.meta.url === `file://${process.argv[1]}`) {
  runCorpus()
    .then((result) => {
      const p = writeScores(result);
      console.log("MIRAGE benchmark (FLOW_PLAN H3) — first-party, mock-default");
      console.log(`  corpus_version:  ${result.corpus_version} (${result.corpus_checksum.slice(0, 22)}…)`);
      for (const path of result.paths) {
        const rate = path.grounded_support_rate === null ? "n/a (0 attested P)" : path.grounded_support_rate.toFixed(2);
        console.log(
          `  ${path.path}: score=${rate} attested=${path.counts.attested}/${path.counts.total} ` +
            `abstain=${path.abstain_correct} invariant=${path.invariant_hold} benchmark_passed=${path.benchmark_passed} patient_eligible=${path.patient_eligible}`
        );
      }
      console.log(`  scores → ${p.replace(process.cwd() + "/", "")}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
