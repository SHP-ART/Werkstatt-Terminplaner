#!/bin/bash
# ============================================================================
# Werkstatt Terminplaner - Automatisches Linux-Installations-Skript
# ============================================================================
# Installation mit einem Befehl:
#   curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/main/install-linux.sh | sudo bash
# 
# Oder lokal:
#   sudo ./install-linux.sh
# ============================================================================

set -e  # Bei Fehler abbrechen

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Variablen
INSTALL_DIR="/opt/werkstatt-terminplaner"
DATA_DIR="/var/lib/werkstatt-terminplaner"
LOG_DIR="/var/log/werkstatt-terminplaner"
CONFIG_DIR="/etc/werkstatt-terminplaner"
SERVICE_USER="werkstatt"
SERVICE_NAME="werkstatt-terminplaner"
PORT=3001

# Funktionen für Output
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  Werkstatt Terminplaner - Linux Installation              ║${NC}"
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
    echo "Beispiel: sudo ./install-linux.sh"
    exit 1
fi

print_header

# 1. System-Check
print_step "Prüfe System..."
OS_NAME=$(grep "^ID=" /etc/os-release | cut -d= -f2 | tr -d '"')
OS_VERSION=$(grep "^VERSION_ID=" /etc/os-release | cut -d= -f2 | tr -d '"')
print_info "Betriebssystem: $OS_NAME $OS_VERSION"

if [[ "$OS_NAME" != "debian" && "$OS_NAME" != "ubuntu" ]]; then
    print_warning "Nicht getestet auf $OS_NAME - fahre trotzdem fort..."
fi
print_success "System-Check abgeschlossen"

# 2. Node.js installieren
print_step "Prüfe Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//;s/\..*//')
    if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
        print_warning "Node.js $NODE_VERSION ist zu alt (mind. v18 erforderlich)"
        print_step "Installiere Node.js 20 LTS..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        print_success "Node.js aktualisiert: $(node -v)"
    else
        print_success "Node.js bereits installiert: $NODE_VERSION"
    fi
else
    print_step "Installiere Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    print_success "Node.js installiert: $(node -v)"
fi

# 3. Dependencies installieren
print_step "Installiere System-Dependencies..."
apt-get update -qq
apt-get install -y git sqlite3 avahi-daemon curl wget 2>&1 | tail -3 || {
    print_error "Fehler beim Installieren der Dependencies"
    exit 1
}
print_success "System-Dependencies installiert"

# 4. Repository klonen oder aktualisieren
print_step "Lade Anwendung..."
if [ -d "$INSTALL_DIR" ]; then
    print_info "Verzeichnis existiert - aktualisiere..."
    cd "$INSTALL_DIR"
    git pull origin main &>/dev/null || print_warning "Git pull fehlgeschlagen - verwende vorhandene Version"
else
    print_info "Klone Repository..."
    git clone https://github.com/SHP-ART/Werkstatt-Terminplaner.git "$INSTALL_DIR" &>/dev/null
    cd "$INSTALL_DIR"
fi
print_success "Anwendung geladen"

# 5. Backend-Dependencies installieren
print_step "Installiere Backend-Dependencies..."
cd "$INSTALL_DIR/backend"
npm install --production --quiet &>/dev/null
print_success "Backend-Dependencies installiert"

# 6. System-User anlegen
print_step "Erstelle System-User..."
if id "$SERVICE_USER" &>/dev/null; then
    print_info "User '$SERVICE_USER' existiert bereits"
else
    useradd -r -s /bin/false -d "$DATA_DIR" "$SERVICE_USER"
    print_success "User '$SERVICE_USER' erstellt"
fi

# 7. Verzeichnisse erstellen
print_step "Erstelle Verzeichnisse..."
mkdir -p "$DATA_DIR"/{database,backups}
mkdir -p "$LOG_DIR"
mkdir -p "$CONFIG_DIR"

# Anwendungsverzeichnis lesbar für Service-User setzen
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$LOG_DIR"
chmod 755 "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
print_success "Verzeichnisse erstellt"

# 8. Konfiguration erstellen
print_step "Erstelle Konfiguration..."
if [ ! -f "$CONFIG_DIR/.env" ]; then
    cat > "$CONFIG_DIR/.env" << EOF
# Werkstatt Terminplaner Konfiguration
# Bearbeite diese Datei um Einstellungen anzupassen

# Server Port
PORT=$PORT

