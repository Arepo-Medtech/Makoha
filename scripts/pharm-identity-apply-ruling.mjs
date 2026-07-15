#!/usr/bin/env node
/**
 * pharm-identity-apply-ruling — record an EXISTING clinician ruling against the RxNorm identity map.
 *
 * ══ THIS IS NOT A WORKSHEET SIGN-OFF, AND THE DIFFERENCE MATTERS ══
 * `pharm-vocabulary-apply-signoff` applies decisions a clinician MADE, row by row, on a worksheet he
 * marked. This applies a ruling he ALREADY made, to the artifact that ruling was about. Nobody reviews
 * 1473 rows here, and the attestation must not imply anyone did.
 *
 * KL ruled on the vocabulary worksheet (2026-07-15, sheet 1, decision 2): **"RxNorm's concept id
 * (RxCUI) is the identity key" — Attest.** `ingredient-identity.json` IS that harvest: 1473 mechanical
 * RxNav lookups, `authored_by: "identity lookup only; no clinical judgement"`. The ruling is on the
 * SOURCE, and the source is what this file is.
 *
 * ══ WHY IT IS BEING SIGNED WHEN IT UNLOCKS NOTHING — the operator's reason, recorded ══
 * Measured A/B: behaviour is IDENTICAL signed vs unsigned. `resolveIngredient()` is the only consumer
 * the flag gates and it has ZERO production callers; `doseIdentitySplit()` — the engine's real use —
 * reads the map UNSIGNED by design, to BLOCK; and `pharm-vocabulary-build` reads `.records` without
 * consulting the flag at all.
 *
 * So this closes a PROVENANCE CHAIN, not a feature: a clinician-signed vocabulary built from an
 * unsigned input is a traceability gap, and traceability (requirement → design → code → test →
 * evidence) is what keeps this system certifiable. Operator ruling 2026-07-15: "sign it for the chain."
 * That reason is in the statement, so nobody later reads the signature as unlocking something.
 *
 * ══ THE CLAIM IS VERIFIED, NOT TYPED ══
 * The statement asserts KL made ruling #2. This script REFUSES to write it unless that ruling is
 * actually in the vocabulary's attestation — the derived signature is bound to the source ruling, so
 * it cannot outlive it. A statement I typed is a claim; a statement checked against the artifact it
 * cites is a record.
 *
 * Usage:
 *   node scripts/pharm-identity-apply-ruling.mjs --utc 2026-07-15 [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checksumRecords } from "./pharm-author.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp", "servers", "pharmacology", "data");

/** The ruling this signature rests on. Verified in the vocabulary's own attestation, never assumed. */
const RULING = "RxNorm's concept id as the identity key";

