/**
 * Contract test — A TRUNK MAY NOT CLAIM AN ENFORCEMENT THAT DOES NOT EXIST (R1-c).
 *
 * WHY THIS SUITE EXISTS. All nine trunk prompts ended with:
 *
 *     ## Constraints (enforced by verification)
 *     - No diagnosis.
 *     - No dosages.
 *
 * Verification does not check either. Its five checks are no_invented_codes, no_invented_guidelines,
 * no_invented_operations, no_repo_invention, hard_stop_enforcement. Two integrity detectors do exist
 * and are correctly wired (monotone AND — a detector failure fails the output and can never rescue it),
 * but they are narrow by design and neither catches the act:
 *
 *     "The patient has appendicitis."                  → not caught
 *     "Take 500 mg of amoxicillin three times daily."  → not caught
 *
 * `overconfident_diagnosis` catches a rhetorical register ("definitely … diagnosed"); `advisory_dose_leak`
 * catches a dose wearing ADVISORY framing (it targets one named leak, G9). Both are correct as targeted
 * detectors. **The defect was the claim, not the detector.**
 *
 * And the claim was invented by the prompts alone. `docs/grounding/trunk-constraints.md` — the source of
 * truth — has always listed exactly which checks fire per trunk, and never listed a diagnosis or dose
 * check. The derived cheatsheets are honest too. The prompts were the sole outlier.
 *
 * WHY IT MATTERS MORE THAN WORDING. An unenforced constraint labelled "enforced" buys silence with a
 * promise it does not keep: it reads as absolute, so nobody asks how the risk is actually modelled, and
 * it stops nothing, so the risk is not handled. That is `presents_mock_as_live` — the register's own
 * word for a conventional guarantee dressed as a mechanical one.
 *
 * WHAT THIS PINS. A prompt's MECHANICAL claims must name bars that really exist, and must match the
 * contract exactly. A constraint that nothing enforces must be labelled CONVENTIONAL — which is not a
 * weaker constraint, it is an honest one, and an honest one is a gap someone can close.
 *
 * Run from repo root: node test/contract-trunk-claims.js
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };

const PROMPT_DIR = "trunk/prompts";
const CONSTRAINTS = "docs/grounding/trunk-constraints.md";

/* ── The bars that actually exist, read from the source rather than a list kept in a test ───────── */
const verifierSrc = readFileSync("verification/verifier.js", "utf8");
const detectorSrc = readFileSync("verification/integrity-detectors/detectors.js", "utf8");
const REAL_CHECKS = new Set([
  ...[...verifierSrc.matchAll(/check:\s*"([a-z_]+)"/g)].map((m) => m[1]),
  ...[...detectorSrc.matchAll(/detector:\s*"([a-z_]+)"/g)].map((m) => m[1]),
]);
expect(REAL_CHECKS.size >= 5, "fixture: the real bars must be discoverable from source");

/* ── The contract's per-trunk truth ─────────────────────────────────────────────────────────────── */
const constraintsDoc = readFileSync(CONSTRAINTS, "utf8");
/** @returns {Set<string>} the checks trunk-constraints.md says fire for this trunk */
function contractChecks(trunkId) {
  const re = new RegExp(`#+\\s*Trunk ${trunkId.replace(".", "\\.")}[^\\n]*\\n([\\s\\S]*?)(?=\\n#+\\s*Trunk |$)`);
  const block = re.exec(constraintsDoc)?.[1] ?? "";
  const line = /Verifier checks triggered:\*{0,2}\s*(.+)/.exec(block)?.[1] ?? "";
  return new Set([...line.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]));
}

const prompts = readdirSync(PROMPT_DIR).filter((f) => /^trunk-\d\.\d-system\.md$/.test(f)).sort();
expect(prompts.length === 9, `all nine trunk prompts must be present (found ${prompts.length})`);

