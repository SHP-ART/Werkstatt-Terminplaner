#!/bin/bash
# ============================================================================
# Werkstatt Terminplaner - Linux Update-Skript
# ============================================================================
# Update mit einem Befehl:
#   sudo ./update-linux.sh
# 
# Oder automatisch (cronjob):
#   0 3 * * 0 /opt/werkstatt-terminplaner/update-linux.sh --auto
# ============================================================================

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variablen
INSTALL_DIR="/opt/werkstatt-terminplaner"
DATA_DIR="/var/lib/werkstatt-terminplaner"
BACKUP_DIR="$DATA_DIR/backups"
SERVICE_NAME="werkstatt-terminplaner"
GITHUB_REPO="SHP-ART/Werkstatt-Terminplaner"
AUTO_MODE=false

# Parameter
if [[ "$1" == "--auto" ]]; then
    AUTO_MODE=true
fi

# Funktionen
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Werkstatt Terminplaner - Update System                   ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

# Root-Check
if [ "$EUID" -ne 0 ]; then 
    print_error "Bitte als root ausführen oder mit sudo"
    exit 1
fi

print_header

# 1. Aktuelle Version ermitteln
print_step "Prüfe installierte Version..."
if [ ! -d "$INSTALL_DIR" ]; then
    print_error "Werkstatt Terminplaner ist nicht installiert"
    print_info "Installation: curl -fsSL https://raw.githubusercontent.com/$GITHUB_REPO/main/install-linux.sh | sudo bash"
    exit 1
fi

cd "$INSTALL_DIR"

# Version aus package.json auslesen
if [ -f "backend/package.json" ]; then
    CURRENT_VERSION=$(node -p "require('./backend/package.json').version" 2>/dev/null || echo "unknown")
    print_info "Installierte Version: $CURRENT_VERSION"
else
    print_warning "Kann Version nicht ermitteln"
    CURRENT_VERSION="unknown"
fi

# 2. Neueste Version von GitHub prüfen
print_step "Prüfe auf Updates..."
LATEST_VERSION=$(curl -s "https://api.github.com/repos/$GITHUB_REPO/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v?([^"]+)".*/\1/' 2>/dev/null || echo "")

if [ -z "$LATEST_VERSION" ]; then
    print_error "Kann neueste Version nicht von GitHub abrufen"
    exit 1
fi

print_info "Neueste Version: $LATEST_VERSION"

# 3. Versions-Vergleich
if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
    print_success "System ist bereits auf dem neuesten Stand!"
    
    if [ "$AUTO_MODE" = true ]; then
        exit 0
    fi
    
    echo ""
    read -p "Trotzdem neu installieren? (j/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Jj]$ ]]; then
        exit 0
    fi
fi

# 4. Backup erstellen
print_step "Erstelle Backup vor Update..."
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/pre_update_${CURRENT_VERSION}_${TIMESTAMP}.db"

if [ -f "$DATA_DIR/database/werkstatt.db" ]; then
    cp "$DATA_DIR/database/werkstatt.db" "$BACKUP_FILE"
    print_success "Backup erstellt: $(basename $BACKUP_FILE)"
else
    print_warning "Keine Datenbank gefunden - kein Backup erstellt"
fi

# 5. Service stoppen
print_step "Stoppe Server..."
systemctl stop "$SERVICE_NAME.service"
print_success "Server gestoppt"

# 6. Alten Code sichern
print_step "Sichere aktuelle Installation..."
OLD_BACKUP="/tmp/werkstatt-backup-$TIMESTAMP"
cp -r "$INSTALL_DIR" "$OLD_BACKUP"
print_success "Gesichert nach: $OLD_BACKUP"

# 7. Update durchführen
print_step "Lade neue Version..."
cd "$INSTALL_DIR"

# Git pull wenn möglich
if [ -d ".git" ]; then
    git fetch origin main
    git reset --hard origin/main
    print_success "Code aktualisiert via git"
else
    # Fallback: Frisches Clone
    print_warning "Kein git-Repository - führe Neuinstallation durch..."
    cd /tmp
    rm -rf werkstatt-temp
    git clone "https://github.com/$GITHUB_REPO.git" werkstatt-temp
    
    # Ersetze alles außer .env und node_modules
    cd "$INSTALL_DIR"
    find . -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'node_modules' -exec rm -rf {} +
    cp -r /tmp/werkstatt-temp/* .
    rm -rf /tmp/werkstatt-temp
    print_success "Code neu installiert"
fi

# 8. Dependencies aktualisieren
print_step "Aktualisiere Dependencies..."
cd "$INSTALL_DIR/backend"
npm install --production --silent 2>&1 | tail -5
print_success "Dependencies aktualisiert"

# 9. Datenbank-Migrationen (falls vorhanden)
print_step "Prüfe Datenbank-Migrationen..."
if [ -f "$INSTALL_DIR/backend/src/server.js" ]; then
    # Migrationen werden automatisch beim Server-Start ausgeführt
    print_info "Migrationen werden beim Start ausgeführt"
else
    print_warning "Server-Datei nicht gefunden"
fi

# 10. Permissions setzen
print_step "Setze Permissions..."
chown -R werkstatt:werkstatt "$INSTALL_DIR"
print_success "Permissions gesetzt"

# 11. Service starten
print_step "Starte Server..."
systemctl start "$SERVICE_NAME.service"
sleep 5

# 12. Status prüfen
if systemctl is-active --quiet "$SERVICE_NAME.service"; then
    print_success "Server läuft"
    
    # Neue Version prüfen
    NEW_VERSION=$(node -p "require('./backend/package.json').version" 2>/dev/null || echo "unknown")
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Update erfolgreich abgeschlossen! 🎉                      ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}Alte Version:${NC} $CURRENT_VERSION"
    echo -e "  ${CYAN}Neue Version:${NC} $NEW_VERSION"
    echo ""
    echo -e "  ${CYAN}Backup:${NC} $(basename $BACKUP_FILE)"
    echo -e "  ${CYAN}Code-Backup:${NC} $OLD_BACKUP"
    echo ""
    
    # Server-IP und Port
    SERVER_IP=$(hostname -I | awk '{print $1}')
    PORT=$(grep -oP 'PORT=\K[0-9]+' /etc/werkstatt-terminplaner/.env 2>/dev/null || echo "3001")
    echo -e "  ${CYAN}Zugriff:${NC} http://$SERVER_IP:$PORT"
    echo ""
    
    print_info "Alte Code-Sicherung kann gelöscht werden mit:"
    echo -e "  ${YELLOW}sudo rm -rf $OLD_BACKUP${NC}"
    echo ""
    
    # Changelog anzeigen (falls vorhanden)
    if [ -f "$INSTALL_DIR/CHANGELOG.md" ]; then
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}📝 Änderungen in Version $NEW_VERSION:${NC}"
        echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        # Zeige die letzten 20 Zeilen des Changelogs
        head -20 "$INSTALL_DIR/CHANGELOG.md"
        echo ""
    fi
    
else
    print_error "Server konnte nicht gestartet werden!"
    echo ""
    echo "Fehleranalyse:"
    echo "  sudo systemctl status $SERVICE_NAME"
    echo "  sudo journalctl -u $SERVICE_NAME -n 50"
    echo ""
    print_warning "Rollback möglich mit:"
    echo "  sudo systemctl stop $SERVICE_NAME"
    echo "  sudo rm -rf $INSTALL_DIR"
    echo "  sudo mv $OLD_BACKUP $INSTALL_DIR"
    echo "  sudo systemctl start $SERVICE_NAME"
    echo ""
    exit 1
fi

exit 0
