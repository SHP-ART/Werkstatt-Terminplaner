#!/bin/bash

# Werkstatt Terminplaner - Backend Stop Script (Port 3001 + Electron)

echo "=========================================="
echo "  Server und Electron werden gestoppt    "
echo "=========================================="
echo ""

# Farbcodes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

STOPPED=0

# Stoppe Electron über PID-Datei
if [ -f "logs/electron.pid" ]; then
    ELECTRON_PID=$(cat logs/electron.pid)
    if ps -p $ELECTRON_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}[STOP]${NC} Stoppe Electron-App (PID: $ELECTRON_PID)..."
        kill $ELECTRON_PID
        sleep 1

        # Prüfe ob Prozess noch läuft
        if ps -p $ELECTRON_PID > /dev/null 2>&1; then
            echo -e "${YELLOW}[FORCE]${NC} Erzwinge Beendigung..."
            kill -9 $ELECTRON_PID 2>/dev/null
        fi

        echo -e "${GREEN}[OK]${NC} Electron gestoppt"
        rm logs/electron.pid
        STOPPED=1
    else
        echo -e "${YELLOW}[INFO]${NC} Electron läuft nicht (PID nicht gefunden)"
        rm logs/electron.pid
    fi
else
    echo -e "${YELLOW}[INFO]${NC} Electron PID-Datei nicht gefunden"
fi

# Stoppe Backend über PID-Datei
if [ -f "logs/backend.pid" ]; then
    BACKEND_PID=$(cat logs/backend.pid)
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}[STOP]${NC} Stoppe Backend-Server (PID: $BACKEND_PID)..."
        kill $BACKEND_PID
        sleep 1

        # Prüfe ob Prozess noch läuft
        if ps -p $BACKEND_PID > /dev/null 2>&1; then
            echo -e "${YELLOW}[FORCE]${NC} Erzwinge Beendigung..."
            kill -9 $BACKEND_PID 2>/dev/null
        fi

        echo -e "${GREEN}[OK]${NC} Backend gestoppt"
        rm logs/backend.pid
        STOPPED=1
    else
        echo -e "${YELLOW}[INFO]${NC} Backend läuft nicht (PID nicht gefunden)"
        rm logs/backend.pid
    fi
else
    echo -e "${YELLOW}[INFO]${NC} Backend PID-Datei nicht gefunden"
fi

# Alternative: Stoppe jeden Prozess auf Port 3001
echo ""
echo -e "${YELLOW}[CHECK]${NC} Prüfe Port 3001..."

PORT_3001_PID=$(lsof -ti:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PID" ]; then
    echo -e "${YELLOW}[STOP]${NC} Stoppe Prozess auf Port 3001 (PID: $PORT_3001_PID)..."
    kill -9 $PORT_3001_PID 2>/dev/null
    echo -e "${GREEN}[OK]${NC} Port 3001 freigegeben"
    STOPPED=1
fi

echo ""
if [ $STOPPED -eq 1 ]; then
    echo -e "${GREEN}=========================================="
    echo "  Backend erfolgreich gestoppt!          "
    echo "==========================================${NC}"
else
    echo -e "${YELLOW}=========================================="
    echo "  Kein laufender Backend-Server gefunden "
    echo "==========================================${NC}"
fi
echo ""
