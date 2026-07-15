/**
 * Contract test — POSITIONAL STABILITY (M3).
 *
 * OPERATOR, 2026-07-15: *"the order in which you list your differentials in the prompt can change the
 * model's ranked output — a failure mode with no bedside equivalent and one that is invisible unless
 * you deliberately permute the input and check for stability."*
 *
 * THE GLITCH NO CLINICIAN WILL CATCH. A human applies judgement to each entry of a differential roughly
 * independently of its ordinal position. A transformer does not — attention is finite and unevenly
 * distributed, so first and last are attended more reliably than the middle. A reviewer has no intuition
 * for this **because they do not have the bug**. It is silent by construction.
 *
 * WHAT THIS SUITE PROVES — and the distinction matters:
 *   1. The harness DETECTS a genuinely position-biased generator. A stability checker that has never
 *      caught an unstable generator is decoration.
 *   2. It does NOT false-flag a stable one.
 *   3. It REFUSES TO JUDGE a non-deterministic generator (`indeterminate`) rather than misattributing
 *      temperature noise to position — a flag that cries wolf gets switched off within a week, and then
 *      the real instability ships.
 *   4. It says `not_applicable` when there is no ordering to bite on, rather than a hollow `stable`.
 *
 * SCOPE, HONESTLY: the default trunk generator returns a fixed string and ignores the packet, so it is
 * trivially stable and checking it proves nothing. The harness is for the REAL generation path
 * (`generate_candidate(packet)` — Claude / MedGemma), and is inert until one is wired. It exists now,
 * detection-proven, so the day a model is in the loop the check is already there rather than retrofitted
 * after the first unstable ranking has shipped.
 *
 * Run from repo root: node test/contract-positional-stability.js
 */
import { checkPositionalStability, defaultRank } from "../verification/positional-stability.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };

const packet = {
  trunk_id: "5.0",
  facts: [
    { fact_id: "f-1", category: "symptom", label: "chest pain", value: "central" },
    { fact_id: "f-2", category: "symptom", label: "dyspnoea", value: "on exertion" },
    { fact_id: "f-3", category: "risk_score", label: "wells", value: "4" },
    { fact_id: "f-4", category: "past_history", label: "prior DVT", value: "yes" },
  ],
  evidence: [],
};

// ---- 1. THE HARNESS DETECTS A POSITION-BIASED GENERATOR — the whole point ----------------------
// This generator is the bug, distilled: it ranks by INPUT POSITION and nothing else. Exactly what a
// transformer riding attention geometry does, with the confound removed.
const positional = async (p) => p.facts.map((f) => f.fact_id).join(" then ");
{
  const r = await checkPositionalStability(packet, positional);
  expect(r.verdict === "unstable",
    `a generator that ranks purely by input position MUST be caught — got "${r.verdict}". A stability checker that never catches an unstable generator is decoration.`);
  expect(/positional, not clinical/.test(r.reason), "the finding must say WHAT is wrong: the ranking is positional, not clinical");
  expect(/no bedside equivalent|no human reviewer/i.test(r.reason),
    "the finding must say WHY it matters: no human reviewer will catch this, because no human has the bug");
  expect(Array.isArray(r.permuted_rankings) && r.permuted_rankings.length === 3,
    "the finding must carry the permuted rankings — a flag without the evidence is not reproducible");
}

// ---- 2. It does NOT false-flag a genuinely stable generator -------------------------------------
// Ranks on MERIT (a fixed clinical ordering) regardless of how the input is arranged.
const clinical = async (p) => {
  const merit = ["f-3", "f-4", "f-1", "f-2"]; // by lethality-if-missed, say
  return merit.filter((id) => p.facts.some((f) => f.fact_id === id)).join(" then ");
};
{
  const r = await checkPositionalStability(packet, clinical);
  expect(r.verdict === "stable",
    `a generator that ranks on merit must PASS — got "${r.verdict}" (${r.reason}). A check that flags good behaviour gets switched off, and then the real instability ships.`);
}

// ---- 3. It REFUSES TO JUDGE a non-deterministic generator ---------------------------------------
// THE METHODOLOGICAL TRAP: you cannot attribute a difference to POSITION until you have controlled
// run-to-run variance. A model at temperature > 0 varies for reasons that have nothing to do with
// ordering. Without the control run, this harness would attribute temperature noise to positional bias
// and cry wolf on every check.
let flip = 0;
const nondeterministic = async (p) => (flip++ % 2 === 0 ? "f-1 then f-2" : "f-2 then f-1");
{
  const r = await checkPositionalStability(packet, nondeterministic);
  expect(r.verdict === "indeterminate",
    `a NON-DETERMINISTIC generator must return "indeterminate", not "unstable" — got "${r.verdict}". Misattributing temperature noise to position is how a real flag gets discredited and disabled.`);
  expect(/cannot be attributed|Refusing to judge/i.test(r.reason),
    "the refusal must state that attribution is impossible, not imply the generator is fine");
}

// ---- 4. No ordering → no question. It must not report a hollow "stable" -------------------------
{
  const r = await checkPositionalStability({ trunk_id: "5.0", facts: [{ fact_id: "f-1", category: "symptom", label: "x", value: "y" }], evidence: [] }, positional);
  expect(r.verdict === "not_applicable",
    `a packet with no list of length > 1 has no ordering for the bias to bite on — got "${r.verdict}". Reporting "stable" here would be a pass nobody earned.`);
}

// ---- 5. Reproducibility: a flag someone cannot re-run is not actionable -------------------------
{
  const a = await checkPositionalStability(packet, positional, { seed: 42 });
  const b = await checkPositionalStability(packet, positional, { seed: 42 });
  expect(JSON.stringify(a.permuted_rankings) === JSON.stringify(b.permuted_rankings),
    "the shuffle must be seeded — an instability nobody can reproduce cannot be investigated or fixed");
}

// ---- 6. The default ranking signal reads ORDER, not prose ---------------------------------------
// Two runs of a model word things differently while ranking identically; that is not instability.
{
  const r1 = defaultRank("first f-2, then f-1", packet);
  const r2 = defaultRank("We note f-2. Subsequently, f-1 is considered.", packet);
  expect(r1.join("|") === r2.join("|") && r1.join("|") === "f-2|f-1",
    "the rank signal must extract ORDER and ignore wording — comparing prose would flag paraphrase as instability");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-positional-stability FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-positional-stability: OK (M3 — detects a position-biased generator · does not false-flag a merit-based one · REFUSES to judge a non-deterministic one rather than blaming position for temperature · not_applicable when there is no ordering · seeded, so a flag is reproducible)");
