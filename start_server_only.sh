#!/bin/bash

# Werkstatt Terminplaner - Nur Backend-Server (ohne Electron)

echo "=========================================="
echo "  Backend-Server wird gestartet (3001)   "
echo "  (ohne Electron)                        "
echo "=========================================="
echo ""

# Farbcodes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Prüfe ob Node.js installiert ist
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js ist nicht installiert!"
    exit 1
fi

# Backend-Dependencies installieren
if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}[INFO]${NC} Installiere Backend-Dependencies..."
    cd backend && npm install > /dev/null 2>&1 && cd ..
    echo -e "${GREEN}[OK]${NC} Dependencies installiert"
fi

# Prüfe ob Port bereits belegt ist
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}[INFO]${NC} Stoppe laufenden Server auf Port 3001..."
    kill $(lsof -Pi :3001 -sTCP:LISTEN -t) 2>/dev/null
    sleep 1
fi

# Erstelle Logs-Verzeichnis
mkdir -p logs

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

# Starte Backend
echo -e "${BLUE}[START]${NC} Starte Backend-Server..."
cd backend
DATA_DIR="$BACKEND_DIR" nohup node src/server.js > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../logs/backend.pid
cd ..
sleep 2

# Prüfe ob Backend läuft
if ps -p $BACKEND_PID > /dev/null; then
    echo -e "${GREEN}[OK]${NC} Backend läuft (PID: $BACKEND_PID)"
    echo ""
    echo -e "${GREEN}=========================================="
    echo "  Server erfolgreich gestartet!          "
    echo "==========================================${NC}"
    echo ""
    echo "Frontend:  http://localhost:3001"
    echo "API:       http://localhost:3001/api"
    echo ""
    echo "Log:       logs/backend.log"
    echo "Stoppen:   kill $BACKEND_PID"
    echo ""
else
    echo -e "${RED}[ERROR]${NC} Server konnte nicht gestartet werden!"
    echo "Siehe logs/backend.log für Details"
    cat logs/backend.log | tail -20
    exit 1
fi
