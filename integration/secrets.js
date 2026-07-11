/**
 * secrets — fail-closed secrets-manager resolver seam (LIVE_PLAN L2, R-36).
 *
 * The charter (<security_and_secrets>) forbids credentials in the repo, in
 * commits, or in chat; env templates carry `example.invalid` placeholders and
 * real values are injected at deploy from a secrets manager. This module is
 * the single seam that resolution goes through, so every consumer (LLM
 * adapter, terminology live, pharmacology vendor, FHIR broker, portal auth)
 * gets the same fail-closed behaviour:
 *
 *  - a secret is addressed by a REF, never a value: "<scheme>:<name>"
 *    (e.g. "env:HEYDOC_PORTAL_TOKEN", "aws-sm:heydoc/pharm-vendor-key");
 *  - the only built-in backend is "env" (process.env) — the dev/CI default;
 *  - any other scheme must be registered at deploy via
 *    registerSecretsBackend(); an UNREGISTERED scheme REFUSES (throws) —
 *    a misconfigured deployment must never silently fall back to env or to
 *    an empty credential;
 *  - a resolved value that is missing/empty REFUSES (no blank credentials);
 *  - a resolved value containing "example.invalid" REFUSES — a template
 *    placeholder is never a real secret (mock-as-live discipline applied to
 *    credentials);
 *  - values are NEVER logged, and error messages carry the REF only.
 */

const backends = new Map([
  // Built-in dev/CI backend: resolve from the process environment.
  ["env", (name) => process.env[name]],
]);

/**
 * Register a deploy-time secrets backend (e.g. AWS Secrets Manager, Vault).
 * @param {string} scheme - the ref prefix this backend serves (e.g. "aws-sm")
 * @param {(name: string) => string|undefined} resolver
 */
export function registerSecretsBackend(scheme, resolver) {
  if (typeof scheme !== "string" || !scheme.trim()) throw new Error("registerSecretsBackend: scheme must be a non-empty string");
  if (typeof resolver !== "function") throw new Error(`registerSecretsBackend("${scheme}"): resolver must be a function`);
  backends.set(scheme.trim(), resolver);
}

/**
 * Resolve a secret ref. Throws (fail-closed) on: malformed ref, unregistered
 * scheme, missing/empty value, or a template placeholder value.
 * @param {string} ref - "<scheme>:<name>"
 * @returns {string} the secret value (do not log it)
 */
export function getSecret(ref) {
  if (typeof ref !== "string" || !ref.includes(":")) {
    throw new Error(`getSecret: ref must be "<scheme>:<name>" (got ${typeof ref === "string" ? `"${ref}"` : typeof ref})`);
  }
  const idx = ref.indexOf(":");
  const scheme = ref.slice(0, idx).trim();
  const name = ref.slice(idx + 1).trim();
  if (!scheme || !name) throw new Error(`getSecret: malformed ref "${ref}"`);

  const backend = backends.get(scheme);
  if (!backend) {
    // FAIL-CLOSED: an unregistered scheme means the deployment did not wire
    // its secrets manager — refuse, never fall back.
    throw new Error(`getSecret: no secrets backend registered for scheme "${scheme}" — register one at deploy via registerSecretsBackend() (ref: "${ref}")`);
  }
  const value = backend(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`getSecret: secret "${ref}" is missing or empty — refusing to return a blank credential`);
  }
  if (value.includes("example.invalid")) {
    // A template placeholder reached a live resolution path — refuse.
    throw new Error(`getSecret: secret "${ref}" resolves to a template placeholder (example.invalid) — a placeholder is never a real credential`);
  }
  return value;
}

/** Non-throwing probe: is this ref resolvable to a real (non-placeholder) value? */
export function hasSecret(ref) {
  try {
    getSecret(ref);
    return true;
  } catch {
    return false;
  }
}
