#!/bin/bash

# Werkstatt Terminplaner - Frontend Start Script (Vite, Port 3000)
# Für macOS und Linux

echo "=========================================="
echo "  Werkstatt Terminplaner Frontend       "
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

# Prüfe ob npm installiert ist
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} npm ist nicht installiert!"
    echo "Bitte installieren Sie Node.js von https://nodejs.org"
    exit 1
fi

# Prüfe ob Frontend-Port bereits belegt ist
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}[WARNUNG]${NC} Port 3000 (Frontend) ist bereits belegt!"
    echo "Stoppen Sie zuerst den laufenden Server mit ./stop.sh"
    exit 1
fi

# Erstelle Logs-Verzeichnis
mkdir -p logs

# Frontend-Dependencies installieren (falls noch nicht geschehen)
if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}[INFO]${NC} Installiere Frontend-Dependencies..."
    cd frontend
    npm install > /dev/null 2>&1
    cd ..
    echo -e "${GREEN}[OK]${NC} Frontend-Dependencies installiert"
fi

# Starte Frontend
echo -e "${BLUE}[START]${NC} Starte Frontend-Server auf Port 3000..."
cd frontend
nohup npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > ../logs/frontend.pid
cd ..
sleep 2

# Prüfe ob Frontend läuft
if ps -p $FRONTEND_PID > /dev/null; then
    echo -e "${GREEN}[OK]${NC} Frontend läuft (PID: $FRONTEND_PID)"
else
    echo -e "${RED}[ERROR]${NC} Frontend konnte nicht gestartet werden!"
    echo "Siehe logs/frontend.log für Details"
    # Stoppe Backend wenn Frontend fehlschlägt
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "  Frontend erfolgreich gestartet!        "
echo "==========================================${NC}"
echo ""
echo "Frontend:  http://localhost:3000"
echo ""
echo "Logs:"
echo "  Frontend: logs/frontend.log"
echo ""
echo "Zum Stoppen: ./stop.sh"
echo "Backend separat starten: ./start_server.sh"
echo ""

# IP-Adresse anzeigen (für Netzwerkzugriff)
if command -v ifconfig &> /dev/null; then
    IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
    if [ ! -z "$IP" ]; then
        echo "Netzwerkzugriff:"
        echo "  http://$IP:3000"
        echo ""
    fi
fi
