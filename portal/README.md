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

## What remains before "portal built"

Clinician-facing review UI/workflow, authenticated clinician identity +
signature capture, and durable gate-record storage (M8). Until those exist —
and the other release blockers are green — **no patient path opens**.
