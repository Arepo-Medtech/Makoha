#!/usr/bin/env node
/**
 * cases:verify-codes — batch-verify every case's candidate codes against the
 * terminology MCP server and write per-code receipts into each case_manifest
 * (ARCH_PLAN M6; gap `case-set` / R-23; receipt discipline: no receipt, no claim).
 *
 * For each data/cases/<CASE_ID>/case_manifest.json codes_manifest entry still
 * `unverified_pending_terminology_receipt`, this calls terminology_lookup
 * (query.kind="code") and records the returned receipt on the entry:
 *
 *   verification_status: "mock_verified_pending_live_ncts"
 *   terminology_receipt: { request_id, timestamp_utc, upstream, mode,
 *                          validated_code, system_version }
 *
 * HONESTY OF THE STATUS: the mock terminology server ECHOES a looked-up code
 * (it grounds binding, not clinical validity), so the flipped status says
 * exactly that — mock-verified, PENDING live NCTS revalidation. FMEA F5: on
 * live connect (M11) every candidate code is batch-REvalidated against live
 * NCTS and blocks on mismatch. The receipt's mode:"mock" keeps this mechanical:
 * the mode-normaliser blocks mock receipts as proof in any live-enforced
 * context, so these receipts can never masquerade as live validation.
 *
 * SCORING-STORE FIREWALL: this script reads ONLY case_manifest.json per case.
 * It never opens 00–02 or the sealed 10–13 node files; codes_manifest is
 * ingest-written metadata (code, system, status), and `used_in` pointers are
 * path strings, not node content.
 *
 * Usage: node scripts/verify-case-codes.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const CASES_DIR = join(REPO_ROOT, "data/cases");
const DRY_RUN = process.argv.includes("--dry-run");
const PENDING = "unverified_pending_terminology_receipt";
const MOCK_VERIFIED = "mock_verified_pending_live_ncts";

async function main() {
  const caseDirs = readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const transport = new StdioClientTransport({
    command: "node",
    args: [join(REPO_ROOT, "mcp/servers/terminology/index.js")],
    env: { ...process.env, HEYDOC_MODE_DEFAULT: "mock" },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "heydoc-case-code-verify", version: "0.1.0" });
  await client.connect(transport);

  let casesTouched = 0, codesVerified = 0, codesAlreadyDone = 0, failures = [], skipped = [];
  try {
    for (const caseId of caseDirs) {
      const manifestPath = join(CASES_DIR, caseId, "case_manifest.json");
      if (!existsSync(manifestPath)) {
        // Pre-ingest legacy case (the hand-built reference case predates the
        // manifest discipline). Skipped by NAME, not silently — registered as
        // `reference-case-manifest-missing`; retrofit is a gated follow-up.
        skipped.push(`${caseId}: no case_manifest.json (pre-ingest legacy — see reference-case-manifest-missing)`);
        continue;
      }
      const raw = readFileSync(manifestPath, "utf8");
      const manifest = JSON.parse(raw);
      let changed = false;

      for (const entry of manifest.codes_manifest || []) {
        if (entry.verification_status !== PENDING) {
          codesAlreadyDone++;
          continue;
        }
        const result = await client.callTool({
          name: "terminology_lookup",
          arguments: { system: entry.code_system, query: { kind: "code", value: entry.code }, mode: "mock" },
        });
        const payload = JSON.parse(result.content?.[0]?.text || "{}");
        const concept = payload.response?.concept;
        const receipt = payload.receipt;
        // The mock server must echo the exact code back — anything else means the
        // lookup did not bind THIS code, and the entry stays unverified (fail-safe).
        if (!concept || concept.code !== entry.code || !receipt?.request_id) {
          failures.push(`${caseId}: ${entry.code_system} ${entry.code} — lookup did not bind (stays ${PENDING})`);
          continue;
        }
        entry.verification_status = MOCK_VERIFIED;
        entry.terminology_receipt = {
          request_id: receipt.request_id,
          timestamp_utc: receipt.timestamp_utc,
          upstream: receipt.upstream,
          mode: receipt.mode,
          validated_code: concept.code,
          system_version: concept.version,
        };
        codesVerified++;
        changed = true;
      }

      if (changed && !DRY_RUN) {
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + (raw.endsWith("\n") ? "\n" : ""));
        casesTouched++;
      } else if (changed) {
        casesTouched++;
      }
    }
  } finally {
    client.close();
  }

  console.log(`cases:verify-codes${DRY_RUN ? " (dry-run)" : ""}:`);
  console.log(`  cases scanned:      ${caseDirs.length}`);
  console.log(`  cases updated:      ${casesTouched}`);
  console.log(`  codes receipted:    ${codesVerified} (status → ${MOCK_VERIFIED})`);
  console.log(`  codes already done: ${codesAlreadyDone}`);
  console.log(`  legacy skipped:     ${skipped.length}`);
  for (const s of skipped) console.warn(`  [skip] ${s}`);
  console.log(`  failures:           ${failures.length}`);
  for (const f of failures) console.error(`  [fail] ${f}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
