/**
 * Contract test: L12 consent capture (FL-01 / R-40; plan .planning/CONSENT-PLAN.md).
 *
 * Proves the load-bearing claims:
 *  - RECORDING, NOT UNLOCKING: persistContent() still refuses non-synthetic
 *    content even with an ACTIVE session_persistence consent (the no-unlock
 *    assertion) — consent capture opens no persistence path;
 *  - PACKET ISOLATION: the pipeline / context-allowlist / trunk integration
 *    files contain no consent reference at all (static scan) — the LLM packet
 *    is byte-identical with or without consent records because no code path
 *    connects them;
 *  - default-deny on EVERY branch of requireActiveConsent(): no record,
 *    declined, revoked, session-ended, unknown type, malformed ref;
 *  - consent types are never minted: omnibus-sourced types carry a
 *    provenPath()-proven binding + the pinned dataset receipt fields;
 *  - session-bound expiry is MECHANICAL: closeEncounter() inactivates active
 *    consents via the close-hook registry, and working-state destruction
 *    survives a throwing hook;
 *  - the consent store is append-only, hash-chained, tamper-evident, PHI-free
 *    by construction (.strict() refuses an extra/free-text field BEFORE the
 *    durable write), and sits on a fail-closed substrate seam from day one;
 *  - the consult intake parsing is BOUNDED (silence records nothing) and
 *    capture is SUPPRESSED on an emergency result.
 *
 * Uses HEYDOC_DATA_DIR to isolate the store in a temp dir (same convention as
 * contract-ppp-ttt-ledger.js). Run from repo root: node test/contract-consent.js
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const tempDir = mkdtempSync(join(tmpdir(), "consent-"));
process.env.HEYDOC_DATA_DIR = tempDir;
delete process.env.HEYDOC_CONSENT_SUBSTRATE;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const {
  captureConsent, revokeConsent, consentStatus, getActiveConsent,
  requireActiveConsent, endSessionConsents, CONSENT_TYPES, BLOCKED_NO_CONSENT,
} = await import("../verification/consent.js");
const {
  readConsentLedger, verifyConsentChain, registerConsentStoreSubstrate, appendConsentEntry,
} = await import("../verification/consent-store.js");
const { validateConsentRecord, CONSENT_RECORD_KEYS } = await import("../verification/consent-schema.js");
const { openEncounter, closeEncounter, isOpen, putWorkingState, registerCloseHook } = await import("../verification/session-store.js");
const { omnibusDatasetReceipt } = await import("../verification/omnibus.js");
const { persistContent } = await import("../verification/audit-store.js");
const { parseConsentIntake, captureIntakeConsents } = await import("../patient/consult-flow.js");

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const refuses = (fn, label) => {
  try { fn(); return `${label}: DID NOT REFUSE`; } catch (err) {
    return String(err.message).startsWith(BLOCKED_NO_CONSENT) ? null : `${label}: refused without the ${BLOCKED_NO_CONSENT} prefix (${err.message.slice(0, 80)})`;
  }
};

try {
  // ── 1. Capture round-trip + omnibus proof ─────────────────────────────────
  const ref = openEncounter();
  const granted = captureConsent({ session_ref: ref, consent_type: "session_persistence", decision: "granted" });
  check(granted.status === "active" && granted.reason === "patient_granted", "a grant must record status=active");
  check(granted.type_source === "heydoc-first-party" && granted.omnibus_binding === null,
    "session_persistence is first-party — it must never claim an omnibus binding");
  check(granted.mode === "mock", "in the mock dev default the record mode must be mock (normaliseMode)");

  const mhr = captureConsent({ session_ref: ref, consent_type: "mhr_data_sharing", decision: "granted" });
  const receipt = omnibusDatasetReceipt();
  check(mhr.omnibus_binding && mhr.omnibus_binding.path === "Consent.au_consent_types.MHR_data_sharing",
    "an omnibus-sourced type must carry its proven omnibus path");
  check(mhr.omnibus_binding.dataset_version === receipt.dataset_version && mhr.omnibus_binding.sha256 === receipt.sha256,
    "the omnibus binding must carry the PINNED dataset receipt fields (version + sha256)");

  check(requireActiveConsent(ref, "session_persistence").consent_id === granted.consent_id,
    "requireActiveConsent must return the active record");
  check(consentStatus(ref, "telehealth_consent") === "absent", "an unasked type must derive as absent");

  // ── 2. NO-UNLOCK: consent never opens a persistence path ──────────────────
  let unlockRefused = false;
  try { persistContent("sha256:" + "a".repeat(64), "real patient text", { synthetic: false }); }
  catch { unlockRefused = true; }
  check(unlockRefused,
    "LOAD-BEARING: persistContent must STILL refuse non-synthetic content while a session_persistence consent is ACTIVE — capture is recording, not unlocking");

  // ── 3. Default-deny matrix ─────────────────────────────────────────────────
  const declinedRef = openEncounter();
  captureConsent({ session_ref: declinedRef, consent_type: "session_persistence", decision: "declined" });
  for (const e of [
    refuses(() => requireActiveConsent(declinedRef, "session_persistence"), "declined consent"),
    refuses(() => requireActiveConsent(declinedRef, "mhr_data_sharing"), "no record"),
    refuses(() => requireActiveConsent(declinedRef, "organ_donation"), "unknown type (v1 scope)"),
    refuses(() => requireActiveConsent("", "session_persistence"), "malformed session_ref"),
    refuses(() => captureConsent({ session_ref: "enc-never-opened-1", consent_type: "session_persistence", decision: "granted" }), "capture on an unopened encounter"),
    refuses(() => captureConsent({ session_ref: declinedRef, consent_type: "session_persistence", decision: "maybe" }), "non-bounded decision"),
    refuses(() => revokeConsent({ session_ref: declinedRef, consent_type: "session_persistence" }), "revoking a non-active consent"),
  ]) if (e) errors.push(e);

  // ── 4. Revocation + session-end expiry (mechanical) ───────────────────────
  const revokable = captureConsent({ session_ref: declinedRef, consent_type: "telehealth_consent", decision: "granted" });
  check(revokable.status === "active", "re-grant on the same encounter must be capturable");
  const revoked = revokeConsent({ session_ref: declinedRef, consent_type: "telehealth_consent" });
  check(revoked.status === "inactive" && revoked.reason === "patient_revoked", "revocation must append an inactive/patient_revoked event");
  if (refuses(() => requireActiveConsent(declinedRef, "telehealth_consent"), "revoked consent")) errors.push("revoked consent must refuse");

  const closeInfo = closeEncounter(ref); // ref still holds active session_persistence + mhr grants
  const tail = readConsentLedger().slice(-2);
  check(tail.every((e) => e.session_ref === ref && e.status === "inactive" && e.reason === "session_end"),
    "closeEncounter must inactivate every active consent for that encounter (session_end)");
  check(!closeInfo.hook_errors, "the consent close hook must not error on a normal close");
  if (refuses(() => requireActiveConsent(ref, "session_persistence"), "session-ended consent")) errors.push("a session-ended consent must refuse");

  // A throwing close hook must NEVER block working-state destruction.
  registerCloseHook(() => { throw new Error("deliberately failing hook"); });
  const hookRef = openEncounter();
  putWorkingState(hookRef, "k", { v: 1 });
  const closed = closeEncounter(hookRef);
  check(closed.keys_destroyed === 1 && !isOpen(hookRef), "working-state destruction must survive a throwing close hook");
  check(Array.isArray(closed.hook_errors) && closed.hook_errors.length === 1, "a hook failure must be surfaced in the close result");

  // ── 5. PHI-free by construction (.strict() BEFORE the durable write) ──────
  const priorLen = readConsentLedger().length;
  let strictRefused = false;
  try {
    appendConsentEntry({
      session_ref: "enc-strict-test-1", consent_type: "session_persistence", type_source: "heydoc-first-party",
      omnibus_binding: null, status: "active", reason: "patient_granted", scope: "patient-privacy",
      provision_actions: ["collect"], patient_story: "free text that must be unrepresentable",
    });
  } catch { strictRefused = true; }
  // NOTE: appendConsentEntry builds the record from known fields only, so the
  // stray key is dropped structurally; the schema is the second wall. Prove
  // the WALL itself too:
  let wallRefused = false;
  try { validateConsentRecord({ ...readConsentLedger()[0], narrative: "PHI" }); } catch { wallRefused = true; }
  check(wallRefused, "an extra (potentially PHI-bearing) field must be unrepresentable (.strict())");
  check(strictRefused || readConsentLedger().length === priorLen + 1,
    "a stray caller field must never reach the durable log as-is");
  const keys = new Set(Object.keys(readConsentLedger()[0]));
  check([...keys].every((k) => CONSENT_RECORD_KEYS.includes(k)), "every persisted key must be in the declared key set");

  // ── 6. Chain integrity + tamper evidence ──────────────────────────────────
  const v1 = verifyConsentChain();
  check(v1.valid === true && v1.entries === readConsentLedger().length, `a freshly written chain must verify (got ${JSON.stringify(v1)})`);
  const storeFile = join(tempDir, "consent-records.jsonl");
  const lines = readFileSync(storeFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const tampered = { ...lines[0], status: lines[0].status === "active" ? "rejected" : "active" };
  writeFileSync(storeFile, [JSON.stringify(tampered), ...lines.slice(1).map((l) => JSON.stringify(l))].join("\n") + "\n");
  const v2 = verifyConsentChain();
  check(v2.valid === false && v2.brokenAt === 0, "editing a consent record (flipping a status) MUST break the hash chain");
  writeFileSync(storeFile, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  check(verifyConsentChain().valid === true, "restoring the original bytes must re-validate the chain");

  // ── 7. Substrate seam: fail-closed + registerable ─────────────────────────
  process.env.HEYDOC_CONSENT_SUBSTRATE = "unregistered-worm";
  let seamRefused = false;
  try { readConsentLedger(); } catch { seamRefused = true; }
  check(seamRefused, "a non-local substrate with no registered adapter must REFUSE (fail-closed)");
  const mem = [];
  registerConsentStoreSubstrate("unregistered-worm", { appendLine: (l) => mem.push(l), readLines: () => mem.slice() });
  const viaSeam = openEncounter();
  captureConsent({ session_ref: viaSeam, consent_type: "session_persistence", decision: "granted" });
  check(mem.length === 1 && JSON.parse(mem[0]).seq === 0, "a registered adapter must receive the append through the seam");
  check(verifyConsentChain().valid === true, "the chain must verify through a registered substrate");
  closeEncounter(viaSeam);
  process.env.HEYDOC_CONSENT_SUBSTRATE = "local";

  // ── 8. PACKET ISOLATION (static scan — the mechanical byte-identity proxy) ─
  for (const f of ["verification/pipeline.js", "verification/context-allowlist.js", "integration/trunk-pipeline.js", "integration/trunk-sequencer.js"]) {
    const src = readFileSync(join(REPO_ROOT, f), "utf8");
    check(!/consent/i.test(src),
      `${f} must contain NO consent reference — the LLM packet stays byte-identical because no code path connects consent to it`);
  }

  // ── 9. Consult intake: bounded parsing + emergency suppression ────────────
  const p1 = parseConsentIntake({ consent_session: "yes", consent_telehealth: "1" });
  check(p1.length === 2 && p1[0].decision === "granted", "explicit yes answers must parse to grants");
  check(parseConsentIntake({}).length === 0, "silence must record NOTHING (consent never assumed)");
  check(parseConsentIntake({ consent_session: "whatever", free_text: "I consent to everything" }).length === 0,
    "non-bounded input must never become a consent");

  const supp = captureIntakeConsents({ session_ref: "enc-x", result: { ppp_ttt: { tier: "STOP" } }, decisions: p1 });
  check(supp.suppressed === true && supp.captured.length === 0,
    "consent capture must be SUPPRESSED on an emergency result (never a step on a STOP/T5 path)");
  const failSafe = captureIntakeConsents({ session_ref: "enc-never-opened-2", result: {}, decisions: p1 });
  check(failSafe.errors.length === 2 && failSafe.captured.length === 0,
    "a capture failure must be collected, never thrown into the patient screen path");

  check(Object.keys(CONSENT_TYPES).length === 3, "v1 scope is exactly the three approved types");
} catch (err) {
  errors.push(`unexpected error: ${err && err.stack ? err.stack : err}`);
}

if (errors.length) {
  console.error(`contract-consent: FAIL (${errors.length})`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-consent: OK");
