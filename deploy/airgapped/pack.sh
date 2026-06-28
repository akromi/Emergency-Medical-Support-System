#!/usr/bin/env bash
# Build the app image and bundle it together with Postgres into a single tarball,
# so the whole stack can be carried to an air-gapped machine on a USB stick.
#
# Run this on a CONNECTED build machine (it pulls base images + npm deps once):
#   ./pack.sh                       # -> triage-link-airgapped.tar
#   ./pack.sh /media/usb/tl.tar     # custom output path
#
# Then on the OFFLINE field laptop (Docker installed, no internet):
#   docker load -i triage-link-airgapped.tar
#   cp .env.example .env   # edit credentials
#   docker compose up -d
set -euo pipefail
cd "$(dirname "$0")"

PG_IMAGE="postgres:16-alpine"
APP_IMAGE="triage-link-airgapped:latest"
OUT="${1:-triage-link-airgapped.tar}"

echo "==> Building ${APP_IMAGE} (this also bundles the PWA) ..."
docker compose build

echo "==> Fetching ${PG_IMAGE} ..."
docker pull "${PG_IMAGE}"

echo "==> Saving images to ${OUT} ..."
docker save "${APP_IMAGE}" "${PG_IMAGE}" -o "${OUT}"

echo "==> Done: ${OUT} ($(du -h "${OUT}" | cut -f1))."
echo "    Transfer it, then on the offline host:"
echo "      docker load -i $(basename "${OUT}")"
echo "      cp .env.example .env   # set credentials"
echo "      docker compose up -d   # http://<host>:\${APP_PORT:-8080}"
