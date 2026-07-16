/**
 * contract-cds-token — the AU_OSS_CDS client's bearer token for the deployed shim.
 *
 * The deployed gateway's shim enforces an optional shared token (SHIM_TOKEN, gateway repo);
 * this pins the CLIENT half of that contract:
 *   1. opts.token → sent as `Authorization: Bearer <token>` on /pharm-check;
 *   2. env fallback — queryCds threads HEYDOC_PHARM_CDS_TOKEN from its env param;
 *   3. no token anywhere → NO Authorization header (local containers stay open);
 *   4. a 401 from the shim is a TRANSPORT failure → BLOCKED_NO_PROOF, like any other
 *      gateway failure. The token is an exposure control for a public staging URL,
 *      never a safety boundary — the fail-closed path must not care WHY the gateway
 *      refused.
 */
import { queryOpenCds } from "../mcp/servers/pharmacology/cds-adapter/opencds-client.js";
import { queryCds } from "../mcp/servers/pharmacology/cds-adapter/index.js";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) return console.log(`  ok: ${name}`);
  failures++;
  console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
};

const INTENT = { drug: "paracetamol", mode: "mock" };
const FACTS = { patient_age_years: 40 };

/** Fake shim: captures headers, answers whatever `respond` returns. */
function fakeShim(respond) {
  const seen = { headers: null };
  const fetchImpl = async (url, init) => {
    seen.headers = init.headers || {};
    return respond(seen);
  };
  return { seen, fetchImpl };
}
const ok401 = () => ({ ok: false, status: 401 });

// 1. opts.token → Authorization: Bearer <token> reaches the wire.
{
  const { seen, fetchImpl } = fakeShim(ok401);
  await queryOpenCds(INTENT, FACTS, { endpoint: "http://x", fetchImpl, token: "tok-abc" });
  check("opts.token is sent as a Bearer header", seen.headers.authorization === "Bearer tok-abc",
    `got ${JSON.stringify(seen.headers.authorization)}`);
}

// 2. env fallback through queryCds({ env }).
{
  const { seen, fetchImpl } = fakeShim(ok401);
  const env = { HEYDOC_PHARM_CDS: "AU_OSS_CDS", HEYDOC_PHARM_CDS_ENDPOINT: "http://x", HEYDOC_PHARM_CDS_TOKEN: "tok-env" };
  await queryCds(INTENT, { env, resolvedFacts: FACTS, fetchImpl });
  check("queryCds threads HEYDOC_PHARM_CDS_TOKEN from its env param", seen.headers.authorization === "Bearer tok-env",
    `got ${JSON.stringify(seen.headers.authorization)}`);
}

// 3. no token anywhere → no Authorization header at all.
{
  const { seen, fetchImpl } = fakeShim(ok401);
  const env = { HEYDOC_PHARM_CDS: "AU_OSS_CDS", HEYDOC_PHARM_CDS_ENDPOINT: "http://x" };
  const hadProcessToken = "HEYDOC_PHARM_CDS_TOKEN" in process.env;
  const saved = process.env.HEYDOC_PHARM_CDS_TOKEN;
  delete process.env.HEYDOC_PHARM_CDS_TOKEN;
  try {
    await queryCds(INTENT, { env, resolvedFacts: FACTS, fetchImpl });
    check("no token configured → no Authorization header", !("authorization" in seen.headers),
      `got ${JSON.stringify(seen.headers.authorization)}`);
  } finally {
    if (hadProcessToken) process.env.HEYDOC_PHARM_CDS_TOKEN = saved;
  }
}

// 4. a 401 refusal is fail-closed transport: BLOCKED_NO_PROOF, never content.
{
  const { fetchImpl } = fakeShim(ok401);
  const r = await queryOpenCds(INTENT, FACTS, { endpoint: "http://x", fetchImpl, token: "wrong" });
  check("shim 401 → BLOCKED_NO_PROOF", r.verdict === "BLOCKED_NO_PROOF", `got ${r.verdict}`);
  check("shim 401 → no dose guidance", r.dose_guidance === null, `got ${JSON.stringify(r.dose_guidance)}`);
}

if (failures) {
  console.error(`contract-cds-token FAIL (${failures})`);
  process.exit(1);
}
console.log("contract-cds-token OK (opts token sent · env token threaded · absent token sends nothing · 401 is fail-closed transport)");
