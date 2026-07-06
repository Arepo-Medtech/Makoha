/**
 * Shared governance contract runner (FLOW_PLAN H7 / FMEA G7). Each harvested
 * path's test/contract-governance-<path>.js calls runGovernanceContract() with
 * its own governedRelease wrapper. One runner, so every harvested path is proven
 * against the SAME fail-closed criteria and a bypass cannot hide in a per-path
 * test that quietly checks less.
 *
 * Proves, per path:
 *   1. CLOSED without an attested VerificationGateRecord (default state).
 *   2. Opens ONLY with a valid record on the EXACT candidate_output_hash — tested
 *      with a SYNTHETIC record (no real clinician sign-off, no Portal UI exists).
 *   3. Dev modes (mock) refuse even with a record.
 *   4. Altered output refuses (the gate re-hashes the exact bytes).
 *   5. No path flips patient_eligible:true (release verdict + native flag).
 *   6. The audit ledger (C5) records a harvested-path run, metadata-only / PHI-free.
 *
 * RETAIN boundary: imports releaseToPatient (via governedRelease), hashCandidateOutput,
 * recordGateDecision, appendEntry/verifyChain, validateLedgerEntry — modifies NONE.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashCandidateOutput } from "../verification/hash.js";
import { recordGateDecision } from "../portal/verification-gate.js";
import { appendEntry, verifyChain } from "../verification/audit-store.js";
import { validateLedgerEntry } from "../verification/ledger-schema.js";

/**
 * @param {{ pathId:string, milestone:string, governedRelease:(o:string)=>object,
 *           nativeAssertions?: Array<[string, boolean]> }} spec
 */
export function runGovernanceContract({ pathId, milestone, governedRelease, nativeAssertions = [] }) {
  const errors = [];
  const check = (name, cond) => { if (!cond) errors.push(name); };

  const savedMode = process.env.HEYDOC_MODE_DEFAULT;
  const savedDataDir = process.env.HEYDOC_DATA_DIR;
  // Isolated temp ledger — the ledger assertion must never touch real .heydoc-data.
  process.env.HEYDOC_DATA_DIR = mkdtempSync(join(tmpdir(), `gov-${pathId}-`));
  try {
    const OUTPUT = `Harvested (${pathId}) patient-directed output — H7 governance contract fixture.`;
    const H = hashCandidateOutput(OUTPUT);

    // 1. CLOSED without a gate record. Use a live-enforced context (staging =
    //    synthetic patients) so the mode-guard is satisfied and we are testing the
    //    gate proper, not the dev-mode refusal.
    process.env.HEYDOC_MODE_DEFAULT = "staging";
    const closed = governedRelease(OUTPUT);
    check("CLOSED without an attested gate record", closed.released === false);
    check("refusal names mandatory clinician review", closed.reasons.some((r) => /no VerificationGateRecord/.test(r)));
    check("verdict attributes the harvested path", closed.path === pathId);
    check("verdict attributes the milestone", closed.milestone === milestone);

    // 2. Dev mode refuses EVEN WITH an attested record on the exact hash.
    recordGateDecision({
      run_id: `run-gov-${pathId}-0001`,
      candidate_output_hash: H,
      clinician_id: "AHPRA-TEST-GOV",
      decision: "approved",
      decided_at_utc: "2026-07-07T00:00:00.000Z",
      signature_ref: "sig-gov-artefact-1",
    });
    process.env.HEYDOC_MODE_DEFAULT = "mock";
    check("dev mode (mock) refuses even with an attested record", governedRelease(OUTPUT).released === false);

    // 3. Opens ONLY with the synthetic attested record on the EXACT hash.
    process.env.HEYDOC_MODE_DEFAULT = "staging";
    const opened = governedRelease(OUTPUT);
    check("OPENS with a synthetic attested record on the exact hash", opened.released === true && opened.released_hash === H);
    check("opened verdict binds the computed hash", opened.candidate_output_hash === H);

    // 4. Altered output refuses (gate re-hashes exact bytes).
    check("altered output refuses (hash recomputed)", governedRelease(OUTPUT + " ").released === false);

    // 5. No patient_eligible flip — not on the release verdict, and not on the
    //    path's native eligibility flag(s).
    check("release verdict never carries patient_eligible:true", opened.patient_eligible !== true && closed.patient_eligible !== true);
    for (const [name, cond] of nativeAssertions) check(name, cond);

    // 6. Audit ledger records a harvested-path run — metadata only, PHI-free.
    const entry = appendEntry({
      run_id: `run-gov-${pathId}-ledger`,
      candidate_output_hash: H,
      pass: true,
      check_results: [{ check: "no_invented_codes", passed: true }],
      receipts: [{ request_id: `rid-${pathId}-1`, upstream: `heydoc-harvested-${pathId}`, mode: "mock" }],
      mode: "mock",
      content_persisted: false,
    });
    check("audit ledger appended a harvested-path run", typeof entry.entry_hash === "string" && entry.run_id === `run-gov-${pathId}-ledger`);
    check("ledger chain intact after harvested-run entry", verifyChain().valid === true);
    // Metadata-only: appendEntry writes ONLY the fixed field set — an unknown
    // (PHI-shaped) field passed in is dropped, never persisted.
    const dropped = appendEntry({
      run_id: `run-gov-${pathId}-phi`,
      candidate_output_hash: H, pass: true, check_results: [], receipts: [],
      mode: "mock", content_persisted: false, patient_name: "SHOULD-NOT-PERSIST",
    });
    check("ledger drops unknown/PHI fields (metadata-only)", dropped.patient_name === undefined);
    // And the .strict() schema that GATES every append refuses a PHI-bearing entry.
    let phiRefused = false;
    try { validateLedgerEntry({ ...entry, patient_name: "leak" }); } catch (_) { phiRefused = true; }
    check("ledger schema (.strict) refuses a PHI-bearing entry", phiRefused);
  } finally {
    if (savedMode === undefined) delete process.env.HEYDOC_MODE_DEFAULT; else process.env.HEYDOC_MODE_DEFAULT = savedMode;
    if (savedDataDir === undefined) delete process.env.HEYDOC_DATA_DIR; else process.env.HEYDOC_DATA_DIR = savedDataDir;
  }

  if (errors.length) {
    console.error(`contract-governance-${pathId} FAILURES:`, errors);
    process.exit(1);
  }
  console.log(`contract-governance-${pathId}: OK`);
}
