/**
 * Contract test for the PharmCheck ingest adapter (FL-30 round-trip).
 *
 * Runs fully OFFLINE. Part A uses a committed fixture dev-package against the LIVE datasets;
 * Part B uses a TEMP dataset dir to prove the integrate-not-overwrite (content-preservation)
 * behaviour deterministically. Asserts the adapter brings externally-authored records back IN
 * only through the fail-closed pipeline, and never destroys existing content:
 *  - schema-valid record accepted + FORCED to review_status:draft/reviewed_by:null;
 *  - schema-invalid record REJECTED with a reason (fail-closed);
 *  - dose_evidence source_ref != citation.identifier rejected by the .refine;
 *  - unknown/non-authorable capability refused (→ structural proposal), not invented;
 *  - structural_proposals surfaced, never auto-applied;
 *  - ingestPackage never writes (planning only);
 *  - a record matching an existing NATURAL KEY with different content is classed an UPDATE,
 *    NOT appended-blindly and NOT written without --accept-updates;
 *  - --write adds net-new but HOLDS updates (existing content untouched);
 *  - --accept-updates ARCHIVES the superseded record into superseded[] (never deletes) and
 *    applies the new one.
 * Run from repo root: node test/contract-pharm-ingest.js
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestPackage, entityKey, naturalKey, writeResults } from "../scripts/pharm-ingest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };

// ---------------------------------------------------------------------------
// Part A — fixture against the live datasets: validation + fail-closed + refuse-unknown.
// ---------------------------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "authoring", "pharm", "fixtures", "dev-package-sample.json"), "utf8"));
const { results, proposals, errors: envErrors } = ingestPackage(pkg);
expect(envErrors.length === 0, `envelope should be clean, got: ${envErrors.join("; ")}`);
const byCap = Object.fromEntries(results.map((r) => [r.capability, r]));

const inter = byCap.interactions;
expect(inter && inter.known, "interactions is authorable");
expect(inter.rejected.length === 1 && /mechanism_category/.test(inter.rejected[0].reason), "interactions: invalid mechanism_category rejected with reason");
// accepted-and-not-a-conflict lands in fresh, forced to draft
const anyFresh = inter.fresh[0] || (inter.conflicts[0] && inter.conflicts[0].incoming);
expect(anyFresh && anyFresh.provenance.review_status === "draft" && anyFresh.provenance.reviewed_by === null, "accepted record FORCED to draft / null reviewer");

const de = byCap.dose_evidence;
expect(de.rejected.length === 1 && /source_ref/.test(de.rejected[0].reason), "dose_evidence: source_ref!=identifier rejected by refine");

const hep = byCap.hepatic_rules;
expect(hep && hep.known === false && hep.accepted === 0, "unknown capability refused as not authorable, writes nothing");
expect(proposals.length === 1 && proposals[0].kind === "new_check", "structural proposal surfaced for engineer review");

// entityKey stability / provenance-independence (dedup is by entity, not provenance)
const probe = { ingredient: "x", indication: "y" };
expect(entityKey(probe) === entityKey({ ...probe }), "entityKey stable for identical entity");
expect(entityKey(probe) === entityKey({ ...probe, provenance: { version: "z" } }), "entityKey ignores provenance");

// ---------------------------------------------------------------------------
// Part B — content preservation on a controlled temp dataset.
// ---------------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "pharm-ingest-"));
// Seed an existing interactions dataset with one record (natural key = pair + mechanism_category).
const existingRec = {
  interaction_kind: "drug_drug", mechanism_category: "qt_prolongation", subject: "citalopram", object: "domperidone",
  severity: "moderate", mechanism_class: "additive QT", management_category: "monitor", evidence_tier: "trial",
  provenance: { source: "seed", source_ref: "seed", authored_by: "seed", reviewed_by: null, review_status: "draft", version: "v0", effective_date: "2026-07-14" },
};
writeFileSync(join(dir, "drug-interactions.json"), JSON.stringify({ capability: "interactions", records: [existingRec] }, null, 2));

// An UPDATE (same pair + mechanism_category, escalated severity) and a genuinely NEW record.
const updatePkg = {
  pharmcheck_dev_package: "v1", authored_in: "test", author_note: "update + new",
  capabilities: { interactions: {
    provenance_defaults: { source: "AMH", source_ref: "amh", authored_by: "chat", version: "v0.1", effective_date: "2026-07-14" },
    records: [
      { interaction_kind: "drug_drug", mechanism_category: "qt_prolongation", subject: "domperidone", object: "citalopram", severity: "critical", mechanism_class: "additive QT prolongation", management_category: "avoid", evidence_tier: "guideline" },
      { interaction_kind: "drug_drug", mechanism_category: "cyp_inhibitor", subject: "fluconazole", object: "warfarin", severity: "critical", mechanism_class: "CYP2C9 inhibition", management_category: "monitor", evidence_tier: "guideline" },
    ],
  } },
};
const r2 = ingestPackage(updatePkg, { dataDir: dir });
const ic = r2.results.find((x) => x.capability === "interactions");
expect(ic.conflicts.length === 1, `update detected as conflict (got ${ic.conflicts.length})`); // domperidone~citalopram matches existing (order-insensitive)
expect(ic.fresh.length === 1, `genuinely-new record classed new (got ${ic.fresh.length})`);
expect(naturalKey("interactions", updatePkg.capabilities.interactions.records[0]) === naturalKey("interactions", existingRec), "natural key is order-insensitive on the drug pair");

// --write WITHOUT --accept-updates: adds the new one, HOLDS the update, existing untouched.
writeResults(r2.results, { acceptUpdates: false, dataDir: dir });
let ds = JSON.parse(readFileSync(join(dir, "drug-interactions.json"), "utf8"));
expect(ds.records.length === 2, `held update: 1 existing + 1 new = 2 (got ${ds.records.length})`);
expect(ds.records.some((x) => x.severity === "moderate" && x.subject === "citalopram"), "original record PRESERVED (not overwritten) when update held");
expect(!ds.superseded, "nothing archived when updates held");

// --accept-updates: archives the old record, applies the update — NEVER deletes.
const r3 = ingestPackage(updatePkg, { dataDir: dir }); // re-plan against current state
writeResults(r3.results, { acceptUpdates: true, dataDir: dir });
ds = JSON.parse(readFileSync(join(dir, "drug-interactions.json"), "utf8"));
expect(Array.isArray(ds.superseded) && ds.superseded.length === 1, `superseded record archived (got ${ds.superseded && ds.superseded.length})`);
expect(ds.superseded[0].record.severity === "moderate", "the ARCHIVED record is the old content (severity moderate) — preserved, not lost");
expect(ds.records.some((x) => x.severity === "critical" && x.mechanism_category === "qt_prolongation"), "the update (critical) is now the live record");
expect(ds.records.every((x) => !(x.severity === "moderate" && x.mechanism_category === "qt_prolongation")), "stale record removed from live set (but retained in superseded[])");

// ---------------------------------------------------------------------------
// Part C — the --supersede-signed guard: an update must NEVER silently archive a SIGNED record.
// ---------------------------------------------------------------------------
const dir2 = mkdtempSync(join(tmpdir(), "pharm-ingest-signed-"));
const signedRec = {
  ingredient: "carbamazepine", effect: "stevens-johnson syndrome", system: "dermatological", severity: "serious", onset: "acute",
  provenance: { source: "seed", source_ref: "seed", authored_by: "KL", reviewed_by: "KL", review_status: "approved", version: "v1", effective_date: "2026-07-14" },
};
writeFileSync(join(dir2, "serious-adverse-effects.json"), JSON.stringify({ capability: "serious_adverse_effects", records: [signedRec] }, null, 2));
const saePkg = {
  pharmcheck_dev_package: "v1", authored_in: "test", author_note: "refine a SIGNED SAE record",
  capabilities: { serious_adverse_effects: {
    provenance_defaults: { source: "chat", source_ref: "chat", authored_by: "chat", version: "v0.1", effective_date: "2026-07-14" },
    records: [{ ingredient: "carbamazepine", effect: "stevens-johnson syndrome", system: "dermatological", severity: "life_threatening", onset: "subacute" }],
  } },
};

// Default (no --supersede-signed): the update is BLOCKED, the signed record stays intact.
const s1 = ingestPackage(saePkg, { dataDir: dir2 });
const w1 = writeResults(s1.results, { acceptUpdates: true, dataDir: dir2 });
expect(Array.isArray(w1.blockedSigned) && w1.blockedSigned.length === 1, `guard blocks superseding a signed record (got ${w1.blockedSigned && w1.blockedSigned.length})`);
let sds = JSON.parse(readFileSync(join(dir2, "serious-adverse-effects.json"), "utf8"));
expect(sds.records.length === 1 && sds.records[0].severity === "serious" && sds.records[0].provenance.review_status === "approved", "signed record left intact (not downgraded to draft)");
expect(!sds.superseded || sds.superseded.length === 0, "signed record NOT archived by default");

// Explicit --supersede-signed: deliberate override archives the signed record (never deletes) and applies.
const s2 = ingestPackage(saePkg, { dataDir: dir2 });
const w2 = writeResults(s2.results, { acceptUpdates: true, supersedeSigned: true, dataDir: dir2 });
expect(w2.blockedSigned.length === 0, "with --supersede-signed nothing is blocked");
sds = JSON.parse(readFileSync(join(dir2, "serious-adverse-effects.json"), "utf8"));
expect(Array.isArray(sds.superseded) && sds.superseded.length === 1 && sds.superseded[0].record.provenance.review_status === "approved", "the archived record is the previously-signed one (preserved)");
expect(sds.records.some((x) => x.severity === "life_threatening"), "the update is applied under explicit override");

if (errors.length) {
  errors.forEach((e) => console.error("FAIL:", e));
  console.error(`contract-pharm-ingest FAIL (${errors.length})`);
  process.exit(1);
}
console.log("contract-pharm-ingest: OK");
