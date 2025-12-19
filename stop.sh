#!/bin/bash

# Werkstatt Terminplaner - Stop Script
# Für macOS und Linux

echo "=========================================="
echo "  Werkstatt Terminplaner wird gestoppt   "
echo "=========================================="
echo ""

# Farbcodes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

STOPPED=0

# Stoppe Backend
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

# Stoppe Frontend
if [ -f "logs/frontend.pid" ]; then
    FRONTEND_PID=$(cat logs/frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}[STOP]${NC} Stoppe Frontend-Server (PID: $FRONTEND_PID)..."
        kill $FRONTEND_PID
        sleep 1

        # Prüfe ob Prozess noch läuft
        if ps -p $FRONTEND_PID > /dev/null 2>&1; then
            echo -e "${YELLOW}[FORCE]${NC} Erzwinge Beendigung..."
            kill -9 $FRONTEND_PID 2>/dev/null
        fi

        echo -e "${GREEN}[OK]${NC} Frontend gestoppt"
        rm logs/frontend.pid
        STOPPED=1
    else
        echo -e "${YELLOW}[INFO]${NC} Frontend läuft nicht (PID nicht gefunden)"
        rm logs/frontend.pid
    fi
else
    echo -e "${YELLOW}[INFO]${NC} Frontend PID-Datei nicht gefunden"
fi

# Alternative: Stoppe alle Node/Python-Prozesse auf den Ports
echo ""
echo -e "${YELLOW}[CHECK]${NC} Prüfe Ports 3000 und 3001..."

# Port 3001 (Backend)
PORT_3001_PID=$(lsof -ti:3001 2>/dev/null)
if [ ! -z "$PORT_3001_PID" ]; then
    echo -e "${YELLOW}[STOP]${NC} Stoppe Prozess auf Port 3001 (PID: $PORT_3001_PID)..."
    kill -9 $PORT_3001_PID 2>/dev/null
    echo -e "${GREEN}[OK]${NC} Port 3001 freigegeben"
    STOPPED=1
fi

# Port 3000 (Frontend)
PORT_3000_PID=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$PORT_3000_PID" ]; then
    echo -e "${YELLOW}[STOP]${NC} Stoppe Prozess auf Port 3000 (PID: $PORT_3000_PID)..."
    kill -9 $PORT_3000_PID 2>/dev/null
    echo -e "${GREEN}[OK]${NC} Port 3000 freigegeben"
    STOPPED=1
fi

echo ""
if [ $STOPPED -eq 1 ]; then
    echo -e "${GREEN}=========================================="
    echo "  Server erfolgreich gestoppt!           "
    echo "==========================================${NC}"
else
    echo -e "${YELLOW}=========================================="
    echo "  Keine laufenden Server gefunden        "
    echo "==========================================${NC}"
fi
echo ""
