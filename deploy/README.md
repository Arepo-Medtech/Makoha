# deploy/ — deploy-time wiring (LIVE_PLAN L2)

This directory holds **examples and documentation only**. Real deployments
inject credentials from a secrets manager and register production substrates
at boot — nothing real is ever committed (charter `<security_and_secrets>`).

## Three environments, one-way promotion (charter `<release_and_environments>`)

| env | `HEYDOC_MODE_DEFAULT` | patients | mock proof | audit substrate |
|---|---|---|---|---|
| mock (dev) | `mock` | none | flagged, allowed | `local` JSONL |
| staging | `staging` (→ live enforcement) | **synthetic only** | **BLOCKED** | WORM (registered) |
| production | `production` (→ live enforcement) | real, consented, pharmacist-signed | **BLOCKED** | WORM (registered, retention set) |

Every promotion is plan-gated. Production stays closed until all four
patient-facing release blockers are green and the operator signs the L14
GO/NO-GO checklist.

## Boot wiring

A deployment boots the portal (or any role) through a small bootstrap that
registers its backends BEFORE starting the server — see
[`register-substrates.example.mjs`](./register-substrates.example.mjs):

1. `registerAuditSubstrate(name, adapter)` — main medicolegal ledger (WORM).
2. `registerGateRecordSubstrate(name, adapter)` — clinician gate records (WORM).
3. `registerSecretsBackend(scheme, resolver)` — secrets manager resolution.

Fail-closed by construction: selecting a non-local substrate without a
registered adapter REFUSES at first write; an unregistered secrets scheme
REFUSES at first resolve; a live-enforced portal without
`HEYDOC_PORTAL_TOKEN` REFUSES to start.

## Open operator decisions (R-39, L2 remainder)
- WORM backend choice (e.g. S3 Object Lock, immudb) — the adapter implements
  the existing four-op / two-op seams; the chain algorithms never change.
- `HEYDOC_AUDIT_RETENTION` — a minimum-keep regulatory decision; ledgers are
  never auto-deleted regardless.
- Cloud/target for the staging deploy job.
