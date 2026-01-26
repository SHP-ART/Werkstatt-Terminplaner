#!/usr/bin/env bash
set -euo pipefail

# Standalone Installer: Externe KI ohne lokales Repo
# Lädt nur die benötigten KI-Dateien aus GitHub und richtet den Service ein.

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

REPO_OWNER="${REPO_OWNER:-SHP-ART}"
REPO_NAME="${REPO_NAME:-Werkstatt-Terminplaner}"
REPO_BRANCH="${REPO_BRANCH:-master}"
REPO_RAW_BASE="${REPO_RAW_BASE:-https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/tools/ki-service}"

if [[ -z "$BACKEND_URL" ]]; then
  echo "Hinweis: BACKEND_URL nicht gesetzt - Auto-Discovery wird genutzt."
fi

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

download_file() {
  local url="$1"
  local dest="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$dest" "$url"
  else
    echo "curl oder wget wird benoetigt."
    exit 1
  fi
}

echo "[1/5] Systempakete installieren..."
$SUDO apt-get update -y
$SUDO apt-get install -y python3-venv python3-pip ca-certificates avahi-daemon

WORKDIR="$(mktemp -d /tmp/werkstatt-ki-XXXXXX)"
cleanup() {
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "[2/5] KI-Dateien laden..."
download_file "${REPO_RAW_BASE}/requirements.txt" "$WORKDIR/requirements.txt"
download_file "${REPO_RAW_BASE}/app/main.py" "$WORKDIR/main.py"
download_file "${REPO_RAW_BASE}/app/__init__.py" "$WORKDIR/__init__.py"

echo "[3/5] Dateien installieren..."
$SUDO mkdir -p "$INSTALL_DIR/app" "$INSTALL_DIR/data"
$SUDO cp "$WORKDIR/requirements.txt" "$INSTALL_DIR/requirements.txt"
$SUDO cp "$WORKDIR/main.py" "$INSTALL_DIR/app/main.py"
$SUDO cp "$WORKDIR/__init__.py" "$INSTALL_DIR/app/__init__.py"
$SUDO chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

echo "[4/5] Python venv und Abhaengigkeiten..."
run_as_user python3 -m venv "$INSTALL_DIR/venv"
run_as_user "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
run_as_user "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

echo "[5/5] systemd Service einrichten..."
$SUDO tee "$INSTALL_DIR/werkstatt-ki.env" > /dev/null <<EOF
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

echo "[6/6] Update-Skript bereitstellen..."
# Kopiere update.sh in das Installationsverzeichnis
if [ -f "$INSTALL_DIR/update.sh" ]; then
    $SUDO chmod +x "$INSTALL_DIR/update.sh"
    echo "Update-Skript verfügbar unter: $INSTALL_DIR/update.sh"
    echo "Zukünftige Updates: cd $INSTALL_DIR && sudo ./update.sh"
fi

echo "Fertig. Status:"
$SUDO systemctl --no-pager --full status werkstatt-ki.service || true
