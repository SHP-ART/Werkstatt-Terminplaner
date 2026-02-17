#!/bin/bash
# ============================================================================
# Build-Skript für Werkstatt Terminplaner Debian-Paket
# ============================================================================

set -e  # Bei Fehler abbrechen

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variablen
VERSION=$(node -p "require('./backend/package.json').version")
ARCH="amd64"
PKG_NAME="werkstatt-terminplaner"
BUILD_DIR="packaging/linux/debian"
OUTPUT_DIR="dist-linux"
DEB_FILE="${PKG_NAME}_${VERSION}_${ARCH}.deb"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Werkstatt Terminplaner - Debian Package Builder          ║${NC}"
echo -e "${BLUE}║  Version: ${VERSION}                                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Funktion für Status-Meldungen
print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# 1. Aufräumen alter Builds
print_step "Bereinige alte Builds..."
rm -rf "$BUILD_DIR/opt" "$BUILD_DIR/lib" "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"
print_success "Bereinigung abgeschlossen"

# 2. Backend-Dependencies installieren
print_step "Installiere Backend-Dependencies (production)..."
cd backend
npm install --production --no-optional
cd ..
print_success "Backend-Dependencies installiert"

# 3. Frontend bauen (optional - falls Vite Build gewünscht)
if [ -d "frontend" ]; then
    print_step "Baue Frontend..."
    cd frontend
    if [ -f "package.json" ]; then
        npm install
        # Prüfe ob Vite-Build-Script existiert
        if npm run | grep -q "build"; then
            npm run build
            print_success "Frontend gebaut (Vite)"
        else
            print_success "Frontend wird in Original-Form verwendet (kein Build nötig)"
        fi
    fi
    cd ..
fi

# 4. Paket-Struktur erstellen
print_step "Erstelle Paket-Struktur..."

# Zielverzeichnisse erstellen
mkdir -p "$BUILD_DIR/opt/$PKG_NAME"
mkdir -p "$BUILD_DIR/lib/systemd/system"
mkdir -p "$BUILD_DIR/etc/$PKG_NAME"

# Backend kopieren
print_step "Kopiere Backend..."
cp -r backend/src "$BUILD_DIR/opt/$PKG_NAME/"
cp -r backend/node_modules "$BUILD_DIR/opt/$PKG_NAME/"
cp backend/package.json "$BUILD_DIR/opt/$PKG_NAME/"
cp backend/.env.example "$BUILD_DIR/etc/$PKG_NAME/" 2>/dev/null || true

# Migrations kopieren (WICHTIG: benötigt von database.js)
print_step "Kopiere Migrations..."
if [ -d "backend/migrations" ]; then
    cp -r backend/migrations "$BUILD_DIR/opt/$PKG_NAME/"
    print_success "Migrations kopiert"
else
    print_error "WARNUNG: migrations/ Verzeichnis nicht gefunden!"
fi

# Frontend kopieren
print_step "Kopiere Frontend..."
if [ -d "frontend/dist" ]; then
    # Vite Build vorhanden
    cp -r frontend/dist "$BUILD_DIR/opt/$PKG_NAME/frontend"
    print_success "Frontend (Vite dist) kopiert"
elif [ -d "frontend" ]; then
    # Original Frontend
    mkdir -p "$BUILD_DIR/opt/$PKG_NAME/frontend"
    # Kopiere nur relevante Frontend-Dateien (nicht node_modules)
    if command -v rsync &> /dev/null; then
        rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' \
            frontend/ "$BUILD_DIR/opt/$PKG_NAME/frontend/"
    else
        # Fallback ohne rsync
        cp -r frontend/ "$BUILD_DIR/opt/$PKG_NAME/frontend/"
        rm -rf "$BUILD_DIR/opt/$PKG_NAME/frontend/node_modules" \
               "$BUILD_DIR/opt/$PKG_NAME/frontend/.git" \
               "$BUILD_DIR/opt/$PKG_NAME/frontend/dist" 2>/dev/null || true
    fi
    print_success "Frontend (Original) kopiert"
fi

# systemd-Service-Datei kopieren
print_step "Kopiere systemd-Service..."
cp packaging/linux/werkstatt-terminplaner.service "$BUILD_DIR/lib/systemd/system/"
print_success "systemd-Service kopiert"

# 5. Control-Datei mit Version aktualisieren
print_step "Aktualisiere Control-Datei..."
sed -i.bak "s/^Version:.*/Version: $VERSION/" "$BUILD_DIR/DEBIAN/control"
rm -f "$BUILD_DIR/DEBIAN/control.bak"
print_success "Control-Datei aktualisiert"

# 6. Permissions setzen
print_step "Setze Permissions..."
chmod 755 "$BUILD_DIR/DEBIAN/postinst"
chmod 755 "$BUILD_DIR/DEBIAN/prerm"
chmod 755 "$BUILD_DIR/DEBIAN/postrm"
chmod -R 755 "$BUILD_DIR/opt/$PKG_NAME"
print_success "Permissions gesetzt"

# 7. deb-Paket erstellen
print_step "Erstelle deb-Paket..."
fakeroot dpkg-deb --build "$BUILD_DIR" "$OUTPUT_DIR/$DEB_FILE"

if [ $? -eq 0 ]; then
    print_success "deb-Paket erstellt: $OUTPUT_DIR/$DEB_FILE"
else
    print_error "Fehler beim Erstellen des deb-Pakets"
    exit 1
fi

# 8. Paket-Informationen anzeigen
print_step "Paket-Informationen:"
dpkg-deb --info "$OUTPUT_DIR/$DEB_FILE"

# 9. Größe anzeigen
FILE_SIZE=$(du -h "$OUTPUT_DIR/$DEB_FILE" | cut -f1)
print_success "Paketgröße: $FILE_SIZE"

# 10. Lintian-Check (optional)
if command -v lintian &> /dev/null; then
    print_step "Führe Lintian-Check durch..."
    lintian "$OUTPUT_DIR/$DEB_FILE" || true
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Build erfolgreich abgeschlossen!                          ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Paket: ${YELLOW}$OUTPUT_DIR/$DEB_FILE${NC}"
echo -e "Größe: ${YELLOW}$FILE_SIZE${NC}"
echo ""
echo -e "Installation:"
echo -e "  ${BLUE}sudo dpkg -i $OUTPUT_DIR/$DEB_FILE${NC}"
echo -e "  ${BLUE}sudo apt-get install -f${NC}"
echo ""
echo -e "Deinstallation:"
echo -e "  ${BLUE}sudo apt remove $PKG_NAME${NC}"
echo ""
