#!/usr/bin/env node
/**
 * verify:worm — live WORM integrity validation across ALL FOUR medicolegal
 * hash chains (FL-11 ENG half; R-39 lineage).
 *
 * `verify:rehash --integrity` validates the audit ledger against whatever
 * substrate is registered — run naked on a laptop that is the LOCAL file, not
 * the bucket, and it covers one chain of four. This script exists to make the
 * staging claim honestly: it registers the `s3-object-lock` substrate against
 * the real Object Lock bucket (exactly as deploy/bootstrap.mjs does at boot),
 * selects it on all four seams, then verifies:
 *
 *   - the audit ledger chain          (verifyChain)         + every persisted
 *     content hash recomputed against its candidate_output_hash (drift = tampering)
 *   - the clinician gate-record chain (verifyGateRecordChain)
 *   - the PPP-TTT triage chain        (verifyPppTttChain)
 *   - the consent-record chain        (verifyConsentChain)
 *
 * An EMPTY chain is reported as valid-and-empty, never silently passed — a
 * bucket nobody has written to proves connectivity, not durability; the
 * write-then-verify round trip is a separate, deliberate step (the FL-11 run
 * uses `verify:rehash <synthetic-file>` with this same registration).
 *
 * Exit 0 iff every chain is VALID and content drift is zero. Read-only.
 *
 * Usage (env, mirroring the deploy):
 *   HEYDOC_WORM_BUCKET=heydoc-medicolegal-audit AWS_REGION=ap-southeast-2 \
 *   HEYDOC_WORM_RETENTION_YEARS=7 npm run verify:worm
 */
import { registerWormAudit } from "../integration/audit-substrates/s3-object-lock.js";
import { verifyChain, readLedger, readContent } from "../verification/audit-store.js";
import { verifyGateRecordChain } from "../portal/gate-record-store.js";
import { verifyPppTttChain } from "../verification/ppp-ttt/ledger.js";
import { verifyConsentChain } from "../verification/consent-store.js";
import { hashCandidateOutput } from "../verification/hash.js";

/** Select the s3-object-lock substrate on all four seams for THIS process. The
 *  stores read their selection env at call time; registration alone selects nothing
 *  (by design — a registered-but-unselected adapter must never shadow `local`). */
function selectWormOnAllSeams() {
  process.env.HEYDOC_AUDIT_SUBSTRATE = "s3-object-lock";
  process.env.HEYDOC_GATE_RECORD_SUBSTRATE = "s3-object-lock";
  process.env.HEYDOC_PPP_TTT_SUBSTRATE = "s3-object-lock";
  process.env.HEYDOC_CONSENT_SUBSTRATE = "s3-object-lock";
}

/**
 * Verify all four chains + audit content hashes against an ALREADY-REGISTERED
 * substrate. Split from main() so the contract test can drive it with the
 * adapter's injectable exec (a fake bucket) — every failure mode provable
 * without AWS.
 * @returns {{ ok: boolean, chains: object, drift: Array, contentChecked: number, contentMissing: number }}
 */
export function runIntegrity() {
  const chains = {
    audit: verifyChain(),
    gate_records: verifyGateRecordChain(),
    ppp_ttt: verifyPppTttChain(),
    consent: verifyConsentChain(),
  };

  // Content recheck (audit chain only — the other three chains carry their whole
  // record inside the hashed entry, so the chain check IS their content check).
  const drift = [];
  let contentChecked = 0;
  let contentMissing = 0;
  for (const e of readLedger()) {
    if (!e.content_persisted) continue;
    const content = readContent(e.candidate_output_hash);
    if (content === null) { contentMissing++; continue; }
    contentChecked++;
    const recomputed = hashCandidateOutput(content);
    if (recomputed !== e.candidate_output_hash) {
      drift.push({ seq: e.seq, run_id: e.run_id, stored: e.candidate_output_hash, recomputed });
    }
  }

  const ok = Object.values(chains).every((c) => c.valid) && drift.length === 0;
  return { ok, chains, drift, contentChecked, contentMissing };
}

function report(bucket, result) {
  console.log(`verify:worm — s3-object-lock @ ${bucket}`);
  for (const [name, c] of Object.entries(result.chains)) {
    const state = c.valid ? (c.entries === 0 ? "VALID (empty)" : `VALID (${c.entries} entries)`) : `BROKEN at seq ${c.brokenAt} — ${c.reason}`;
    console.log(`  ${name.padEnd(13)} ${state}`);
  }
  console.log(`  content checked:   ${result.contentChecked}`);
  console.log(`  content missing:   ${result.contentMissing}`);
  console.log(`  drift (tampering): ${result.drift.length}`);
  for (const d of result.drift) console.log(`    ! seq ${d.seq} ${d.run_id}: stored ${d.stored} != recomputed ${d.recomputed}`);
  console.log(result.ok ? "verify:worm OK — all four chains valid, zero drift" : "verify:worm FAIL");
}

async function main() {
  const bucket = String(process.env.HEYDOC_WORM_BUCKET || "").trim();
  const region = String(process.env.AWS_REGION || "ap-southeast-2").trim();
  const retentionYears = Number(process.env.HEYDOC_WORM_RETENTION_YEARS || 7);
  const mode = String(process.env.HEYDOC_WORM_MODE || "COMPLIANCE").trim();
  if (!bucket) {
    console.error("verify:worm: HEYDOC_WORM_BUCKET is required (the Object-Lock-enabled bucket)");
    process.exit(2);
  }
  selectWormOnAllSeams();
  await registerWormAudit({ bucket, region, retentionYears, mode }); // fail-closed: throws on missing CLI / bad config
  const result = runIntegrity();
  report(bucket, result);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
