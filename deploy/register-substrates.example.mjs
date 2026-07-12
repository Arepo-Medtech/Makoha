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
import { registerSecretsBackend } from "../integration/secrets.js";
import { registerAwsSecretsManager } from "../integration/secrets-backends/aws-secrets-manager.js";
import { registerWormAudit } from "../integration/audit-substrates/s3-object-lock.js";

// 1) WORM substrate for ALL THREE medicolegal seams (audit ledger + clinician
//    gate records + PPP-TTT triage ledger) — AWS S3 Object Lock, COMPLIANCE mode,
//    7-year retention (§9 B1). CONCRETE and runnable on a deploy host that has the
//    AWS CLI installed and an IAM role with s3:PutObject / s3:PutObjectRetention /
//    s3:GetObject / s3:ListBucket on the bucket. The bucket MUST be created with
//    Object Lock (and versioning) ENABLED — the adapter sets per-object retention;
//    it cannot enable the feature. Registers "s3-object-lock" on all three seams;
//    select it with HEYDOC_AUDIT_SUBSTRATE=s3-object-lock,
//    HEYDOC_GATE_RECORD_SUBSTRATE=s3-object-lock, and
//    HEYDOC_PPP_TTT_SUBSTRATE=s3-object-lock.
//    AWAIT it before starting the server (the boot read caches are seeded here).
await registerWormAudit({
  bucket: "heydoc-medicolegal-audit",   // ← your Object-Lock-enabled bucket
  region: "ap-southeast-2",
  retentionYears: 7,                     // operator-set; no period is defaulted in code
  mode: "COMPLIANCE",                    // immutable even to root until retain date
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