# CORS-Einstellungen (Komma-getrennt oder * für alle)
CORS_ORIGIN=*

# Node Environment
NODE_ENV=production

# Datenbank-Pfad (optional)
# DB_PATH=$DATA_DIR/database/werkstatt.db

# Externe KI-URL (optional - für Hardware-KI)
# KI_EXTERNAL_URL=http://192.168.1.100:5000

# OpenAI API Key (optional - für Cloud-KI)
# OPENAI_API_KEY=sk-...
EOF
    print_success "Konfiguration erstellt"
else
    print_info "Konfiguration existiert bereits"
fi

# Symlink für Backend
ln -sf "$CONFIG_DIR/.env" "$INSTALL_DIR/backend/.env" 2>/dev/null || true

# 9. systemd-Service installieren
print_step "Installiere systemd-Service..."
cat > /lib/systemd/system/"$SERVICE_NAME.service" << 'EOF'
[Unit]
Description=Werkstatt Terminplaner Server
Documentation=https://github.com/SHP-ART/Werkstatt-Terminplaner
After=network.target

[Service]
Type=simple
User=werkstatt
Group=werkstatt
WorkingDirectory=/opt/werkstatt-terminplaner/backend
Environment="NODE_ENV=production"
Environment="DATA_DIR=/var/lib/werkstatt-terminplaner"
Environment="PORT=3001"
ExecStart=/usr/bin/node /opt/werkstatt-terminplaner/backend/src/server.js
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=werkstatt-terminplaner

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/werkstatt-terminplaner
ReadWritePaths=/var/log/werkstatt-terminplaner

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
print_success "systemd-Service installiert"

# 10. Service aktivieren und starten
print_step "Starte Server..."
systemctl enable "$SERVICE_NAME.service" &>/dev/null
systemctl restart "$SERVICE_NAME.service"
sleep 3

# 11. Status prüfen
if systemctl is-active --quiet "$SERVICE_NAME.service"; then
    print_success "Server läuft"
    
    # Server-Info sammeln
    SERVER_IP=$(hostname -I | awk '{print $1}')
    
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Installation erfolgreich abgeschlossen! 🎉                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🌐 Zugriff auf die Anwendung:${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  📱 Frontend:  ${GREEN}http://$SERVER_IP:$PORT${NC}"
    echo -e "  📊 Status:    ${GREEN}http://$SERVER_IP:$PORT/status${NC}"
    echo -e "  🔌 API:       ${GREEN}http://$SERVER_IP:$PORT/api/health${NC}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🛠️  Nützliche Befehle:${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${YELLOW}Status anzeigen:${NC}"
    echo -e "    systemctl status $SERVICE_NAME"
    echo ""
    echo -e "  ${YELLOW}Server neu starten:${NC}"
    echo -e "    sudo systemctl restart $SERVICE_NAME"
    echo ""
    echo -e "  ${YELLOW}Logs live anzeigen:${NC}"
    echo -e "    sudo journalctl -u $SERVICE_NAME -f"
    echo ""
    echo -e "  ${YELLOW}Konfiguration bearbeiten:${NC}"
    echo -e "    sudo nano $CONFIG_DIR/.env"
    echo -e "    ${CYAN}(Danach: sudo systemctl restart $SERVICE_NAME)${NC}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📁 Wichtige Verzeichnisse:${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Anwendung:     $INSTALL_DIR"
    echo -e "  Datenbank:     $DATA_DIR/database/"
    echo -e "  Backups:       $DATA_DIR/backups/"
    echo -e "  Konfiguration: $CONFIG_DIR/.env"
    echo -e "  Logs:          journalctl -u $SERVICE_NAME"
    echo ""
    
    # Firewall-Check
    if command -v ufw >/dev/null 2>&1; then
        if ufw status 2>/dev/null | grep -q "Status: active"; then
            echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${YELLOW}⚠  Firewall aktiv!${NC}"
            echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "  Port öffnen mit:"
            echo -e "    ${GREEN}sudo ufw allow $PORT/tcp${NC}"
            echo ""
        fi
    fi
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📚 Dokumentation:${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  https://github.com/SHP-ART/Werkstatt-Terminplaner"
    echo ""
    
else
    print_error "Server konnte nicht gestartet werden"
    echo ""
    echo "Fehleranalyse:"
    echo "  sudo systemctl status $SERVICE_NAME"
    echo "  sudo journalctl -u $SERVICE_NAME -n 50"
    exit 1
fi

exit 0
