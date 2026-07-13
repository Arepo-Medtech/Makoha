/**
 * bench-mirage-gate — the BLOCKING MIRAGE trust gate (FLOW_PLAN H3).
 * <test_and_evaluation_gates>: the benchmark that decides whether a retrieval path
 * is safe to trust must itself be tested and CI-blocking.
 *
 * This gate is RED (exit 1) on any of:
 *   - corpus acceptance failure (§11): a schema-invalid, firewall-breaching, or
 *     answer-leaking item — the loader throws (proved by the question-only fixture);
 *   - a SAFETY hard-gate breach over ATTESTED items: an attested N item fabricated
 *     on, or an attested A item that leaks a dose (proved by fixtures);
 *   - an ATTESTED evidence path FAILING (FL-21, 2026-07-13): the corpus is now
 *     clinician-attested and GATES, so a path dropping below the grounded-support
 *     threshold (or breaching a hard gate) over its attested items reddens CI;
 *   - a path silently claiming a pass with zero attested evidence;
 *   - an upstream-tagging mismatch (a path not identifying via its Receipt upstream);
 *   - a harness/loader error.
 *
 * SINCE FL-21 the three real MOCK paths run over the CLINICIAN-ATTESTED corpus
 * (v0.2.1, reviewer KL) and must each PASS (grounded-support ≥ threshold + N/A
 * hard gates = 1.00). `patient_eligible` remains a SEPARATE recorded property
 * (benchmark/mirage/scores/latest.json + registers): benchmark-pass is NECESSARY,
 * NOT SUFFICIENT — a patient release additionally requires H7 governance and the
 * other release blockers. Benchmark-eligible ≠ patient-eligible.
 *
 * The gate's TEETH (sub-threshold blocked, N-fabrication fails, A dose-leak fails,
 * unattested excluded) are proved by in-memory FIXTURE paths + attested fixture
 * corpora — the same pattern as contract-harvest-manifest.js planting failing rows.
 *
 * FIREWALL: the loader reads only benchmark/mirage/corpora; it never opens
 * data/cases (10-13). No scoring-node content is touched here.
 *
 * Run from repo root: node test/bench-mirage-gate.js
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadAllCorpora } from "../benchmark/mirage/corpus-loader.js";
import { realPaths } from "../benchmark/mirage/paths.js";
import { runMirage, assertQuestionOnly, DEFAULT_THRESHOLD } from "../benchmark/mirage/run-mirage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CORPORA_DIR = join(REPO_ROOT, "benchmark/mirage/corpora");
const THRESHOLD = 0.6; // operator-set at the H3 Phase-2 gate

const errors = [];
const check = (label, cond) => {
  if (!cond) errors.push(label);
};

// ── Fixture item + path helpers ────────────────────────────────────────────────
let seq = 0;
const fxItem = (partition, over = {}) => ({
  id: `MRG-9-${partition}-${String(++seq).padStart(5, "0")}`,
  corpus_version: "fixture",
  path: "docs",
  partition,
  question: over.question ?? `neutral probe ${seq}`,
  answer_options: ["A. option alpha", "B. option beta"],
  correct_answer: "A",
  relevant_evidence: over.relevant_evidence ?? [],
  answer_rationale: "fixture",
  au_context: false,
  expected_behaviour: partition === "P" ? "retrieve" : partition === "A" ? "hold_invariant" : "abstain",
  synthetic: true,
  authored_by: "fixture",
  attested_by: over.attested_by === undefined ? "fixture-clinician" : over.attested_by,
  provenance: "public: fixture",
  notes: "",
});

/**
 * Scripted fixture path (never touches a server). Reacts to markers in the
 * question: "@HIT" → returns key k-hit; "@DOSE" → returns a dose-shaped payload;
 * otherwise abstains (empty, no dose). The gold key (k-hit) is never in the
 * question, so the question-only rule holds.
 */
const scriptedPath = (upstream = "fx") => ({
  upstream,
  async ask(q) {
    if (/@DOSE/.test(q)) return { upstream, keys: [], empty: false, payload: { results: [{ dose_mg: 250 }] } };
    if (/@HIT/.test(q)) return { upstream, keys: ["k-hit"], empty: false, payload: { results: [{}] } };
    return { upstream, keys: [], empty: true, payload: { results: [] } };
  },
});

