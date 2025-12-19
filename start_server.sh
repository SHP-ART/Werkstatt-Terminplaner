#!/bin/bash

# Werkstatt Terminplaner - Backend Start Script (Port 3001)

echo "=========================================="
echo "  Backend-Server wird gestartet (3001)   "
echo "=========================================="
echo ""

# Farbcodes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Prüfe ob Node.js installiert ist
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js ist nicht installiert!"
    echo "Bitte installieren Sie Node.js von https://nodejs.org"
    exit 1
fi

# Backend-Dependencies installieren (falls noch nicht geschehen)
if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}[INFO]${NC} Installiere Backend-Dependencies..."
    cd backend
    npm install > /dev/null 2>&1
    cd ..
    echo -e "${GREEN}[OK]${NC} Backend-Dependencies installiert"
fi

# Prüfe ob Port bereits belegt ist
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}[WARNUNG]${NC} Port 3001 (Backend) ist bereits belegt!"
    echo "Stoppen Sie zuerst den laufenden Server mit ./stop_server.sh"
    exit 1
fi

# Erstelle Logs-Verzeichnis
mkdir -p logs

# Starte Backend
echo -e "${BLUE}[START]${NC} Starte Backend-Server auf Port 3001..."
cd backend
nohup npm start > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../logs/backend.pid
cd ..
sleep 2

# Prüfe ob Backend läuft
if ps -p $BACKEND_PID > /dev/null; then
    echo -e "${GREEN}[OK]${NC} Backend läuft (PID: $BACKEND_PID)"
else
    echo -e "${RED}[ERROR]${NC} Backend konnte nicht gestartet werden!"
    echo "Siehe logs/backend.log für Details"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "  Backend erfolgreich gestartet!         "
echo "==========================================${NC}"
echo ""
echo "Backend:   http://localhost:3001"
echo "API:       http://localhost:3001/api"
echo ""
echo "Logs:"
echo "  Backend:  logs/backend.log"
echo ""
echo "Zum Stoppen: ./stop_server.sh"
echo ""
