/**
 * Contract test: Clinician Verification Portal L1 — review bundle, durable
 * gate-record chain, registry hydration, HTTP console, and the end-to-end
 * decision→release round-trip against the FROZEN gate.
 *
 * Proves:
 *  - buildReviewBundle() produces a schema-valid, tamper-evident bundle from a
 *    real pipeline result (PPP-TTT artifacts carried when present);
 *  - gate records are durable-first, hash-chained, tamper-evident, and
 *    hydrate the frozen in-memory registry across "restarts";
 *  - releaseToPatient(): mock refuses even with an approved record; a
 *    live-enforced context releases ONLY the exact attested bytes; rejected
 *    releases nothing; amended releases only the amended text;
 *  - the HTTP console: healthz open; everything else 401 without the bearer
 *    token; queue lists; decision POST records durably; output is HTML-escaped;
 *  - a live-enforced portal without a token REFUSES to start;
 *  - approving in the portal NEVER sets patient_eligible or sends anything.
 *
 * Run from repo root: node test/contract-portal-review.js
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "portal-l1-"));
process.env.HEYDOC_DATA_DIR = tempDir;

const { runPipeline } = await import("../verification/pipeline.js");
const { buildReviewBundle, verifyReviewBundle } = await import("../portal/review-bundle.js");
const { recordDecisionDurable, verifyGateRecordChain, hydrateGateRegistry, effectiveDecision, readGateRecordEntries } =
  await import("../portal/gate-record-store.js");
const { releaseToPatient, getGateRecords } = await import("../portal/verification-gate.js");
const { createPortalServer, submitForReview, clearPending } = await import("../portal/server.js");
const { hashCandidateOutput } = await import("../verification/hash.js");

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const PYELO = { source: "trunk_9.0", area_id: "uti", condition: "Pyelonephritis" };
const answers = {};
for (let i = 1; i <= 9; i++) answers[`uhao-${i}`] = "absent";
for (let i = 1; i <= 5; i++) answers[`pyelonephritis-cs-${i}`] = "absent";
answers["pyelonephritis-refer-1"] = "present";

try {
  // ── 1. Review bundle from a real (CAUTION-graded) pipeline run ──────────────
  const result = await runPipeline({ raised_flags: [PYELO], patient_answers: answers, abcde_input: { patient_decision: "proceed" } });
  const bundle = buildReviewBundle(result);
  check(bundle.candidate_output_hash === result.verification.candidate_output_hash,
    "bundle must anchor to the run's medicolegal hash");
  check(bundle.ppp_ttt?.tier === "CAUTION" && bundle.abcde_record?._pppTtt?.schema === "ppp-ttt-abcde-record",
    "bundle must carry the PPP-TTT verdict + tagged ABCDE record for the reviewer");
  check(verifyReviewBundle(bundle) === true, "a fresh bundle must verify against its own hash");
  check(verifyReviewBundle({ ...bundle, candidate_output: bundle.candidate_output + " " }) === false,
    "any change to what the reviewer sees must break the bundle hash (tamper-evident)");

  // ── 2. Durable-first decisions + chain + hydration ──────────────────────────
  const approval = {
    run_id: bundle.run_id,
    candidate_output_hash: bundle.candidate_output_hash,
    clinician_id: "pharm-KL",
    decision: "approved",
    decided_at_utc: new Date().toISOString(),
    signature_ref: "sig:test-attestation-1",
  };
  const { entry } = recordDecisionDurable(approval, { bundle_sha256: bundle.bundle_sha256 });
  check(entry.bundle_sha256 === bundle.bundle_sha256,
    "the durable entry must record WHAT THE REVIEWER WAS SHOWN (bundle_sha256)");
  check(verifyGateRecordChain().valid === true, "the gate-record chain must verify after append");
  check(getGateRecords(bundle.candidate_output_hash).length === 1, "the frozen registry must see the decision");

  // Tamper: flipping a recorded decision must break the chain.
  const storeFile = join(tempDir, "gate-records.jsonl");
  const lines = readFileSync(storeFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const tampered = JSON.parse(JSON.stringify(lines[0]));
  tampered.record.decision = "rejected";
  writeFileSync(storeFile, JSON.stringify(tampered) + "\n");
  check(verifyGateRecordChain().valid === false, "editing a recorded clinician decision MUST break the chain");
  writeFileSync(storeFile, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  check(verifyGateRecordChain().valid === true, "restoring original bytes re-validates the chain");

  // Hydration is idempotent (replaying an already-registered decision is a no-op).
  check(hydrateGateRegistry() === 0 && getGateRecords(bundle.candidate_output_hash).length === 1,
    "hydration must not duplicate decisions already in the frozen registry");
  check(effectiveDecision(bundle.candidate_output_hash)?.decision === "approved",
    "effectiveDecision must read the durable trail");

  // ── 3. Release round-trip against the FROZEN gate ────────────────────────────
  // Mock context: even an approved record must NOT release (no patients in dev).
  const mockAttempt = releaseToPatient({ candidate_output_hash: bundle.candidate_output_hash, output: bundle.candidate_output });
  check(mockAttempt.released === false, "mock context must refuse release even with an approved record");

  // Live-enforced context: exact attested bytes release; altered bytes refuse.
  process.env.HEYDOC_MODE_DEFAULT = "staging";
  const liveExact = releaseToPatient({ candidate_output_hash: bundle.candidate_output_hash, output: bundle.candidate_output });
  check(liveExact.released === true && liveExact.released_hash === bundle.candidate_output_hash,
    "a live-enforced context must release EXACTLY the attested bytes");
  const liveAltered = releaseToPatient({ candidate_output_hash: bundle.candidate_output_hash, output: bundle.candidate_output + "!" });
  check(liveAltered.released === false, "altered bytes must refuse (hash recomputed, never trusted)");

  // Amend: only the amended text releases afterwards.
  const amendedText = bundle.candidate_output + "\n[Amended by reviewing pharmacist: see note.]";
  recordDecisionDurable({
    ...approval,
    decision: "amended",
    decided_at_utc: new Date().toISOString(),
    amended_output_hash: hashCandidateOutput(amendedText),
  });
  check(releaseToPatient({ candidate_output_hash: bundle.candidate_output_hash, output: bundle.candidate_output }).released === false,
    "after an amendment, the ORIGINAL text must no longer release");
  check(releaseToPatient({ candidate_output_hash: bundle.candidate_output_hash, output: amendedText }).released === true,
    "after an amendment, exactly the amended text releases");

  // Reject: nothing releases.
  recordDecisionDurable({ ...approval, decision: "rejected", decided_at_utc: new Date().toISOString() });
  check(releaseToPatient({ candidate_output_hash: bundle.candidate_output_hash, output: amendedText }).released === false,
    "after a rejection (latest wins), nothing releases");
  process.env.HEYDOC_MODE_DEFAULT = "mock";

  // ── 4. HTTP console ──────────────────────────────────────────────────────────
  // Live-enforced without a token must refuse to start.
  process.env.HEYDOC_MODE_DEFAULT = "staging";
  delete process.env.HEYDOC_PORTAL_TOKEN;
  let refusedStart = false;
  try {
    createPortalServer();
  } catch {
    refusedStart = true;
  }
  check(refusedStart, "a live-enforced portal with no HEYDOC_PORTAL_TOKEN must refuse to start");
  process.env.HEYDOC_MODE_DEFAULT = "mock";

  const TOKEN = "test-token-123";
  const server = createPortalServer({ token: TOKEN });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { authorization: `Bearer ${TOKEN}` };

  const health = await fetch(`${base}/healthz`);
  check(health.status === 200, "/healthz must be open");
  check((await fetch(`${base}/queue`)).status === 401, "console routes must 401 without the bearer token");
  check((await fetch(`${base}/metrics`, { headers: auth })).status === 200, "/metrics must serve a snapshot with auth");

  // Submit a run whose output contains an XSS probe; the console must escape it.
  clearPending();
  const xssResult = await runPipeline({ candidate_output: `Based on the provided context (citation: cw-au:imaging-lbp:2024-01), <script>alert(1)</script> no imaging is recommended. No diagnosis or dosages are given.` });
  submitForReview(xssResult);
  const queueHtml = await (await fetch(`${base}/queue`, { headers: auth })).text();
  check(queueHtml.includes(xssResult.run_id), "queue must list the submitted run");
  const reviewHtml = await (await fetch(`${base}/review?run=${xssResult.run_id}`, { headers: auth })).text();
  check(!reviewHtml.includes("<script>alert(1)</script>") && reviewHtml.includes("&lt;script&gt;"),
    "the console must HTML-escape candidate output (XSS)");

  // Record a decision over HTTP; it must land durably and clear the queue.
  const before = readGateRecordEntries().length;
  const dec = await fetch(`${base}/decision`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      run_id: xssResult.run_id,
      candidate_output_hash: xssResult.verification.candidate_output_hash,
      clinician_id: "pharm-KL",
      decision: "approved",
      signature_ref: "sig:test-attestation-2",
    }),
  });
  check(dec.status === 201, "POST /decision must record (got " + dec.status + ")");
  check(readGateRecordEntries().length === before + 1, "the HTTP decision must append to the durable chain");
  check(effectiveDecision(xssResult.verification.candidate_output_hash)?.decision === "approved",
    "the HTTP decision must be the effective decision");

  server.close();

  // ── 5. Nothing in the portal sets patient_eligible ───────────────────────────
  for (const f of ["portal/server.js", "portal/review-bundle.js", "portal/gate-record-store.js"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    check(!/patient_eligible/.test(src), `${f} must not reference the patient-eligibility flag`);
  }
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.HEYDOC_DATA_DIR;
  process.env.HEYDOC_MODE_DEFAULT = "mock";
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-portal-review: OK");
