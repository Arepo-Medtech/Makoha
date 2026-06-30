#!/usr/bin/env node
/**
 * verify:rehash — reprocess stored outputs through the verification layer.
 *
 * Two modes (the medicolegal point of each is distinct):
 *
 *   --integrity (default)  Recompute the SHA-256 of every stored output and
 *                          compare it to the ledger's candidate_output_hash, and
 *                          verify the ledger hash-chain. This DETECTS tampering or
 *                          drift in either store. It mints nothing.
 *
 *   --reissue              Re-run verify() over every stored (synthetic) output to
 *                          produce a fresh hashed VerificationReport and append a
 *                          new audit entry — incorporating previously-generated
 *                          outputs into the audit trail under the current verifier.
 *                          The hash MUST reproduce; if it does not, the output was
 *                          altered and the reissue fails.
 *
 *   <path>                 Ingest an arbitrary candidate-output file: verify it,
 *                          hash it, and record it (content persisted only when the
 *                          run is synthetic, i.e. not live).
 *
 * WHY we never fabricate: a hash is only a valid anchor over the exact bytes we
 * hold. We re-verify outputs we have; we never invent a hash for an output we
 * cannot produce. Where stored content is absent, integrity reports it as such.
 *
 * Usage: node verification/rehash.js [--integrity | --reissue | <path>]
 */
import { readFileSync, existsSync } from "node:fs";
import { readLedger, verifyChain, readContent, appendEntry, recordRun } from "./audit-store.js";
import { hashCandidateOutput } from "./hash.js";
import { verify } from "./verifier.js";
import { validateReport } from "./report-schema.js";

/** Reconstruct verifier evidence from a ledger entry's receipt metadata, so a
 *  reissued verification evaluates the same checks the original run had. */
function evidenceFromReceipts(receipts = []) {
  const citations = [];
  const terminology = [];
  const terminology_receipts = [];
  const live_receipts = [];
  for (const r of receipts) {
    if (/terminolog/i.test(r.upstream)) {
      // Rebuild the per-code binding evidence from the recorded codes, so a coded
      // output that originally passed re-binds (and passes) on reissue.
      terminology.push({ request_id: r.request_id, codes: r.codes || [], mode: r.mode });
      terminology_receipts.push(r.request_id);
      live_receipts.push(r.request_id);
    } else if (/doc/i.test(r.upstream)) {
      citations.push(r.request_id);
    } else {
      live_receipts.push(r.request_id);
    }
  }
  return { citations, terminology, terminology_receipts, live_receipts };
}

function integrity() {
  const chain = verifyChain();
  const ledger = readLedger();
  let checked = 0;
  let okHash = 0;
  let missingContent = 0;
  const drift = [];

  for (const e of ledger) {
    if (!e.content_persisted) continue;
    const content = readContent(e.candidate_output_hash);
    if (content === null) {
      missingContent++;
      continue;
    }
    checked++;
    const recomputed = hashCandidateOutput(content);
    if (recomputed === e.candidate_output_hash) okHash++;
    else drift.push({ seq: e.seq, run_id: e.run_id, stored: e.candidate_output_hash, recomputed });
  }

  console.log("rehash --integrity");
  console.log(`  ledger entries:     ${ledger.length}`);
  console.log(`  chain:              ${chain.valid ? "VALID" : "BROKEN at seq " + chain.brokenAt + " — " + chain.reason}`);
  console.log(`  content checked:    ${checked}`);
  console.log(`  hash matches:       ${okHash}`);
  console.log(`  content missing:    ${missingContent}`);
  console.log(`  drift (tampering):  ${drift.length}`);
  for (const d of drift) console.log(`    ! seq ${d.seq} ${d.run_id}: stored ${d.stored} != recomputed ${d.recomputed}`);

  return chain.valid && drift.length === 0;
}

function reissue() {
  const ledger = readLedger();
  const seen = new Set();
  let reissued = 0;
  const failed = [];

  for (const e of ledger) {
    if (!e.content_persisted || seen.has(e.candidate_output_hash)) continue;
    const content = readContent(e.candidate_output_hash);
    if (content === null) continue;
    seen.add(e.candidate_output_hash);

    const v = verify(content, evidenceFromReceipts(e.receipts));
    if (v.candidate_output_hash !== e.candidate_output_hash) {
      failed.push({ seq: e.seq, run_id: e.run_id });
      continue; // do NOT record a reissue whose hash does not reproduce
    }

    const report = {
      run_id: `reissue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp_utc: new Date().toISOString(),
      trunk_id: e.trunk_id,
      session_ref: e.session_ref,
      pass: v.pass,
      results: v.results,
      missing_receipts: v.missing_receipts,
      candidate_output_hash: v.candidate_output_hash,
    };
    validateReport(report);

    appendEntry({
      run_id: report.run_id,
      trunk_id: e.trunk_id,
      session_ref: e.session_ref,
      candidate_output_hash: v.candidate_output_hash,
      pass: v.pass,
      check_results: v.results,
      receipts: e.receipts,
      mode: e.mode,
      content_persisted: e.mode !== "live", // content already exists in the synthetic store
    });
    reissued++;
  }

  console.log("rehash --reissue");
  console.log(`  distinct outputs:   ${seen.size}`);
  console.log(`  reissued:           ${reissued}`);
  console.log(`  hash-reproduce fail:${failed.length}`);
  for (const f of failed) console.log(`    ! seq ${f.seq} ${f.run_id}: hash did not reproduce`);
  return failed.length === 0;
}

function ingest(path) {
  if (!existsSync(path)) {
    console.error(`rehash: file not found: ${path}`);
    return false;
  }
  const output = readFileSync(path, "utf8");
  const v = verify(output, {});
  const entry = recordRun(
    { run_id: `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, output, verification: v, packet: { receipts: [] } },
    {}
  );
  console.log("rehash <path>");
  console.log(`  ingested:           ${path}`);
  console.log(`  candidate_output_hash: ${v.candidate_output_hash}`);
  console.log(`  ledger seq:         ${entry.seq}`);
  return true;
}

function main() {
  const arg = process.argv[2];
  let ok;
  if (!arg || arg === "--integrity") ok = integrity();
  else if (arg === "--reissue") ok = reissue();
  else if (arg.startsWith("--")) {
    console.error(`rehash: unknown option ${arg}\nUsage: node verification/rehash.js [--integrity | --reissue | <path>]`);
    process.exit(2);
  } else ok = ingest(arg);
  process.exit(ok ? 0 : 1);
}

main();
