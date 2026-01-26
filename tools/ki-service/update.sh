#!/bin/bash
#
# Werkstatt KI-Service Update Script
# Führt ein vollständiges Update des externen KI-Services durch
#
# Verwendung: sudo ./update.sh
#

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Werkstatt KI-Service Update${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Prüfe ob als root/sudo ausgeführt
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Fehler: Bitte mit sudo ausführen${NC}"
    echo "Verwendung: sudo ./update.sh"
    exit 1
fi

# Setze Verzeichnisse
INSTALL_DIR="/opt/werkstatt-ki"
SERVICE_NAME="werkstatt-ki"

# Finde tatsächliche Installation
if [ ! -d "$INSTALL_DIR" ]; then
    # Prüfe alternative Pfade
    if [ -d "/opt/werkstatt-ki-service" ]; then
        INSTALL_DIR="/opt/werkstatt-ki-service"
    elif [ -d "/opt/ki-service" ]; then
        INSTALL_DIR="/opt/ki-service"
    else
        echo -e "${RED}Fehler: KI-Service Installation nicht gefunden${NC}"
        echo "Geprüfte Pfade:"
        echo "  - /opt/werkstatt-ki"
        echo "  - /opt/werkstatt-ki-service"
        echo "  - /opt/ki-service"
        echo ""
        echo "Bitte erst installieren mit dem Installer"
        exit 1
    fi
fi

# Finde Service-Verzeichnis
SERVICE_DIR="$INSTALL_DIR"
if [ -d "$INSTALL_DIR/tools/ki-service" ]; then
    SERVICE_DIR="$INSTALL_DIR/tools/ki-service"
elif [ -d "$INSTALL_DIR/ki-service" ]; then
    SERVICE_DIR="$INSTALL_DIR/ki-service"
fi

echo -e "${BLUE}Installation gefunden: $INSTALL_DIR${NC}"
echo -e "${BLUE}Service-Verzeichnis: $SERVICE_DIR${NC}"
echo ""

echo -e "${YELLOW}➜ Service wird gestoppt...${NC}"
systemctl stop $SERVICE_NAME || true
sleep 2

echo -e "${YELLOW}➜ Wechsle ins Verzeichnis...${NC}"
cd $INSTALL_DIR

# Prüfe ob Git-Repository
if [ -d ".git" ]; then
    echo -e "${YELLOW}➜ Code wird aktualisiert (git pull)...${NC}"
    sudo -u $(stat -c '%U' $INSTALL_DIR 2>/dev/null || stat -f '%Su' $INSTALL_DIR) git pull origin master
    UPDATE_METHOD="git"
else
    echo -e "${YELLOW}➜ Standalone-Installation: Lade neueste Version...${NC}"
    
    # Backup des aktuellen Codes
    BACKUP_DIR="/tmp/werkstatt-ki-backup-$(date +%Y%m%d-%H%M%S)"
    echo -e "${YELLOW}   Erstelle Backup in $BACKUP_DIR${NC}"
    
    if [ -d "$SERVICE_DIR" ] && [ "$(ls -A $SERVICE_DIR)" ]; then
        mkdir -p $BACKUP_DIR
        cp -r $SERVICE_DIR/* $BACKUP_DIR/ 2>/dev/null || true
    fi
    
    # Lade neuesten Code
    TEMP_DIR=$(mktemp -d)
    cd $TEMP_DIR
    echo -e "${YELLOW}   Lade Code von GitHub...${NC}"
    curl -fsSL https://github.com/SHP-ART/Werkstatt-Terminplaner/archive/refs/heads/master.tar.gz | tar -xz
    
    # Kopiere neue Dateien
    echo -e "${YELLOW}   Installiere Update...${NC}"
    if [ -d "$INSTALL_DIR/tools/ki-service" ]; then
        # Vollständige Repo-Struktur
        cp -r Werkstatt-Terminplaner-master/tools/ki-service/* $INSTALL_DIR/tools/ki-service/
    elif [ -d "$INSTALL_DIR/ki-service" ]; then
        # Nur ki-service Verzeichnis
        cp -r Werkstatt-Terminplaner-master/tools/ki-service/* $INSTALL_DIR/ki-service/
    else
        # Direkt im Install-Dir
        mkdir -p $INSTALL_DIR/app
        cp -r Werkstatt-Terminplaner-master/tools/ki-service/app/* $INSTALL_DIR/app/
        cp Werkstatt-Terminplaner-master/tools/ki-service/requirements.txt $INSTALL_DIR/ 2>/dev/null || true
    fi
    
    # Aufräumen
    cd $INSTALL_DIR
    rm -rf $TEMP_DIR
    
    UPDATE_METHOD="standalone"
fi

echo -e "${YELLOW}➜ Python Dependencies werden aktualisiert...${NC}"
# Finde requirements.txt
REQUIREMENTS_FILE=""
if [ -f "$SERVICE_DIR/requirements.txt" ]; then
    REQUIREMENTS_FILE="$SERVICE_DIR/requirements.txt"
elif [ -f "$INSTALL_DIR/requirements.txt" ]; then
    REQUIREMENTS_FILE="$INSTALL_DIR/requirements.txt"
fi

if [ -n "$REQUIREMENTS_FILE" ] && [ -f "$REQUIREMENTS_FILE" ]; then
    $INSTALL_DIR/venv/bin/pip install -r $REQUIREMENTS_FILE --upgrade --quiet
else
    echo -e "${YELLOW}   Keine requirements.txt gefunden, überspringe...${NC}"
fi

echo -e "${YELLOW}➜ Service wird neu gestartet...${NC}"
systemctl daemon-reload
systemctl restart $SERVICE_NAME
sleep 3

echo ""
echo -e "${GREEN}✓ Update erfolgreich abgeschlossen!${NC}"
echo ""

# Status anzeigen
echo -e "${BLUE}Status:${NC}"
systemctl status $SERVICE_NAME --no-pager -l

echo ""
echo -e "${BLUE}Service-Info:${NC}"
SERVICE_PORT=$(grep "SERVICE_PORT=" $INSTALL_DIR/tools/ki-service/.env 2>/dev/null | cut -d'=' -f2 || echo "5000")
sleep 2
curl -s http://localhost:$SERVICE_PORT/health | python3 -m json.tool 2>/dev/null || echo "Health-Check fehlgeschlagen"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Update abgeschlossen!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Logs anzeigen: ${BLUE}sudo journalctl -u $SERVICE_NAME -f${NC}"
echo -e "Service stoppen: ${BLUE}sudo systemctl stop $SERVICE_NAME${NC}"
echo -e "Service starten: ${BLUE}sudo systemctl start $SERVICE_NAME${NC}"
echo ""
