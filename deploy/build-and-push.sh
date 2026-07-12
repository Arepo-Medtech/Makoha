#!/usr/bin/env bash
# build-and-push — build the Breath-Ezy image (with the AWS Secrets Manager SDK)
# and push it to Amazon ECR (LIVE_PLAN §9 B2). Run from the repo root, e.g. in
# AWS CloudShell (which has docker + the AWS CLI) after `git clone`.
#
#   ./deploy/build-and-push.sh
#
# Env (all have sensible defaults):
#   AWS_REGION   default ap-southeast-2
#   ECR_REPO     default breath-ezy
#   IMAGE_TAG    default latest
#
# Prints the pushed image URI — pass it to deploy/apprunner-create.sh.
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-2}"
REPO="${ECR_REPO:-breath-ezy}"
TAG="${IMAGE_TAG:-latest}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
IMAGE="${REGISTRY}/${REPO}:${TAG}"

echo "==> Account ${ACCOUNT_ID} / region ${REGION} / image ${IMAGE}"

# 1) Ensure the ECR repository exists (scan on push).
if ! aws ecr describe-repositories --repository-names "$REPO" --region "$REGION" >/dev/null 2>&1; then
  echo "==> Creating ECR repository ${REPO}"
  aws ecr create-repository --repository-name "$REPO" --region "$REGION" \
    --image-scanning-configuration scanOnPush=true >/dev/null
fi

# 2) Log docker in to ECR.
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

# 3) Build with the AWS Secrets Manager SDK (INSTALL_AWS_SM) and the AWS CLI
#    (INSTALL_AWS_S3, for the S3 Object Lock WORM audit substrate) baked into the
#    image, then push. (Run from the repo root so the Dockerfile context is correct.)
docker build --build-arg INSTALL_AWS_SM=true --build-arg INSTALL_AWS_S3=true -t "$IMAGE" .
docker push "$IMAGE"

echo ""
echo "==> Pushed ${IMAGE}"
echo "    Next: ./deploy/apprunner-create.sh ${IMAGE}"
