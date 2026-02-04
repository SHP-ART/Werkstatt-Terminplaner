#!/bin/bash

# Werkstatt Terminplaner - Tablet-App Stop Script

echo "=========================================="
echo "   Tablet-App wird gestoppt              "
echo "=========================================="
echo ""

# Farbcodes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

STOPPED=0

# Stoppe Tablet-App über PID-Datei
if [ -f "logs/tablet.pid" ]; then
    TABLET_PID=$(cat logs/tablet.pid)
    if ps -p $TABLET_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}[STOP]${NC} Stoppe Tablet-App (PID: $TABLET_PID)..."
        kill $TABLET_PID
        sleep 1

        # Prüfe ob Prozess noch läuft
        if ps -p $TABLET_PID > /dev/null 2>&1; then
            echo -e "${YELLOW}[FORCE]${NC} Erzwinge Beendigung..."
            kill -9 $TABLET_PID 2>/dev/null
        fi

        echo -e "${GREEN}[OK]${NC} Tablet-App gestoppt"
        rm logs/tablet.pid
        STOPPED=1
    else
        echo -e "${YELLOW}[INFO]${NC} Tablet-App läuft nicht (PID nicht gefunden)"
        rm logs/tablet.pid
    fi
else
    echo -e "${YELLOW}[INFO]${NC} Tablet PID-Datei nicht gefunden"
fi

# Zusätzlich: Finde und beende alle Electron-Prozesse der Tablet-App
TABLET_PROCESSES=$(pgrep -f "electron.*intern-tablet")
if [ ! -z "$TABLET_PROCESSES" ]; then
    echo -e "${YELLOW}[STOP]${NC} Stoppe gefundene Tablet-Prozesse..."
    for PID in $TABLET_PROCESSES; do
        echo -e "${YELLOW}[STOP]${NC} Beende Prozess $PID..."
        kill $PID 2>/dev/null
        sleep 0.5
        
        # Force kill falls nötig
        if ps -p $PID > /dev/null 2>&1; then
            kill -9 $PID 2>/dev/null
        fi
    done
    echo -e "${GREEN}[OK]${NC} Alle Tablet-Prozesse gestoppt"
    STOPPED=1
fi

if [ $STOPPED -eq 0 ]; then
    echo -e "${YELLOW}[INFO]${NC} Tablet-App läuft nicht"
fi

echo ""
echo "=========================================="
echo "   Tablet-App gestoppt ✓                 "
echo "=========================================="
