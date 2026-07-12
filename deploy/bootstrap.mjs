/**
 * bootstrap — the concrete AWS deploy entrypoint (LIVE_PLAN §9 B2).
 *
 * The container's default CMD (`node portal/server.js`) starts a server WITHOUT
 * registering any non-env secrets backend, so an `aws-sm:` ref would refuse.
 * On AWS this bootstrap runs FIRST: it registers the AWS Secrets Manager
 * backend (fetching the named secrets at boot into the fail-closed seam), THEN
 * imports the chosen server. Set it as the App Runner StartCommand:
 *   node deploy/bootstrap.mjs
 *
 * Config (env, set by the App Runner service — see deploy/apprunner-create.sh):
 *   AWS_REGION               region for Secrets Manager (default ap-southeast-2)
 *   HEYDOC_AWS_SECRET_NAMES  comma-separated SecretIds to preload into aws-sm
 *                            (default "aws.sm/heydoc/anthropic.key")
 *   HEYDOC_SERVICE           "portal" (default) | "consult" — which surface to run
 *
 *   # WORM audit substrate (§9 B1 / R-39), registered when selected:
 *   HEYDOC_AUDIT_SUBSTRATE       set to "s3-object-lock" to store the medicolegal
 *                                ledger + gate records in S3 Object Lock
 *   HEYDOC_GATE_RECORD_SUBSTRATE set to "s3-object-lock" likewise (usually both)
 *   HEYDOC_WORM_BUCKET           the Object-Lock-enabled S3 bucket
 *   HEYDOC_WORM_RETENTION_YEARS  retention period, e.g. 7 (REQUIRED — not defaulted)
 *   HEYDOC_WORM_MODE             "COMPLIANCE" (default) | "GOVERNANCE"
 *
 * Requires @aws-sdk/client-secrets-manager in the image (the Dockerfile's
 * INSTALL_AWS_SM build arg adds it; the module dynamic-imports it). The WORM
 * substrate additionally requires the AWS CLI (INSTALL_AWS_S3 build arg). The
 * secret VALUE is fetched into memory and never logged — see the aws-sm backend.
 */
import { registerAwsSecretsManager } from "../integration/secrets-backends/aws-secrets-manager.js";

const region = process.env.AWS_REGION || "ap-southeast-2";
const secretNames = String(process.env.HEYDOC_AWS_SECRET_NAMES || "aws.sm/heydoc/anthropic.key")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (secretNames.length) {
  // Fail-closed at boot: a missing/empty secret throws here and the container
  // never starts serving — a misconfigured deploy fails loud, not silently.
  await registerAwsSecretsManager({ region, secretNames });
}

// WORM audit substrate (§9 B1 / R-39). Registered at boot when either medicolegal
// seam selects "s3-object-lock", BEFORE the server starts — so the very first
// audit write lands on the immutable backend, never on the local (non-WORM) one.
// Fail-closed at boot: a missing bucket / retention throws here and the container
// never serves. The retention PERIOD is operator-set (surface, don't decide) — no
// default is encoded, so an unset HEYDOC_WORM_RETENTION_YEARS fails loud.
const wormSelected = [process.env.HEYDOC_AUDIT_SUBSTRATE, process.env.HEYDOC_GATE_RECORD_SUBSTRATE]
  .map((v) => String(v || "").trim())
  .includes("s3-object-lock");
if (wormSelected) {
  const { registerWormAudit } = await import("../integration/audit-substrates/s3-object-lock.js");
  const bucket = String(process.env.HEYDOC_WORM_BUCKET || "").trim();
  const retentionYears = Number(process.env.HEYDOC_WORM_RETENTION_YEARS);
  const mode = String(process.env.HEYDOC_WORM_MODE || "COMPLIANCE").trim();
  await registerWormAudit({ bucket, region, retentionYears, mode });
}

const service = String(process.env.HEYDOC_SERVICE || "portal").trim().toLowerCase();
if (service === "consult") {
  await import("../patient/consult-server.js");
} else {
  await import("../portal/server.js");
}
