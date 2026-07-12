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
 * Requires @aws-sdk/client-secrets-manager in the image (the Dockerfile's
 * INSTALL_AWS_SM build arg adds it; the module dynamic-imports it). The secret
 * VALUE is fetched into memory and never logged — see the aws-sm backend.
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

const service = String(process.env.HEYDOC_SERVICE || "portal").trim().toLowerCase();
if (service === "consult") {
  await import("../patient/consult-server.js");
} else {
  await import("../portal/server.js");
}
