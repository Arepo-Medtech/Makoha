/**
 * aws-secrets-manager — the AWS Secrets Manager backend for the fail-closed
 * secrets seam (LIVE_PLAN L2/§9 item B3; operator chose AWS SM, region
 * ap-southeast-2).
 *
 * WHY FETCH-AT-BOOT, READ-SYNCHRONOUSLY: integration/secrets.js resolves
 * SYNCHRONOUSLY — `getSecret(ref)` returns a string, and callers use it inline
 * (e.g. the Claude client constructor: `apiKey: getSecret(ref)`). AWS SM's
 * GetSecretValue is ASYNC. So this module fetches each named secret ONCE at
 * deploy boot (async) into an in-memory cache, then registers a SYNCHRONOUS
 * `aws-sm` backend that reads that cache. Standard pattern: pull secrets at
 * startup, use them synchronously thereafter. Rotation → a rolling restart
 * (a TTL refresh is a documented later option).
 *
 * WHY THE AWS SDK IS A DEPLOY-TIME DEPENDENCY (dynamic import), NOT A REPO
 * DEPENDENCY: the repo core is cloud-agnostic and mock-by-default. Making
 * `@aws-sdk/client-secrets-manager` a package.json dependency would pull AWS
 * into every dev/CI/mock install and expand the supply chain for a code path
 * that never runs outside an AWS deploy. Instead the AWS deploy image installs
 * it (`npm install @aws-sdk/client-secrets-manager`), and this module
 * dynamically imports it only when the backend is actually registered. Absent
 * SDK → a clear, actionable error, never a silent failure.
 *
 * SECRET DISCIPLINE (charter <security_and_secrets>): the secret VALUE lives
 * only in the in-memory cache on the deploy host and flows only to the
 * getSecret() caller (the adapter). It is NEVER logged, never returned to the
 * agent, never written to disk. This module handles only the secret NAME/ARN
 * (an identifier, not a secret) and the region.
 */
import { registerSecretsBackend } from "../secrets.js";

/**
 * Build the real AWS fetcher by dynamically importing the SDK v3. Deploy-only:
 * throws an actionable error if the SDK is not installed on the host.
 * @param {string} region
 * @returns {(secretId: string) => Promise<string|undefined>}
 */
async function awsFetcher(region) {
  let mod;
  try {
    mod = await import("@aws-sdk/client-secrets-manager");
  } catch {
    throw new Error(
      "aws-sm backend requires @aws-sdk/client-secrets-manager on the deploy host — run " +
      "`npm install @aws-sdk/client-secrets-manager` in the AWS deploy image. It is intentionally NOT a repo " +
      "dependency (the core is cloud-agnostic and mock-by-default)."
    );
  }
  const { SecretsManagerClient, GetSecretValueCommand } = mod;
  const client = new SecretsManagerClient({ region }); // creds via the default AWS chain (instance role / env)
  return async (secretId) => {
    const resp = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    return resp && resp.SecretString;
  };
}

/**
 * Register the `aws-sm` secrets backend, preloading the named secrets from AWS
 * Secrets Manager at boot. Call this from the deploy bootstrap BEFORE starting
 * the server (it is async; await it).
 *
 * After registration, refs of the form `aws-sm:<SecretId>` resolve through the
 * fail-closed seam (`getSecret`), e.g.
 *   HEYDOC_LLM_KEY_REF = "aws-sm:aws.sm/heydoc/anthropic.key"
 * The `<SecretId>` is everything after the first colon — passed to AWS verbatim,
 * so slashes/dots in the secret name are preserved.
 *
 * @param {{ region: string, secretNames: string[], fetchSecret?: Function }} opts
 *   region       — AWS region (e.g. "ap-southeast-2").
 *   secretNames  — the AWS SecretIds to preload (the <SecretId> part of each ref).
 *   fetchSecret  — test/override: async (secretId) => value. When omitted, the
 *                  real AWS SDK fetcher is used (deploy).
 * @returns {Promise<{ registered: "aws-sm", count: number }>}
 * @throws if a named secret returns no SecretString (fail-closed at boot —
 *   never register a backend that will hand back a blank credential).
 */
export async function registerAwsSecretsManager({ region, secretNames = [], fetchSecret } = {}) {
  if (!region || typeof region !== "string") throw new Error("registerAwsSecretsManager: `region` is required (e.g. \"ap-southeast-2\")");
  if (!Array.isArray(secretNames) || secretNames.length === 0) throw new Error("registerAwsSecretsManager: `secretNames` must be a non-empty array of AWS SecretIds to preload");

  const fetch = fetchSecret || (await awsFetcher(region));
  const cache = new Map();
  for (const name of secretNames) {
    const value = await fetch(name);
    // Fail-closed at boot: an empty/missing SecretString is a misconfiguration,
    // not something to paper over with a blank credential later.
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`aws-sm: secret "${name}" returned no SecretString (region ${region}) — check the SecretId, the region, and the deploy role's secretsmanager:GetSecretValue permission`);
    }
    cache.set(name, value);
  }

  // The registered backend is SYNCHRONOUS: a cache read. Unknown names return
  // undefined → the seam refuses (fail-closed), never a blank credential.
  registerSecretsBackend("aws-sm", (name) => cache.get(name));
  return { registered: "aws-sm", count: cache.size };
}
