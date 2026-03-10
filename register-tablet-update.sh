#!/bin/bash
# Tablet-Update manuell auf Linux-Server registrieren
# Nutzung: ./register-tablet-update.sh 1.6.2

VERSION="$1"
UPLOAD_DIR="/opt/werkstatt-upload"
BACKEND_URL="http://localhost:3001"

if [ -z "$VERSION" ]; then
  echo "🔧 Tablet-Update Registrierung"
  echo "================================"
  echo ""
  echo "Nutzung: $0 <version>"
  echo "Beispiel: $0 1.6.2"
  echo ""
  echo "Verfügbare Dateien in $UPLOAD_DIR:"
  ls -lh "$UPLOAD_DIR"/Werkstatt-Intern-Setup-*.exe 2>/dev/null || echo "  Keine gefunden"
  exit 1
fi

# Suche passende Datei
FILE_PATH="$UPLOAD_DIR/Werkstatt-Intern-Setup-$VERSION-ia32.exe"

if [ ! -f "$FILE_PATH" ]; then
  echo "❌ Datei nicht gefunden: $FILE_PATH"
  echo ""
  echo "Verfügbare Dateien:"
  ls -lh "$UPLOAD_DIR"/Werkstatt-Intern-Setup-*.exe
  exit 1
fi

echo "📦 Registriere Tablet-Update"
echo "================================"
echo "Version:   $VERSION"
echo "Datei:     $FILE_PATH"
echo "Größe:     $(du -h "$FILE_PATH" | cut -f1)"
echo ""

# Registriere Update
curl -X POST "$BACKEND_URL/api/tablet-update/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"version\": \"$VERSION\",
    \"filePath\": \"$FILE_PATH\",
    \"releaseNotes\": \"Manuell registriert am $(date '+%Y-%m-%d %H:%M:%S')\"
  }"

echo ""
echo ""
echo "✅ Fertig!"
echo ""
echo "Prüfe Status:"
echo "  curl http://localhost:3001/api/tablet-update/check?version=1.0.0"
