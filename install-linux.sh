#!/bin/bash
# ============================================================================
# Werkstatt Terminplaner - All-in-One KI-Server Installation (Linux)
# ============================================================================
# Installiert den kompletten Werkstatt-Terminplaner mit lokaler KI,
# Frontend-Build, SQLite-Optimierungen und systemd-Service.
#
# Installation mit einem Befehl:
#   curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/install-linux.sh | sudo bash
#
# Oder lokal:
#   sudo ./install-linux.sh
#
# Optionen:
#   --port=XXXX       Server-Port (Standard: 3001)
#   --branch=NAME     Git-Branch (Standard: master)
#   --no-frontend     Frontend-Build überspringen
#   --with-openai     OpenAI API-Key interaktiv abfragen
#   --with-ki         Externe KI (ML-Service) auf diesem Server installieren
#   --with-ollama     Ollama + lokales LLM installieren (empfohlen fuer Linux-Server)
# ============================================================================

set -e  # Bei Fehler abbrechen

# Sicherstellen dass /usr/sbin und /sbin im PATH sind (Debian 13 / minimal-Umgebungen)
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# ============================================================================
# KONFIGURATION
# ============================================================================

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Standard-Variablen
INSTALL_DIR="/opt/werkstatt-terminplaner"
DATA_DIR="/var/lib/werkstatt-terminplaner"
LOG_DIR="/var/log/werkstatt-terminplaner"
CONFIG_DIR="/etc/werkstatt-terminplaner"
SERVICE_USER="werkstatt"
SERVICE_NAME="werkstatt-terminplaner"
REPO_URL="https://github.com/SHP-ART/Werkstatt-Terminplaner.git"
PORT=3001
GIT_BRANCH="master"
BUILD_FRONTEND=true
SETUP_OPENAI=false
SETUP_KI=true
SETUP_OLLAMA=true
OLLAMA_MODEL_DEFAULT="llama3.2"
ERRORS=0

# Kommandozeilen-Argumente parsen
for arg in "$@"; do
    case $arg in
        --port=*)
            PORT="${arg#*=}"
            ;;
        --branch=*)
            GIT_BRANCH="${arg#*=}"
            ;;
        --no-frontend)
            BUILD_FRONTEND=false
            ;;
        --with-openai)
            SETUP_OPENAI=true
            ;;
        --with-ki)
            SETUP_KI=true
            ;;
        --with-ollama)
            SETUP_OLLAMA=true
            ;;
        --ollama-model=*)
            OLLAMA_MODEL_DEFAULT="${arg#*=}"
            ;;
        --help|-h)
            echo "Werkstatt Terminplaner - All-in-One KI-Server Installation"
            echo ""
            echo "Optionen:"
            echo "  --port=XXXX       Server-Port (Standard: 3001)"
            echo "  --branch=NAME     Git-Branch (Standard: master)"
            echo "  --no-frontend     Frontend-Build überspringen"
            echo "  --with-openai     OpenAI API-Key interaktiv abfragen"
            echo "  --with-ki         Externe KI (ML-Service) mitinstallieren"
            echo "  --with-ollama     Ollama + lokales LLM installieren (empfohlen fuer Linux-Server)"
            echo "  --ollama-model=NAME  Ollama-Modell (Standard: llama3.2)"
            echo "  --help            Hilfe anzeigen"
            exit 0
            ;;
    esac
done

# ============================================================================
# HILFSFUNKTIONEN
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  ${BOLD}Werkstatt Terminplaner - All-in-One KI-Server${NC}${BLUE}                ║${NC}"
    echo -e "${BLUE}║  Linux Headless Installation                                   ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}Backend${NC}  + ${MAGENTA}Lokale KI${NC} + ${GREEN}Frontend${NC} + ${YELLOW}SQLite-Optimiert${NC} + ${BLUE}systemd${NC}"
    if [ "$SETUP_KI" = true ]; then
        echo -e "  + ${MAGENTA}Externe KI (ML-Service mit scikit-learn)${NC}"
    fi
    if [ "$SETUP_OLLAMA" = true ]; then
        echo -e "  + ${CYAN}Ollama (lokales LLM: $OLLAMA_MODEL_DEFAULT)${NC}"
    fi
    echo ""
}

print_step() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}▶ $1${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_substep() {
    echo -e "  ${CYAN}▸${NC} $1"
}

print_success() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "  ${RED}✗${NC} $1"
    ERRORS=$((ERRORS + 1))
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "  ${CYAN}ℹ${NC} $1"
}

# Fehlerbehandlung
cleanup_on_error() {
    echo ""
    print_error "Installation abgebrochen!"
    echo -e "  Fehlerlog: ${YELLOW}sudo journalctl -u $SERVICE_NAME -n 50${NC}"
    exit 1
}
trap cleanup_on_error ERR

# ============================================================================
# VORAUSSETZUNGEN
# ============================================================================

# Root-Check
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Bitte als root ausführen oder mit sudo${NC}"
    echo "  Beispiel: sudo ./install-linux.sh"
    echo "  Oder:     curl -fsSL https://...install-linux.sh | sudo bash"
    exit 1
fi

# ============================================================================
# INTERAKTIVER SETUP-ASSISTENT
# ============================================================================
# Wird nur angezeigt wenn: interaktives Terminal vorhanden UND
# keine Flags explizit gesetzt wurden (alles noch auf Standardwerten)
# Beim Pipen (curl | bash) wird der Assistent übersprungen.

