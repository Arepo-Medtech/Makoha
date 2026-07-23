/**
 * bench-medprobe-gate — the MedProbeBench trust gate (Mechanical Inventory B2).
 *
 * B2.1b: the grounded citation verifier + scorer are wired, so this gate proves BOTH the
 * corpus-acceptance/firewall teeth AND the scoring teeth (over attested FIXTURE corpora):
 *   - the grounded adapter PASSES a clean attested corpus (accountability >= threshold,
 *     every U/F flagged);
 *   - the naive existence-only adapter MISSES a misattributed citation -> catch_rate < 1.00
 *     -> passed=false (the hallucination-catch HARD gate bites);
 *   - sub-threshold citation-accountability -> passed=false;
 *   - unattested items never gate;
 *   - the runner emits a schema-valid artifact (inert on the DEV/unattested seed).
 *
 * FIREWALL: reads only benchmark/medprobe/corpora; never opens data/cases (10-13).
 * Run from repo root: node test/bench-medprobe-gate.js
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { loadAllClaims, validateItem } from "../benchmark/medprobe/corpus-loader.js";
import { groundedAdapter, naiveStructuralAdapter } from "../benchmark/medprobe/adapter.js";
import { runMedProbe } from "../benchmark/medprobe/run-medprobe.js";
import { buildScore, writeScores } from "../benchmark/medprobe/index.js";
import { validateMedProbeScore } from "../benchmark/medprobe/score-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPORA_DIR = join(__dirname, "..", "benchmark/medprobe/corpora");
const THRESHOLD = 0.6;

const errors = [];
const check = (label, cond) => {
  if (!cond) errors.push(label);
};
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

const baseItem = () => ({
  id: "MPB-9-S-00001",
  corpus_version: "fixture",
  claim: "A neutral supported clinical claim about hydration in mild illness.",
  claim_ref: "prop-neutral",
  cited_evidence: ["ev-neutral"],
  partition: "S",
  expected_verdict: "accept",
  support_note: "fixture",
  synthetic: true,
  authored_by: "fixture",
  attested_by: null,
  provenance: "public: fixture",
  notes: "",
});

// ── 1. Real seed corpus loads clean ────────────────────────────────────────────
let loaded;
try {
  loaded = loadAllClaims(CORPORA_DIR);
} catch (e) {
  errors.push(`corpus acceptance FAILED to load: ${e.message}`);
}
if (loaded) {
  check("corpus: checksum recorded", /^sha256:[0-9a-f]{64}$/.test(loaded.checksum));
  check("corpus: has S/U/F items", loaded.counts.S > 0 && loaded.counts.U > 0 && loaded.counts.F > 0);
  check("corpus: evidence store present", loaded.counts.evidence_keys > 0);
  check("corpus: DEV seed is unattested (armed-but-inert)", loaded.counts.attested === 0);
}

// ── 2. Firewall + hygiene + schema teeth ────────────────────────────────────────
check("firewall: data/cases provenance rejected", throws(() => validateItem({ ...baseItem(), provenance: "data/cases/SPEC-CARD-04-00001/10_ground_truth_node.json" }, "fx")));
check("firewall: scoring-node keyword provenance rejected", throws(() => validateItem({ ...baseItem(), provenance: "from the management_plan node" }, "fx")));
check("hygiene: claim embedding its cited key rejected", throws(() => validateItem({ ...baseItem(), claim: "this claim leaks ev-neutral in its text", cited_evidence: ["ev-neutral"] }, "fx")));
check("schema: bad id rejected", throws(() => validateItem({ ...baseItem(), id: "BAD-1" }, "fx")));
check("schema: unknown field rejected", throws(() => validateItem({ ...baseItem(), sneaky: true }, "fx")));
check("schema: partition/verdict mismatch rejected", throws(() => validateItem({ ...baseItem(), partition: "U", expected_verdict: "accept", cited_evidence: [] }, "fx")));
check("schema: clean baseline item accepted", !throws(() => validateItem(baseItem(), "fx")));

// ── 3. Scoring teeth (attested FIXTURE corpora) ─────────────────────────────────
const fxEvidence = {
  "ev-fx-support": { key: "ev-fx-support", text: "supports prop-fx", source: "fx", supports: ["prop-fx"], refutes: [] },
  "ev-fx-refute": { key: "ev-fx-refute", text: "refutes prop-fx-bad", source: "fx", supports: [], refutes: ["prop-fx-bad"] },
};
const at = (over) => ({ ...baseItem(), attested_by: "fixture-clinician", ...over });

// (a) Clean attested corpus → grounded adapter PASSES.
{
  const corpus = {
    evidence: fxEvidence,
    items: [
      at({ id: "MPB-9-S-00001", partition: "S", expected_verdict: "accept", claim_ref: "prop-fx", cited_evidence: ["ev-fx-support"] }),
      at({ id: "MPB-9-U-00002", partition: "U", expected_verdict: "flag_unsupported", claim_ref: "prop-fx-u", cited_evidence: [] }),
      at({ id: "MPB-9-F-00003", partition: "F", expected_verdict: "flag_fabricated", claim_ref: "prop-fx-x", cited_evidence: ["ev-fx-missing"] }),
      at({ id: "MPB-9-F-00004", partition: "F", expected_verdict: "flag_fabricated", claim_ref: "prop-fx-bad", cited_evidence: ["ev-fx-refute"] }),
    ],
  };
  const r = runMedProbe(groundedAdapter(fxEvidence), corpus, { threshold: THRESHOLD });
  check("grounded PASS: accountability 1.0", r.citation_accountability_rate === 1);
  check("grounded PASS: hallucination_catch 1.0", r.hallucination_catch_rate === 1);
  check("grounded PASS: passed=true", r.benchmark_passed === true);
  // determinism
  const r2 = runMedProbe(groundedAdapter(fxEvidence), corpus, { threshold: THRESHOLD });
  check("grounded: deterministic", JSON.stringify(r.per_item.map((x) => x.verdict)) === JSON.stringify(r2.per_item.map((x) => x.verdict)));

  // (b) Naive existence-only adapter MISSES the misattributed citation → HARD gate bites.
  const rn = runMedProbe(naiveStructuralAdapter(fxEvidence), corpus, { threshold: THRESHOLD });
  check("naive MISATTRIBUTION: hallucination_catch < 1.0", rn.hallucination_catch_rate < 1);
  check("naive MISATTRIBUTION: passed=false (HARD gate bites)", rn.benchmark_passed === false);
}

// (c) Sub-threshold citation-accountability → passed=false (an S citing non-supporting evidence).
{
  const corpus = {
    evidence: fxEvidence,
    items: [
      at({ id: "MPB-9-S-00010", partition: "S", expected_verdict: "accept", claim_ref: "prop-fx", cited_evidence: ["ev-fx-support"] }),
      at({ id: "MPB-9-S-00011", partition: "S", expected_verdict: "accept", claim_ref: "prop-fx", cited_evidence: ["ev-fx-refute"] }), // grounded → unsupported → wrong
      at({ id: "MPB-9-U-00012", partition: "U", expected_verdict: "flag_unsupported", claim_ref: "prop-fx-u", cited_evidence: [] }),
    ],
  };
  const r = runMedProbe(groundedAdapter(fxEvidence), corpus, { threshold: THRESHOLD });
  check("sub-threshold: accountability 0.5 < 0.6", Math.abs(r.citation_accountability_rate - 0.5) < 1e-9);
  check("sub-threshold: passed=false", r.benchmark_passed === false);
}

// (d) Unattested items never gate.
{
  const corpus = {
    evidence: fxEvidence,
    items: [
      at({ id: "MPB-9-S-00020", partition: "S", expected_verdict: "accept", claim_ref: "prop-fx", cited_evidence: ["ev-fx-support"] }),
      at({ id: "MPB-9-U-00021", partition: "U", expected_verdict: "flag_unsupported", claim_ref: "prop-fx-u", cited_evidence: [] }),
      { ...baseItem(), id: "MPB-9-S-00022", partition: "S", expected_verdict: "accept", claim_ref: "prop-fx", cited_evidence: ["ev-fx-refute"], attested_by: null }, // wrong, but unattested
    ],
  };
  const r = runMedProbe(groundedAdapter(fxEvidence), corpus, { threshold: THRESHOLD });
  check("unattested: excluded (accountability 1.0 over attested)", r.citation_accountability_rate === 1);
  check("unattested: counted as unattested", r.counts.unattested === 1 && r.counts.total_attested === 2);
  check("unattested: passed=true (attested-only)", r.benchmark_passed === true);
}

// ── 4. Runner emits a valid artifact (inert on the DEV/unattested seed) ──────────
try {
  const record = buildScore({ nowIso: "2026-07-24T00:00:00.000Z" });
  validateMedProbeScore(record);
  check("artifact: schema-valid", true);
  check("artifact: inert on unattested seed (armed=false, passed=false)", record.armed === false && record.benchmark_passed === false);
  check("artifact: carries corpus checksum", /^sha256:/.test(record.corpus_checksum));
  const p = writeScores(record);
  check("artifact: written to disk", existsSync(p));
  check("artifact: on-disk copy re-validates", (() => {
    try {
      validateMedProbeScore(JSON.parse(readFileSync(p, "utf8")));
      return true;
    } catch {
      return false;
    }
  })());
} catch (e) {
  errors.push(`artifact: runner threw — ${e.message}`);
}

if (errors.length) {
  console.error("bench-medprobe-gate FAILURES:", errors);
  process.exit(1);
}
console.log("bench-medprobe-gate: OK (B2.1b — firewall/hygiene teeth + scoring teeth: grounded passes, naive misses misattribution, sub-threshold blocked, attested-only)");
