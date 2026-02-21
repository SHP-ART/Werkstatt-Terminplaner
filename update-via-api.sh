#!/bin/bash
# ============================================================================
# Werkstatt Terminplaner - API-Update-Skript (nicht-interaktiv)
# Wird vom Backend-Endpoint POST /api/system/update aufgerufen.
# Muss NICHT als root laufen, aber systemctl restart benötigt sudo-Berechtigung.
#
# Einmalige Einrichtung (auf dem Server als root):
#   echo "werkstatt ALL=NOPASSWD: /bin/systemctl restart werkstatt-terminplaner.service" \
#     >> /etc/sudoers.d/werkstatt-update
#   chmod 440 /etc/sudoers.d/werkstatt-update
# ============================================================================

set +e  # Fehler stoppen das Skript NICHT (nicht-interaktiv)

INSTALL_DIR="/opt/werkstatt-terminplaner"
LOG_FILE="/tmp/werkstatt-api-update.log"
SERVICE_NAME="werkstatt-terminplaner"

exec >> "$LOG_FILE" 2>&1
echo "=== API-Update gestartet: $(date) ==="

# 1. Git Pull
echo "▶ git pull..."
cd "$INSTALL_DIR" || { echo "FEHLER: $INSTALL_DIR nicht gefunden"; exit 1; }
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
git pull origin master
echo "✓ git pull erfolgreich"

# 2. Frontend bauen (wenn npm vorhanden)
if [ -f "package.json" ] && command -v npm &>/dev/null; then
  echo "▶ npm install (root)..."
  npm install --prefer-offline 2>&1 | tail -5
  echo "▶ Frontend bauen..."
  npm run build 2>&1 | tail -10
  echo "✓ Frontend gebaut"
fi

# 3. Backend Dependencies
if [ -f "backend/package.json" ]; then
  echo "▶ npm install (backend)..."
  npm install --prefix backend --prefer-offline 2>&1 | tail -5
  echo "✓ Backend Dependencies aktualisiert"
fi

# 4. Service neustarten (benötigt sudo-Freigabe, siehe oben)
echo "▶ Starte Service neu..."
if sudo systemctl restart "$SERVICE_NAME.service" 2>/dev/null; then
  echo "✓ Service neugestartet"
elif systemctl restart "$SERVICE_NAME.service" 2>/dev/null; then
  echo "✓ Service neugestartet (ohne sudo)"
else
  echo "⚠ systemctl restart fehlgeschlagen - versuche kill+restart"
  # Fallback: Node-Prozess töten (PM2 oder der Service-Watchdog startet ihn neu)
  pkill -f "node.*server.js" 2>/dev/null || true
  echo "✓ Prozess beendet (Watchdog startet ihn neu)"
fi

echo "=== API-Update abgeschlossen: $(date) ==="
