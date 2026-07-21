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
   `HeydocSecretsRead` policy (Secrets Manager `GetSecretValue` on **both**
   `aws.sm/heydoc/anthropic.key-*` **and** `aws.sm/heydoc/portal.token-*` — App
   Runner fetches the RuntimeEnvironmentSecrets portal token with this same
   instance role, so covering only the anthropic key fails service creation
   with AccessDenied; found live 2026-07-16) **and** the WORM-audit policy
   below. Its trust policy must allow `tasks.apprunner.amazonaws.com`.
2. **Access role** — lets App Runner pull the image from ECR. Attach the AWS
   managed policy `AWSAppRunnerServicePolicyForECRAccess`; trust
   `build.apprunner.amazonaws.com`.
3. **Portal token secret** — a Secrets Manager secret holding the portal bearer
   token (the portal refuses to start live-enforced without it, by design).
4. **WORM audit bucket (§9 B1)** — an S3 bucket created with **Object Lock
   ENABLED** (which requires versioning; Object Lock cannot be turned on after
   creation). The medicolegal ledger + clinician gate records are written here as
   immutable objects (COMPLIANCE mode, 7-year retention — set per object by the
   adapter). Grant the instance role, scoped to this bucket:
   `s3:PutObject`, `s3:PutObjectRetention`, `s3:GetObject`, `s3:ListBucket`.
   The image must include the AWS CLI (the `build-and-push.sh` `INSTALL_AWS_S3`
   build arg adds it) — the substrate writes via a blocking CLI call because the
   audit-store seam is synchronous. Selected by `HEYDOC_AUDIT_SUBSTRATE=s3-object-lock`
   + `HEYDOC_GATE_RECORD_SUBSTRATE=s3-object-lock`, `HEYDOC_WORM_BUCKET`,
   `HEYDOC_WORM_RETENTION_YEARS=7`, `HEYDOC_WORM_MODE=COMPLIANCE` (all set by
   `apprunner-create.sh`). Fail-closed: with the substrate selected but the bucket
   or retention unset, the container refuses to start — the ledger is never
   written to the local (non-WORM) backend in production.

   > ⚠️ **COMPLIANCE mode is irreversible.** Objects cannot be deleted or
   > overwritten — even by the account root — until their 7-year retain date. Use
   > a dedicated bucket; do not point this at shared storage.

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

> ⚠️ **App Runner instance storage is EPHEMERAL.** The `local` audit substrate
> (a JSONL file under `HEYDOC_DATA_DIR`) does not survive a restart — fine for a
> `HEYDOC_AUDIT_SUBSTRATE=local` staging demo, but **the S3 Object Lock WORM
> substrate (§9 B1) is what makes the medicolegal trail durable and tamper-proof
> and is REQUIRED before production.** A non-`local` substrate name with no
> registered adapter REFUSES (fail-closed), by design. B1 built the
> `s3-object-lock` adapter; provision the bucket (prerequisite 4) and set the
> `HEYDOC_WORM_*` env to use it in staging or production.

## Medicolegal WORM audit storage (§9 B1 / R-39) — provisioning runbook

The immutable, tamper-proof store for the **four** hash-chained medicolegal chains
— the audit ledger, the clinician gate records, the PPP-TTT triage ledger, and the
consent records. Adapter: [`integration/audit-substrates/s3-object-lock.js`](../integration/audit-substrates/s3-object-lock.js).
**Operator choice: AWS S3 Object Lock, `COMPLIANCE` mode, 7-year retention, region
`ap-southeast-2`.** The adapter sets retention *per object*; the bucket must be
created with Object Lock enabled. This is a **production release blocker** — until
it is provisioned the medicolegal trail is not durable. Selecting the substrate
registers **all four** chains at boot; a missing bucket or retention **fails the
container closed** (it never serves, and never silently falls back to the
non-WORM `local` store).

> ⚠️ **`COMPLIANCE` mode is irreversible.** Objects cannot be deleted or
> overwritten — **even by the account root** — until their 7-year retain date.
> Use a **dedicated** bucket. Do not point this at shared storage, and do not
> rehearse against it — every write is locked for 7 years.

**Credentials never live in the repo, the env, or with the agent.** S3 + Secrets
Manager access is granted to the App Runner **instance role** (IAM); the AWS CLI
in the image assumes that role. No `AWS_ACCESS_KEY_ID`/secret is ever set.

