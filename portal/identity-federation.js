/**
 * identity-federation — verified clinician identity for the Verification Portal
 * (FL-42; the "authenticated clinician identity federation" half of
 * `clinician-verification-portal-unbuilt`).
 *
 * THE GAP THIS CLOSES: before this, the portal authorised with a single shared
 * bearer token and the clinician_id / signature_ref on a gate record were
 * FREE-TEXT fields the reviewer typed. A token-holder could record a decision
 * under any name with any signature — the medicolegal trail's identity was a
 * self-asserted claim. This module makes the attesting clinician a VERIFIED
 * identity resolved from a trusted provider, and binds the signature to WHO
 * signed and WHAT exact bytes.
 *
 * SEAM PATTERN (mirrors the audit/secrets substrate seams): identity providers
 * are pluggable via registerIdentityProvider(). The built-in `dev` provider
 * yields a synthetic identity for development and is NEVER accepted as a live
 * federated identity. A production OIDC / SAML / AHPRA provider is registered at
 * deploy behind the same contract — that live connect is INPUT-GATED on the
 * operator's protocol/vendor choice + credentials (like the pharmacology vendor
 * and the aws-sm secrets backend), and is not decided here.
 *
 * FAIL-CLOSED: in a live-enforced context (mode-normaliser), resolving identity
 * through the `dev` provider — or through an unregistered provider name —
 * REFUSES. A dev/mock identity can never stand in for a verified clinician on a
 * live path; the portal must have a real federated provider registered. This is
 * the same posture as the WORM substrate refusing a non-local unregistered
 * backend.
 *
 * The verified identity NEVER flows into the LLM context packet — it rides the
 * medicolegal gate-record trail only (portal/gate-record-store.js entry
 * envelope), exactly like bundle_sha256.
 */
import { sha256Prefixed } from "../verification/hash.js";

/** The one provider name that is intrinsically development-only. */
export const DEV_PROVIDER = "dev";

/**
 * Registry of identity providers. Each adapter implements
 *   resolve(req) -> { subject, ahpra_registration, display_name } | null
 * where `req` is the incoming HTTP request (headers carry the provider's token).
 * A provider returns null when it cannot verify an identity (→ fail-closed).
 */
const providers = new Map([
  [
    DEV_PROVIDER,
    {
      // Development provider: a synthetic identity from an explicit dev header.
      // Deterministic, clearly-mock, and gated out of any live-enforced context
      // by resolveClinicianIdentity(). No network, no real IdP.
      resolve(req) {
        const raw = headerOf(req, "x-heydoc-dev-clinician");
        if (!raw) return null; // no dev identity asserted → refuse (fail-closed)
        // Accept either a bare id ("pharm-KL") or a JSON object with details.
        let subject = raw, ahpra = null, name = null;
        if (raw.trim().startsWith("{")) {
          try {
            const o = JSON.parse(raw);
            subject = o.subject || o.id || o.clinician_id;
            ahpra = o.ahpra_registration || o.ahpra || null;
            name = o.display_name || o.name || null;
          } catch {
            return null; // malformed dev header → refuse
          }
        }
        if (!subject || typeof subject !== "string") return null;
        return {
          subject,
          ahpra_registration: ahpra || `DEV-AHPRA-${subject}`,
          display_name: name || `Dev Clinician ${subject}`,
        };
      },
    },
  ],
]);

/** Case-insensitive header read that tolerates node's lower-cased header map. */
function headerOf(req, name) {
  const h = (req && req.headers) || {};
  const v = h[name] ?? h[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v || null;
}

/**
 * Register a production identity provider (OIDC / SAML / AHPRA) at deploy.
 * The adapter MUST validate the caller's credential itself (this module does not
 * trust an unvalidated token) and return the verified subject, or null.
 */
export function registerIdentityProvider(name, adapter) {
  if (name === DEV_PROVIDER) throw new Error(`identity-federation: "${DEV_PROVIDER}" is a reserved development provider and cannot be overridden`);
  if (typeof (adapter || {}).resolve !== "function") throw new Error(`identity-federation: provider "${name}" must implement resolve(req)`);
  providers.set(name, adapter);
}

/** The active provider name (HEYDOC_PORTAL_IDP; default dev). */
export function activeProviderName() {
  return (process.env.HEYDOC_PORTAL_IDP || DEV_PROVIDER).trim() || DEV_PROVIDER;
}

/**
 * Resolve the verified clinician identity for a request. FAIL-CLOSED on every
 * ambiguity: unregistered provider, dev provider in a live context, or a
 * provider that cannot verify → { verified:false, reason }.
 *
 * @param {object} req - incoming HTTP request (headers carry the IdP credential)
 * @param {{ enforce_live: boolean, context_mode?: string }} mode - normaliseMode() result
 * @returns {{ verified:true, clinician_id, ahpra_registration, display_name, idp, session_id }
 *          | { verified:false, reason:string }}
 */
export function resolveClinicianIdentity(req, mode = {}) {
  const idp = activeProviderName();
  const provider = providers.get(idp);
  if (!provider) {
    return { verified: false, reason: `identity provider "${idp}" is not registered — register a federated provider at deploy (register no dev fallback on a live path)` };
  }
  // A dev/mock identity is never a live federated identity.
  if (mode.enforce_live && idp === DEV_PROVIDER) {
    return { verified: false, reason: "live-enforced portal refuses the dev identity provider — a real clinician-identity federation (OIDC/SAML/AHPRA) must be registered (HEYDOC_PORTAL_IDP) before a live path" };
  }
  let resolved;
  try {
    resolved = provider.resolve(req);
  } catch (err) {
    return { verified: false, reason: `identity provider "${idp}" errored while verifying (${err && err.message ? err.message.slice(0, 120) : "unknown"}) — refusing` };
  }
  if (!resolved || !resolved.subject) {
    return { verified: false, reason: `identity provider "${idp}" could not verify a clinician identity for this request` };
  }
  // A stable per-verification session id (deterministic from subject+idp — no
  // clock/random here; it identifies the verified principal, not the moment).
  const session_id = sha256Prefixed(`${idp}|${resolved.subject}`).slice(7, 27);
  return {
    verified: true,
    clinician_id: resolved.subject,
    ahpra_registration: resolved.ahpra_registration || null,
    display_name: resolved.display_name || null,
    idp,
    session_id,
  };
}

/**
 * Bind a signature reference to WHO signed and WHAT exact bytes. Replaces the
 * old free-text signature_ref: the reference is a deterministic function of the
 * verified identity + the candidate_output_hash, so a signature cannot be
 * transplanted to a different clinician or a different output.
 *
 * @param {{ clinician_id, ahpra_registration, idp, session_id }} identity - a verified identity
 * @param {string} candidateOutputHash - the exact bytes being attested
 * @returns {string} signature_ref
 */
export function bindSignature(identity, candidateOutputHash) {
  if (!identity || identity.verified !== true) throw new Error("bindSignature: refusing to bind a signature to an unverified identity");
  const proof = sha256Prefixed(`${identity.subject || identity.clinician_id}|${candidateOutputHash}|${identity.session_id}`).slice(7, 27);
  const ahpra = identity.ahpra_registration || "no-ahpra";
  return `sig:federated:${identity.idp}:${ahpra}:${proof}`;
}

/** The verified-identity block persisted on the durable gate-record entry. */
export function identityBlock(identity) {
  return {
    verified: identity.verified === true,
    idp: identity.idp,
    subject: identity.clinician_id,
    ahpra_registration: identity.ahpra_registration || null,
    display_name: identity.display_name || null,
    session_id: identity.session_id,
  };
}
