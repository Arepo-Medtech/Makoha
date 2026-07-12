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

## B2 — staging deploy to AWS App Runner (runbook)

The Dockerfile + the two scripts here stand up a running **staging** service
(the clinician portal by default) from an ECR image. Run from the repo root in
**AWS CloudShell** (has docker + the AWS CLI) after `git clone`.

**Prerequisites (once):**
1. **Instance role** — the role the app assumes at runtime. Attach the
   `HeydocSecretsRead` policy (Secrets Manager `GetSecretValue` on
   `aws.sm/heydoc/anthropic.key`). Its trust policy must allow
   `tasks.apprunner.amazonaws.com`.
2. **Access role** — lets App Runner pull the image from ECR. Attach the AWS
   managed policy `AWSAppRunnerServicePolicyForECRAccess`; trust
   `build.apprunner.amazonaws.com`.
3. **Portal token secret** — a Secrets Manager secret holding the portal bearer
   token (the portal refuses to start live-enforced without it, by design).

**Deploy:**
```sh
# 1) build the image (with the AWS SDK baked in) + push to ECR
./deploy/build-and-push.sh                 # prints <ECR_IMAGE_URI>

# 2) create the App Runner service
export APPRUNNER_ACCESS_ROLE_ARN=arn:aws:iam::<ACCT>:role/<ecr-pull-role>
export APPRUNNER_INSTANCE_ROLE_ARN=arn:aws:iam::<ACCT>:role/<the-role-with-HeydocSecretsRead>
export HEYDOC_PORTAL_TOKEN_SECRET_ARN=arn:aws:secretsmanager:ap-southeast-2:<ACCT>:secret:aws.sm/heydoc/portal.token-XXXX
./deploy/apprunner-create.sh <ECR_IMAGE_URI>     # prints the service URL
```
Then `GET https://<ServiceUrl>/healthz` should return `{"ok":true,"mode":"live"}`.

**How the key is resolved:** the service's StartCommand is
`node deploy/bootstrap.mjs`, which registers the `aws-sm` backend (fetching
`aws.sm/heydoc/anthropic.key` at boot into the fail-closed seam) BEFORE starting
the server — so `HEYDOC_LLM_KEY_REF=aws-sm:…` resolves at runtime via the
**instance role**, and the value never appears in the service config.

> **Secret format — store the Anthropic key as PLAINTEXT.** The Secrets Manager
> console "key/value pairs" default stores a JSON object
> (`{"ANTHROPIC_API_KEY":"sk-ant-…"}`); handing that whole blob to the API as a
> key yields `401 invalid x-api-key`. Prefer the **Plaintext** option (a raw
> `sk-ant-…` string). If the secret *is* JSON, the `aws-sm` backend auto-extracts
> a **single-key** object; for a **multi-key** object, name the field in the ref:
> `HEYDOC_LLM_KEY_REF=aws-sm:aws.sm/heydoc/anthropic.key#ANTHROPIC_API_KEY`.
> Fail-closed: an ambiguous JSON secret (several keys, no `#field`) is REFUSED,
> never guessed.

**Run the consult surface instead of the portal:** set `HEYDOC_SERVICE=consult`
(a second service on the same image), or run both.

> ⚠️ **Staging storage is EPHEMERAL on App Runner.** In staging (synthetic
> patients only) the local audit ledger is not durable — fine for a staging
> demo, but **B1 (a WORM audit substrate) is REQUIRED before production**. Leave
> `HEYDOC_AUDIT_SUBSTRATE=local` for staging; a non-local name with no registered
> WORM adapter REFUSES (fail-closed), by design.

## Open operator decisions (R-39, L2 remainder)
- WORM backend choice (e.g. S3 Object Lock, immudb) — the adapter implements
  the existing four-op / two-op seams; the chain algorithms never change.
- `HEYDOC_AUDIT_RETENTION` — a minimum-keep regulatory decision; ledgers are
  never auto-deleted regardless.
- A CI-driven deploy (GitHub Actions → App Runner via OIDC) is a later step on
  top of these scripts; needs an AWS OIDC role (operator infra).