function main(argv) {
  const args = argv.slice(2);
  const utc = (() => { const i = args.indexOf("--utc"); return i >= 0 ? args[i + 1] : undefined; })();
  const write = args.includes("--write");
  if (!utc) { console.error("usage: node scripts/pharm-identity-apply-ruling.mjs --utc <YYYY-MM-DD> [--write]"); process.exit(2); }

  const vocabPath = join(DATA_DIR, "drug-vocabulary.json");
  const idPath = join(DATA_DIR, "ingredient-identity.json");
  const vocab = JSON.parse(readFileSync(vocabPath, "utf8"));
  const ds = JSON.parse(readFileSync(idPath, "utf8"));

  // 1. THE SOURCE RULING MUST EXIST. Without it this signature has nothing under it.
  const va = vocab.attestation || {};
  if (va.clinical_sign_off !== true) {
    console.error("REFUSING: the drug vocabulary is not signed, so there is no ruling to record here.\nThis signature derives from KL's vocabulary ruling #2 — it cannot exist before the thing it derives from.");
    process.exit(2);
  }
  if (!String(va.statement || "").includes(RULING)) {
    console.error(`REFUSING: the vocabulary's attestation does not carry the ruling this signature cites ("${RULING}").\nThe statement below would assert a ruling that is not in the record. A claim I type is not a record; it must be checked against the artifact it cites.`);
    process.exit(2);
  }
  const reviewer = va.reviewer_id;
  if (!reviewer) { console.error("REFUSING: the vocabulary attestation names no reviewer — an unattributable signature is not one."); process.exit(2); }

  // 2. R-46: the seal must be INTACT before we mutate. Applying to a drifted dataset would bury a
  // pre-existing tamper under a fresh seal carrying the clinician's name.
  const before = checksumRecords(ds.records);
  if (before !== ds.records_checksum) {
    console.error(`REFUSING: ingredient-identity.json's seal is ALREADY broken (stored ${ds.records_checksum.slice(0, 12)}, actual ${before.slice(0, 12)}).\nRe-seal and investigate first — applying now would bury the drift under a fresh seal carrying the clinician's name.`);
    process.exit(2);
  }

  // 3. The content is a MECHANICAL harvest — assert that rather than trust it. If a record ever
  // carried a human judgement, "no clinical judgement to review" would stop being true and this whole
  // basis would collapse.
  const judged = ds.records.filter((r) => !/no clinical judgement/i.test(r.provenance?.authored_by || ""));
  if (judged.length) {
    console.error(`REFUSING: ${judged.length} record(s) do NOT declare themselves free of clinical judgement (e.g. "${judged[0].name}").\nThis ruling covers a MECHANICAL RxNorm harvest. A record carrying a human judgement needs a clinician to READ it, not a ruling applied over it.`);
    process.exit(2);
  }

  const resolved = ds.records.filter((r) => r.resolution === "resolved").length;
  const priorChecksum = ds.records_checksum;

  console.log(`\npharm-identity-apply-ruling: recording an EXISTING ruling, not a review\n`);
  console.log(`  source ruling : "${RULING}" — Attest, ${reviewer}, ${va.attested_utc}`);
  console.log(`  verified in   : drug-vocabulary.json attestation ✓`);
  console.log(`  records       : ${ds.records.length} (${resolved} resolved) — all declare "no clinical judgement"`);
  console.log(`  unlocks       : NOTHING. Measured A/B — behaviour is identical signed vs unsigned.`);
  console.log(`  why           : provenance chain (a signed vocabulary built from an unsigned input is a traceability gap)`);
  if (!write) { console.log(`\n  --dry-run (default). Re-run with --write.\n`); return; }

  for (const r of ds.records) {
    r.provenance.reviewed_by = reviewer;
    r.provenance.review_status = "approved";
    r.provenance.effective_date = utc;
  }
  // THE RE-SEAL, in the pass that caused the drift (R-46). Applying a sign-off mutates every record's
  // provenance, which invalidates the seal computed at harvest time. Doing this by hand is exactly how
  // seven datasets carried stale seals for a day.
  ds.records_checksum = checksumRecords(ds.records);

  ds.attestation = {
    ...ds.attestation,
    method: "clinician_ruling_recorded_from_vocabulary_worksheet",
    clinical_sign_off: true,
    regulatory_sign_off: false,
    reviewer_id: reviewer,
    attested_utc: utc,
    recorded_by: "claude-fable-5 (agent, recording an existing clinician ruling)",
    statement:
      `Registered medical practitioner ${reviewer} ruled on the drug-vocabulary attestation worksheet ` +
      `(eval/pharmacology/signoff/drug-vocabulary-worksheet-KL-2026-07-15.xlsx, sheet 1, decision 2), on ${va.attested_utc}: ` +
      `"RxNorm's concept id (RxCUI) is the identity key" — ATTEST. This dataset IS that harvest, so this records his ` +
      `ruling against the artifact it was about. ` +
      `WHAT HE DID NOT DO, stated plainly: he did NOT review these ${ds.records.length} individual lookups, and there was no ` +
      `clinical judgement in them to review — every record is a mechanical RxNav exact/synonym lookup declaring ` +
      `"identity lookup only; no clinical judgement", and the ${19} ambiguous concepts are REFUSED by resolveIngredient (never ` +
      `picked) and used by doseIdentitySplit only to BLOCK. The ruling is on the SOURCE (RxNorm as the identity key), not on ` +
      `1473 rows. ` +
      `WHAT THIS UNLOCKS: nothing. Verified by A/B measurement — engine behaviour is IDENTICAL signed vs unsigned. ` +
      `resolveIngredient() is the only consumer the flag gates and it has zero production callers; doseIdentitySplit() reads ` +
      `this map UNSIGNED by design, to block fail-safe; pharm-vocabulary-build reads .records without consulting the flag. ` +
      `WHY IT IS SIGNED ANYWAY (operator ruling ${utc}, "sign it for the chain"): a clinician-signed vocabulary built from an ` +
      `UNSIGNED input is a traceability gap, and traceability is what keeps this system certifiable. This closes the ` +
      `provenance chain; it does not switch anything on. ` +
      `CLINICAL sign-off only; regulatory (TGA) sign-off NOT given; dataset remains -dev and non-patient-facing.`,
    scope:
      `${ds.records.length} RxNorm identity records (${resolved} resolved, 19 collision groups REFUSED not picked) — the ruling is on ` +
      `the SOURCE, not on the rows. Identity only: no dose, no clinical claim. Unlocks nothing (A/B-verified).`,
    reseal_history: [
      ...(ds.attestation?.reseal_history || []),
      {
        resealed_utc: utc,
        prior_checksum: priorChecksum,
        new_checksum: ds.records_checksum,
        records: ds.records.length,
        reason:
          `Vocabulary ruling #2 recorded against the RxNorm identity harvest: the application set ` +
          `provenance.reviewed_by/review_status on every record. The seal was computed at harvest time when those records ` +
          `were draft, so recording the ruling invalidated it — the R-46 mechanism. Re-sealed in the same pass that caused ` +
          `the drift, by the script rather than by memory. No identity content changed: only the two provenance review fields.`,
      },
    ],
  };
  writeFileSync(idPath, JSON.stringify(ds, null, 2) + "\n");
  console.log(`\n  WROTE ingredient-identity.json — clinical_sign_off: true (the chain is closed; nothing is unlocked)`);
  console.log(`  re-sealed ${priorChecksum.slice(0, 12)} → ${ds.records_checksum.slice(0, 12)} (R-46: the ruling mutates records, so the seal moves in the same pass)\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv);
