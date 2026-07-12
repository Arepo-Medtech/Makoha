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
 *
 * JSON-TOLERANT RESOLUTION (LIVE_PLAN B3 hardening): AWS Secrets Manager's
 * console default stores a secret as a JSON key/value object
 * (`{"ANTHROPIC_API_KEY":"sk-ant-…"}`), not a raw string. Handing that whole
 * blob to a consumer as an API key yields `401 invalid x-api-key`. So the ref
 * grammar gains an OPTIONAL field selector — `aws-sm:<SecretId>#<field>` — and
 * the resolver extracts a single value. `#` is a safe delimiter: AWS secret
 * names cannot contain it. FAIL-CLOSED throughout — a plaintext secret is
 * returned verbatim (no behaviour change), but an ambiguous JSON secret (zero
 * or several keys, missing/empty/non-string field, malformed JSON) REFUSES
 * rather than guess or return the raw blob. Error messages carry the ref/field
 * only — never the value.
 */
import { registerSecretsBackend } from "../secrets.js";

/** Base SecretId for a resolver name that may carry a `#field` selector. */
function baseSecretId(name) {
  const hash = name.indexOf("#");
  return hash === -1 ? name : name.slice(0, hash);
}

/**
 * Extract a single credential string from a cached SecretString, applying the
 * JSON-tolerant, fail-closed policy above.
 *
 * @param {string} raw    the cached SecretString (plaintext or JSON object)
 * @param {string} [field] the `#field` selector from the ref, if any
 * @param {string} [refLabel] the SecretId, for actionable errors (never the value)
 * @returns {string} the resolved credential
 * @throws (fail-closed) on any ambiguous/malformed JSON case — never returns a
 *   raw JSON blob and never guesses among multiple fields.
 */
export function extractSecret(raw, field, refLabel = "<secret>") {
  const looksJson = /^\s*\{/.test(raw);

  // A `#field` selector was given: the secret MUST be a JSON object and MUST
  // carry that field as a non-empty string. Anything else refuses.
  if (field) {
    let obj;
    try { obj = JSON.parse(raw); } catch { obj = null; }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      throw new Error(`aws-sm: secret "${refLabel}" is not a JSON object, so field "#${field}" cannot be extracted — store plaintext, or store JSON to use a #field selector`);
    }
    const v = Object.prototype.hasOwnProperty.call(obj, field) ? obj[field] : undefined;
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`aws-sm: JSON secret "${refLabel}" has no non-empty string field "#${field}" — check the field name against the stored keys`);
    }
    return v;
  }

  // No selector. Plaintext passes through VERBATIM (status quo — the value the
  // fetcher returned is the credential). Only a JSON-looking value is parsed.
  if (!looksJson) return raw;

  let obj;
  try { obj = JSON.parse(raw); } catch { obj = null; }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    // Starts with `{` but is not a clean JSON object: refuse rather than hand
    // back a blob that looks like JSON. (A real credential never starts with `{`.)
    throw new Error(`aws-sm: secret "${refLabel}" looks like JSON but did not parse to an object — store a plaintext credential, or valid JSON with a #field selector`);
  }
  const keys = Object.keys(obj);
  if (keys.length === 1 && typeof obj[keys[0]] === "string" && obj[keys[0]].length > 0) {
    // Single-key JSON: unambiguous — extract it (the common console default).
    return obj[keys[0]];
  }
  // Zero keys, several keys, or a single non-string/empty value: ambiguous.
  // Fail-closed — the operator must say which field via a #field selector.
  throw new Error(`aws-sm: JSON secret "${refLabel}" has ${keys.length} field(s); cannot pick one unambiguously — select with a ref of the form aws-sm:${refLabel}#<field>`);
}

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
    // Preload keys on the BASE SecretId — a `#field` selector (if an operator
    // lists one) is a resolution-time concern, not part of the AWS name.
    const secretId = baseSecretId(name);
    const value = await fetch(secretId);
    // Fail-closed at boot: an empty/missing SecretString is a misconfiguration,
    // not something to paper over with a blank credential later.
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`aws-sm: secret "${secretId}" returned no SecretString (region ${region}) — check the SecretId, the region, and the deploy role's secretsmanager:GetSecretValue permission`);
    }
    cache.set(secretId, value);
  }

  // The registered backend is SYNCHRONOUS: a cache read + JSON-tolerant
  // extraction. The name may carry a `#field` selector; the cache is keyed by
  // the base SecretId. An unknown SecretId returns undefined → the seam refuses
  // (fail-closed), never a blank credential; an ambiguous JSON secret THROWS
  // (fail-closed) via extractSecret rather than hand back a raw blob.
  registerSecretsBackend("aws-sm", (name) => {
    const secretId = baseSecretId(name);
    const raw = cache.get(secretId);
    if (raw === undefined) return undefined; // un-preloaded → seam refuses
    const hash = name.indexOf("#");
    const field = hash === -1 ? undefined : name.slice(hash + 1);
    return extractSecret(raw, field, secretId);
  });
  return { registered: "aws-sm", count: cache.size };
}
