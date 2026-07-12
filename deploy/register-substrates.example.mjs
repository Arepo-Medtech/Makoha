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
import { registerPppTttLedgerSubstrate } from "../verification/ppp-ttt/ledger.js";
import { registerWormAudit } from "../integration/audit-substrates/s3-object-lock.js";
import { registerSecretsBackend } from "../integration/secrets.js";
import { registerAwsSecretsManager } from "../integration/secrets-backends/aws-secrets-manager.js";

// 1) CONCRETE WORM: S3 Object Lock on ALL THREE medicolegal seams in one call —
//    the audit ledger (4-op), clinician gate records (2-op), and the PPP-TTT
//    triage ledger (2-op). Requires an Object-Lock-enabled bucket + a retention
//    period (COMPLIANCE mode); refuses if either is missing. AWS creds come from
//    the deploy host's IAM role, never the repo. Uncomment on an AWS deploy host
//    that has the AWS CLI installed, then select on all three seams:
//      HEYDOC_AUDIT_SUBSTRATE=s3-object-lock
//      HEYDOC_GATE_RECORD_SUBSTRATE=s3-object-lock
//      HEYDOC_PPP_TTT_SUBSTRATE=s3-object-lock
//
//    registerWormAudit({
//      bucket: process.env.HEYDOC_S3_OBJECT_LOCK_BUCKET,   // Object-Lock-enabled
//      region: "ap-southeast-2",
//      retention: process.env.HEYDOC_AUDIT_RETENTION,      // e.g. "P7Y" (minimum-keep)
//    });

// 1b) Non-AWS template: the same three seams wired to placeholder adapters that
//    throw by design (example.invalid), so copying this file unedited cannot go
//    live. Replace with your own WORM backend, or use registerWormAudit() above.
registerAuditSubstrate("worm-example", {
  appendLedgerLine(_line) { throw new Error("example adapter — implement against your WORM backend (https://worm.example.invalid)"); },
  readLedgerLines() { throw new Error("example adapter"); },
  writeContentOnce(_hex, _text) { throw new Error("example adapter"); },
  readContentByHex(_hex) { throw new Error("example adapter"); },
});
registerGateRecordSubstrate("worm-example", {
  appendLine(_line) { throw new Error("example adapter"); },
  readLines() { throw new Error("example adapter"); },
});
registerPppTttLedgerSubstrate("worm-example", {
  appendLine(_line) { throw new Error("example adapter"); },
  readLines() { throw new Error("example adapter"); },
});

// 3) Secrets backend — AWS Secrets Manager (operator choice, region
//    ap-southeast-2). This is CONCRETE and runnable on an AWS deploy host that
//    has `@aws-sdk/client-secrets-manager` installed and an IAM role with
//    secretsmanager:GetSecretValue on the named secrets. It fetches each named
//    secret ONCE at boot (async) into an in-memory cache, then registers a
//    synchronous `aws-sm` backend. AWAIT it before starting the server.
//
//    Refs then resolve as "aws-sm:<SecretId>", e.g. set on the staging deploy:
//      HEYDOC_MODE_DEFAULT=staging
//      HEYDOC_LLM_LIVE=1
//      HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key
await registerAwsSecretsManager({
  region: "ap-southeast-2",
  secretNames: [
    "aws.sm/heydoc/anthropic.key",   // → HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key
    // "aws.sm/heydoc/medgemma.key", // → HEYDOC_MEDGEMMA_KEY_REF=aws-sm:aws.sm/heydoc/medgemma.key (when MedGemma goes live)
    // "aws.sm/heydoc/portal.token", // → HEYDOC_PORTAL_TOKEN is read directly from env today; move to aws-sm if you prefer
  ],
});
//    (The generic placeholder backend below is left as a template for other
//    schemes/managers — it throws by design so copying it unedited can't go live.)
registerSecretsBackend("vault-example", (_name) => {
  throw new Error("example backend — resolve from your secrets manager (https://secrets.example.invalid)");
});

// 4) Then start the role:
// await import("../portal/server.js");
