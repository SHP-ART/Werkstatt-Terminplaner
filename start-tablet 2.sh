#!/bin/bash

# Werkstatt Terminplaner - Tablet-App Start Script

echo "=========================================="
echo "   Tablet-App wird gestartet             "
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

# Prüfe ob Backend läuft
if ! lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${YELLOW}[WARNUNG]${NC} Backend läuft nicht auf Port 3001!"
    echo -e "${BLUE}[INFO]${NC} Starten Sie zuerst das Backend mit ./start.sh"
    echo ""
    read -p "Backend jetzt starten? (j/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Jj]$ ]]; then
        echo -e "${BLUE}[INFO]${NC} Starte Backend..."
        ./start.sh &
        sleep 5
    else
        echo -e "${RED}[ABBRUCH]${NC} Tablet-App benötigt laufendes Backend"
        exit 1
    fi
fi

# Tablet-Dependencies installieren (falls noch nicht geschehen)
if [ ! -d "electron-intern-tablet/node_modules" ]; then
    echo -e "${YELLOW}[INFO]${NC} Installiere Tablet-Dependencies..."
    cd electron-intern-tablet
    npm install > /dev/null 2>&1
    cd ..
    echo -e "${GREEN}[OK]${NC} Tablet-Dependencies installiert"
fi

# Prüfe ob Tablet-App bereits läuft
if pgrep -f "electron.*intern-tablet" > /dev/null 2>&1; then
    echo -e "${YELLOW}[WARNUNG]${NC} Tablet-App läuft bereits!"
    echo "Stoppen Sie zuerst die laufende App mit ./stop-tablet.sh"
    exit 1
fi

# Erstelle Logs-Verzeichnis
mkdir -p logs

# Starte Tablet-App
echo -e "${BLUE}[START]${NC} Starte Tablet-App..."
cd electron-intern-tablet

# Starte Electron im Hintergrund und speichere PID
npm start > ../logs/tablet.log 2>&1 &
TABLET_PID=$!

cd ..

# Speichere PID
echo $TABLET_PID > logs/tablet.pid

# Warte kurz und prüfe ob Prozess läuft
sleep 2
if ps -p $TABLET_PID > /dev/null 2>&1; then
    echo -e "${GREEN}[OK]${NC} Tablet-App gestartet (PID: $TABLET_PID)"
    echo ""
    echo -e "${BLUE}[INFO]${NC} Logs: tail -f logs/tablet.log"
    echo -e "${BLUE}[INFO]${NC} Stoppen: ./stop-tablet.sh"
    echo ""
else
    echo -e "${RED}[ERROR]${NC} Tablet-App konnte nicht gestartet werden"
    echo "Prüfen Sie die Logs: cat logs/tablet.log"
    rm logs/tablet.pid 2>/dev/null
    exit 1
fi

echo "=========================================="
echo "   Tablet-App läuft ✓                    "
echo "=========================================="
