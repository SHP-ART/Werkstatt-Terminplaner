#!/bin/bash
set -euo pipefail

SERVICE_USER="${SERVICE_USER:-$USER}"
INSTALL_DIR="${INSTALL_DIR:-/opt/werkstatt-ki}"
SERVICE_PORT="${SERVICE_PORT:-5000}"
BACKEND_URL="${BACKEND_URL:-}"
TRAINING_INTERVAL_MINUTES="${TRAINING_INTERVAL_MINUTES:-1440}"
TRAINING_LIMIT="${TRAINING_LIMIT:-0}"
TRAINING_LOOKBACK_DAYS="${TRAINING_LOOKBACK_DAYS:-14}"
TRAINING_MAX_RETRIES="${TRAINING_MAX_RETRIES:-5}"
TRAINING_BACKOFF_INITIAL_SECONDS="${TRAINING_BACKOFF_INITIAL_SECONDS:-5}"
TRAINING_BACKOFF_MAX_SECONDS="${TRAINING_BACKOFF_MAX_SECONDS:-300}"
DISCOVERY_ENABLED="${DISCOVERY_ENABLED:-1}"
BACKEND_DISCOVERY_ENABLED="${BACKEND_DISCOVERY_ENABLED:-1}"

# Optional: Repo fuer Updates/Modelle
REPO_URL="${REPO_URL:-}"
REPO_BRANCH="${REPO_BRANCH:-main}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  SUDO="sudo"
else
  SUDO=""
fi

run_as_user() {
  if [[ -n "$SUDO" ]]; then
    $SUDO -u "$SERVICE_USER" "$@"
  else
    "$@"
  fi
}

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python3 fehlt."
  exit 1
fi

echo "[1/6] Systempakete installieren..."
$SUDO apt-get update -y
$SUDO apt-get install -y python3-venv python3-pip git avahi-daemon

SOURCE_ROOT="$SCRIPT_DIR"
if [[ -n "$REPO_URL" ]]; then
  echo "[2/6] Repo laden: $REPO_URL"
  $SUDO mkdir -p "$INSTALL_DIR/src"
  $SUDO chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
  if [[ ! -d "$INSTALL_DIR/src/.git" ]]; then
    git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR/src"
  else
    git -C "$INSTALL_DIR/src" pull
  fi
  SOURCE_ROOT="$INSTALL_DIR/src"
fi

if [[ -d "$SOURCE_ROOT/tools/ki-service/app" ]]; then
  APP_SOURCE="$SOURCE_ROOT/tools/ki-service/app"
  REQ_SOURCE="$SOURCE_ROOT/tools/ki-service/requirements.txt"
elif [[ -d "$SOURCE_ROOT/app" ]]; then
  APP_SOURCE="$SOURCE_ROOT/app"
  REQ_SOURCE="$SOURCE_ROOT/requirements.txt"
else
  echo "App-Quellen nicht gefunden. Bitte REPO_URL setzen oder Script im Repo ausfuehren."
  exit 1
fi

echo "[3/6] KI-Service kopieren..."
$SUDO mkdir -p "$INSTALL_DIR/app" "$INSTALL_DIR/data"
$SUDO cp -R "$APP_SOURCE/"* "$INSTALL_DIR/app/"
$SUDO cp "$REQ_SOURCE" "$INSTALL_DIR/requirements.txt"
$SUDO chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

echo "[4/6] Python venv und Abhaengigkeiten..."
run_as_user python3 -m venv "$INSTALL_DIR/venv"
run_as_user "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
run_as_user "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

echo "[5/6] Environment-Datei schreiben..."
cat > "$INSTALL_DIR/werkstatt-ki.env" <<EOF
BACKEND_URL=$BACKEND_URL
SERVICE_PORT=$SERVICE_PORT
TRAINING_INTERVAL_MINUTES=$TRAINING_INTERVAL_MINUTES
TRAINING_LIMIT=$TRAINING_LIMIT
TRAINING_LOOKBACK_DAYS=$TRAINING_LOOKBACK_DAYS
TRAINING_MAX_RETRIES=$TRAINING_MAX_RETRIES
TRAINING_BACKOFF_INITIAL_SECONDS=$TRAINING_BACKOFF_INITIAL_SECONDS
TRAINING_BACKOFF_MAX_SECONDS=$TRAINING_BACKOFF_MAX_SECONDS
DISCOVERY_ENABLED=$DISCOVERY_ENABLED
BACKEND_DISCOVERY_ENABLED=$BACKEND_DISCOVERY_ENABLED
EOF
$SUDO chown "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/werkstatt-ki.env"

echo "[6/6] systemd Service einrichten..."
$SUDO tee /etc/systemd/system/werkstatt-ki.service > /dev/null <<EOF
[Unit]
Description=Werkstatt KI Service
After=network.target

[Service]
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/werkstatt-ki.env
ExecStart=$INSTALL_DIR/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $SERVICE_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable werkstatt-ki.service
$SUDO systemctl restart werkstatt-ki.service

echo "Fertig. Status:"
$SUDO systemctl --no-pager --full status werkstatt-ki.service || true
