#!/usr/bin/env bash
# apprunner-create — create (or update) the App Runner service that runs the
# Breath-Ezy portal from the ECR image (LIVE_PLAN §9 B2).
#
#   ./deploy/apprunner-create.sh <ECR_IMAGE_URI>
#     (the image URI printed by deploy/build-and-push.sh)
#
# Two IAM roles are required (App Runner's model):
#   APPRUNNER_ACCESS_ROLE_ARN   role App Runner uses to PULL the image from ECR
#                               (attach the managed policy
#                               AWSAppRunnerServicePolicyForECRAccess).
#   APPRUNNER_INSTANCE_ROLE_ARN the role the RUNNING app assumes — the one you
#                               attached HeydocSecretsRead to (for Secrets
#                               Manager GetSecretValue on the anthropic key).
#
# Secrets (never plaintext in the service config):
#   HEYDOC_PORTAL_TOKEN_SECRET_ARN  a Secrets Manager secret holding the portal
#                                   bearer token; App Runner injects it into the
#                                   HEYDOC_PORTAL_TOKEN env var at runtime.
#
# The anthropic key is resolved by the app itself at boot via the aws-sm backend
# (deploy/bootstrap.mjs) using the INSTANCE role — NOT injected here.
#
# Staging note: App Runner storage is EPHEMERAL. In staging (synthetic patients
# only) the local audit ledger is not durable — acceptable for a staging demo,
# but B1 (a WORM audit substrate) is REQUIRED before production.
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-2}"
SERVICE="${APPRUNNER_SERVICE:-breath-ezy-portal}"
IMAGE="${1:?usage: apprunner-create.sh <ECR_IMAGE_URI>}"
ACCESS_ROLE_ARN="${APPRUNNER_ACCESS_ROLE_ARN:?set APPRUNNER_ACCESS_ROLE_ARN (ECR-pull role; policy AWSAppRunnerServicePolicyForECRAccess)}"
INSTANCE_ROLE_ARN="${APPRUNNER_INSTANCE_ROLE_ARN:?set APPRUNNER_INSTANCE_ROLE_ARN (the role with HeydocSecretsRead)}"
PORTAL_TOKEN_SECRET_ARN="${HEYDOC_PORTAL_TOKEN_SECRET_ARN:?set HEYDOC_PORTAL_TOKEN_SECRET_ARN (Secrets Manager ARN of the portal bearer token)}"
SERVICE_ROLE="${HEYDOC_SERVICE:-portal}"

# The start command runs the bootstrap (registers the aws-sm key backend) then
# starts the chosen server. Port 8787 matches the portal default.
read -r -d '' SOURCE_CONFIG <<JSON || true
{
  "ImageRepository": {
    "ImageIdentifier": "${IMAGE}",
    "ImageRepositoryType": "ECR",
    "ImageConfiguration": {
      "Port": "8787",
      "StartCommand": "node deploy/bootstrap.mjs",
      "RuntimeEnvironmentVariables": {
        "HEYDOC_MODE_DEFAULT": "staging",
        "HEYDOC_PORTAL_PORT": "8787",
        "HEYDOC_SERVICE": "${SERVICE_ROLE}",
        "AWS_REGION": "${REGION}",
        "HEYDOC_AWS_SECRET_NAMES": "aws.sm/heydoc/anthropic.key",
        "HEYDOC_LLM_LIVE": "1",
        "HEYDOC_LLM_BACKEND": "claude",
        "HEYDOC_LLM_KEY_REF": "aws-sm:aws.sm/heydoc/anthropic.key",
        "HEYDOC_AUDIT_SUBSTRATE": "s3-object-lock",
        "HEYDOC_GATE_RECORD_SUBSTRATE": "s3-object-lock",
        "HEYDOC_WORM_BUCKET": "${HEYDOC_WORM_BUCKET:-heydoc-medicolegal-audit}",
        "HEYDOC_WORM_RETENTION_YEARS": "7",
        "HEYDOC_WORM_MODE": "COMPLIANCE",
        "HEYDOC_AUDIT_RETENTION": "7y"
      },
      "RuntimeEnvironmentSecrets": {
        "HEYDOC_PORTAL_TOKEN": "${PORTAL_TOKEN_SECRET_ARN}"
      }
    }
  },
  "AutoDeploymentsEnabled": false,
  "AuthenticationConfiguration": { "AccessRoleArn": "${ACCESS_ROLE_ARN}" }
}
JSON

echo "==> Creating App Runner service ${SERVICE} (${REGION}) from ${IMAGE}"
aws apprunner create-service \
  --region "$REGION" \
  --service-name "$SERVICE" \
  --source-configuration "$SOURCE_CONFIG" \
  --instance-configuration "{\"InstanceRoleArn\": \"${INSTANCE_ROLE_ARN}\"}" \
  --health-check-configuration '{"Protocol":"HTTP","Path":"/healthz","Interval":10,"Timeout":5,"HealthyThreshold":1,"UnhealthyThreshold":5}' \
  --query 'Service.ServiceUrl' --output text

echo ""
echo "==> Service creating. Watch status:"
echo "    aws apprunner list-services --region ${REGION} --query \"ServiceSummaryList[?ServiceName=='${SERVICE}']\""
echo "    Then GET https://<ServiceUrl>/healthz"
