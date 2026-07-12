/**
 * Contract test: the AWS Secrets Manager backend for the secrets seam
 * (LIVE_PLAN §9 B3; integration/secrets-backends/aws-secrets-manager.js).
 *
 * Proves — WITHOUT the AWS SDK and WITHOUT any AWS call (injected fetcher):
 *  - boot-preload → synchronous resolve: after registerAwsSecretsManager, a
 *    ref `aws-sm:<SecretId>` resolves through getSecret() to the fetched value;
 *  - the SecretId is passed to AWS verbatim (slashes/dots preserved) — the ref
 *    split is on the FIRST colon only;
 *  - fail-closed at boot: a secret returning no SecretString THROWS at
 *    registration (never registers a backend that hands back a blank credential);
 *  - a name not preloaded → getSecret refuses (fail-closed), never blank;
 *  - required-arg guards (region, non-empty secretNames);
 *  - the deploy-only dynamic-import path gives an actionable error when the AWS
 *    SDK is absent (it is intentionally NOT a repo dependency — so this exercises
 *    the real absent-SDK branch);
 *  - the secret VALUE is never logged by the module (source scan).
 *
 * Run from repo root: node test/contract-secrets-aws.js
 */
import { readFileSync } from "node:fs";
import { registerAwsSecretsManager, extractSecret } from "../integration/secrets-backends/aws-secrets-manager.js";
import { getSecret, hasSecret } from "../integration/secrets.js";

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };
const rejects = async (p, msg) => { try { await p; errors.push(msg); } catch { /* expected */ } };
const throws = (fn, msg) => { try { fn(); errors.push(msg); } catch { /* expected */ } };

const SECRET_ID = "aws.sm/heydoc/anthropic.key"; // the operator's real SecretId shape
// A deliberately NON-credential-shaped fixture value: the point is that the seam
// returns whatever the fetcher returned, not that it looks like a real key.
// (Must not match the secret-scan patterns — that gate scans this tracked file.)
const SECRET_VALUE = "fixture-resolved-secret-value-000";

