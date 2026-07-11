#!/usr/bin/env node
/**
 * Run the 5-step grounding pipeline and write verification artifacts.
 * Usage: node verification/run.js [path-to-candidate-output.txt]
 *   If no path given, uses stub generation output.
 * Writes: verification/report.json, verification/evidence_tree.md
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runPipeline } from "./pipeline.js";
import { validateReport } from "./report-schema.js";
import { recordRun } from "./audit-store.js";
import { appendPppTttEntry, ledgerCoreFromRecord } from "./ppp-ttt/ledger.js";
import { recordRunMetrics } from "./metrics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFICATION_DIR = join(__dirname);

async function main() {
  const candidatePath = process.argv[2];
  let candidate_output;
  if (candidatePath) {
    try {
      candidate_output = readFileSync(candidatePath, "utf8");
    } catch (e) {
      console.error("Failed to read candidate output file:", e.message);
      process.exit(1);
    }
  }

  const result = await runPipeline({ candidate_output });

  const report = {
    run_id: result.run_id,
    timestamp_utc: result.timestamp_utc,
    pass: result.verification.pass,
    results: result.verification.results,
    missing_receipts: result.verification.missing_receipts,
    // Medicolegal anchor — required field; computed in verify().
    candidate_output_hash: result.verification.candidate_output_hash,
    mock_receipt_flags: result.verification.mock_receipt_flags,
  };

  // Gate the audit record on its contract before persisting: a defective
  // VerificationReport must never be written (throws on failure).
  validateReport(report);

  if (!existsSync(VERIFICATION_DIR)) mkdirSync(VERIFICATION_DIR, { recursive: true });
  writeFileSync(join(VERIFICATION_DIR, "report.json"), JSON.stringify(report, null, 2));

  // Append the run to the append-only medicolegal ledger (and, for synthetic
  // data, the content store). This is the durable, tamper-evident audit trail.
  recordRun(result);
  // PPP-TTT parallel trail (LIVE_PLAN L1 wiring): a graded run's PHI-free
  // triage record is appended alongside, cross-linked by run_id + hash.
  if (result.abcde_record) appendPppTttEntry(ledgerCoreFromRecord(result.abcde_record));
  // Charter metrics (LIVE_PLAN L2): counters + alarm seam — observability
  // only, never a gate change.
  recordRunMetrics(result);

  const evidenceTree = buildEvidenceTreeMd(result);
  writeFileSync(join(VERIFICATION_DIR, "evidence_tree.md"), evidenceTree);

  console.log("Verification run:", result.run_id);
  console.log("Pass:", report.pass);
  console.log("Wrote verification/report.json and verification/evidence_tree.md");
  process.exit(report.pass ? 0 : 1);
}

function buildEvidenceTreeMd(result) {
  const lines = [
    "# Evidence tree",
    "",
    `**Run ID:** ${result.run_id}`,
    `**Timestamp:** ${result.timestamp_utc}`,
    "",
    "## Claims → proofs",
    "",
  ];
  for (const node of result.packet.evidence || []) {
    lines.push(`- **${node.claim}**`);
    for (const s of node.supports || []) {
      lines.push(`  - ${s.kind}: \`${s.ref}\``);
    }
    lines.push("");
  }
  lines.push("## Verification result");
  lines.push("");
  lines.push(result.verification.pass ? "**PASS**" : "**FAIL**");
  lines.push("");
  for (const r of result.verification.results) {
    lines.push(`- ${r.check}: ${r.passed ? "pass" : "fail"}${r.reason ? ` — ${r.reason}` : ""}`);
  }
  if (result.verification.missing_receipts?.length) {
    lines.push("");
    lines.push("### Missing receipts");
    result.verification.missing_receipts.forEach((m) => lines.push(`- ${m}`));
  }
  // Audit-channel omnibus enrichment (present only on case-driven runs):
  // fact provenance + consult tags live on the result, never in the packet —
  // rendered here so the step-5 audit artifact carries them.
  if (result.fact_provenance) {
    lines.push("");
    lines.push("## Case fact provenance (Digital Tablet omnibus)");
    lines.push("");
    lines.push(`Dataset: \`${result.fact_provenance.dataset_receipt.ref}\` (sha256 \`${result.fact_provenance.dataset_receipt.sha256.slice(0, 12)}…\`)`);
    lines.push("");
    for (const node of result.fact_provenance.evidence || []) {
      lines.push(`- **${node.claim}**`);
      if (node.taxonomy_tags?.length) {
        node.taxonomy_tags.forEach((t) => lines.push(`  - tag: ${t.group}.${t.tag}${t.matched ? ` (“${t.matched}”)` : ""}`));
      }
    }
    for (const w of result.fact_provenance.tag_withheld || []) {
      lines.push(`- ${w.fact_id}: taxonomy tagging withheld — ${w.tier}`);
    }
  }
  // Clinician-facing encounter history summary (HIST-3) — rendered into the
  // step-5 audit artifact; the portal reviewer's standardised history view.
  if (result.history_summary) {
    const hs = result.history_summary;
    lines.push("");
    lines.push("## Encounter history summary (patient-reported, unverified)");
    lines.push("");
    lines.push(`> ${hs.disclaimer}`);
    lines.push("");
    lines.push(`Summary hash: \`${hs.summary_sha256.slice(0, 16)}…\` · omnibus: \`${hs.dataset_receipt.ref}\``);
    for (const [section, entries] of Object.entries(hs.sections)) {
      if (!entries.length) continue;
      lines.push("");
      lines.push(`### ${section.replace(/_/g, " ")}`);
      for (const e of entries) {
        lines.push(`- “${e.as_stated}” — ${e.provenance}, unverified${e.au_core ? ` (AU Core structural: ${e.au_core.status})` : ""}`);
      }
    }
  }
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
