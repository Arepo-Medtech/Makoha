/**
 * contract-worm-integrity — the FL-11 four-chain WORM integrity validator
 * (scripts/worm-integrity.mjs), driven through the s3-object-lock adapter's
 * injectable exec so every failure mode is provable without AWS.
 *
 * Bars:
 *   1. empty bucket → all FOUR chains VALID (empty), ok=true — and reported as
 *      empty, because an empty chain proves connectivity, not durability;
 *   2. a real appended entry (through the audit seam, via the adapter) → VALID(1);
 *   3. content drift — stored bytes that no longer hash to the ledger's
 *      candidate_output_hash → detected as tampering, ok=false;
 *   4. chain tamper — a ledger object edited in the bucket → re-seeded caches
 *      report BROKEN with the seq, ok=false. This is the medicolegal point:
 *      an edit to an immutable store MUST be loud, never absorbed.
 */
import { registerWormAudit } from "../integration/audit-substrates/s3-object-lock.js";
import { appendEntry } from "../verification/audit-store.js";
import { hashCandidateOutput } from "../verification/hash.js";
import { runIntegrity } from "../scripts/worm-integrity.mjs";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) return console.log(`  ok: ${name}`);
  failures++;
  console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
};

// Select the WORM substrate on all four seams for this process.
for (const v of ["HEYDOC_AUDIT_SUBSTRATE", "HEYDOC_GATE_RECORD_SUBSTRATE", "HEYDOC_PPP_TTT_SUBSTRATE", "HEYDOC_CONSENT_SUBSTRATE"]) {
  process.env[v] = "s3-object-lock";
}

/** In-memory fake of the exact AWS CLI surface the adapter shells out to. */
function fakeBucket() {
  const objects = new Map(); // key → body
  const exec = (args, input) => {
    const cmd = args.slice(0, 2).join(" ");
    if (cmd === "s3api put-object") {
      const key = args[args.indexOf("--key") + 1];
      if (args.includes("--if-none-match") && objects.has(key)) {
        const err = new Error("PreconditionFailed");
        err.stderr = "An error occurred (PreconditionFailed) when calling the PutObject operation: At least one of the pre-conditions you specified did not hold";
        throw err;
      }
      objects.set(key, input);
      return "";
    }
    if (cmd === "s3 cp") {
      const key = args[2].replace(/^s3:\/\/[^/]+\//, "");
      if (!objects.has(key)) {
        const err = new Error("NoSuchKey");
        err.stderr = "An error occurred (404) when calling the HeadObject operation: Not Found";
        throw err;
      }
      return objects.get(key);
    }
    if (cmd === "s3api list-objects-v2") {
      const prefix = args[args.indexOf("--prefix") + 1];
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      return keys.length ? keys.join("\n") : "None";
    }
    throw new Error(`fakeBucket: unexpected CLI call: ${args.join(" ")}`);
  };
  return { objects, exec };
}

const CFG = { bucket: "fake-worm", region: "ap-southeast-2", retentionYears: 7, mode: "COMPLIANCE" };

// 1. Empty bucket: four chains, all valid, all empty — and ok overall.
const fake = fakeBucket();
await registerWormAudit({ ...CFG, exec: fake.exec });
{
  const r = runIntegrity();
  check("empty bucket → ok", r.ok === true);
  for (const [name, c] of Object.entries(r.chains)) {
    check(`empty bucket → ${name} valid and empty`, c.valid === true && c.entries === 0, JSON.stringify(c));
  }
}

// 2. A real entry through the audit seam lands in the fake bucket and verifies.
const content = "synthetic candidate output for the WORM round trip";
const candidateHash = hashCandidateOutput(content);
{
  appendEntry({
    run_id: "worm-test-1",
    trunk_id: "9.0",
    session_ref: "worm-integrity-contract",
    candidate_output_hash: candidateHash,
    pass: true,
    check_results: [],
    receipts: [],
    mode: "mock",
    content_persisted: false,
  });
  const r = runIntegrity();
  check("appended entry → audit chain VALID(1)", r.chains.audit.valid === true && r.chains.audit.entries === 1, JSON.stringify(r.chains.audit));
  check("appended entry → still ok overall", r.ok === true);
  check("ledger object exists in the bucket", [...fake.objects.keys()].some((k) => k.includes("/ledger/")));
}

// 3. Content drift: stored bytes that no longer hash to the recorded anchor.
{
  const hex = candidateHash.replace(/^sha256:/, "");
  fake.objects.set(`heydoc-audit/content/${hex}.txt`, "TAMPERED BYTES — not the attested output");
  appendEntry({
    run_id: "worm-test-2",
    trunk_id: "9.0",
    session_ref: "worm-integrity-contract",
    candidate_output_hash: candidateHash,
    pass: true,
    check_results: [],
    receipts: [],
    mode: "mock",
    content_persisted: true,
  });
  const r = runIntegrity();
  check("content drift → detected", r.drift.length === 1, `drift=${r.drift.length}`);
  check("content drift → ok=false", r.ok === false);
}

// 4. Chain tamper: edit a ledger object in the bucket, re-register (fresh cache
//    seed, as a fresh process would), and the chain must report BROKEN.
{
  const key = [...fake.objects.keys()].filter((k) => k.includes("/ledger/")).sort()[0];
  const edited = JSON.parse(fake.objects.get(key));
  edited.pass = false; // the medicolegal edit: flip a verdict after the fact
  fake.objects.set(key, JSON.stringify(edited));
  await registerWormAudit({ ...CFG, exec: fake.exec }); // re-seed caches from the tampered bucket
  const r = runIntegrity();
  check("chain tamper → audit BROKEN", r.chains.audit.valid === false, JSON.stringify(r.chains.audit));
  check("chain tamper → names the seq", Number.isInteger(r.chains.audit.brokenAt), JSON.stringify(r.chains.audit));
  check("chain tamper → ok=false", r.ok === false);
}

if (failures) {
  console.error(`contract-worm-integrity FAIL (${failures})`);
  process.exit(1);
}
console.log("contract-worm-integrity OK (empty=valid-and-said-so · append verifies · content drift caught · a bucket edit is LOUD)");
