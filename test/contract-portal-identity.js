/**
 * Contract test: FL-42 clinician identity federation (portal remainder;
 * plan .planning/IDENTITY-FEDERATION-PLAN.md).
 *
 * Proves the identity federation seam + the fail-closed binding onto the durable
 * gate-record trail — WITHOUT touching the frozen verification-gate.js:
 *  - the dev provider resolves a synthetic identity in a dev context;
 *  - a live-enforced context REFUSES the dev provider (fail-closed) — a dev
 *    identity is never accepted as a live federated identity;
 *  - a registered production provider yields a verified identity; the durable
 *    entry carries the identity block; the signature is DERIVED (bound to who +
 *    what), never free-text;
 *  - a record whose clinician_id disagrees with the verified identity subject is
 *    REJECTED by recordDecisionDurable (fail-closed binding);
 *  - tampering the persisted identity block breaks the hash chain;
 *  - a legacy call with no identity still works (backward compatible);
 *  - the frozen gate contract is untouched (identity rides the entry envelope).
 *
 * Isolated in a temp HEYDOC_DATA_DIR (same convention as contract-portal-review).
 * Run: node test/contract-portal-identity.js
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "portal-identity-"));
process.env.HEYDOC_DATA_DIR = tempDir;
delete process.env.HEYDOC_PORTAL_IDP;

const {
  resolveClinicianIdentity, bindSignature, identityBlock,
  registerIdentityProvider, activeProviderName, DEV_PROVIDER,
} = await import("../portal/identity-federation.js");
const { recordDecisionDurable, verifyGateRecordChain, readGateRecordEntries } =
  await import("../portal/gate-record-store.js");
const { hashCandidateOutput } = await import("../verification/hash.js");

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

// Minimal request stub carrying headers (as node lower-cases them).
const reqWith = (headers = {}) => ({ headers });
const HASH = hashCandidateOutput("attested candidate output — no diagnosis, no dose.");
const MOCK_MODE = { enforce_live: false, context_mode: "mock" };
const LIVE_MODE = { enforce_live: true, context_mode: "live" };

try {
  // ── 1. Dev provider resolves a synthetic identity in a dev context ─────────
  check(activeProviderName() === DEV_PROVIDER, "default active provider is dev");
  const devId = resolveClinicianIdentity(reqWith({ "x-heydoc-dev-clinician": "pharm-KL" }), MOCK_MODE);
  check(devId.verified === true && devId.clinician_id === "pharm-KL", "dev provider resolves the asserted dev clinician");
  check(devId.idp === "dev" && !!devId.session_id, "resolved identity carries idp + session_id");
  check(devId.ahpra_registration === "DEV-AHPRA-pharm-KL", "dev provider synthesises an AHPRA ref");

  // No dev header → refuse (fail-closed, even in dev).
  const noHeader = resolveClinicianIdentity(reqWith({}), MOCK_MODE);
  check(noHeader.verified === false, "no dev identity asserted → refused");

  // ── 2. Live-enforced context REFUSES the dev provider ──────────────────────
  const devLive = resolveClinicianIdentity(reqWith({ "x-heydoc-dev-clinician": "pharm-KL" }), LIVE_MODE);
  check(devLive.verified === false && /dev identity provider/.test(devLive.reason),
    "LOAD-BEARING: a live-enforced portal refuses the dev provider (dev identity is never live)");

  // Unregistered provider name → refuse.
  process.env.HEYDOC_PORTAL_IDP = "acme-oidc-not-registered";
  const unreg = resolveClinicianIdentity(reqWith({}), LIVE_MODE);
  check(unreg.verified === false && /not registered/.test(unreg.reason), "an unregistered provider refuses (fail-closed)");
  delete process.env.HEYDOC_PORTAL_IDP;

  // Reserved dev provider cannot be overridden.
  let reservedThrew = false;
  try { registerIdentityProvider("dev", { resolve: () => ({ subject: "x" }) }); } catch { reservedThrew = true; }
  check(reservedThrew, "the reserved dev provider name cannot be overridden");

  // ── 3. A registered production provider → verified identity + bound signature
  registerIdentityProvider("test-oidc", {
    resolve(req) {
      const tok = req.headers["x-idp-token"];
      if (tok !== "valid-token") return null; // the adapter validates its own credential
      return { subject: "ahpra-MED0001234567", ahpra_registration: "MED0001234567", display_name: "Dr Test" };
    },
  });
  process.env.HEYDOC_PORTAL_IDP = "test-oidc";
  const liveId = resolveClinicianIdentity(reqWith({ "x-idp-token": "valid-token" }), LIVE_MODE);
  check(liveId.verified === true && liveId.clinician_id === "ahpra-MED0001234567" && liveId.idp === "test-oidc",
    "a registered live provider yields a verified identity in a live context");
  const badTok = resolveClinicianIdentity(reqWith({ "x-idp-token": "nope" }), LIVE_MODE);
  check(badTok.verified === false, "the live provider refuses an invalid credential");

  const sig = bindSignature(liveId, HASH);
  check(sig.startsWith("sig:federated:test-oidc:MED0001234567:"), "signature is bound to idp + ahpra");
  check(bindSignature(liveId, HASH) === sig, "signature binding is deterministic for the same identity + hash");
  check(bindSignature(liveId, hashCandidateOutput("different bytes")) !== sig, "signature changes with the attested bytes (bound to WHAT)");
  let unverifiedSigThrew = false;
  try { bindSignature({ verified: false }, HASH); } catch { unverifiedSigThrew = true; }
  check(unverifiedSigThrew, "refusing to bind a signature to an unverified identity");

  // ── 4. Durable record with the verified identity block ─────────────────────
  const record = {
    run_id: "run-identity-0001",
    candidate_output_hash: HASH,
    clinician_id: liveId.clinician_id, // MUST be the verified subject
    decision: "approved",
    decided_at_utc: "2026-07-13T02:00:00.000Z",
    signature_ref: sig,
  };
  const { entry } = recordDecisionDurable(record, { identity: identityBlock(liveId) });
  check(entry.identity && entry.identity.verified === true && entry.identity.subject === "ahpra-MED0001234567",
    "the durable entry carries the verified identity block");
  check(entry.identity.idp === "test-oidc" && !!entry.identity.session_id, "the identity block records idp + session");
  check(verifyGateRecordChain().valid === true, "the gate-record chain verifies with an identity block");

  // ── 5. Binding is fail-closed: clinician_id ≠ verified subject → REJECT ─────
  let mismatchThrew = false;
  try {
    recordDecisionDurable(
      { ...record, run_id: "run-identity-0002", clinician_id: "someone-else" },
      { identity: identityBlock(liveId) }
    );
  } catch (e) {
    mismatchThrew = /identity binding/.test(e.message);
  }
  check(mismatchThrew, "LOAD-BEARING: a record whose clinician_id disagrees with the verified identity is REFUSED");

  // ── 6. Tampering the identity block breaks the chain ───────────────────────
  const { readFileSync, writeFileSync } = await import("node:fs");
  const storeFile = join(tempDir, "gate-records.jsonl");
  const lines = readFileSync(storeFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const tampered = { ...lines[0], identity: { ...lines[0].identity, subject: "impostor" } };
  writeFileSync(storeFile, [JSON.stringify(tampered), ...lines.slice(1).map((l) => JSON.stringify(l))].join("\n") + "\n");
  check(verifyGateRecordChain().valid === false, "editing the persisted identity block MUST break the hash chain");
  writeFileSync(storeFile, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  check(verifyGateRecordChain().valid === true, "restoring the original bytes re-validates the chain");

  // ── 7. Backward compatible: a legacy call with no identity still works ──────
  const { entry: legacyEntry } = recordDecisionDurable({
    run_id: "run-identity-legacy", candidate_output_hash: HASH, clinician_id: "legacy-KL",
    decision: "approved", decided_at_utc: "2026-07-13T03:00:00.000Z", signature_ref: "sig:legacy-free-text",
  });
  check(legacyEntry.identity === undefined, "a legacy decision with no identity persists without an identity block (backward compatible)");
  check(verifyGateRecordChain().valid === true, "the chain still verifies across mixed identity/legacy entries");

  process.env.HEYDOC_PORTAL_IDP = "";
} catch (err) {
  errors.push(`unexpected error: ${err && err.stack ? err.stack : err}`);
}

if (errors.length) {
  console.error(`contract-portal-identity: FAIL (${errors.length})`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-portal-identity: OK");