# Interaktiver Setup-Assistent:
# Läuft wenn ein Terminal vorhanden ist (nicht bei curl | bash).
# Fragt nur nach Port, Ollama-Modell und optionalem OpenAI-Key.
# Ollama + Externe KI werden IMMER installiert.
if [ -t 0 ]; then

    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  ${BOLD}Werkstatt Terminplaner - Setup-Assistent${NC}${BLUE}                      ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  Folgendes wird ${BOLD}immer${NC} installiert:"
    echo -e "  ${GREEN}✓${NC} Werkstatt-Terminplaner (Backend + Frontend)"
    echo -e "  ${GREEN}✓${NC} Ollama (lokales LLM) — Aktivierung im Frontend: Einstellungen > KI > Ollama"
    echo -e "  ${GREEN}✓${NC} Externe KI (ML-Service, scikit-learn)"
    echo ""
    echo -e "  Beantworte die folgenden Fragen (Enter = Standard-Wert)."
    echo ""

    # --- Port ---
    echo -e "  ${CYAN}▸ Server-Port${NC} [Standard: 3001]"
    read -r -p "    Port eingeben (Enter = 3001): " INPUT_PORT
    if [ -n "$INPUT_PORT" ] && [[ "$INPUT_PORT" =~ ^[0-9]+$ ]]; then
        PORT="$INPUT_PORT"
        echo -e "    ${GREEN}✓ Port: $PORT${NC}"
    else
        echo -e "    ${GREEN}✓ Port: 3001 (Standard)${NC}"
    fi
    echo ""

    # --- Ollama-Modell ---
    echo -e "  ${CYAN}▸ Ollama-Modell${NC}"
    echo -e "    ${BOLD}1)${NC} llama3.2  — 2 GB, schnell, gut für Werkstatt-Texte ${GREEN}(empfohlen)${NC}"
    echo -e "    ${BOLD}2)${NC} mistral   — 4 GB, besser bei komplexen Anfragen"
    echo -e "    ${BOLD}3)${NC} llama3.1  — 5 GB, sehr gute Qualität"
    echo -e "    ${BOLD}4)${NC} Eigene Eingabe"
    read -r -p "    Modell wählen [1-4, Enter = 1]: " MODELL_WAHL
    case "$MODELL_WAHL" in
        2) OLLAMA_MODEL_DEFAULT="mistral"  ; echo -e "    ${GREEN}✓ Modell: mistral${NC}"  ;;
        3) OLLAMA_MODEL_DEFAULT="llama3.1" ; echo -e "    ${GREEN}✓ Modell: llama3.1${NC}" ;;
        4)
            read -r -p "    Modell-Name eingeben: " CUSTOM_MODEL
            if [ -n "$CUSTOM_MODEL" ]; then
                OLLAMA_MODEL_DEFAULT="$CUSTOM_MODEL"
                echo -e "    ${GREEN}✓ Modell: $OLLAMA_MODEL_DEFAULT${NC}"
            else
                echo -e "    ${GREEN}✓ Modell: llama3.2 (Standard)${NC}"
            fi
            ;;
        *) OLLAMA_MODEL_DEFAULT="llama3.2" ; echo -e "    ${GREEN}✓ Modell: llama3.2 (Standard)${NC}" ;;
    esac
    echo ""

    # --- OpenAI (optional) ---
    echo -e "  ${CYAN}▸ OpenAI API-Key${NC} ${YELLOW}(optional)${NC}"
    echo -e "    Nur nötig wenn du zusätzlich OpenAI Cloud-KI nutzen möchtest."
    echo -e "    Leer lassen = Ollama / lokale KI verwenden (kein Internet nötig)."
    read -r -p "    OpenAI API-Key (sk-... oder Enter zum Überspringen): " OPENAI_KEY_INPUT
    if [ -n "$OPENAI_KEY_INPUT" ]; then
        SETUP_OPENAI=true
        OPENAI_KEY_PREFILL="$OPENAI_KEY_INPUT"
        echo -e "    ${GREEN}✓ OpenAI API-Key wird konfiguriert${NC}"
    else
        echo -e "    ${CYAN}ℹ${NC} OpenAI übersprungen"
    fi
    echo ""

    # --- Zusammenfassung + Bestätigung ---
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD} Installations-Zusammenfassung${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}✓${NC} Werkstatt-Terminplaner auf Port $PORT"
    echo -e "  ${GREEN}✓${NC} Ollama  — Modell: $OLLAMA_MODEL_DEFAULT  (Aktivierung im Frontend)"
    echo -e "  ${GREEN}✓${NC} Externe KI (ML-Service)"
    if [ "$SETUP_OPENAI" = true ]; then
        echo -e "  ${GREEN}✓${NC} OpenAI API-Key konfiguriert"
    fi
    echo ""
    read -r -p "  Installation starten? [J/n]: " BESTÄTIGUNG
    case "$BESTÄTIGUNG" in
        [nN]*)
            echo -e "  ${YELLOW}Abgebrochen.${NC}"
            exit 0
            ;;
        *) echo -e "  ${GREEN}▶ Starte Installation...${NC}" ;;
    esac
    echo ""
fi

print_header

# ============================================================================
# SCHRITT 1: SYSTEM-CHECK
# ============================================================================
print_step "1/11 - System-Check"

