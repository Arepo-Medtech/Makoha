/**
 * Contract test for MI-20 — jurisdiction guard (execution plan §8 E6).
 *
 * Asserts: US-regulatory sources (openFDA) are tagged US_context and barred from
 * an AU patient path (downgraded to unknown); AU guidance is AU_endorsed; global
 * literature is non_AU and NOT barred (its receipt-eligibility is the ranker's job);
 * no US source is ever AU_endorsed; unknown sources fail safe to non_AU.
 * Run from repo root: node test/contract-jurisdiction.js
 */
import { tagJurisdiction, stampJurisdiction, enforceAuJurisdiction, JURISDICTION_BY_SOURCE } from "../config/jurisdiction.js";
import { JURISDICTION_TAGS } from "../verification/pipeline-schemas.js";

const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

// Tagging table.
expect(tagJurisdiction("openfda") === "US_context", "openfda must be US_context");
expect(tagJurisdiction("guideline") === "AU_endorsed", "guideline must be AU_endorsed");
for (const s of ["pubmed", "clinicaltrials_gov", "open_targets", "chembl", "biorxiv_medrxiv"]) {
  expect(tagJurisdiction(s) === "non_AU", `${s} must be non_AU`);
}
expect(tagJurisdiction("some_unknown_src") === "non_AU", "unknown source must fail safe to non_AU");

// Every tag is a legal receipt vocabulary value; invariant: no US source AU_endorsed.
for (const [src, tag] of Object.entries(JURISDICTION_BY_SOURCE)) {
  expect(JURISDICTION_TAGS.includes(tag), `${src}: tag '${tag}' not a legal jurisdiction_tag`);
}
expect(JURISDICTION_BY_SOURCE.openfda !== "AU_endorsed", "US source must never be AU_endorsed");

// E6 STOP on the AU patient path.
const fda = enforceAuJurisdiction({ source: "openfda", claim: "US label text" }, { patient_path: true });
expect(fda.admitted === false && fda.result === "unknown" && /US_context/.test(fda.reason), "openfda on AU patient path must be barred → unknown (E6)");

// Global literature passes the jurisdiction gate (ranker decides receipt-eligibility).
const pm = enforceAuJurisdiction({ source: "pubmed", claim: "trial finding" }, { patient_path: true });
expect(pm.admitted === true && pm.jurisdiction_tag === "non_AU", "pubmed must pass the jurisdiction gate as non_AU");

// AU guidance admitted.
const gl = enforceAuJurisdiction({ source: "guideline", claim: "AU guideline" }, { patient_path: true });
expect(gl.admitted === true && gl.jurisdiction_tag === "AU_endorsed", "AU guideline must be admitted AU_endorsed");

// Off the patient path, US_context is not barred (research/context use).
const research = enforceAuJurisdiction({ source: "openfda" }, { patient_path: false });
expect(research.admitted === true, "off patient path, US_context is not barred");

// stampJurisdiction stamps and requires a source.
expect(stampJurisdiction({ source: "openfda" }).jurisdiction_tag === "US_context", "stampJurisdiction must set the tag");
let threw = false;
try { stampJurisdiction({ claim: "no source" }); } catch { threw = true; }
expect(threw, "stampJurisdiction must throw without a string source");

if (errors.length) { errors.forEach((e) => console.error("FAIL:", e)); console.error(`MI-20 jurisdiction FAIL (${errors.length})`); process.exit(1); }
console.log("MI-20 jurisdiction PASS");
process.exit(0);
