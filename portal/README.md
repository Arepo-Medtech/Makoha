# Clinician Verification Portal — server-side release gate

**Status:** gate contract + mechanical checkpoint built (ARCH_PLAN M5). The portal
UI and the clinician review workflow are **not** built and are out of current
engineering scope. This directory holds the release-blocking core only.

## What this is

The mandatory human-in-the-loop checkpoint (`prime_directive`): **no generated
output reaches a patient without a clinician's attested decision bound to the
exact bytes being released.**

- Contract: [`mcp/schemas/verification-portal-decision.schema.json`](../mcp/schemas/verification-portal-decision.schema.json)
  (`VerificationGateRecord`, ARCH_PLAN §3.5.5) — zod-mirrored in
  [`verification-gate.js`](./verification-gate.js).
- Gate: `releaseToPatient({ candidate_output_hash, output })` — fail-closed;
  refuses unless (1) the context is live-enforced (mock/dry_run never release),
  (2) a gate record exists for the hash, (3) the latest decision is
  `approved` (output must hash to `candidate_output_hash`) or `amended`
  (output must hash to `amended_output_hash`), never `rejected`. The hash is
  **recomputed from the supplied text** — the gate never trusts a hash it is
  handed.
- Decisions append per hash; the latest is effective (re-review supported);
  records are never mutated. Durable WORM storage rides with the M8 audit
  substrate.

## Adoption rule (binding on all future work)

Every patient-facing path — messaging-geo `msg_send` wiring (M13, still
deferred), any portal UI, any export — **must** call `releaseToPatient()` and
honour `released: false` by escalating to a clinician, never by retrying around
the gate. A patient path that does not route through this gate is a Critical
defect (F13, portal bypass).

## Clinician identity (FL-42)

The attesting clinician is a **federation-verified** identity, not a free-text
field. `identity-federation.js` is a fail-closed seam: `registerIdentityProvider`
plugs in the production IdP (OIDC/SAML/AHPRA), selected via `HEYDOC_PORTAL_IDP`;
the built-in `dev` provider is development-only and is **refused on any
live-enforced path**. The `/decision` route derives `clinician_id` and the
signature from the verified identity (a body-supplied name that disagrees is
rejected), and the durable gate-record entry carries a hash-chained, tamper-
evident identity block bound to the signature (`record.clinician_id` must equal
the verified subject, or the append is refused). The verified identity never
enters the LLM context packet — it rides the medicolegal trail only.

**To go live:** register a real provider at deploy and set `HEYDOC_PORTAL_IDP`
(operator protocol/vendor choice + credentials — input-gated).

## What remains before "portal built"

The **WORM substrate registration** for gate records (R-39, operator backend +
retention), the **live identity-provider connect** (above), and — gated behind
those and the other release blockers — the patient path itself. Until all are
green, **no patient path opens**.
