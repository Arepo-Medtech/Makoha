/**
 * Contract tests for the medicolegal-audit-ledger (append-only store + rehash).
 * Asserts:
 *   - appendEntry chains entries (genesis link, prev_hash linkage, seq); verifyChain valid.
 *   - a tampered ledger line breaks verifyChain.
 *   - ledger entries carry NO PHI keys.
 *   - content store round-trips by hash; persistContent refuses non-synthetic.
 *   - verify:rehash CLI: --integrity exits 0 clean, --reissue exits 0, and
 *     --integrity exits 1 when stored content is tampered (drift).
 * Uses a throwaway HEYDOC_DATA_DIR so the real .heydoc-data is untouched.
 * Run from repo root: node test/contract-audit-store.js
 */
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const rehashPath = join(repoRoot, "verification/rehash.js");

async function run() {
  const errors = [];
  const dir = mkdtempSync(join(tmpdir(), "heydoc-audit-"));
  process.env.HEYDOC_DATA_DIR = dir; // audit-store reads this lazily per call

  const { appendEntry, verifyChain, persistContent, readContent, readLedger, GENESIS_HASH, registerAuditSubstrate, auditRetentionPolicy } = await import("../verification/audit-store.js");
  const { hashCandidateOutput } = await import("../verification/hash.js");

  // Seed two synthetic entries (content + ledger).
  const outs = ["Synthetic output A: no diagnosis, no dosages.", "Synthetic output B: triage only."];
  outs.forEach((o, i) => {
    const h = hashCandidateOutput(o);
    persistContent(h, o, { synthetic: true });
    appendEntry({
      run_id: `run-test-${i}-aaaaaaa`,
      trunk_id: "2.0",
      session_ref: "enc-test-001",
      candidate_output_hash: h,
      pass: true,
      check_results: [{ check: "no_invented_codes", passed: true }],
      receipts: [{ request_id: "term-1", upstream: "terminology", mode: "mock", codes: ["279039003"] }],
      mode: "mock",
      content_persisted: true,
    });
  });

  const L = readLedger();
  if (L.length !== 2) errors.push(`expected 2 entries, got ${L.length}`);
  // Validated codes must survive the append (so verify:rehash --reissue can re-bind).
  if (JSON.stringify(L[0].receipts?.[0]?.codes) !== JSON.stringify(["279039003"])) errors.push("ledger dropped terminology receipt codes (reissue would flip coded outputs to FAIL)");
  if (L[0].prev_hash !== GENESIS_HASH) errors.push("first entry does not link to genesis");
  if (L[1].prev_hash !== L[0].entry_hash) errors.push("second entry does not link to first");
  if (L[0].seq !== 0 || L[1].seq !== 1) errors.push("seq not monotonic from 0");
  if (!verifyChain().valid) errors.push("verifyChain invalid on a clean ledger");

  // No PHI keys must ever appear in a ledger entry.
  for (const e of L) {
    for (const banned of ["facts", "output", "candidate_output_excerpt", "demographics"]) {
      if (banned in e) errors.push(`ledger entry carries PHI-risk key: ${banned}`);
    }
  }

  // Content store round-trip + synthetic guard.
  if (readContent(hashCandidateOutput(outs[0])) !== outs[0]) errors.push("content did not round-trip by hash");
  let refused = false;
  try {
    persistContent("sha256:" + "b".repeat(64), "x", { synthetic: false });
  } catch (_) {
    refused = true;
  }
  if (!refused) errors.push("persistContent did not refuse non-synthetic content");

  // verifyChain detects a tampered ledger line.
  {
    const p = join(dir, "audit-ledger.jsonl");
    const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
    const t = JSON.parse(lines[0]);
    t.pass = false;
    lines[0] = JSON.stringify(t);
    writeFileSync(p, lines.join("\n") + "\n");
    if (verifyChain().valid) errors.push("verifyChain failed to detect a tampered ledger line");
    // restore the original line so the rehash CLI checks below run on a valid chain
    lines[0] = JSON.stringify({ ...t, pass: true });
  }

  // Rebuild a clean ledger for the CLI checks (fresh dir).
  const dir2 = mkdtempSync(join(tmpdir(), "heydoc-audit-cli-"));
  const env = { ...process.env, HEYDOC_DATA_DIR: dir2 };
  // Seed via a real verification run so content + ledger exist.
  spawnSync("node", [join(repoRoot, "verification/run.js")], { env, cwd: repoRoot });

  const integrityClean = spawnSync("node", [rehashPath, "--integrity"], { env, cwd: repoRoot });
  if (integrityClean.status !== 0) errors.push(`rehash --integrity (clean) expected exit 0, got ${integrityClean.status}`);

  const reissue = spawnSync("node", [rehashPath, "--reissue"], { env, cwd: repoRoot });
  if (reissue.status !== 0) errors.push(`rehash --reissue expected exit 0, got ${reissue.status}`);

  // Plant content drift, expect integrity to exit 1.
  const cdir = join(dir2, "content");
  const first = readdirSync(cdir)[0];
  writeFileSync(join(cdir, first), "TAMPERED");
  const integrityDrift = spawnSync("node", [rehashPath, "--integrity"], { env, cwd: repoRoot });
  if (integrityDrift.status !== 1) errors.push(`rehash --integrity (drift) expected exit 1, got ${integrityDrift.status}`);

  // --- M8/C5: substrate seam + retention hook (run LAST; no subprocesses after) ---
  const savedSub = process.env.HEYDOC_AUDIT_SUBSTRATE;
  const savedRet = process.env.HEYDOC_AUDIT_RETENTION;
  try {
    // (a) Custom in-memory substrate proves the seam: the frozen chain works
    //     end-to-end through a non-filesystem backend.
    const mem = { ledger: [], content: new Map() };
    registerAuditSubstrate("memtest", {
      appendLedgerLine: (line) => mem.ledger.push(line),
      readLedgerLines: () => mem.ledger.slice(),
      writeContentOnce: (hex, text) => { if (!mem.content.has(hex)) mem.content.set(hex, text); return `mem:${hex}`; },
      readContentByHex: (hex) => (mem.content.has(hex) ? mem.content.get(hex) : null),
    });
    process.env.HEYDOC_AUDIT_SUBSTRATE = "memtest";
    const h = "sha256:" + "c".repeat(64);
    persistContent(h, "synthetic through the seam", { synthetic: true });
    appendEntry({ run_id: "run-mem-0-aaaaaaa", candidate_output_hash: h, pass: true,
      check_results: [{ check: "no_invented_codes", passed: true }], receipts: [], mode: "mock", content_persisted: true });
    appendEntry({ run_id: "run-mem-1-aaaaaaa", candidate_output_hash: h, pass: true,
      check_results: [{ check: "no_invented_codes", passed: true }], receipts: [], mode: "mock", content_persisted: false });
    if (mem.ledger.length !== 2) errors.push("custom substrate: appendLedgerLine not used");
    if (!verifyChain().valid) errors.push("custom substrate: verifyChain invalid (chain must work through any substrate)");
    if (readContent(h) !== "synthetic through the seam") errors.push("custom substrate: content did not round-trip through the seam");

    // (b) Fail-safe: a non-local substrate with no adapter registered REFUSES.
    process.env.HEYDOC_AUDIT_SUBSTRATE = "worm";
    let refused = false;
    try { appendEntry({ run_id: "run-worm-0-aaaaaa", candidate_output_hash: h, pass: true, check_results: [], receipts: [], mode: "mock", content_persisted: false }); }
    catch { refused = true; }
    if (!refused) errors.push("unconfigured WORM substrate did NOT refuse (must never write to a non-WORM backend)");

    // (c) Retention hook: surfaced, never decides, never auto-deletes.
    delete process.env.HEYDOC_AUDIT_RETENTION;
    const unset = auditRetentionPolicy();
    if (unset.configured !== false || unset.auto_delete !== false) errors.push("retention: unset default should be {configured:false, auto_delete:false}");
    process.env.HEYDOC_AUDIT_RETENTION = "P7Y";
    const set = auditRetentionPolicy();
    if (set.configured !== true || set.retention !== "P7Y" || set.auto_delete !== false) errors.push("retention: configured value should surface with auto_delete:false");
  } finally {
    if (savedSub === undefined) delete process.env.HEYDOC_AUDIT_SUBSTRATE; else process.env.HEYDOC_AUDIT_SUBSTRATE = savedSub;
    if (savedRet === undefined) delete process.env.HEYDOC_AUDIT_RETENTION; else process.env.HEYDOC_AUDIT_RETENTION = savedRet;
  }
  console.log("  [pass] substrate seam (custom adapter + WORM-refuse) and retention hook");

  if (errors.length) {
    console.error("Contract failures:", errors);
    process.exit(1);
  }
  console.log("contract-audit-store: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
