#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-}"
REPO_BRANCH="${REPO_BRANCH:-main}"
BACKEND_URL="${BACKEND_URL:-}"

SERVICE_USER="${SERVICE_USER:-$USER}"
INSTALL_DIR="${INSTALL_DIR:-/opt/werkstatt-ki}"
SERVICE_PORT="${SERVICE_PORT:-5000}"
TRAINING_INTERVAL_MINUTES="${TRAINING_INTERVAL_MINUTES:-1440}"
TRAINING_LIMIT="${TRAINING_LIMIT:-0}"
TRAINING_LOOKBACK_DAYS="${TRAINING_LOOKBACK_DAYS:-14}"
TRAINING_MAX_RETRIES="${TRAINING_MAX_RETRIES:-5}"
TRAINING_BACKOFF_INITIAL_SECONDS="${TRAINING_BACKOFF_INITIAL_SECONDS:-5}"
TRAINING_BACKOFF_MAX_SECONDS="${TRAINING_BACKOFF_MAX_SECONDS:-300}"
DISCOVERY_ENABLED="${DISCOVERY_ENABLED:-1}"

if [[ -z "$REPO_URL" ]]; then
  echo "REPO_URL ist erforderlich."
  echo "Beispiel: REPO_URL=https://github.com/user/Werkstatt-Terminplaner.git"
  exit 1
fi

if [[ -z "$BACKEND_URL" ]]; then
  echo "Hinweis: BACKEND_URL nicht gesetzt - Auto-Discovery wird genutzt."
fi

if [[ "${EUID}" -ne 0 ]]; then
  SUDO="sudo"
else
  SUDO=""
fi

echo "[1/4] Systempakete installieren..."
$SUDO apt-get update -y
$SUDO apt-get install -y git ca-certificates

WORKDIR="$(mktemp -d /tmp/werkstatt-ki-XXXXXX)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "[2/4] Repo klonen..."
git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$WORKDIR/repo"

echo "[3/4] KI-Service installieren..."
BACKEND_URL="$BACKEND_URL" \
SERVICE_USER="$SERVICE_USER" \
INSTALL_DIR="$INSTALL_DIR" \
SERVICE_PORT="$SERVICE_PORT" \
TRAINING_INTERVAL_MINUTES="$TRAINING_INTERVAL_MINUTES" \
TRAINING_LIMIT="$TRAINING_LIMIT" \
TRAINING_LOOKBACK_DAYS="$TRAINING_LOOKBACK_DAYS" \
TRAINING_MAX_RETRIES="$TRAINING_MAX_RETRIES" \
TRAINING_BACKOFF_INITIAL_SECONDS="$TRAINING_BACKOFF_INITIAL_SECONDS" \
TRAINING_BACKOFF_MAX_SECONDS="$TRAINING_BACKOFF_MAX_SECONDS" \
DISCOVERY_ENABLED="$DISCOVERY_ENABLED" \
$SUDO bash "$WORKDIR/repo/tools/ki-service/install_werkstatt_ki.sh"

echo "[4/4] Fertig."
echo "Status:"
$SUDO systemctl --no-pager --full status werkstatt-ki.service || true
