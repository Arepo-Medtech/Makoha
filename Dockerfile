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

COPY . .

# Dev-safe defaults; deploy overrides. HEYDOC_DATA_DIR is a volume in every
# real environment — the medicolegal ledgers must outlive the container.
ENV HEYDOC_MODE_DEFAULT=mock \
    HEYDOC_DATA_DIR=/data \
    HEYDOC_PORTAL_PORT=8787
VOLUME ["/data"]

EXPOSE 8787
CMD ["node", "portal/server.js"]
