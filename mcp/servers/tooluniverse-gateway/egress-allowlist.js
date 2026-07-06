/**
 * tooluniverse-gateway — egress allow-list (FLOW_PLAN H5, G2 blast-radius bound).
 *
 * Least-privilege: even a hypothetical executed tool must not reach an arbitrary host.
 * The gateway declares the ONLY upstream hosts ToolUniverse's scientific tools are
 * permitted to call, and a default-deny boundary function rejects anything else. This
 * bounds the blast radius of the whole library to its declared endpoints.
 *
 * Two enforcement points, one contract:
 *  - IN CODE (here, testable now): assertEgressAllowed(host) is default-deny; the
 *    gateway refuses to forward to a live endpoint whose host is not on the list.
 *  - AT DEPLOY (input-gated): the same host set is applied as the subprocess network
 *    policy (egress firewall / netns) so the Python process itself cannot dial out
 *    beyond the list. That is an operator control; this file is its source of truth.
 *
 * The list is CONSERVATIVE and explicit — adding a host is a plan-gated change, not a
 * runtime toggle. Hostnames only (no schemes/paths); matched case-insensitively with
 * a trailing-dot-FQDN + port + subdomain-spoof guard (mirrors the fhir-live sandbox
 * guard so the boundary can't be tricked by an equivalent host spelling).
 */

/**
 * Declared upstream hosts for ToolUniverse's tool library. These are the public
 * scientific data APIs ToolUniverse's tools call. Kept minimal; expand only under a
 * plan. NOT secrets — public API hostnames.
 */
export const DECLARED_EGRESS_HOSTS = [
  "api.fda.gov",
  "eutils.ncbi.nlm.nih.gov",
  "clinicaltrials.gov",
  "rest.uniprot.org",
  "www.ebi.ac.uk",
  "api.platform.opentargets.org",
  "rest.ensembl.org",
  "www.disgenet.org",
];

/** Normalise a host for comparison: strip a trailing dot, lowercase, drop any port. */
function normaliseHost(host) {
  let h = String(host == null ? "" : host).trim().toLowerCase();
  h = h.replace(/:\d+$/, ""); // strip :port
  h = h.replace(/\.$/, ""); // strip trailing-dot FQDN
  return h;
}

/**
 * Is `host` on the declared allow-list? EXACT host match only — a subdomain
 * ("evil.api.fda.gov") is NOT allowed unless explicitly listed (default-deny).
 * @param {string} host
 * @param {string[]} [allow]
 * @returns {boolean}
 */
export function isEgressAllowed(host, allow = DECLARED_EGRESS_HOSTS) {
  const h = normaliseHost(host);
  if (!h) return false;
  const set = new Set(allow.map(normaliseHost));
  return set.has(h);
}

/**
 * Fail-closed egress guard: throw unless `host` is on the allow-list. Returns the
 * normalised host when allowed (so it composes inline before a forward).
 * @param {string} host
 * @param {string[]} [allow]
 * @returns {string}
 */
export function assertEgressAllowed(host, allow = DECLARED_EGRESS_HOSTS) {
  if (!isEgressAllowed(host, allow)) {
    throw new Error(
      `EGRESS BOUNDARY (G2): host "${host}" is not on the tooluniverse-gateway egress allow-list. ` +
        `The gateway is bounded to ToolUniverse's declared upstreams (${DECLARED_EGRESS_HOSTS.join(", ")}); ` +
        `reaching any other host is refused (default-deny). Add a host only under a plan.`
    );
  }
  return normaliseHost(host);
}
