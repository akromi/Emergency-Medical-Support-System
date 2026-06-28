# syntax=docker/dockerfile:1
#
# Air-gapped TRIAGE-LINK image: ONE Node process serves the built PWA *and* the
# sync API from a single origin (the field-laptop deployment). Pair it with the
# Postgres sidecar in docker-compose.yml for persistence.
#
# Build context is the REPO ROOT (so the whole workspace is available):
#   docker build -f deploy/airgapped/Dockerfile -t triage-link-airgapped:latest .
# or just `docker compose build` from this directory.

# ---- Stage 1: install deps, build the framework-free core + the PWA bundle ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Copy the manifests first so `npm ci` is cached until a dependency changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/ehr-gateway/package.json ./packages/ehr-gateway/
COPY packages/sync-service/package.json ./packages/sync-service/
RUN npm ci
# Now the sources, and build: core (consumed by the service) + the production
# PWA (`npm run build` → /app/dist; its prebuild also builds core).
COPY . .
RUN npm run build

# ---- Stage 2: runtime — serves /app/dist (PWA) + the API on one port ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Bring over the installed deps, the built workspaces + service source, and the
# built PWA. The service runs from TypeScript via tsx (already in node_modules).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages
COPY --from=build /app/dist ./dist
ENV STATIC_DIR=/app/dist \
    PORT=8080
EXPOSE 8080
# tsx handles the workspace's .ts sources (the service imports raw TS).
CMD ["node_modules/.bin/tsx", "packages/sync-service/src/server.ts"]
