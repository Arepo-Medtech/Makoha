/**
 * Contract tests for the Clinician Verification Portal release gate
 * (portal/verification-gate.js + mcp/schemas/verification-portal-decision.schema.json)
 * — ARCH_PLAN C9 / FMEA F13 (portal bypass). The mandatory HITL checkpoint.
 * <test_and_evaluation_gates> requires deterministic safety code to be tested.
 *
 * Asserts:
 *   - the VerificationGateRecord contract (zod + JSON schema in lockstep):
 *     valid records validate; bad hash shape / bad decision / missing
 *     signature_ref / extra properties / amended-without-amended-hash reject;
 *   - the patient path is CLOSED without an attested gate record;
 *   - release binds to the EXACT candidate_output_hash: approved text releases,
 *     any other text refuses (hash recomputed, never trusted);
 *   - 'rejected' never releases; 'amended' releases ONLY the amended text;
 *   - latest decision wins (approve → reject ⇒ refused);
 *   - mock/dry_run contexts NEVER release (mode-normaliser guard);
 *   - refusals are fail-closed status objects naming every unmet condition.
 * Run from repo root: node test/contract-verification-gate.js
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv/dist/2020.js"; // the schema declares draft 2020-12 (repo idiom, as in cases:ingest)
import { GateRecordSchema, recordGateDecision, releaseToPatient, getGateRecords } from "../portal/verification-gate.js";
import { hashCandidateOutput } from "../verification/hash.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const errors = [];
const check = (label, cond) => { if (!cond) errors.push(label); };

const ajv = new Ajv({ strict: false, validateFormats: false });
const jsonSchema = ajv.compile(JSON.parse(readFileSync(join(__dirname, "..", "mcp/schemas/verification-portal-decision.schema.json"), "utf8")));
/** Both contract layers must agree — zod is the runtime gate, the JSON schema is the source of truth. */
const bothAccept = (r) => GateRecordSchema.safeParse(r).success === true && jsonSchema(r) === true;
const bothReject = (r) => GateRecordSchema.safeParse(r).success === false && jsonSchema(r) === false;

const OUTPUT = "Grounded advice per the provided context. No diagnosis or dosages.";
const AMENDED = OUTPUT + " Amended by the reviewing clinician: follow up within 48 hours.";
const H = hashCandidateOutput(OUTPUT);
const HA = hashCandidateOutput(AMENDED);
const base = { run_id: "run-gate-0001", candidate_output_hash: H, clinician_id: "AHPRA-TEST-0001", decision: "approved", decided_at_utc: "2026-07-03T00:00:00.000Z", signature_ref: "sig-artefact-1" };

// 1. Contract — zod and JSON schema in lockstep.
check("valid approved record accepted by both", bothAccept(base));
check("valid amended record accepted by both", bothAccept({ ...base, decision: "amended", amended_output_hash: HA }));
check("bad hash shape rejected by both", bothReject({ ...base, candidate_output_hash: "sha256:short" }));
check("bad decision rejected by both", bothReject({ ...base, decision: "maybe" }));
check("missing signature_ref rejected by both", bothReject((({ signature_ref, ...r }) => r)(base)));
check("extra property rejected by both", bothReject({ ...base, patient_name: "leak" }));
check("amended without amended_output_hash rejected by both", bothReject({ ...base, decision: "amended" }));

const savedMode = process.env.HEYDOC_MODE_DEFAULT;
try {
  // 2. Development contexts never release — even with an approved record.
  recordGateDecision(base);
  process.env.HEYDOC_MODE_DEFAULT = "mock";
  const inMock = releaseToPatient({ candidate_output_hash: H, output: OUTPUT });
  check("mock: refused despite approval", inMock.released === false && inMock.reasons.some((r) => /non-live context/.test(r)));
  process.env.HEYDOC_MODE_DEFAULT = "dry_run";
  check("dry_run: refused", releaseToPatient({ candidate_output_hash: H, output: OUTPUT }).released === false);

  // Live-enforced context for the gate checks proper (staging = synthetic patients).
  process.env.HEYDOC_MODE_DEFAULT = "staging";

  // 3. No gate record → the patient path is closed.
  const unreviewed = hashCandidateOutput("Never-reviewed output.");
  const noRec = releaseToPatient({ candidate_output_hash: unreviewed, output: "Never-reviewed output." });
  check("no record: refused, reason names mandatory review", noRec.released === false && noRec.reasons.some((r) => /no VerificationGateRecord/.test(r)));

  // 4. Approved: the EXACT text releases; any other text refuses.
  const ok = releaseToPatient({ candidate_output_hash: H, output: OUTPUT });
  check("approved + exact text: released", ok.released === true && ok.released_hash === H && ok.gate_record.decision === "approved");
  const tampered = releaseToPatient({ candidate_output_hash: H, output: OUTPUT + " " });
  check("approved + altered text: refused (hash recomputed)", tampered.released === false && tampered.reasons.some((r) => /does not hash to the approved/.test(r)));

  // 5. Rejected never releases.
  const H2 = hashCandidateOutput("Second output.");
  recordGateDecision({ ...base, run_id: "run-gate-0002", candidate_output_hash: H2, decision: "rejected" });
  const rej = releaseToPatient({ candidate_output_hash: H2, output: "Second output." });
  check("rejected: refused", rej.released === false && rej.reasons.some((r) => /'rejected'/.test(r)));

  // 6. Amended: only the amended text releases; the original refuses.
  const H3 = hashCandidateOutput("Third output, needs amendment.");
  recordGateDecision({ ...base, run_id: "run-gate-0003", candidate_output_hash: H3, decision: "amended", amended_output_hash: HA });
  check("amended: original text refused", releaseToPatient({ candidate_output_hash: H3, output: "Third output, needs amendment." }).released === false);
  const amendedOk = releaseToPatient({ candidate_output_hash: H3, output: AMENDED });
  check("amended: attested amended text released", amendedOk.released === true && amendedOk.released_hash === HA);

  // 7. Latest decision wins — re-review can close a previously open release.
  recordGateDecision({ ...base, run_id: "run-gate-0004", decision: "rejected", decided_at_utc: "2026-07-03T01:00:00.000Z" });
  const reReviewed = releaseToPatient({ candidate_output_hash: H, output: OUTPUT });
  check("approve→reject: refused (latest wins)", reReviewed.released === false);
  check("audit read returns full history", getGateRecords(H).length === 2);

  // 8. Malformed release requests fail closed with named reasons.
  const bad = releaseToPatient({ candidate_output_hash: "not-a-hash", output: "" });
  check("malformed request: fail-closed with reasons", bad.released === false && bad.reasons.length >= 2);
  // recordGateDecision throws on contract violations (never stores junk).
  let threw = false;
  try { recordGateDecision({ ...base, decision: "amended" }); } catch (_) { threw = true; }
  check("recordGateDecision throws on contract violation", threw);
} finally {
  if (savedMode === undefined) delete process.env.HEYDOC_MODE_DEFAULT;
  else process.env.HEYDOC_MODE_DEFAULT = savedMode;
}

if (errors.length) {
  console.error("Contract failures:", errors);
  process.exit(1);
}
console.log("contract-verification-gate: OK");