OS_NAME=$(grep "^ID=" /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "unknown")
OS_VERSION=$(grep "^VERSION_ID=" /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "?")
OS_PRETTY=$(grep "^PRETTY_NAME=" /etc/os-release 2>/dev/null | cut -d= -f2 | tr -d '"' || echo "$OS_NAME $OS_VERSION")
ARCH=$(uname -m)
RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/ {print $2}')
if [ -z "$RAM_MB" ]; then
    RAM_MB=$(awk '/^MemTotal:/ {printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo "?")
fi
[ -z "$RAM_MB" ] && RAM_MB="?"
DISK_FREE=$(df -h / 2>/dev/null | awk 'NR==2 {print $4}' || echo "?")

print_info "System:  $OS_PRETTY ($ARCH)"
print_info "RAM:     ${RAM_MB} MB"
print_info "Disk:    ${DISK_FREE} frei"
print_info "Port:    $PORT"
print_info "Branch:  $GIT_BRANCH"
if [ "$SETUP_KI" = true ]; then
    print_info "KI:      Externe KI wird mitinstalliert (--with-ki)"
fi
if [ "$SETUP_OLLAMA" = true ]; then
    print_info "Ollama:  Wird installiert (Modell: $OLLAMA_MODEL_DEFAULT)"
fi

if [[ "$OS_NAME" != "debian" && "$OS_NAME" != "ubuntu" && "$OS_NAME" != "raspbian" ]]; then
    print_warning "Nicht offiziell getestet auf $OS_NAME - fahre trotzdem fort..."
fi

# RAM-Warnung
if [ -n "$RAM_MB" ] && [ "$RAM_MB" != "?" ] && [ "$RAM_MB" -gt 0 ] 2>/dev/null && [ "$RAM_MB" -lt 512 ]; then
    print_warning "Wenig RAM (${RAM_MB} MB) - mindestens 512 MB empfohlen"
fi

print_success "System-Check abgeschlossen"

# ============================================================================
# SCHRITT 2: NODE.JS INSTALLIEREN
# ============================================================================
print_step "2/11 - Node.js 20 LTS"

install_nodejs() {
    print_substep "Installiere Node.js 20 LTS..."
    if curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/dev/null; then
        apt-get install -y nodejs &>/dev/null
        print_success "Node.js installiert: $(node -v)"
    else
        print_error "NodeSource-Repository fehlgeschlagen"
        print_substep "Versuche Alternative (apt)..."
        apt-get install -y nodejs npm &>/dev/null || {
            print_error "Node.js konnte nicht installiert werden!"
            exit 1
        }
        print_success "Node.js installiert (apt): $(node -v)"
    fi
}

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//;s/\..*//')
    if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
        print_warning "Node.js $NODE_VERSION ist zu alt (mind. v18)"
        install_nodejs
    else
        print_success "Node.js vorhanden: $NODE_VERSION"
    fi
else
    install_nodejs
fi

# npm prüfen
if ! command -v npm &> /dev/null; then
    print_error "npm nicht gefunden!"
    exit 1
fi
print_success "npm vorhanden: $(npm -v)"

# ============================================================================
# SCHRITT 3: SYSTEM-DEPENDENCIES
# ============================================================================
print_step "3/11 - System-Dependencies"

print_substep "Aktualisiere Paketlisten..."
apt-get update -qq 2>/dev/null

# Basis-Pakete
PACKAGES="git sqlite3 curl wget"
print_substep "Installiere Basis: $PACKAGES"
apt-get install -y $PACKAGES &>/dev/null || {
    print_error "Basis-Pakete fehlgeschlagen"
    exit 1
}
print_success "Basis-Pakete installiert"

# Build-Tools fuer native Node-Module (sqlite3, mdns-js)
print_substep "Installiere Build-Tools (fuer native Node-Module)..."
apt-get install -y build-essential python3 &>/dev/null || {
    print_warning "Build-Tools teilweise fehlgeschlagen - native Module koennten Probleme machen"
}
print_success "Build-Tools installiert"

# Python-venv fuer externe KI (falls --with-ki)
if [ "$SETUP_KI" = true ]; then
    print_substep "Installiere Python-venv (fuer ML KI-Service)..."
    apt-get install -y python3-venv python3-pip &>/dev/null || {
        print_warning "Python-venv nicht installiert - --with-ki koennte fehlschlagen"
    }
    print_success "Python-venv installiert"
fi

# mDNS/Avahi fuer KI-Discovery im Netzwerk
print_substep "Installiere Avahi/mDNS (KI-Discovery)..."
apt-get install -y avahi-daemon libavahi-compat-libdnssd-dev &>/dev/null || {
    print_warning "Avahi/mDNS nicht verfuegbar - KI-Discovery im LAN deaktiviert"
    print_info "Externe KI kann manuell per URL konfiguriert werden"
}
print_success "Avahi/mDNS installiert (KI-Discovery aktiv)"

# ============================================================================
# SCHRITT 4: REPOSITORY LADEN
# ============================================================================
print_step "4/11 - Anwendung laden"

if [ -d "$INSTALL_DIR/.git" ]; then
    print_info "Verzeichnis existiert - aktualisiere..."
    cd "$INSTALL_DIR"
    # Aktuelle Version merken
    OLD_VERSION=$(node -p "require('./backend/package.json').version" 2>/dev/null || echo "?")
    git fetch origin &>/dev/null || true
    git checkout "$GIT_BRANCH" &>/dev/null || true
    git pull origin "$GIT_BRANCH" &>/dev/null || print_warning "Git pull fehlgeschlagen - verwende vorhandene Version"
    NEW_VERSION=$(node -p "require('./backend/package.json').version" 2>/dev/null || echo "?")
    if [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
        print_info "Update: v$OLD_VERSION -> v$NEW_VERSION"
    fi
elif [ -d "$INSTALL_DIR" ]; then
    print_info "Verzeichnis existiert (kein Git) - ueberspringe Clone"
    cd "$INSTALL_DIR"
else
    print_substep "Klone Repository (Branch: $GIT_BRANCH)..."
    git clone --branch "$GIT_BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR" &>/dev/null || {
        # Fallback ohne --depth (aeltere Git-Versionen)
        git clone --branch "$GIT_BRANCH" "$REPO_URL" "$INSTALL_DIR" &>/dev/null
    }
    cd "$INSTALL_DIR"
fi

APP_VERSION=$(node -p "require('./backend/package.json').version" 2>/dev/null || echo "unbekannt")
print_success "Anwendung geladen (v$APP_VERSION)"

# ============================================================================
# SCHRITT 5: BACKEND INSTALLIEREN
# ============================================================================
print_step "5/11 - Backend installieren"

cd "$INSTALL_DIR/backend"

print_substep "Installiere Backend-Dependencies..."
npm install --production 2>&1 | tail -5 || {
    print_error "Backend npm install fehlgeschlagen"
    exit 1
}
print_success "Backend-Dependencies installiert"

# Prüfe ob sqlite3 native Modul geladen werden kann
if node -e "require('better-sqlite3')" 2>/dev/null; then
    print_success "SQLite3 native Modul OK"
elif node -e "require('sqlite3')" 2>/dev/null; then
    print_success "SQLite3 Modul OK"
else
    print_warning "SQLite3-Modul Test uebersprungen (wird beim Start geladen)"
fi

# ============================================================================
# SCHRITT 6: FRONTEND BAUEN
# ============================================================================
print_step "6/11 - Frontend bauen"

if [ "$BUILD_FRONTEND" = true ]; then
    cd "$INSTALL_DIR/frontend"

    # Prüfe ob dist/ bereits existiert und aktuell ist
    if [ -f "$INSTALL_DIR/frontend/dist/index.html" ]; then
        print_info "Frontend dist/ existiert bereits"
        # Prüfe ob Quelldateien neuer sind
        SRC_TIME=$(find "$INSTALL_DIR/frontend/src" "$INSTALL_DIR/frontend/index.html" -newer "$INSTALL_DIR/frontend/dist/index.html" 2>/dev/null | head -1)
        if [ -z "$SRC_TIME" ]; then
            print_success "Frontend ist aktuell - ueberspringe Build"
            BUILD_NEEDED=false
        else
            print_info "Quelldateien geaendert - baue neu..."
            BUILD_NEEDED=true
        fi
    else
        BUILD_NEEDED=true
    fi

    if [ "$BUILD_NEEDED" = true ]; then
        print_substep "Installiere Frontend-Dependencies..."
        npm install 2>&1 | tail -3 || {
            print_error "Frontend npm install fehlgeschlagen"
            exit 1
        }
        print_success "Frontend-Dependencies installiert"

        print_substep "Baue Frontend (Vite Build)..."
        npm run build 2>&1 | tail -5 || {
            print_error "Frontend Build fehlgeschlagen!"
            print_warning "Server startet ohne Frontend - nur API verfuegbar"
            BUILD_FRONTEND=false
        }

        if [ -f "$INSTALL_DIR/frontend/dist/index.html" ]; then
            DIST_SIZE=$(du -sh "$INSTALL_DIR/frontend/dist" 2>/dev/null | cut -f1)
            print_success "Frontend gebaut ($DIST_SIZE)"
        else
            print_error "Frontend dist/index.html nicht gefunden nach Build"
            BUILD_FRONTEND=false
        fi
    fi
else
    print_info "Frontend-Build uebersprungen (--no-frontend)"
fi

cd "$INSTALL_DIR"

# ============================================================================
# SCHRITT 7: SYSTEM-USER UND VERZEICHNISSE
# ============================================================================
print_step "7/11 - System-User und Verzeichnisse"

# System-User
if id "$SERVICE_USER" &>/dev/null; then
    print_info "User '$SERVICE_USER' existiert bereits"
else
    USERADD_CMD=$(command -v useradd || echo "/usr/sbin/useradd")
    "$USERADD_CMD" -r -s /bin/false -d "$DATA_DIR" "$SERVICE_USER"
    print_success "System-User '$SERVICE_USER' erstellt"
fi

# Verzeichnisse
mkdir -p "$DATA_DIR"/{database,backups}
mkdir -p "$LOG_DIR"
mkdir -p "$CONFIG_DIR"

# Berechtigungen
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$LOG_DIR"
chmod 755 "$INSTALL_DIR" "$DATA_DIR" "$LOG_DIR"
print_success "Verzeichnisse erstellt und Berechtigungen gesetzt"

# ============================================================================
# SCHRITT 8: KONFIGURATION
# ============================================================================
print_step "8/11 - Konfiguration (.env)"

OPENAI_KEY_LINE="# OPENAI_API_KEY=sk-..."
OPENAI_MODEL_LINE="# OPENAI_MODEL=gpt-4o-mini"
OPENAI_COST_LINE="# OPENAI_COST_LIMIT=50"

# OpenAI-Key: vom Wizard vorausgefüllt ODER via --with-openai neu abfragen
if [ -n "${OPENAI_KEY_PREFILL:-}" ]; then
    # Aus dem interaktiven Wizard übernehmen
    OPENAI_KEY_LINE="OPENAI_API_KEY=$OPENAI_KEY_PREFILL"
    OPENAI_MODEL_LINE="OPENAI_MODEL=gpt-4o-mini"
    OPENAI_COST_LINE="OPENAI_COST_LIMIT=50"
    print_success "OpenAI API-Key aus Setup-Assistent übernommen"
elif [ "$SETUP_OPENAI" = true ] && [ -t 0 ]; then
    echo ""
    echo -e "  ${MAGENTA}OpenAI API-Key Konfiguration${NC}"
    echo -e "  ${CYAN}(Optional - fuer Cloud-KI mit GPT-4o-mini)${NC}"
    echo -e "  ${CYAN}Leer lassen = nur lokale KI verwenden${NC}"
    echo ""
    read -r -p "  OpenAI API-Key (sk-...): " OPENAI_KEY
    if [ -n "$OPENAI_KEY" ]; then
        OPENAI_KEY_LINE="OPENAI_API_KEY=$OPENAI_KEY"
        OPENAI_MODEL_LINE="OPENAI_MODEL=gpt-4o-mini"
        OPENAI_COST_LINE="OPENAI_COST_LIMIT=50"
        print_success "OpenAI API-Key gesetzt"
    else
        print_info "Kein API-Key - nur lokale KI aktiv"
    fi
fi

if [ ! -f "$CONFIG_DIR/.env" ]; then
    cat > "$CONFIG_DIR/.env" << EOF
# ============================================================================
# Werkstatt Terminplaner - Server-Konfiguration
# ============================================================================
# Nach Aenderungen: sudo systemctl restart $SERVICE_NAME

# --- Server ---
PORT=$PORT
NODE_ENV=production
CORS_ORIGIN=*

# --- Datenbank ---
# DB_PATH=$DATA_DIR/database/werkstatt.db

# --- KI-Konfiguration ---
# Modus wird in der Web-Oberflaeche eingestellt (Einstellungen > KI)
# Verfuegbare Modi: local (Standard), openai (Cloud), external (LAN-Server)

# OpenAI Cloud-KI (optional)
$OPENAI_KEY_LINE
$OPENAI_MODEL_LINE
# OPENAI_MAX_TOKENS=1000
# OPENAI_TEMPERATURE=0.3
$OPENAI_COST_LINE

# Externe KI im LAN (optional - wird auch per mDNS auto-entdeckt)
# KI_EXTERNAL_URL=http://192.168.1.100:5000
# KI_EXTERNAL_TIMEOUT_MS=4000

# Lokale externe KI (wird bei --with-ki automatisch gesetzt)
# KI_LOCAL_SERVICE=true

# mDNS Backend-Discovery
BACKEND_DISCOVERY_ENABLED=1

# Ollama lokales LLM (wird bei --with-ollama automatisch gesetzt)
# Modus in der Web-Oberflaeche: Einstellungen > KI > Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=$OLLAMA_MODEL_DEFAULT
OLLAMA_TIMEOUT_MS=15000
OLLAMA_TEMPERATURE=0.3
EOF
    chown "$SERVICE_USER":"$SERVICE_USER" "$CONFIG_DIR/.env"
    chmod 640 "$CONFIG_DIR/.env"
    print_success "Konfiguration erstellt: $CONFIG_DIR/.env"
else
    print_info "Konfiguration existiert bereits - wird beibehalten"
fi

# Symlink fuer Backend
ln -sf "$CONFIG_DIR/.env" "$INSTALL_DIR/backend/.env" 2>/dev/null || true
print_success "Konfiguration verlinkt"

# ============================================================================
# SCHRITT 9: SYSTEMD-SERVICE
# ============================================================================
print_step "9/11 - systemd-Service"

cat > /lib/systemd/system/"$SERVICE_NAME.service" << EOF
[Unit]
Description=Werkstatt Terminplaner - All-in-One KI-Server
Documentation=https://github.com/SHP-ART/Werkstatt-Terminplaner
After=network.target avahi-daemon.service
Wants=avahi-daemon.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$CONFIG_DIR/.env
Environment="DATA_DIR=$DATA_DIR"
ExecStart=/usr/bin/node $INSTALL_DIR/backend/src/server.js
Restart=always
RestartSec=10

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR
ReadWritePaths=$LOG_DIR
ReadWritePaths=$INSTALL_DIR

# Resource limits
LimitNOFILE=65536
MemoryMax=512M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
print_success "systemd-Service installiert"

# ============================================================================
# SCHRITT 10: SERVICE STARTEN
# ============================================================================
print_step "10/11 - Server starten"

# Avahi starten (fuer mDNS KI-Discovery)
if systemctl is-enabled avahi-daemon &>/dev/null 2>&1; then
    systemctl start avahi-daemon &>/dev/null || true
    print_success "Avahi-Daemon laeuft (mDNS KI-Discovery)"
fi

# Service aktivieren und starten
systemctl enable "$SERVICE_NAME.service" &>/dev/null
systemctl restart "$SERVICE_NAME.service"

print_substep "Warte auf Server-Start..."
WAIT_SECONDS=10
for i in $(seq 1 $WAIT_SECONDS); do
    if systemctl is-active --quiet "$SERVICE_NAME.service"; then
        # Health-Check
        if curl -sf "http://localhost:$PORT/api/health" &>/dev/null; then
            print_success "Server antwortet auf Health-Check"
            break
        fi
    fi
    sleep 1
    printf "  Warte... %d/%d\r" "$i" "$WAIT_SECONDS"
done
echo ""

# ============================================================================
# SCHRITT 10b: EXTERNE KI INSTALLIEREN (optional, --with-ki)
# ============================================================================
if [ "$SETUP_KI" = true ]; then
    print_step "10b/11 - Externe KI (ML-Service) installieren"

    KI_INSTALL_DIR="/opt/werkstatt-ki"
    KI_PORT=5000
    KI_SERVICE_NAME="werkstatt-ki"
    KI_SOURCE="$INSTALL_DIR/tools/ki-service"

    if [ ! -d "$KI_SOURCE/app" ]; then
        print_error "KI-Service Quellcode nicht gefunden: $KI_SOURCE/app"
        print_info "Ueberspringe externe KI-Installation"
    else
        # KI-Verzeichnis erstellen und Dateien kopieren
        print_substep "Kopiere KI-Service nach $KI_INSTALL_DIR..."
        mkdir -p "$KI_INSTALL_DIR/app" "$KI_INSTALL_DIR/data"
        cp -R "$KI_SOURCE/app/"* "$KI_INSTALL_DIR/app/"
        cp "$KI_SOURCE/requirements.txt" "$KI_INSTALL_DIR/requirements.txt"
        chown -R "$SERVICE_USER":"$SERVICE_USER" "$KI_INSTALL_DIR"
        print_success "KI-Service kopiert"

        # Python venv + Dependencies
        print_substep "Erstelle Python-Umgebung und installiere ML-Abhaengigkeiten..."
        sudo -u "$SERVICE_USER" python3 -m venv "$KI_INSTALL_DIR/venv" 2>/dev/null || {
            print_error "Python-venv Erstellung fehlgeschlagen"
            print_info "Versuche ohne venv..."
        }

        if [ -f "$KI_INSTALL_DIR/venv/bin/pip" ]; then
            sudo -u "$SERVICE_USER" "$KI_INSTALL_DIR/venv/bin/pip" install --upgrade pip -q 2>/dev/null || true
            sudo -u "$SERVICE_USER" "$KI_INSTALL_DIR/venv/bin/pip" install -r "$KI_INSTALL_DIR/requirements.txt" -q 2>&1 | tail -3 || {
                print_error "ML-Abhaengigkeiten konnten nicht installiert werden"
            }
            print_success "Python-Umgebung + ML-Pakete installiert (scikit-learn, FastAPI, uvicorn)"
        fi

        # Backend-URL fuer KI-Service (localhost, da auf demselben Server)
        BACKEND_URL_LOCAL="http://localhost:$PORT"

        # Environment-Datei
        print_substep "Erstelle KI-Service Konfiguration..."
        cat > "$KI_INSTALL_DIR/werkstatt-ki.env" << KIEOF
BACKEND_URL=$BACKEND_URL_LOCAL
SERVICE_PORT=$KI_PORT
TRAINING_INTERVAL_MINUTES=1440
TRAINING_LIMIT=0
TRAINING_LOOKBACK_DAYS=14
TRAINING_MAX_RETRIES=5
TRAINING_BACKOFF_INITIAL_SECONDS=5
TRAINING_BACKOFF_MAX_SECONDS=300
DISCOVERY_ENABLED=1
BACKEND_DISCOVERY_ENABLED=1
KIEOF
        chown "$SERVICE_USER":"$SERVICE_USER" "$KI_INSTALL_DIR/werkstatt-ki.env"
        print_success "KI-Konfiguration erstellt"

        # systemd-Service fuer KI
        print_substep "Erstelle systemd-Service fuer KI..."
        cat > /lib/systemd/system/"$KI_SERVICE_NAME.service" << KIEOF
[Unit]
Description=Werkstatt KI Service (ML/scikit-learn)
Documentation=https://github.com/SHP-ART/Werkstatt-Terminplaner
After=network.target $SERVICE_NAME.service
Wants=$SERVICE_NAME.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$KI_INSTALL_DIR
EnvironmentFile=$KI_INSTALL_DIR/werkstatt-ki.env
ExecStart=$KI_INSTALL_DIR/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $KI_PORT
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ReadWritePaths=$KI_INSTALL_DIR

# Resource limits
MemoryMax=256M

[Install]
WantedBy=multi-user.target
KIEOF
        systemctl daemon-reload
        systemctl enable "$KI_SERVICE_NAME.service" &>/dev/null
        systemctl restart "$KI_SERVICE_NAME.service"
        print_success "KI-Service gestartet (Port $KI_PORT)"

        # Warte auf KI-Service Health
        print_substep "Warte auf KI-Service..."
        KI_READY=false
        for i in $(seq 1 8); do
            if curl -sf "http://localhost:$KI_PORT/health" &>/dev/null; then
                KI_READY=true
                print_success "KI-Service antwortet auf Health-Check"
                break
            fi
            sleep 2
        done

        if [ "$KI_READY" = true ]; then
            # Backend automatisch auf external-Modus umschalten
            print_substep "Konfiguriere Backend fuer externe KI..."

            # KI-URL in .env setzen (falls noch nicht vorhanden)
            if ! grep -q "^KI_EXTERNAL_URL=" "$CONFIG_DIR/.env" 2>/dev/null; then
                sed -i "s|^# KI_EXTERNAL_URL=.*|KI_EXTERNAL_URL=http://localhost:$KI_PORT|" "$CONFIG_DIR/.env" 2>/dev/null || \
                echo "KI_EXTERNAL_URL=http://localhost:$KI_PORT" >> "$CONFIG_DIR/.env"
            fi

            # KI-Modus auf 'external' setzen via API
            sleep 2
            curl -sf -X PUT "http://localhost:$PORT/api/einstellungen" \
                -H "Content-Type: application/json" \
                -d '{"ki_mode":"external","ki_enabled":1}' &>/dev/null && \
                print_success "KI-Modus auf 'external' gesetzt (ML-basiert)" || \
                print_warning "KI-Modus konnte nicht automatisch gesetzt werden - bitte manuell unter Einstellungen > KI"

            # Backend neustarten damit es die KI-URL aus .env liest
            systemctl restart "$SERVICE_NAME.service" &>/dev/null
            sleep 3
            print_success "Backend neu gestartet mit externer KI-Anbindung"
        else
            print_warning "KI-Service reagiert nicht - pruefe: journalctl -u $KI_SERVICE_NAME"
            print_info "Backend nutzt weiterhin lokale KI als Fallback"
        fi
    fi
fi

# ============================================================================
# SCHRITT 10c: OLLAMA INSTALLIEREN (optional, --with-ollama)
# ============================================================================
if [ "$SETUP_OLLAMA" = true ]; then
    print_step "10c/11 - Ollama installieren (lokales LLM)"

    if command -v ollama >/dev/null 2>&1; then
        print_success "Ollama bereits installiert: $(ollama --version 2>/dev/null || echo 'version unbekannt')"
    else
        print_substep "Installiere Ollama..."
        if curl -fsSL https://ollama.com/install.sh | sh &>/dev/null; then
            print_success "Ollama installiert"
        else
            print_error "Ollama-Installation fehlgeschlagen - pruefe Internetverbindung"
            print_info "Manuell: curl -fsSL https://ollama.com/install.sh | sh"
            SETUP_OLLAMA=false
        fi
    fi

    if [ "$SETUP_OLLAMA" = true ]; then
        # systemd-Service fuer Ollama (falls nicht automatisch erstellt)
        if ! systemctl is-enabled ollama &>/dev/null 2>&1; then
            print_substep "Erstelle Ollama systemd-Service..."
            cat > /etc/systemd/system/ollama.service << 'OLLAMAEOF'
[Unit]
Description=Ollama LLM Service
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=5
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="HOME=/root"

[Install]
WantedBy=multi-user.target
OLLAMAEOF
            systemctl daemon-reload
            systemctl enable ollama &>/dev/null
            print_success "Ollama systemd-Service registriert"
        fi

        # Ollama-Daemon starten
        print_substep "Starte Ollama-Daemon..."
        systemctl start ollama &>/dev/null || true
        sleep 3

        # Modell laden
        print_substep "Lade Modell '$OLLAMA_MODEL_DEFAULT' herunter (kann einige Minuten dauern)..."
        if ollama pull "$OLLAMA_MODEL_DEFAULT" 2>&1 | tee /tmp/ollama-pull.log | tail -3; then
            print_success "Modell '$OLLAMA_MODEL_DEFAULT' geladen"
        else
            print_error "Modell konnte nicht geladen werden - Log: /tmp/ollama-pull.log"
            print_info "Manuell: ollama pull $OLLAMA_MODEL_DEFAULT"
        fi

        print_info "Ollama bereit — KI-Modus im Frontend aktivieren: Einstellungen > KI > Ollama"

        # Ollama-Test
        print_substep "Teste Ollama-Verbindung..."
        if curl -sf "http://localhost:11434/api/tags" &>/dev/null; then
            print_success "Ollama erreichbar auf Port 11434"
        else
            print_warning "Ollama antwortet noch nicht - pruefe: systemctl status ollama"
        fi
    fi
fi

# ============================================================================
# SCHRITT 11: ABSCHLUSS UND STATUS
# ============================================================================
print_step "11/11 - Installation abgeschlossen"

if systemctl is-active --quiet "$SERVICE_NAME.service"; then
    # Server-Info sammeln
    SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
    HOSTNAME=$(hostname 2>/dev/null || echo "server")
    KI_STATUS="Lokale KI aktiv (trainiert automatisch)"

    # KI-Status pruefen
    KI_INFO=$(curl -sf "http://localhost:$PORT/api/ai/status" 2>/dev/null || echo "")
    if echo "$KI_INFO" | grep -q '"enabled":true' 2>/dev/null; then
        KI_MODE=$(echo "$KI_INFO" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)
        case "$KI_MODE" in
            openai)   KI_STATUS="OpenAI Cloud-KI (GPT-4o-mini)" ;;
            external) KI_STATUS="Externe KI + lokaler Fallback" ;;
            ollama)   KI_STATUS="Ollama lokales LLM ($OLLAMA_MODEL_DEFAULT)" ;;
            *)        KI_STATUS="Lokale KI aktiv (trainiert automatisch)" ;;
        esac
    fi

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                  ║${NC}"
    echo -e "${GREEN}║   Installation erfolgreich abgeschlossen!                        ║${NC}"
    echo -e "${GREEN}║                                                                  ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${CYAN}Version:${NC}     v$APP_VERSION"
    echo -e "  ${CYAN}KI-Status:${NC}   $KI_STATUS"
    if [ "$SETUP_KI" = true ] && systemctl is-active --quiet werkstatt-ki.service 2>/dev/null; then
        echo -e "  ${CYAN}KI-Service:${NC}  ML-Engine laeuft auf Port 5000"
    fi
    if [ "$SETUP_OLLAMA" = true ] && systemctl is-active --quiet ollama.service 2>/dev/null; then
        echo -e "  ${CYAN}Ollama:${NC}      Lokales LLM laeuft auf Port 11434 (Modell: $OLLAMA_MODEL_DEFAULT)"
    fi
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD} Zugriff auf die Anwendung${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Frontend:     ${GREEN}http://$SERVER_IP:$PORT${NC}"
    echo -e "  Status-UI:    ${GREEN}http://$SERVER_IP:$PORT/status${NC}"
    echo -e "  API-Health:   ${GREEN}http://$SERVER_IP:$PORT/api/health${NC}"
    echo -e "  KI-Status:    ${GREEN}http://$SERVER_IP:$PORT/api/ai/status${NC}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD} KI-System${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${MAGENTA}Lokale KI (Standard):${NC}"
    echo -e "    Sofort aktiv - trainiert automatisch aus Werkstatt-Daten"
    echo -e "    Zeitschaetzung, Arbeitsvorschlaege, Termin-Parsing, VIN-Decoder"
    echo ""
    echo -e "  ${MAGENTA}OpenAI Cloud-KI (optional):${NC}"
    echo -e "    API-Key setzen: ${YELLOW}sudo nano $CONFIG_DIR/.env${NC}"
    echo -e "    Oder im Frontend: Einstellungen > KI > OpenAI"
    echo ""
    echo -e "  ${MAGENTA}Externe KI im LAN (optional):${NC}"
    echo -e "    Wird per mDNS automatisch erkannt (avahi)"
    echo -e "    Oder manuell: ${YELLOW}KI_EXTERNAL_URL=http://IP:PORT${NC}"
    echo ""
    echo -e "  ${MAGENTA}Ollama lokales LLM (empfohlen fuer Linux-Server):${NC}"
    echo -e "    Installieren: ${YELLOW}curl -fsSL https://ollama.com/install.sh | sh${NC}"
    echo -e "    Modell laden: ${YELLOW}ollama pull llama3.2${NC}"
    echo -e "    Im Frontend:  Einstellungen > KI > Ollama"
    echo -e "    Test-URL:     ${YELLOW}http://$SERVER_IP:$PORT/api/ai/ollama/status${NC}"
    if [ "$SETUP_KI" = true ]; then
        echo ""
        echo -e "  ${GREEN}Externe KI (lokal installiert):${NC}"
        echo -e "    ML-basiert (scikit-learn) - trainiert alle 24h automatisch"
        echo -e "    Status:  ${YELLOW}systemctl status werkstatt-ki${NC}"
        echo -e "    Logs:    ${YELLOW}journalctl -u werkstatt-ki -f${NC}"
        echo -e "    Health:  ${YELLOW}curl http://localhost:5000/health${NC}"
    fi
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD} Server-Verwaltung${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${YELLOW}Status:${NC}           systemctl status $SERVICE_NAME"
    echo -e "  ${YELLOW}Neustart:${NC}         sudo systemctl restart $SERVICE_NAME"
    echo -e "  ${YELLOW}Logs:${NC}             sudo journalctl -u $SERVICE_NAME -f"
    echo -e "  ${YELLOW}Konfiguration:${NC}    sudo nano $CONFIG_DIR/.env"
    echo -e "  ${YELLOW}Update:${NC}           sudo $INSTALL_DIR/update-linux.sh"
    if [ "$SETUP_KI" = true ]; then
        echo -e "  ${YELLOW}KI-Status:${NC}        systemctl status werkstatt-ki"
        echo -e "  ${YELLOW}KI-Logs:${NC}          sudo journalctl -u werkstatt-ki -f"
        echo -e "  ${YELLOW}KI-Neustart:${NC}      sudo systemctl restart werkstatt-ki"
    fi
    if [ "$SETUP_OLLAMA" = true ]; then
        echo -e "  ${YELLOW}Ollama-Status:${NC}    systemctl status ollama"
        echo -e "  ${YELLOW}Ollama-Logs:${NC}      sudo journalctl -u ollama -f"
        echo -e "  ${YELLOW}Ollama-Test:${NC}      curl http://localhost:11434/api/tags"
        echo -e "  ${YELLOW}Modelle:${NC}          ollama list"
        echo -e "  ${YELLOW}Neues Modell:${NC}     ollama pull mistral"
    fi
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD} Wichtige Verzeichnisse${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  Anwendung:      $INSTALL_DIR"
    echo -e "  Datenbank:      $DATA_DIR/database/"
    echo -e "  Backups:        $DATA_DIR/backups/"
    echo -e "  Konfiguration:  $CONFIG_DIR/.env"
    echo -e "  Logs:           journalctl -u $SERVICE_NAME"
    echo ""

    # Firewall-Check
    if command -v ufw >/dev/null 2>&1; then
        if ufw status 2>/dev/null | grep -q "Status: active"; then
            echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${YELLOW} Firewall aktiv! Port oeffnen:${NC}"
            echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "  ${GREEN}sudo ufw allow $PORT/tcp${NC}"
            echo ""
        fi
    fi

    # iptables-Check (falls kein ufw)
    if ! command -v ufw >/dev/null 2>&1 && command -v iptables >/dev/null 2>&1; then
        BLOCKED=$(iptables -L INPUT -n 2>/dev/null | grep -c "DROP\|REJECT" || echo "0")
        if [ "$BLOCKED" -gt 0 ]; then
            echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo -e "${YELLOW} iptables aktiv! Port oeffnen:${NC}"
            echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
            echo ""
            echo -e "  ${GREEN}sudo iptables -A INPUT -p tcp --dport $PORT -j ACCEPT${NC}"
            echo ""
        fi
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

else
    echo ""
    print_error "Server konnte nicht gestartet werden!"
    echo ""
    echo -e "  ${YELLOW}Fehleranalyse:${NC}"
    echo -e "    systemctl status $SERVICE_NAME"
    echo -e "    sudo journalctl -u $SERVICE_NAME -n 50"
    echo ""
    echo -e "  ${YELLOW}Manuell starten (Debug):${NC}"
    echo -e "    cd $INSTALL_DIR/backend"
    echo -e "    sudo -u $SERVICE_USER PORT=$PORT node src/server.js"
    echo ""
    exit 1
fi

exit 0
