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

# Node/npm PATH sicherstellen (für Service-Umgebungen ohne vollständigen PATH)
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.nvm/versions/node/*/bin:$PATH"
# nvm-Umgebung einbinden falls vorhanden
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
[ -s "/root/.nvm/nvm.sh" ] && source "/root/.nvm/nvm.sh" 2>/dev/null || true

exec >> "$LOG_FILE" 2>&1
echo "=== API-Update gestartet: $(date) ==="
echo "NODE: $(node --version 2>/dev/null || echo 'nicht gefunden')"
echo "NPM:  $(npm --version 2>/dev/null || echo 'nicht gefunden')"

# 1. Git Pull
echo "▶ git pull..."
cd "$INSTALL_DIR" || { echo "FEHLER: $INSTALL_DIR nicht gefunden"; exit 1; }
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
git pull origin master
GIT_EXIT=$?
if [ $GIT_EXIT -ne 0 ]; then
  echo "⚠ git pull Fehler (Exit $GIT_EXIT) – fahre trotzdem fort"
else
  echo "✓ git pull erfolgreich ($(git rev-parse --short HEAD 2>/dev/null))"
fi

# 2. Frontend bauen
if [ -f "frontend/package.json" ] && command -v npm &>/dev/null; then
  echo "▶ npm install (frontend, ohne --prefer-offline)..."
  npm install --prefix frontend 2>&1
  NPM_EXIT=$?
  echo "  npm install Exit-Code: $NPM_EXIT"

  echo "▶ Frontend bauen (vite build)..."
  npm run build --prefix frontend 2>&1
  BUILD_EXIT=$?
  if [ $BUILD_EXIT -eq 0 ]; then
    echo "✓ Frontend erfolgreich gebaut"
    # Anzahl Dateien im dist-Verzeichnis anzeigen
    echo "  dist Dateien: $(find frontend/dist -type f 2>/dev/null | wc -l)"
  else
    echo "✗ Frontend-Build FEHLGESCHLAGEN (Exit $BUILD_EXIT)"
  fi
elif [ -f "package.json" ] && command -v npm &>/dev/null; then
  echo "▶ npm install (root)..."
  npm install 2>&1
  echo "▶ Frontend bauen..."
  npm run build 2>&1
  BUILD_EXIT=$?
  [ $BUILD_EXIT -eq 0 ] && echo "✓ Frontend gebaut" || echo "✗ Build fehlgeschlagen (Exit $BUILD_EXIT)"
else
  echo "⚠ npm nicht gefunden oder kein frontend/package.json – Build übersprungen"
fi

# 3. Backend Dependencies
if [ -f "backend/package.json" ]; then
  echo "▶ npm install (backend)..."
  npm install --prefix backend 2>&1
  echo "  Exit-Code: $?"
  echo "✓ Backend Dependencies aktualisiert"
fi

# 4. Service neustarten (kein sudo nötig wenn als root)
echo "▶ Starte Service neu..."
if systemctl restart "$SERVICE_NAME.service" 2>/dev/null; then
  echo "✓ Service neugestartet"
else
  echo "⚠ systemctl restart fehlgeschlagen - versuche kill+restart"
  pkill -f "node.*server.js" 2>/dev/null || true
  echo "✓ Prozess beendet (Watchdog startet ihn neu)"
fi

echo "=== API-Update abgeschlossen: $(date) ==="
