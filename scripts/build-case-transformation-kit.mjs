#!/usr/bin/env node
/**
 * build-case-transformation-kit.mjs
 *
 * Assembles a SINGLE self-contained "kit" file that bundles everything a
 * Claude Chat / Claude Cowork session needs to run the case transformation:
 *   - the protocol (case-transformation-protocol.md)
 *   - the FHIR field vocabulary (digital_tablet_omnibus.json)
 *   - the 7 node schemas (data/schemas/*.schema.json)
 *   - the worked reference case (data/cases/SPEC-CARD-04-00001/)
 *   - a ready-to-paste runner prompt (Cowork sequential-ledger mode)
 *
 * Output: docs/case-authoring/breath-ezy-case-transformation-kit.json
 *
 * The kit is a DERIVED artifact — the repo files are the source of truth.
 * Re-run this after any change to the protocol, schemas, omnibus, or reference
 * case so the kit never goes stale. Each embedded source carries its own
 * sha256 in `_kit.contents` so a consumer can tell exactly which versions were
 * bundled (consistent with the repo's hashing discipline).
 *
 * Run:  node scripts/build-case-transformation-kit.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// --- sources (single source of truth = the repo) --------------------------
const PROTOCOL_PATH = "docs/case-authoring/case-transformation-protocol.md";
const OMNIBUS_PATH = "data/digital_tablet_omnibus.json";
const SCHEMA_DIR = "data/schemas";
const SCHEMA_FILES = [
  "00_case_envelope.schema.json",
  "01_presentation_layer.schema.json",
  "02_conversational_policy.schema.json",
  "10_ground_truth_node.schema.json",
  "11_symptom_links_node.schema.json",
  "12_management_plan_node.schema.json",
  "13_safety_netting_node.schema.json",
];
const REF_CASE_DIR = "data/cases/SPEC-CARD-04-00001";

const contents = [];
const readText = (rel) => {
  const raw = readFileSync(join(ROOT, rel));
  contents.push({ path: rel, bytes: raw.length, sha256: sha256(raw) });
  return raw.toString("utf8");
};
const readJson = (rel) => JSON.parse(readText(rel));

// protocol version (parse from the .md header line)
const protocolMd = readText(PROTOCOL_PATH);
const pvMatch = protocolMd.match(/case-transform-protocol:v[0-9.]+:[0-9-]+/);
const protocolVersion = pvMatch ? pvMatch[0] : "unknown";

// omnibus
const omnibus = readJson(OMNIBUS_PATH);

// 7 node schemas
const nodeSchemas = {};
for (const f of SCHEMA_FILES) nodeSchemas[f] = readJson(join(SCHEMA_DIR, f));

// reference case (7 node files, sorted)
const referenceCase = {};
for (const f of readdirSync(join(ROOT, REF_CASE_DIR)).filter((n) => n.endsWith(".json")).sort()) {
  referenceCase[f] = readJson(join(REF_CASE_DIR, f));
}

// --- runner prompt (Cowork sequential-ledger mode, reads from THIS kit) ----
const runnerPrompt = [
  "Work only inside this approved folder. This single kit file",
  "(breath-ezy-case-transformation-kit.json) contains everything you need — do NOT",
  "look for separate attachments:",
  "  - _kit.runner_prompt (this text) and _kit.how_to_use",
  "  - protocol_markdown         = the full case-transformation-protocol.md (FOLLOW IT)",
  "  - digital_tablet_omnibus    = the FHIR field vocabulary",
  "  - node_schemas              = the 7 authoritative node schemas (validate against these)",
  "  - reference_case            = the worked gold-standard case (match its shapes)",
  "",
  "BATCHING (large intakes — do this before touching any file):",
  "  - A Claude Chat / Cowork session is ONE conversation thread. It cannot fork itself",
  "    into concurrent parallel agents just because this file asks it to — that would be",
  "    a Cowork product feature, not a prompt instruction, and none is assumed here.",
  "    Batching below is a SEQUENTIAL checkpoint scheme, not parallel execution: it exists",
  "    so a long multi-batch run never stops to ask permission and never loses its place,",
  "    which is the practical speed lever actually available on this surface.",
  "  - On a fresh start (no `_transform_progress.json` yet), list every `*.txt` in this",
  "    folder (ignore the kit, `_transform_progress.json`, and any `*.casebundle.json`),",
  "    in filename order, and split them into batches of 12-13 files each (e.g. ~50 files",
  "    -> 4 batches of ~13,13,12,12; adjust the last batch to absorb any remainder).",
  "    Record each file's `batch` number on its ledger entry so batch membership survives",
  "    a resume.",
  "  - Batching does NOT change how a file is processed: still exactly one file at a time,",
  "    fully validated before it is written (see PROCESS below). It only changes when you",
  "    report progress and confirms you never idle waiting for a go-ahead.",
  "  - Move through ALL batches, in order, WITHOUT stopping to ask permission between",
  "    files or between batches. When the last pending file in a batch is resolved (done",
  "    or needs_attention), print one batch-summary line (e.g. \"Batch 2/4 complete: 13",
  "    done, 0 needs_attention\") and immediately continue into the next batch's first",
  "    pending file.",
  "  - A bad file inside a batch is NOT a reason to stop the run: mark it",
  "    \"needs_attention\" with the blocking reason in notes and keep going with the rest",
  "    of that batch and every batch after it. Only stop early if the run itself cannot",
  "    continue (e.g. the folder is missing or unreadable) — never for a single file.",
  "",
  "PROGRESS LEDGER (your memory — persist to disk, never keep it only in your head):",
  "  - Use a file `_transform_progress.json` in this folder as the source of truth for",
  "    what's done. On start: if it exists, load it and RESUME from the first \"pending\"",
  "    entry (lowest batch number first); otherwise create it as described in BATCHING",
  "    above.",
  "  - Entry shape: { input, batch, status: pending|in_progress|done|needs_attention,",
  "    case_id, output, schema_valid, transform_flags, notes, processed_utc }.",
  "  - Also track at the top of the ledger: { total_files, batch_size, batch_count,",
  "    batches_completed } so a resumed session can report \"picking up at batch 3/4\"",
  "    without re-deriving it from the entries.",
  "",
  "PROCESS STRICTLY ONE FILE AT A TIME, in order:",
  "  1. Pick the FIRST entry whose status is \"pending\" (lowest batch number first, then",
  "     filename order within the batch). If none remain, go to DONE.",
  "  2. Set it \"in_progress\" and SAVE the ledger.",
  "  3. Read that one .txt and transform it into a single <CASE_ID>.casebundle.json per",
  "     protocol_markdown §7.9, obeying §7.0 conformance and §9.1 case-ID rules (assign the",
  "     canonical SPEC-{SPECIALTY}-{DD}-{SEQ}; record the source ID in",
  "     case_manifest.source.original_case_id).",
  "  4. Validate EVERY sub-object (00–13) against its schema in node_schemas BEFORE writing.",
  "     - all valid  -> write <CASE_ID>.casebundle.json; set status \"done\" and fill",
  "       case_id/output/schema_valid:true/transform_flags/processed_utc.",
  "     - cannot be made valid -> do NOT write a broken bundle; set \"needs_attention\",",
  "       put the blocking reason in notes, continue.",
  "  5. SAVE `_transform_progress.json` after EVERY file (so an interruption never loses",
  "     place — this matters MORE across a multi-batch run, not less).",
  "  6. Print a one-line result and AUTOMATICALLY continue to the next pending file,",
  "     across a batch boundary too (see BATCHING). Never pause for confirmation before",
  "     continuing; the only reasons to stop mid-run are: every file is resolved (go to",
  "     DONE), or the run itself cannot continue (folder missing/unreadable) — never a",
  "     single bad file.",
  "",
  "Rules: never reprocess a \"done\" file; never overwrite an existing",
  "<CASE_ID>.casebundle.json (mark \"needs_attention\" on a possible case_id collision);",
  "leave all sha256 fields null and all codes unverified unless you actually compute hashes",
  "by running real code — never fabricate a digest.",
  "",
  "DONE: print a summary table of every input -> batch -> case_id -> status ->",
  "schema_valid -> transform_flags, grouped by batch, and call out every",
  "\"needs_attention\" row for me to resolve.",
].join("\n");

// --- assemble -------------------------------------------------------------
const kit = {
  _kit: {
    name: "breath-ezy-case-transformation-kit",
    kit_version: "1.1.0",
    protocol_version: protocolVersion,
    generated_utc: new Date().toISOString(),
    description:
      "Single self-contained package to run the Breath-Ezy SOAP->case-set transformation in " +
      "Claude Chat or Claude Cowork. Attach ONLY this file. Everything the protocol tells you " +
      "to attach separately (omnibus, 7 node schemas, reference case) is embedded below.",
    how_to_use: [
      "1. Attach ONLY this file to a Claude Chat or Cowork session.",
      "2. Say: 'Load the Breath-Ezy case transformation kit. Read _kit.runner_prompt and " +
        "protocol_markdown, confirm you have node_schemas (7) and reference_case, then process " +
        "my SOAP .txt files.'",
      "3. (Cowork) put your SOAP .txt files in the same approved folder as this kit and let it " +
        "run the ledger loop in _kit.runner_prompt — for a large intake (~50 files) it will " +
        "split them into batches of 12-13 and run straight through all of them without " +
        "stopping to ask permission (see BATCHING in the runner prompt; this is sequential " +
        "checkpointing, not literal parallel agents — Cowork runs one conversation thread). " +
        "(Chat) paste/upload one .txt at a time and ask for one <CASE_ID>.casebundle.json " +
        "per response.",
      "4. Output per case: one <CASE_ID>.casebundle.json (protocol §7.9). Run it through the " +
        "repo's ingestion (hashes + zod + firewall + terminology), THEN a clinician reviews it " +
        "before it counts toward the eval.",
    ],
    authoritative_contract:
      "node_schemas are the contract; protocol_markdown is guidance. If they ever disagree, the " +
      "schema wins (protocol §7.0).",
    contents,
    runner_prompt: runnerPrompt,
  },
  protocol_markdown: protocolMd,
  digital_tablet_omnibus: omnibus,
  node_schemas: nodeSchemas,
  reference_case: referenceCase,
};

const OUT = "docs/case-authoring/breath-ezy-case-transformation-kit.json";
writeFileSync(join(ROOT, OUT), JSON.stringify(kit, null, 2) + "\n");

const outBytes = readFileSync(join(ROOT, OUT)).length;
console.log(`Built ${OUT}`);
console.log(`  kit_version:      ${kit._kit.kit_version}`);
console.log(`  protocol_version: ${protocolVersion}`);
console.log(`  embedded sources: ${contents.length} (protocol + omnibus + ${SCHEMA_FILES.length} schemas + ${Object.keys(referenceCase).length} reference files)`);
console.log(`  output size:      ${(outBytes / 1024).toFixed(0)} KB`);
