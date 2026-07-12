# Breath-Ezy runtime image (LIVE_PLAN L2, R-35).
#
# One image, role selected by command. Default role: the Clinician
# Verification Portal (portal/server.js). Mock by default — staging/production
# set HEYDOC_MODE_DEFAULT at deploy (mode.js maps them to live enforcement and
# BLOCKS mock proof). Secrets are NEVER baked in: they resolve at runtime via
# integration/secrets.js from deploy-injected env / a registered backend.
FROM node:20-alpine

WORKDIR /app

# Lockfile-only install (supply-chain rule: npm ci, no floating resolution).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# AWS deploy: add the Secrets Manager SDK to the IMAGE only (not a repo
# dependency — the core stays cloud-agnostic; the aws-sm backend dynamic-imports
# it). `docker build --build-arg INSTALL_AWS_SM=true` (see deploy/build-and-push.sh)
# turns it on; the default image stays AWS-free. --no-save keeps package.json
# untouched; pin the major so the image is reproducible.
ARG INSTALL_AWS_SM=false
RUN if [ "$INSTALL_AWS_SM" = "true" ]; then npm install --no-save "@aws-sdk/client-secrets-manager@^3"; fi

# AWS deploy: add the AWS CLI to the IMAGE only, for the S3 Object Lock WORM audit
# substrate (§9 B1). The substrate writes the medicolegal ledger with the CLI
# (execFileSync) because the audit-store seam is SYNCHRONOUS and the AWS SDK is
# async — a blocking CLI call is the only way to get synchronous, durable, WORM
# writes from a frozen sync seam. The CLI is intentionally NOT a repo dependency.
# `docker build --build-arg INSTALL_AWS_S3=true` turns it on; default stays AWS-free.
ARG INSTALL_AWS_S3=false
RUN if [ "$INSTALL_AWS_S3" = "true" ]; then apk add --no-cache aws-cli; fi

COPY . .

# Dev-safe defaults; deploy overrides. HEYDOC_DATA_DIR is a volume in every
# real environment — the medicolegal ledgers must outlive the container.
ENV HEYDOC_MODE_DEFAULT=mock \
    HEYDOC_DATA_DIR=/data \
    HEYDOC_PORTAL_PORT=8787
VOLUME ["/data"]

EXPOSE 8787
CMD ["node", "portal/server.js"]
