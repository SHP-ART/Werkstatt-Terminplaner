#!/bin/bash
# Auto-Register neue Tablet-Updates vom SMB-Share
# Aufruf: ./auto-register-tablet-update.sh
# Oder als Cron-Job: */10 * * * * /opt/scripts/auto-register-tablet-update.sh

UPLOAD_DIR="/opt/werkstatt-upload"
BACKEND_URL="http://localhost:3001"
STATE_FILE="/tmp/tablet-update-last-version.txt"

# Neueste Datei finden
LATEST_FILE=$(ls -t "$UPLOAD_DIR"/Werkstatt-Intern-Setup-*-ia32.exe 2>/dev/null | head -n1)

if [ -z "$LATEST_FILE" ]; then
  echo "Keine Tablet-Update-Datei gefunden in $UPLOAD_DIR"
  exit 0
fi

# Version aus Dateiname extrahieren (z.B. "1.6.2" aus "Werkstatt-Intern-Setup-1.6.2-ia32.exe")
VERSION=$(basename "$LATEST_FILE" | sed -E 's/Werkstatt-Intern-Setup-([0-9]+\.[0-9]+\.[0-9]+)-ia32\.exe/\1/')

if [ -z "$VERSION" ]; then
  echo "Konnte Version nicht aus Dateiname extrahieren: $LATEST_FILE"
  exit 1
fi

# Prüfe ob diese Version schon registriert wurde
if [ -f "$STATE_FILE" ]; then
  LAST_VERSION=$(cat "$STATE_FILE")
  if [ "$LAST_VERSION" = "$VERSION" ]; then
    echo "Version $VERSION bereits registriert (keine Änderung)"
    exit 0
  fi
fi

# Registriere neue Version
echo "Registriere neues Tablet-Update: $VERSION"
echo "Datei: $LATEST_FILE"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/api/tablet-update/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"version\": \"$VERSION\",
    \"filePath\": \"$LATEST_FILE\",
    \"releaseNotes\": \"Automatisch registriert am $(date '+%Y-%m-%d %H:%M:%S')\"
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Update erfolgreich registriert!"
  echo "$VERSION" > "$STATE_FILE"
  echo "$BODY"
else
  echo "❌ Fehler beim Registrieren (HTTP $HTTP_CODE):"
  echo "$BODY"
  exit 1
fi
