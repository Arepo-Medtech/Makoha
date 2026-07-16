/**
 * smoke-worm-live — the WORM substrate against a REAL Object Lock bucket and a
 * REAL AWS CLI. Env-gated: with HEYDOC_WORM_BUCKET unset this SKIPS and exits 0
 * (the smoke-opencds-gateway / smoke-llm precedent).
 *
 * WHY THIS EXISTS — it is the test class that was missing, and its absence cost a
 * live defect. `contract-audit-worm-s3` and `contract-worm-integrity` inject a fake
 * `exec`: they prove the adapter's LOGIC (keys, retention, chain order, refusals)
 * and can never prove the CLI's PARAMETER GRAMMAR. The original `--body /dev/stdin`
 * shape passed every fake-exec test and was rejected by every real AWS CLI v2
 * ("Blob values must be a path to a file") — found by FL-11's live run on
 * 2026-07-16, after the adapter had been "contract-tested" since 2026-07-11. Only a
 * real CLI can prove a real CLI.
 *
 * A green CI run does NOT mean this passed — it means nobody asked.
 *
 * WHAT IT WRITES: one clearly-labelled SYNTHETIC record per run, immutable for the
 * bucket's retention period. That is the point of the bucket, and the cost of
 * proving durability rather than assuming it. Run it against staging, never
 * production.
 *
 * Usage:
 *   HEYDOC_WORM_BUCKET=heydoc-medicolegal-audit AWS_REGION=ap-southeast-2 \
 *   HEYDOC_WORM_RETENTION_YEARS=7 node test/smoke-worm-live.js
 */
import { registerWormAudit } from "../integration/audit-substrates/s3-object-lock.js";
import { recordRun } from "../verification/audit-store.js";
import { verify } from "../verification/verifier.js";
import { runIntegrity } from "../scripts/worm-integrity.mjs";

const bucket = String(process.env.HEYDOC_WORM_BUCKET || "").trim();
if (!bucket) {
  console.log("smoke-worm-live: SKIPPED — HEYDOC_WORM_BUCKET unset (no bucket). This proves NOTHING; it means nobody asked.");
  process.exit(0);
}

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) return console.log(`  ok: ${name}`);
  failures++;
  console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
};

for (const v of ["HEYDOC_AUDIT_SUBSTRATE", "HEYDOC_GATE_RECORD_SUBSTRATE", "HEYDOC_PPP_TTT_SUBSTRATE", "HEYDOC_CONSENT_SUBSTRATE"]) {
  process.env[v] = "s3-object-lock";
}

await registerWormAudit({
  bucket,
  region: String(process.env.AWS_REGION || "ap-southeast-2").trim(),
  retentionYears: Number(process.env.HEYDOC_WORM_RETENTION_YEARS || 7),
  mode: String(process.env.HEYDOC_WORM_MODE || "COMPLIANCE").trim(),
});

// 1. Baseline: whatever is already there must verify before we add to it.
const before = runIntegrity();
check("baseline: all four chains valid", before.ok === true, JSON.stringify(before.chains));
const baselineEntries = before.chains.audit.entries;

// 2. THE ROUND TRIP — a real WORM write through the designed seam. This is the
//    step a fake exec cannot perform and the one that catches CLI-grammar defects.
const stamp = new Date().toISOString();
const output = `SYNTHETIC WORM validation record (${stamp}). Not a clinical output; no patient data. Written by test/smoke-worm-live.js to prove the medicolegal chain is durable end to end against a live Object Lock bucket.`;
const v = verify(output, {});
const entry = recordRun({ run_id: `worm-live-smoke-${stamp}`, output, verification: v, packet: { receipts: [] } }, {});
check("write: the record appended (no CLI refusal)", Number.isInteger(entry.seq), JSON.stringify(entry && entry.seq));

// 3. Read it back and re-verify: the chain grew by exactly one, still valid, no drift.
const after = runIntegrity();
check("after write: all four chains valid", after.ok === true, JSON.stringify(after.chains));
check("after write: audit chain grew by exactly one", after.chains.audit.entries === baselineEntries + 1,
  `${baselineEntries} → ${after.chains.audit.entries}`);
check("after write: zero content drift", after.drift.length === 0, JSON.stringify(after.drift));

if (failures) {
  console.error(`smoke-worm-live FAIL (${failures})`);
  process.exit(1);
}
console.log(`smoke-worm-live: OK (live @ ${bucket} — baseline verified · one synthetic record written through the real CLI · read back · four chains valid · zero drift)`);
