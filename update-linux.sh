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

# Sicherstellen dass /usr/sbin und /sbin im PATH sind (Debian 13 / minimal-Umgebungen)
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

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
GIT_BRANCH="master"
AUTO_MODE=false

# Parameter
for arg in "$@"; do
    case $arg in
        --auto)
            AUTO_MODE=true
            ;;
        --branch=*)
            GIT_BRANCH="${arg#*=}"
            ;;
    esac
done

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

# 2. Prüfe ob neue Commits verfügbar sind (via git fetch)
print_step "Prüfe auf Updates..."

if [ -d "$INSTALL_DIR/.git" ]; then
    git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
    git fetch origin "$GIT_BRANCH" 2>/dev/null || {
        print_warning "Kann GitHub nicht erreichen - fahre trotzdem mit lokalem Stand fort"
    }
    LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
    REMOTE=$(git rev-parse "origin/$GIT_BRANCH" 2>/dev/null || echo "")

    if [ -n "$LOCAL" ] && [ -n "$REMOTE" ] && [ "$LOCAL" = "$REMOTE" ]; then
        print_info "Kein neuer Code auf GitHub (Branch: $GIT_BRANCH)"
        if [ "$AUTO_MODE" = true ]; then
            print_success "System ist aktuell - kein Update nötig"
            exit 0
        fi
        echo ""
        read -p "  Trotzdem neu bauen (npm install + Frontend)? (j/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Jj]$ ]]; then
            print_info "Abgebrochen."
            exit 0
        fi
    else
        COMMIT_COUNT=$(git rev-list HEAD..origin/"$GIT_BRANCH" --count 2>/dev/null || echo "?")
        print_info "Neue Commits verfügbar: $COMMIT_COUNT Commit(s) auf origin/$GIT_BRANCH"
    fi
else
    print_warning "Kein git-Repository - überspringe Versionscheck"
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
systemctl stop "$SERVICE_NAME.service" 2>/dev/null || systemctl kill "$SERVICE_NAME.service" 2>/dev/null || true
sleep 2
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
    # Safe directory fuer Root (verhindert Git-Ownership-Fehler)
    git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
    git fetch origin "$GIT_BRANCH"
    git reset --hard "origin/$GIT_BRANCH"
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
print_step "Aktualisiere Backend-Dependencies..."
cd "$INSTALL_DIR/backend"
npm install --production --silent 2>&1 | tail -5
print_success "Backend-Dependencies aktualisiert"

# 9. Frontend neu bauen
print_step "Baue Frontend neu..."
cd "$INSTALL_DIR/frontend"
if [ -f "package.json" ]; then
    npm install 2>&1 | tail -3 || print_warning "Frontend npm install fehlgeschlagen"
    npm run build 2>&1 | tail -5 || {
        print_warning "Frontend Build fehlgeschlagen - versuche alte Version"
    }
    if [ -f "dist/index.html" ]; then
        DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
        print_success "Frontend gebaut ($DIST_SIZE)"
    else
        print_warning "Frontend dist/ nicht erzeugt - Server liefert evtl. kein Frontend"
    fi
else
    print_warning "Frontend package.json nicht gefunden"
fi

# 10. Datenbank-Migrationen
print_step "Prüfe Datenbank-Migrationen..."
if [ -f "$INSTALL_DIR/backend/src/server.js" ]; then
    print_info "Migrationen werden automatisch beim Server-Start ausgeführt"
else
    print_warning "Server-Datei nicht gefunden"
fi

# 11. Permissions setzen
print_step "Setze Permissions..."
chown -R werkstatt:werkstatt "$INSTALL_DIR"
print_success "Permissions gesetzt"

# 12. Service starten
print_step "Starte Server..."
systemctl start "$SERVICE_NAME.service"
sleep 5

# 13. Status prüfen
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
