/**
 * Contract test — FLUENCY IS NOT CONFIDENCE (M4).
 *
 * OPERATOR, 2026-07-15: *"Separate fluency from confidence. Never present model output in a register
 * that implies calibrated certainty. Surface source-grounding, and treat any claim the model cannot
 * anchor to a retrievable reference as a hypothesis, not a finding."*
 *
 * And the reason it is not optional: *"The model has no calibrated internal uncertainty signal it can
 * surface honestly; fluency and correctness are decoupled. A hesitant human clinician telegraphs doubt
 * ('I'm not sure, but…'). An LLM will state a fabricated drug interaction or a non-existent guideline
 * threshold in the same register it uses for well-established fact."*
 *
 * SO THE REGISTER CANNOT COME FROM THE PROSE. It has to come from the GROUNDING:
 *   supports.length > 0  → receipt-backed
 *   supports.length === 0 → HYPOTHESIS, anchored to nothing
 * `supports: []` is representable — the schema sets no `minItems` — so the unanchored claim is a real
 * case, not a hypothetical one, and it is precisely the one that reads like a finding if unmarked.
 *
 * WHY THIS SUITE EXISTS — R-47's failure mode, found again in code already touched. `evidence_claims`
 * has always been in the bundle schema, populated by `buildReviewBundle`, and hashed into
 * `bundle_sha256`. **It was rendered ZERO times.** Every claim a trunk made was recorded and never
 * displayed — "satisfies every schema and every test, READS as done because the data is right there in
 * the record, and quietly defeats Guardrail 2". E3 built `renderDoseEvidence` and never noticed the
 * claims sitting beside it.
 *
 * Run from repo root: node test/contract-evidence-register.js
 */
import { buildReviewBundle } from "../portal/review-bundle.js";
import { renderBundle, assertEvidenceClaimsRendered } from "../portal/server.js";
import { runPipeline } from "../verification/pipeline.js";

const errors = [];
const expect = (c, m) => { if (!c) errors.push(m); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const IDENTITY = { verified: true, clinician_id: "KL", ahpra_registration: "MED0001857758", idp: "test" };
const base = async (claims) => {
  const r = await runPipeline({ trunk: "5.0" });
  const b = buildReviewBundle(r);
  return { ...b, evidence_claims: claims ?? b.evidence_claims };
};

// ---- 1. The REAL pipeline's claims reach the clinician's page -----------------------------------
// They were carried in the hashed bundle and displayed nowhere. This is the fix, asserted.
{
  const b = await base();
  expect(b.evidence_claims.length > 0, "fixture: the real pipeline must produce claims");
  const html = renderBundle(b, IDENTITY);
  for (const c of b.evidence_claims) {
    expect(html.includes(c.claim), `the claim "${c.claim}" is in the hashed bundle but NOT on the page — a claim the clinician cannot see is a claim they cannot weigh`);
  }
  expect(/Fluency is not confidence/.test(html), "the surface must say what the register means and why the prose cannot carry it");
}

// ---- 2. THE CASE THAT MATTERS: an unanchored claim must be MARKED, not merely shown -------------
// An unanchored claim rendered without its register is WORSE than not rendering it — it then reads as
// a finding, in exactly the voice the model uses for well-established fact.
{
  const b = await base([
    { claim: "Serum tryptase confirms anaphylaxis", supports: [] },                                  // anchored to NOTHING
    { claim: "Guideline citation", supports: [{ kind: "static_doc", ref: "cw-au:imaging-lbp:2024-01" }] },
  ]);
  const html = renderBundle(b, IDENTITY);
  expect(html.includes("Serum tryptase confirms anaphylaxis"), "the unanchored claim must be displayed");
  expect(/HYPOTHESIS — anchored to nothing/.test(html),
    "an UNANCHORED claim must be visibly marked as a hypothesis — unmarked, it reads exactly like a finding, which is the whole failure this bar exists to prevent");
  expect(/receipt-backed/.test(html), "an anchored claim must be marked as receipt-backed — the distinction is the point");
  expect(/1 anchored to nothing/.test(html), "the count of unanchored claims must be surfaced in the heading, not buried in a row");
}

// ---- 3. The bar THROWS on a surface that drops a claim ------------------------------------------
{
  const b = await base([{ claim: "A claim nobody rendered", supports: [] }]);
  expect(throws(() => assertEvidenceClaimsRendered("<html>everything except that claim</html>", b)),
    "a surface that carries a claim in its bundle but drops it from the page must THROW — that is the R-47 recorded-but-not-displayed failure");
}

// ---- 4. …and on a surface that shows an unanchored claim WITHOUT its register -------------------
// The subtler failure, and the more dangerous one: the claim IS displayed, so a naive "is it rendered?"
// check passes — while the clinician reads a hypothesis as a finding.
{
  const b = await base([{ claim: "Serum tryptase confirms anaphylaxis", supports: [] }]);
  const naked = "<html>Serum tryptase confirms anaphylaxis</html>"; // displayed, but unmarked
  expect(throws(() => assertEvidenceClaimsRendered(naked, b)),
    "an unanchored claim displayed WITHOUT its register must THROW — rendering it is not enough; unmarked it reads as a finding");
  // The real surface passes.
  expect(!throws(() => assertEvidenceClaimsRendered(renderBundle(b, IDENTITY), b)), "the real rendered surface must pass its own bar");
}

// ---- 5. The register is derived from GROUNDING, never from wording ------------------------------
// Two claims worded identically — one anchored, one not — must land in different registers. If the
// wording could move the register, the model's fluency would be steering it, which is the bug.
{
  const same = "Amoxicillin is contraindicated in penicillin allergy";
  const anchored = await base([{ claim: same, supports: [{ kind: "static_doc", ref: "ref-1" }] }]);
  const orphan = await base([{ claim: same, supports: [] }]);
  const hA = renderBundle(anchored, IDENTITY);
  const hO = renderBundle(orphan, IDENTITY);
  expect(!/HYPOTHESIS — anchored to nothing/.test(hA), "identical wording WITH support must not be marked a hypothesis");
  expect(/HYPOTHESIS — anchored to nothing/.test(hO), "identical wording WITHOUT support must be marked a hypothesis — the register comes from grounding, not from how it is written");
}

// ---- 6. The claims ride INSIDE the hash — the register is part of the record --------------------
{
  const b = await base();
  const { verifyReviewBundle } = await import("../portal/review-bundle.js");
  expect(verifyReviewBundle(b), "the bundle must verify");
  const stripped = { ...b, evidence_claims: [] };
  expect(!verifyReviewBundle(stripped),
    "removing the claims must BREAK bundle_sha256 — what the clinician was shown, and in which register, is part of the medicolegal record");
}

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-evidence-register FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-evidence-register: OK (M4 — claims reach the page · an UNANCHORED claim is marked HYPOTHESIS, not merely shown · the register comes from GROUNDING not wording · dropping a claim or its register THROWS · the claims ride inside bundle_sha256)");