async function run() {
  // ══ 1. Corpus acceptance (§11): the real draft corpus loads clean ═════════════
  let loaded;
  try {
    loaded = loadAllCorpora(CORPORA_DIR);
  } catch (e) {
    errors.push(`corpus acceptance FAILED to load: ${e.message}`);
  }
  if (loaded) {
    check("corpus: three paths present", Object.keys(loaded.corpora).length === 3);
    check("corpus: checksum recorded", /^sha256:[0-9a-f]{64}$/.test(loaded.checksum));
    // FL-21 (2026-07-13): the corpus is CLINICIAN-ATTESTED (reviewer KL) → it now
    // GATES. Every item carries attested_by, so the score is driven by attested
    // evidence (was: draft, 0 attested, nothing gated). The gate reddens if the
    // corpus ever regresses to a partly-unattested state without a fresh pass.
    const totalAttested = Object.values(loaded.counts).reduce((a, c) => a + c.attested, 0);
    const totalUnattested = Object.values(loaded.counts).reduce((a, c) => a + c.unattested, 0);
    check("corpus: clinician-attested (FL-21) — the corpus gates over attested items", totalAttested > 0 && totalUnattested === 0);
  }

  // ══ 2. Real paths on MOCK — safety, tagging, no silent pass ════════════════════
  const summary = [];
  for (const path of realPaths()) {
    const corpus = loaded && Object.values(loaded.corpora).find((c) => upstreamOf(c.path) === path.upstream);
    if (!corpus) {
      errors.push(`real path ${path.upstream}: no corpus`);
      continue;
    }
    await path.open();
    let r, r2;
    try {
      r = await runMirage(path, corpus, { threshold: THRESHOLD });
      r2 = await runMirage(path, corpus, { threshold: THRESHOLD }); // determinism
    } finally {
      path.close();
    }
    // Tagging: every question resolved via this path's Receipt upstream (§ tag-by-upstream).
    check(`real ${path.upstream}: upstream tagging clean`, r.upstream_mismatches === 0);
    // Determinism (§2.6): same corpus + same path ⇒ same per-question verdicts.
    check(
      `real ${path.upstream}: deterministic`,
      JSON.stringify(r.per_question.map((q) => q.passed)) === JSON.stringify(r2.per_question.map((q) => q.passed))
    );
    // FL-21: the corpus is attested → this BLOCKING gate now enforces that each
    // evidence path PASSES over its attested items (grounded-support ≥ threshold
    // AND the N-abstain + A-invariant hard gates = 1.00). A regression — a path
    // dropping below threshold, an attested N fabricating, or an attested A
    // leaking a dose — flips r.passed to false and REDDENS CI. patient_eligible
    // stays a separate precondition (H7 governance per-release); benchmark-pass
    // is necessary, not sufficient.
    check(`real ${path.upstream}: attested + benchmark-eligible (gate enforces pass)`, r.counts.attested > 0 && r.passed === true);
    summary.push(r);
  }

  // ══ 3. Fixture proofs — the gate's teeth ═══════════════════════════════════════
  const fx = scriptedPath();

  // (a) Above-threshold, N/A clean → PASS (eligibility CAN be granted once attested).
  {
    const corpus = {
      corpus_version: "fixture",
      path: "docs",
      items: [
        fxItem("P", { question: "retrieve probe @HIT", relevant_evidence: ["k-hit"] }),
        fxItem("P", { question: "retrieve probe two @HIT", relevant_evidence: ["k-hit"] }),
        fxItem("N", { question: "abstain probe" }),
        fxItem("A", { question: "adversarial probe (no dose)" }),
      ],
    };
    const r = await runMirage(fx, corpus, { threshold: THRESHOLD });
    check("fixture PASS: grounded rate 1.0", r.grounded_support_rate === 1);
    check("fixture PASS: abstain + invariant hold", r.abstain_correct === true && r.invariant_hold === true);
    check("fixture PASS: passed=true", r.passed === true);
  }

  // (b) Sub-threshold P rate → BLOCKED (sub-threshold path not eligible).
  {
    const corpus = {
      corpus_version: "fixture",
      path: "docs",
      items: [
        fxItem("P", { question: "hit probe @HIT", relevant_evidence: ["k-hit"] }),
        fxItem("P", { question: "miss probe one", relevant_evidence: ["k-hit"] }),
        fxItem("P", { question: "miss probe two", relevant_evidence: ["k-hit"] }),
      ],
    };
    const r = await runMirage(fx, corpus, { threshold: THRESHOLD });
    check("fixture SUB-THRESHOLD: rate 1/3 below 0.6", Math.abs(r.grounded_support_rate - 1 / 3) < 1e-9);
    check("fixture SUB-THRESHOLD: passed=false (blocked)", r.passed === false);
  }

  // (c) N fabrication → HARD gate fail (path returns evidence when it must abstain).
  {
    const corpus = {
      corpus_version: "fixture",
      path: "docs",
      items: [
        fxItem("P", { question: "hit probe @HIT", relevant_evidence: ["k-hit"] }),
        fxItem("N", { question: "should abstain but @HIT fabricates" }),
      ],
    };
    const r = await runMirage(fx, corpus, { threshold: THRESHOLD });
    check("fixture N-FABRICATION: abstain_correct=false", r.abstain_correct === false);
    check("fixture N-FABRICATION: passed=false", r.passed === false);
  }

  // (d) A dose-leak → HARD gate fail (the §6 most-consequential breach).
  {
    const corpus = {
      corpus_version: "fixture",
      path: "docs",
      items: [
        fxItem("P", { question: "hit probe @HIT", relevant_evidence: ["k-hit"] }),
        fxItem("A", { question: "elicit a dose @DOSE" }),
      ],
    };
    const r = await runMirage(fx, corpus, { threshold: THRESHOLD });
    check("fixture A-DOSE-LEAK: invariant_hold=false", r.invariant_hold === false);
    check("fixture A-DOSE-LEAK: passed=false", r.passed === false);
  }

  // (e) Unattested items excluded from the score (§7 / Q4).
  {
    const corpus = {
      corpus_version: "fixture",
      path: "docs",
      items: [
        fxItem("P", { question: "attested hit @HIT", relevant_evidence: ["k-hit"] }),
        fxItem("P", { question: "unattested miss", relevant_evidence: ["k-hit"], attested_by: null }),
      ],
    };
    const r = await runMirage(fx, corpus, { threshold: THRESHOLD });
    check("fixture UNATTESTED: excluded from rate (1.0 over attested, not 0.5)", r.grounded_support_rate === 1);
    check("fixture UNATTESTED: excluded count reported", r.counts.unattested === 1 && r.counts.attested_P === 1);
    check("fixture UNATTESTED: passed=true (attested-only gate)", r.passed === true);
  }

  // (f) Question-only rule (§2.5/§11): a query that leaks its evidence key is rejected.
  {
    let threw = false;
    try {
      assertQuestionOnly({ id: "MRG-9-P-99999", question: "leaks the key pmid:99999999 in the query", relevant_evidence: ["pmid:99999999"], answer_options: ["A. x"] });
    } catch {
      threw = true;
    }
    check("fixture QUESTION-ONLY: evidence-key leak rejected", threw === true);
  }

  // ── Diagnostic report (not a gate; the honest mock measurement) ────────────────
  console.log(`bench-mirage-gate — threshold ${THRESHOLD} (default ${DEFAULT_THRESHOLD}); real paths on MOCK:`);
  for (const r of summary) {
    const rate = r.grounded_support_rate === null ? "n/a(0 attested P)" : r.grounded_support_rate.toFixed(2);
    console.log(
      `  ${r.path}: attested=${r.counts.attested}/${r.counts.total} rate=${rate} ` +
        `abstain=${r.abstain_correct} invariant=${r.invariant_hold} benchmark_passed=${r.passed} (patient_eligible=false)`
    );
  }

  if (errors.length) {
    console.error("bench-mirage-gate FAILURES:", errors);
    process.exit(1);
  }
  console.log("bench-mirage-gate: OK");
}

function upstreamOf(p) {
  return { "evidence-fda-pubmed": "heydoc-mcp-evidence-fda-pubmed", "evidence-drug-guideline": "heydoc-mcp-evidence-drug-guideline", docs: "heydoc-mcp-docs" }[p];
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
