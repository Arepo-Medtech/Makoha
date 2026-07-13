# IDENTITY-FEDERATION-PLAN.md — FL-42 · Clinician identity federation (portal remainder)

**Status:** ⛳ EXECUTED 2026-07-13. Branch `feat/fl42-identity-federation`. Baseline `main @ 138c21c`.
**Tracker:** FINISH-LINE FL-42 (ENG half of the Clinician Verification Portal release blocker). Register: `clinician-verification-portal-unbuilt` (Critical, pf:true) — narrows, does not fully resolve (WORM registration FL-11 + live IdP connect remain).

> Not legal/clinical/regulatory advice. The live IdP protocol/vendor choice (OIDC / SAML / AHPRA) is an operator [DECIDE] that gates the live connect; this builds the fail-closed seam + binding, mock-gated.

## The gap

Today the portal authorises with a single shared bearer token (`HEYDOC_PORTAL_TOKEN`), and `clinician_id` + `signature_ref` are FREE-TEXT form fields the reviewer types. So a token-holder can record a decision under any clinician name with any signature string — the medicolegal trail's identity is a self-asserted claim, not a verified one.

## Design (additive; frozen gate untouched)

`portal/verification-gate.js` is RETAIN/frozen (sha256-pinned) — its `GateRecordSchema` (`.strict()`, free-text `clinician_id`/`signature_ref`) cannot change. So the verified identity binds on the **durable entry envelope** (`gate-record-store.js`, editable) + the portal layer — exactly the `bundle_sha256` precedent (entry-level, hash-chained, tamper-evident).

- **NEW `portal/identity-federation.js`** — the federation seam (mirrors the substrate/secrets seam pattern):
  - `registerIdentityProvider(name, adapter)` — pluggable IdP; `adapter.resolve(req) → { subject, ahpra_registration, display_name } | null`.
  - built-in **`dev`** provider — resolves a synthetic verified identity from a dev header; clearly mock, NEVER live.
  - `resolveClinicianIdentity(req, { mode }) → { verified, clinician_id, ahpra_registration, display_name, idp, session_id }` or `{ verified:false, reason }`. **FAIL-CLOSED:** in enforce-live mode a `dev`/unregistered provider REFUSES — a dev identity is never accepted as a live federated identity (same discipline as the WORM/secrets seams). Selected by `HEYDOC_PORTAL_IDP` (default `dev`).
  - `bindSignature(identity, candidate_output_hash) → "sig:federated:<idp>:<ahpra>:<sha256(subject|hash|session)>"` — binds the signature to WHO signed and WHAT exact bytes, replacing free-text.
- **MODIFY `portal/gate-record-store.js`** — `recordDecisionDurable(record, { bundle_sha256, identity })` gains an optional `identity` block on the durable `GateEntrySchema` (strict). **BINDING ASSERTION (fail-closed):** when `identity` is present, `record.clinician_id` MUST equal `identity.clinician_id` — the frozen record's clinician can never disagree with the verified identity. Backward-compatible: absent identity = legacy/mock path (unchanged).
- **MODIFY `portal/server.js`** — resolve the identity via the seam for console routes; the `/decision` handler DERIVES `clinician_id` + `signature_ref` from the verified identity (never free-text body; a body mismatch is rejected) and passes the `identity` block to the durable store. In enforce-live, identity resolution is mandatory (fail-closed → 403). The bearer token stays as the coarse transport gate (belt-and-suspenders). The decision form prefills clinician_id (read-only) and auto-binds the signature.
- **NEW `test/contract-portal-identity.js`** (in `npm test` + CI).

## Verification (done-when + safety)

- dev provider resolves a synthetic identity in dev; enforce-live + dev provider REFUSES (fail-closed).
- a registered live provider yields a verified identity; the durable entry carries the identity block; signature is derived (not free-text).
- `record.clinician_id` ≠ `identity.clinician_id` → `recordDecisionDurable` REJECTS.
- tampering the identity block breaks the hash chain; chain otherwise verifies.
- `verification-gate.js` byte-unchanged (CI pin holds); existing `contract-portal-review.js` still green (identity optional, backward-compatible).

## Invariant check

Human-in-the-loop STRENGTHENED (the attesting clinician is now verified, not self-asserted) · frozen gate + its schema byte-unchanged · medicolegal trail more tamper-evident (identity hash-chained) · fail-closed everywhere (no verified identity in enforce-live → no decision) · no patient path opened. ✔

## Register / gap

`clinician-verification-portal-unbuilt` NARROWS: identity-federation seam + binding built (mock-gated). REMAINING (unchanged): WORM registration (FL-11/R-39, operator), **live IdP connect** (operator [DECIDE] protocol + credentials — input-gated), and the patient path (none exists). Item stays PARTIAL/Critical.

## New dependencies

None (Node 20 + zod only; live IdP SDK, if any, is a deploy-time dep like aws-sm).
