/**
 * EXAMPLE deploy bootstrap (LIVE_PLAN L2) — NOT wired into anything.
 *
 * A real deployment copies this shape into its infrastructure repo, replaces
 * the example adapters with its WORM/secrets implementations, and boots with:
 *   node deploy/bootstrap.mjs   (which ends by importing portal/server.js)
 *
 * Placeholders below use example.invalid by design — the secrets seam REFUSES
 * placeholder values, so copying this file unedited cannot go live.
 */
import { registerAuditSubstrate } from "../verification/audit-store.js";
import { registerGateRecordSubstrate } from "../portal/gate-record-store.js";
import { registerSecretsBackend } from "../integration/secrets.js";

// 1) WORM adapter for the main medicolegal ledger (four-op seam).
//    Selected by HEYDOC_AUDIT_SUBSTRATE=worm-example. Append-only/write-once
//    semantics are the backend's job (e.g. S3 Object Lock compliance mode).
registerAuditSubstrate("worm-example", {
  appendLedgerLine(_line) { throw new Error("example adapter — implement against your WORM backend (https://worm.example.invalid)"); },
  readLedgerLines() { throw new Error("example adapter"); },
  writeContentOnce(_hex, _text) { throw new Error("example adapter"); },
  readContentByHex(_hex) { throw new Error("example adapter"); },
});

// 2) WORM adapter for clinician gate records (two-op seam).
registerGateRecordSubstrate("worm-example", {
  appendLine(_line) { throw new Error("example adapter"); },
  readLines() { throw new Error("example adapter"); },
});

// 3) Secrets backend (e.g. AWS Secrets Manager / Vault). Refs look like
//    "aws-sm:heydoc/portal-token" and are resolved here at runtime.
registerSecretsBackend("aws-sm", (_name) => {
  throw new Error("example backend — resolve from your secrets manager (https://secrets.example.invalid)");
});

// 4) Then start the role:
// await import("../portal/server.js");