### Step 1 — create the Object-Lock bucket (once)
```sh
# Object Lock REQUIRES versioning; --object-lock-enabled-for-bucket enables both.
# Object Lock CANNOT be turned on after creation — it must be set at create time.
aws s3api create-bucket \
  --bucket <WORM_BUCKET> --region ap-southeast-2 \
  --create-bucket-configuration LocationConstraint=ap-southeast-2 \
  --object-lock-enabled-for-bucket
# (optional belt-and-braces default; the adapter's per-object retention is authoritative)
aws s3api put-object-lock-configuration --bucket <WORM_BUCKET> \
  --object-lock-configuration 'ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Years=7}}'
```

### Step 2 — grant the instance role, scoped to this bucket
Attach to the App Runner **instance role** (the same role that reads the secrets):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:PutObjectRetention", "s3:GetObject"],
      "Resource": "arn:aws:s3:::<WORM_BUCKET>/*" },
    { "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::<WORM_BUCKET>" }
  ]
}
```

### Step 3 — bake the AWS CLI into the image
The substrate writes via a **blocking CLI call** (the audit-store seam is
synchronous; a fire-and-forget SDK write could silently drop a record). Build with:
```sh
docker build --build-arg INSTALL_AWS_S3=true ...   # build-and-push.sh passes this
```
An absent CLI throws an actionable install error at boot — never a silent failure.

### Step 4 — select + configure the substrate (App Runner env)
`apprunner-create.sh` sets these; listed so they can be verified:
```sh
HEYDOC_AUDIT_SUBSTRATE=s3-object-lock        # selects WORM for the audit ledger
HEYDOC_GATE_RECORD_SUBSTRATE=s3-object-lock  # …and the clinician gate records
                                             # (either selector registers ALL FOUR chains)
HEYDOC_WORM_BUCKET=<WORM_BUCKET>
HEYDOC_WORM_RETENTION_YEARS=7                # REQUIRED — never defaulted in code (surface, don't decide)
HEYDOC_WORM_MODE=COMPLIANCE                  # default; GOVERNANCE allowed but not the operator choice
HEYDOC_AUDIT_RETENTION=7y                    # human-readable label for auditRetentionPolicy() — keep consistent with the 7 above
AWS_REGION=ap-southeast-2
```
Boot order ([`deploy/bootstrap.mjs`](bootstrap.mjs), the App Runner StartCommand):
register the `aws-sm` secrets backend → **register the WORM substrate on all four
seams (BEFORE the server starts, so the very first write lands on the immutable
backend)** → start the portal/consult server.

### Step 5 — verify
```sh
npm run verify:worm      # scripts/worm-integrity.mjs — hash-chain integrity across the chains
```
Then `GET https://<ServiceUrl>/healthz` → `{"ok":true,"mode":"live"}`. FL-11
(2026-07-16) live-validated all four chains actually write to a real Object-Lock
bucket. The eval-run reports (FL-40) also land here in production — the authoritative
live eval is persisted append-only to this same store.

### Guardrails (do not weaken)
- **Retention is surfaced, not decided** — `HEYDOC_WORM_RETENTION_YEARS` is
  operator-set and unset **fails closed**; no period is hardcoded. Changing it is a
  regulatory decision, not an engineering one.
- **Never** switch a production deploy to `HEYDOC_AUDIT_SUBSTRATE=local` — that
  store is ephemeral on App Runner and non-WORM.
- Record VALUES are never logged (medicolegal + PHI); only counts/keys.

## Open operator decisions (L2 remainder)
- **R-39 WORM substrate — resolved (§9 B1):** operator chose S3 Object Lock,
  COMPLIANCE, 7-year retention; the `s3-object-lock` adapter is built and
  contract-tested. Remaining operator step: provision the Object-Lock bucket +
  IAM (prerequisite 4) and run against it (live validation).
- `HEYDOC_AUDIT_RETENTION` — set to `7y` by `apprunner-create.sh` so the store's
  `auditRetentionPolicy()` reporter agrees with the adapter's per-object
  retention; a minimum-keep regulatory decision — ledgers are never auto-deleted.
- A CI-driven deploy (GitHub Actions → App Runner via OIDC) is a later step on
  top of these scripts; needs an AWS OIDC role (operator infra).