for (const file of prompts) {
  const id = /trunk-(\d\.\d)-system/.exec(file)[1];
  const src = readFileSync(join(PROMPT_DIR, file), "utf8");

  // ---- 1. The false claim must be gone ---------------------------------------------------------
  // "enforced by verification" over a list containing constraints verification does not check is the
  // F1 defect. The phrase is only legitimate inside a MECHANICAL block, where every entry is real.
  const legacyHeading = /##\s*Constraints \(enforced by verification\)/.test(src);
  expect(!legacyHeading,
    `T${id}: "## Constraints (enforced by verification)" claims an enforcement the verifier does not have (it checks ${[...REAL_CHECKS].slice(0, 3).join(", ")}… — never a diagnosis or a dose). Split the block into MECHANICAL and CONVENTIONAL.`);

  // ---- 2. Every MECHANICAL claim must name a bar that EXISTS ------------------------------------
  const mech = /MECHANICAL[^\n]*\n([\s\S]*?)(?=\n\s*CONVENTIONAL|\n##\s|$)/.exec(src);
  if (mech) {
    const claimed = [...mech[1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
    expect(claimed.length > 0, `T${id}: a MECHANICAL block must name at least one real bar`);
    for (const c of claimed) {
      expect(REAL_CHECKS.has(c),
        `T${id}: MECHANICAL claims \`${c}\`, which is not a real bar — no such verifier check or detector exists. A fabricated enforcement claim is the exact defect this suite exists to stop.`);
    }

    // ---- 3. …and must MATCH THE CONTRACT exactly (D-R-1) ---------------------------------------
    // A subset would let a prompt quietly under-claim; a superset over-claims. trunk-constraints.md
    // is the contract, so the prompt tracks it or the two have drifted — which is how F1 happened.
    const contract = contractChecks(id);
    if (contract.size) {
      const verifierClaims = claimed.filter((c) => !c.startsWith("advisory_") && !c.startsWith("overconfident_") && !c.startsWith("fabricated_") && !c.startsWith("unsupported_"));
      const missing = [...contract].filter((c) => !verifierClaims.includes(c));
      const extra = verifierClaims.filter((c) => !contract.has(c));
      expect(missing.length === 0, `T${id}: trunk-constraints.md says ${[...contract].join(", ")} fire, but the prompt omits ${missing.join(", ")} — the prompt has drifted from the contract`);
      expect(extra.length === 0, `T${id}: the prompt claims ${extra.join(", ")} but trunk-constraints.md does not list it for this trunk`);
    }
  }

  // ---- 4. The literal constraints must SURVIVE, AS BULLETS, in the CONVENTIONAL block -----------
  // R1 re-labels; it must never LIFT. If "no diagnosis" vanished from the list that is a relaxation
  // wearing an honesty costume.
  //
  // SCOPED TO THE BULLETS ON PURPOSE. The first cut of this check tested the WHOLE FILE for
  // /no diagnosis/i — and the explanatory prose beneath the block contains the phrase ("Treating 'no
  // diagnosis' as someone else's problem…"). So deleting the actual constraint still PASSED: the
  // suite's own wording satisfied its own assertion. A test that cannot see the constraint being
  // lifted is worse than no test, because it certifies the lift. Verified by tampering, not assumed.
  const conv = /CONVENTIONAL[^\n]*\n([\s\S]*?)(?=\n##\s|\n\n[A-Z][a-z]|$)/.exec(src);
  const convBullets = conv ? [...conv[1].matchAll(/^\s*-\s+(.+)$/gm)].map((m) => m[1]) : [];
  const statedSomewhere = (re) => convBullets.some((b) => re.test(b)) || [...(mech ? mech[1].matchAll(/^\s*-\s+(.+)$/gm) : [])].some((m) => re.test(m[1]));
  expect(statedSomewhere(/no diagnosis/i),
    `T${id}: the "no diagnosis" constraint must still be stated AS A BULLET — R1 re-labels it CONVENTIONAL, it never removes it (prose mentioning the phrase does not count)`);
  expect(statedSomewhere(/no dosag/i),
    `T${id}: the "no dosages" constraint must still be stated AS A BULLET`);

  // ---- 5. If it is not mechanical, it must be labelled CONVENTIONAL and say so ------------------
  if (!legacyHeading) {
    expect(/CONVENTIONAL/.test(src),
      `T${id}: constraints nothing enforces must be labelled CONVENTIONAL — an honest gap is one someone can close; a false claim is one nobody asks about`);
  }
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-trunk-claims FAIL (${errors.length})`);
  process.exit(1);
}
console.log(`contract-trunk-claims: OK (${prompts.length} prompts · every MECHANICAL claim names a real bar and matches trunk-constraints.md · every literal constraint survives · unenforced constraints labelled CONVENTIONAL)`);
