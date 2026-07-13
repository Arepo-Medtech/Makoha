/**
 * retrofit-reference-manifest.mjs — one-shot, gated retrofit of the ONE
 * pre-ingest reference case's manifest (FL-03 / `reference-case-manifest-missing`).
 *
 * SPEC-CARD-04-00001 is the hand-built worked reference case; it predates
 * `cases:ingest`, so it has the 7 node files but no `case_manifest.json`. That
 * absence was a NAMED exemption in `eval:cases`/`verify-case-codes`. This script
 * produces the missing manifest so the exemption can be removed — the case then
 * joins the normal gate path as a manifested-but-UNATTESTED case (excluded from
 * the trusted/attested count, same posture as the factory demo).
 *
 * SCORING-STORE FIREWALL: this script reads each node file ONLY as raw bytes to
 * compute its SHA-256 (exactly as the eval gate hashes on-disk bytes). It NEVER
 * parses, logs, or routes sealed 10_–13_ content into any path. `codes_manifest`
 * is left empty by design (the reference case is excluded from the attested +
 * code-verification sets; re-manifesting its codes would require parsing node 10,
 * which this retrofit deliberately does not do) — recorded with a transform flag.
 *
 * ATTESTATION (fail-safe): the manifest records `clinician_reviewed: false`. The
 * case's own envelope carries `provenance.clinician_reviewed: true` (KL,
 * 2026-06-23); that record is NOTED here but manifest-level attestation for the
 * trusted release set is WITHHELD pending an explicit operator attestation
 * statement — so this retrofit does NOT change the release-gate attested count.
 * To admit it to the trusted set, an operator flips `clinician_reviewed` to true
 * with an attestation statement (a one-line change), the same ceremony every
 * other attested case went through.
 *
 * Idempotent-ish: refuses to overwrite an existing manifest (pass --force to
 * regenerate). Run: node scripts/retrofit-reference-manifest.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CASE_ID = "SPEC-CARD-04-00001";
const CASE_DIR = join(REPO_ROOT, "data/cases", CASE_ID);

const READABLE = ["00_case_envelope.json", "01_presentation_layer.json", "02_conversational_policy.json"];
const SEALED = ["10_ground_truth_node.json", "11_symptom_links_node.json", "12_management_plan_node.json", "13_safety_netting_node.json"];
const ALL = [...READABLE, ...SEALED];

/** SHA-256 over the EXACT on-disk bytes (matches how eval-case-gate hashes). */
const sha256Bytes = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
/** Canonical manifest bytes: JSON 2-space + trailing newline (repo convention). */
const canonical = (obj) => JSON.stringify(obj, null, 2) + "\n";

function main() {
  const force = process.argv.includes("--force");
  const manifestPath = join(CASE_DIR, "case_manifest.json");
  if (existsSync(manifestPath) && !force) {
    console.error(`refusing to overwrite existing ${CASE_ID}/case_manifest.json (pass --force)`);
    process.exit(1);
  }
  for (const f of ALL) {
    if (!existsSync(join(CASE_DIR, f))) {
      console.error(`missing node file ${CASE_ID}/${f} — cannot retrofit`);
      process.exit(1);
    }
  }

  // Bytes-only: hash each node; the readable envelope is parsed for provenance
  // metadata only (00 is AI-Doctor-readable, not sealed — safe to read).
  const files = ALL.map((f) => ({ path: f, sha256: sha256Bytes(join(CASE_DIR, f)) }));
  const env = JSON.parse(readFileSync(join(CASE_DIR, "00_case_envelope.json"), "utf8"));
  const prov = (env.case_metadata && env.case_metadata.provenance) || {};

  const manifest = {
    case_id: CASE_ID,
    case_set_version: "case-set:vNEXT",
    schema_version: "1.0.0",
    protocol_version: "case-transform-protocol:v1.2.0:2026-07-01",
    generator: { model: "hand_built_reference", generated_at_utc: prov.review_date ? `${prov.review_date}T00:00:00Z` : null },
    source: { filename: null, original_case_id: CASE_ID, sha256: null },
    review: {
      // FAIL-SAFE: withheld at the manifest level pending an explicit operator
      // attestation statement — see the envelope-provenance note below. This
      // reference case is therefore EXCLUDED from the attested/trusted count
      // (the release gate is not moved by this retrofit).
      clinician_reviewed: false,
      review_status: "reference_pre_ingest_unattested",
      source_type: "hand_built_reference",
      reviewer_id: null,
      review_date: null,
      envelope_provenance_note: {
        note: "The case envelope records provenance.clinician_reviewed:true — carried here for visibility, NOT treated as a manifest attestation. To admit this reference case to the trusted set, an operator sets clinician_reviewed:true with an attestation statement.",
        envelope_clinician_reviewed: prov.clinician_reviewed === true,
        envelope_reviewer_id: prov.reviewer_id || null,
        envelope_review_date: prov.review_date || null,
      },
    },
    firewall_assertion: {
      ai_doctor_readable: READABLE,
      scoring_store_sealed: SEALED,
    },
    files,
    codes_manifest: [],
    transform_flags: [
      "FL-03 retrofit (2026-07-13): manifest generated for the pre-ingest reference case by scripts/retrofit-reference-manifest.mjs (byte-hash only; sealed 10_-13_ content never parsed/routed).",
      "codes_manifest intentionally EMPTY: the reference case is excluded from the attested + code-verification sets; its codes were not re-manifested (that would require parsing node 10). Not part of the trusted release set.",
    ],
    ingest: {
      ingested_utc: null,
      ingested_by: "fl03-reference-retrofit",
      bundle_sha256: null,
      hashing: "SHA-256 over the exact on-disk bytes of each node file (matches eval-case-gate).",
    },
  };

  writeFileSync(manifestPath, canonical(manifest));
  console.log(`wrote ${CASE_ID}/case_manifest.json (7 files hashed; clinician_reviewed:false — excluded from attested count)`);
}

main();
