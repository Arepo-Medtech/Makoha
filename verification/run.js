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
  };

  if (!existsSync(VERIFICATION_DIR)) mkdirSync(VERIFICATION_DIR, { recursive: true });
  writeFileSync(join(VERIFICATION_DIR, "report.json"), JSON.stringify(report, null, 2));

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
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