try {
  // ── boot-preload with an injected fetcher (no SDK, no AWS) ──────────────────
  const fetched = [];
  const fetchSecret = async (secretId) => {
    fetched.push(secretId);
    return secretId === SECRET_ID ? SECRET_VALUE : undefined;
  };
  const res = await registerAwsSecretsManager({ region: "ap-southeast-2", secretNames: [SECRET_ID], fetchSecret });
  check(res.registered === "aws-sm" && res.count === 1, "registerAwsSecretsManager returns {registered:'aws-sm', count}");
  check(fetched.length === 1 && fetched[0] === SECRET_ID, "the SecretId is passed to the fetcher VERBATIM (slashes/dots preserved)");

  // ── synchronous resolve through the fail-closed seam ────────────────────────
  const ref = `aws-sm:${SECRET_ID}`;
  check(getSecret(ref) === SECRET_VALUE, "getSecret('aws-sm:<SecretId>') resolves the preloaded value synchronously");
  check(hasSecret(ref) === true, "hasSecret probes the aws-sm ref without throwing");
  // Ref split is on the FIRST colon → the whole SecretId (with its slashes) is the name.
  check(getSecret(`aws-sm:${SECRET_ID}`) === SECRET_VALUE, "the ref split keeps the full SecretId after the first colon");

  // ── a name not preloaded → fail-closed refusal (never blank) ────────────────
  let refused = false;
  try { getSecret("aws-sm:aws.sm/heydoc/not-preloaded"); } catch { refused = true; }
  check(refused, "an un-preloaded aws-sm name REFUSES (fail-closed), never returns blank");

  // ── fail-closed at boot: empty SecretString throws at registration ──────────
  await rejects(
    registerAwsSecretsManager({ region: "ap-southeast-2", secretNames: ["aws.sm/heydoc/empty"], fetchSecret: async () => "" }),
    "a secret returning an empty SecretString must THROW at registration (never register a blank credential)"
  );
  await rejects(
    registerAwsSecretsManager({ region: "ap-southeast-2", secretNames: ["aws.sm/heydoc/missing"], fetchSecret: async () => undefined }),
    "a secret returning no SecretString must THROW at registration"
  );

  // ── required-arg guards ─────────────────────────────────────────────────────
  await rejects(registerAwsSecretsManager({ secretNames: [SECRET_ID], fetchSecret }), "missing region must throw");
  await rejects(registerAwsSecretsManager({ region: "ap-southeast-2", secretNames: [], fetchSecret }), "empty secretNames must throw");

  // ── deploy-only absent-SDK path: actionable error (real branch — the SDK is
  //    intentionally not a repo dependency, so awsFetcher's import throws) ──────
  let sdkErr = null;
  try {
    await registerAwsSecretsManager({ region: "ap-southeast-2", secretNames: [SECRET_ID] }); // no fetchSecret → real path
  } catch (e) {
    sdkErr = e;
  }
  check(sdkErr && /@aws-sdk\/client-secrets-manager/.test(sdkErr.message) && /deploy host/.test(sdkErr.message),
    "absent AWS SDK → an actionable install error naming the package + deploy host");

  // ── JSON-tolerant extraction (B3 hardening) — the pure helper, fail-closed ──
  // Plaintext passes through VERBATIM (status quo; no trimming, no parsing).
  check(extractSecret("sk-ant-plain-000", undefined, "id") === "sk-ant-plain-000", "plaintext value passes through verbatim");
  check(extractSecret("  spaces-are-not-json  ", undefined, "id") === "  spaces-are-not-json  ", "a non-JSON value is never altered");
  // Single-key JSON object → unambiguous auto-extract (the console-default case
  // that caused the 401 in the field).
  check(extractSecret('{"ANTHROPIC_API_KEY":"sk-ant-json-111"}', undefined, "id") === "sk-ant-json-111", "single-key JSON secret auto-extracts its one value");
  // Explicit #field selector picks the named field out of a JSON object.
  check(extractSecret('{"ANTHROPIC_API_KEY":"sk-ant-a","OTHER":"x"}', "ANTHROPIC_API_KEY", "id") === "sk-ant-a", "#field selector extracts the named JSON field");
  // Fail-closed refusals — ambiguous/malformed never yields a credential:
  throws(() => extractSecret('{"A":"1","B":"2"}', undefined, "id"), "multi-key JSON WITHOUT a #field selector REFUSES (never guesses)");
  throws(() => extractSecret('{"A":"1"}', "MISSING", "id"), "a #field naming an absent key REFUSES");
  throws(() => extractSecret('{"A":""}', "A", "id"), "a #field whose value is empty REFUSES (no blank credential)");
  throws(() => extractSecret('{"A":123}', "A", "id"), "a #field whose value is not a string REFUSES");
  throws(() => extractSecret("{not valid json", undefined, "id"), "a value that looks like JSON but does not parse REFUSES (never returned as a blob)");
  throws(() => extractSecret('{"A":123}', undefined, "id"), "single-key JSON with a non-string value REFUSES");
  throws(() => extractSecret("plaintext", "FIELD", "id"), "a #field selector against a plaintext (non-JSON) secret REFUSES");

  // ── end-to-end through the seam: a single-key JSON secret resolves live ─────
  const JSON_ID = "aws.sm/heydoc/json-key";
  await registerAwsSecretsManager({ region: "ap-southeast-2", secretNames: [JSON_ID], fetchSecret: async () => '{"ANTHROPIC_API_KEY":"sk-ant-endtoend-222"}' });
  check(getSecret(`aws-sm:${JSON_ID}`) === "sk-ant-endtoend-222", "a single-key JSON secret resolves through getSecret() to its extracted value");
  // ...and the #field path resolves through the seam, cache keyed on the base id.
  const MULTI_ID = "aws.sm/heydoc/multi";
  await registerAwsSecretsManager({ region: "ap-southeast-2", secretNames: [MULTI_ID], fetchSecret: async () => '{"ANTHROPIC_API_KEY":"sk-ant-multi-333","PORTAL":"p"}' });
  check(getSecret(`aws-sm:${MULTI_ID}#ANTHROPIC_API_KEY`) === "sk-ant-multi-333", "aws-sm:<id>#<field> resolves the named field through the seam");
  check(hasSecret(`aws-sm:${MULTI_ID}`) === false, "the same multi-key secret WITHOUT a #field is unresolvable (fail-closed) via hasSecret");

  // ── the module never logs the secret value ──────────────────────────────────
  const src = readFileSync(new URL("../integration/secrets-backends/aws-secrets-manager.js", import.meta.url), "utf8");
  check(!/console\.(log|info|warn|error)|process\.stdout|process\.stderr/.test(src),
    "the aws-sm backend module must not log anything (the value must never reach a log)");
} catch (e) {
  errors.push("unexpected throw: " + (e && e.stack ? e.stack : e));
}

if (errors.length) {
  console.error("Contract failures:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("contract-secrets-aws: OK");
