# Linux Headless Server Installation
## Werkstatt Terminplaner auf Debian/Ubuntu

Diese Anleitung beschreibt die Installation des Werkstatt Terminplaners als **headless Server** auf Debian oder Ubuntu Linux. Der Server läuft ohne grafische Oberfläche und wird über den Browser bedient.

---

## 📋 Systemanforderungen

### Hardware
- **CPU**: Intel N100 Mini-PC oder vergleichbar (x64)
- **RAM**: Mindestens 2 GB (4 GB empfohlen)
- **Speicher**: 10 GB freier Speicherplatz
- **Netzwerk**: Ethernet oder WLAN

### Software
- **OS**: Debian 11+ oder Ubuntu 20.04+
- **Node.js**: Version 18 oder höher (wird automatisch als Dependency installiert)
- **SQLite**: Version 3.x (wird automatisch installiert)

---

## 🚀 Installation

### Methode 1: Ein-Befehl-Installation (Empfohlen) ⚡

Die einfachste und schnellste Methode – installiert **alles** inklusive Frontend-Build und lokaler KI:

```bash
curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/install-linux.sh | sudo bash
```

**Optionen:**
```bash
# Mit anderem Port:
curl -fsSL https://...install-linux.sh | sudo bash -s -- --port=8080

# Mit OpenAI API-Key Abfrage:
sudo ./install-linux.sh --with-openai

# Mit externer KI (Python ML-Service, automatisch installiert & konfiguriert):
sudo ./install-linux.sh --with-ki

# Komplett mit KI + OpenAI:
sudo ./install-linux.sh --with-ki --with-openai --port=3001

# Nur Backend (ohne Frontend-Build):
sudo ./install-linux.sh --no-frontend

# Hilfe anzeigen:
sudo ./install-linux.sh --help
```

**Oder lokal:**
```bash
# Repository klonen
git clone https://github.com/SHP-ART/Werkstatt-Terminplaner.git
cd Werkstatt-Terminplaner

# Installations-Skript ausführen
sudo ./install-linux.sh
```

Das Skript führt automatisch aus:
- ✅ Installiert Node.js 20 LTS (falls nötig)
- ✅ Installiert System-Dependencies (git, sqlite3, avahi, build-essential)
- ✅ Klont/aktualisiert Repository
- ✅ Installiert Backend npm-Pakete
- ✅ **Baut das Frontend** (Vite Build → `dist/`)
- ✅ Erstellt System-User `werkstatt`
- ✅ Richtet Verzeichnisse ein (`/var/lib/werkstatt-terminplaner`, `/var/log/werkstatt-terminplaner`)
- ✅ Konfiguriert KI-System (lokal, OpenAI, extern)
- ✅ Installiert mDNS/Avahi für KI-Discovery im LAN
- ✅ Erstellt Konfiguration (`/etc/werkstatt-terminplaner/.env`)
- ✅ Installiert systemd-Service
- ✅ Startet Server automatisch
- ✅ Zeigt alle Zugriffs-URLs an

**Das war's! Der Server läuft.** 🎉

---

### Methode 2: Debian-Paket (Für Releases)

```bash
# Lade das neueste Release herunter
wget https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/latest/download/werkstatt-terminplaner_1.6.2_amd64.deb

# Installiere das Paket
sudo dpkg -i werkstatt-terminplaner_1.6.2_amd64.deb

# Falls Dependencies fehlen, automatisch nachinstallieren
sudo apt-get install -f
```

---

### 3. Firewall konfigurieren (falls aktiviert)

```bash
# Port 3001 für Zugriff aus dem Netzwerk öffnen
sudo ufw allow 3001/tcp
sudo ufw status
```

### 4. Installation prüfen

```bash
# Service-Status anzeigen
systemctl status werkstatt-terminplaner

# Sollte anzeigen: "active (running)"
```

---

## 🌐 Zugriff auf die Anwendung

Nach erfolgreicher Installation ist die Anwendung erreichbar unter:

### Lokaler Zugriff (vom Server selbst)
```
http://localhost:3001
```

### Netzwerk-Zugriff (von anderen Geräten)
```
http://<SERVER-IP>:3001
```

**Server-IP ermitteln:**
```bash
hostname -I | awk '{print $1}'
```

### Status-Dashboard
```
http://<SERVER-IP>:3001/status
```

Zeigt Server-Statistiken, Uptime, Ressourcenauslastung und API-Logs an.

---

## ⚙️ Konfiguration

Die Konfiguration erfolgt über die Datei:
```
/etc/werkstatt-terminplaner/.env
```

### Standard-Konfiguration anpassen

```bash
# Konfigurationsdatei bearbeiten
sudo nano /etc/werkstatt-terminplaner/.env
```

**Wichtige Einstellungen:**

```bash
# Server-Port (Standard: 3001)
PORT=3001

# CORS-Einstellungen (Komma-getrennt oder * für alle)
CORS_ORIGIN=*

# Node Environment
NODE_ENV=production

# Datenbank-Pfad (optional)
DB_PATH=/var/lib/werkstatt-terminplaner/database/werkstatt.db

# Externe KI-URL (optional - für Hardware-KI)
KI_EXTERNAL_URL=http://192.168.1.100:5000

# OpenAI API Key (optional - für Cloud-KI)
OPENAI_API_KEY=sk-...
```

**Nach Änderungen Server neu starten:**
```bash
sudo systemctl restart werkstatt-terminplaner
```

---

## 🛠️ Verwaltung

### Service-Befehle

```bash
# Status anzeigen
sudo systemctl status werkstatt-terminplaner

# Server neu starten
sudo systemctl restart werkstatt-terminplaner

# Server stoppen
sudo systemctl stop werkstatt-terminplaner

# Server starten
sudo systemctl start werkstatt-terminplaner

# Auto-Start beim Booten deaktivieren
sudo systemctl disable werkstatt-terminplaner

# Auto-Start beim Booten aktivieren
sudo systemctl enable werkstatt-terminplaner
```

### Logs anzeigen

```bash
# Live-Logs verfolgen
sudo journalctl -u werkstatt-terminplaner -f

# Letzte 100 Zeilen
sudo journalctl -u werkstatt-terminplaner -n 100

# Logs von heute
sudo journalctl -u werkstatt-terminplaner --since today

# Logs mit Zeitstempel
sudo journalctl -u werkstatt-terminplaner --since "2026-02-17 10:00:00"
```

---

## 💾 Backup & Restore

### Backup erstellen

**Option 1: Über Web-Interface**
1. Im Browser zu **Einstellungen** navigieren
2. Auf **Backup erstellen** klicken
3. Backup wird automatisch gespeichert

**Option 2: Manuell über Shell**
```bash
# Datenbank sichern
sudo cp /var/lib/werkstatt-terminplaner/database/werkstatt.db \
   /var/lib/werkstatt-terminplaner/backups/manual_backup_$(date +%Y%m%d_%H%M%S).db

# Backup-Verzeichnis auflisten
sudo ls -lh /var/lib/werkstatt-terminplaner/backups/
```

### Restore durchführen

**Option 1: Über Web-Interface**
1. Einstellungen → Backup-Verwaltung
2. Backup auswählen
3. Auf **Wiederherstellen** klicken

**Option 2: Manuell über Shell**
```bash
# Service stoppen
sudo systemctl stop werkstatt-terminplaner

# Backup wiederherstellen
sudo cp /var/lib/werkstatt-terminplaner/backups/IHR_BACKUP.db \
   /var/lib/werkstatt-terminplaner/database/werkstatt.db

# Permissions korrigieren
sudo chown werkstatt:werkstatt /var/lib/werkstatt-terminplaner/database/werkstatt.db

# Service starten
sudo systemctl start werkstatt-terminplaner
```

---

## 🤖 Externe KI anbinden (optional)

Der Server kann mit einer externen Hardware-KI verbunden werden (z.B. Intel N100 mit ONNX Runtime oder Raspberry Pi mit KI-Beschleuniger).

### Automatische Installation mit `--with-ki` (empfohlen)

Die einfachste Methode: Bei der Installation `--with-ki` angeben. Damit wird der Python-basierte ML-Service (scikit-learn, FastAPI) direkt auf dem gleichen Server installiert und automatisch konfiguriert:

```bash
# Bei Neuinstallation:
sudo ./install-linux.sh --with-ki

# Oder per curl:
curl -fsSL https://...install-linux.sh | sudo bash -s -- --with-ki
```

**Was passiert automatisch:**
1. Python 3 + venv werden installiert
2. KI-Service wird unter `/opt/werkstatt-ki/` eingerichtet
3. Abhängigkeiten (scikit-learn, FastAPI, uvicorn, zeroconf) werden in venv installiert
4. systemd-Service `werkstatt-ki.service` wird erstellt und gestartet (Port 5000)
5. `KI_EXTERNAL_URL=http://localhost:5000` wird in `.env` gesetzt
6. KI-Modus wird automatisch auf `external` umgestellt
7. Backend wird neu gestartet, um die KI-Verbindung zu aktivieren

**KI-Service verwalten:**
```bash
# Status prüfen
sudo systemctl status werkstatt-ki

# Logs anzeigen
sudo journalctl -u werkstatt-ki -f

# Neu starten
sudo systemctl restart werkstatt-ki
```

### Manuelle URL-Konfiguration

```bash
# In .env Datei eintragen
sudo nano /etc/werkstatt-terminplaner/.env

# Zeile hinzufügen:
KI_EXTERNAL_URL=http://192.168.1.100:5000

# Server neu starten
sudo systemctl restart werkstatt-terminplaner
```

### mDNS Auto-Discovery

Wenn Avahi installiert ist, wird die externe KI automatisch erkannt:

```bash
# Avahi installieren (falls nicht vorhanden)
sudo apt-get install avahi-daemon

# Avahi-Status prüfen
sudo systemctl status avahi-daemon
```

Die externe KI muss den Service `_werkstatt-ki._tcp` ankündigen.

---

## 🔒 Sicherheit

### Firewall-Regeln (empfohlen)

```bash
# Nur LAN-Zugriff erlauben
sudo ufw allow from 192.168.1.0/24 to any port 3001

# Oder nur spezifische IP
sudo ufw allow from 192.168.1.50 to any port 3001
```

### Reverse Proxy mit nginx (optional für HTTPS)

```bash
# nginx installieren
sudo apt-get install nginx

# nginx-Konfiguration erstellen
sudo nano /etc/nginx/sites-available/werkstatt
```

```nginx
server {
    listen 80;
    server_name werkstatt.local;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Aktivieren und neu laden
sudo ln -s /etc/nginx/sites-available/werkstatt /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🐛 Troubleshooting

### Server startet nicht

```bash
# Detaillierte Fehler anzeigen
sudo journalctl -u werkstatt-terminplaner -n 50

# Port-Konflikt prüfen
sudo netstat -tulpn | grep 3001

# Permissions prüfen
sudo ls -la /var/lib/werkstatt-terminplaner/
```

### Port bereits belegt

```bash
# Anderen Port verwenden
sudo nano /etc/werkstatt-terminplaner/.env
# PORT=3002 eintragen

sudo systemctl restart werkstatt-terminplaner
```

### Frontend lädt nicht

```bash
# Prüfen ob Frontend-Dateien vorhanden sind
ls -la /opt/werkstatt-terminplaner/frontend/

# Backend-Logs prüfen
sudo journalctl -u werkstatt-terminplaner -f
```

### Datenbank-Fehler

```bash
# Datenbank-Integrität prüfen
sqlite3 /var/lib/werkstatt-terminplaner/database/werkstatt.db "PRAGMA integrity_check;"

# Permissions korrigieren
sudo chown -R werkstatt:werkstatt /var/lib/werkstatt-terminplaner/
```

### mDNS funktioniert nicht

```bash
# Avahi installieren
sudo apt-get install avahi-daemon

# Alternativ: Manuelle URL verwenden
sudo nano /etc/werkstatt-terminplaner/.env
# KI_EXTERNAL_URL=http://192.168.1.100:5000
```

---

## 🗑️ Deinstallation

### Anwendung behalten, Daten löschen

```bash
sudo apt remove werkstatt-terminplaner
```

Daten bleiben erhalten unter `/var/lib/werkstatt-terminplaner/`

### Vollständige Entfernung (inkl. Daten)

```bash
sudo apt purge werkstatt-terminplaner
```

⚠️ **Achtung:** Löscht alle Daten und Backups!

### Manuelle Bereinigung

```bash
# Service stoppen und deaktivieren
sudo systemctl stop werkstatt-terminplaner
sudo systemctl disable werkstatt-terminplaner

# Dateien löschen
sudo rm -rf /opt/werkstatt-terminplaner
sudo rm -rf /var/lib/werkstatt-terminplaner
sudo rm -rf /etc/werkstatt-terminplaner
sudo rm /lib/systemd/system/werkstatt-terminplaner.service

# User löschen
sudo userdel werkstatt

# systemd neu laden
sudo systemctl daemon-reload
```

---

## 📁 Verzeichnisstruktur

```
/opt/werkstatt-terminplaner/          # Anwendungsdateien
├── src/                               # Backend-Code
├── frontend/                          # Frontend-Dateien
├── node_modules/                      # Dependencies
└── package.json                       # Paket-Info

/var/lib/werkstatt-terminplaner/      # Daten (persistent)
├── database/                          # SQLite-Datenbank
│   └── werkstatt.db
└── backups/                           # Automatische Backups

/etc/werkstatt-terminplaner/          # Konfiguration
└── .env                               # Einstellungen

/var/log/werkstatt-terminplaner/      # Log-Dateien (optional)

/lib/systemd/system/                   # systemd-Service
└── werkstatt-terminplaner.service
```

---

## 🤝 Support

- **Dokumentation**: [README.md](../README.md)
- **Issues**: [GitHub Issues](https://github.com/SHP-ART/Werkstatt-Terminplaner/issues)
- **Releases**: [GitHub Releases](https://github.com/SHP-ART/Werkstatt-Terminplaner/releases)

---

## 📝 Nächste Schritte

Nach erfolgreicher Installation:

1. ✅ Im Browser zu `http://<SERVER-IP>:3001` navigieren
2. ✅ Ersten Admin-Benutzer anlegen (falls noch nicht vorhanden)
3. ✅ Werkstatt-Daten konfigurieren (Öffnungszeiten, Arbeitsplätze)
4. ✅ Kunden und Fahrzeuge erfassen
5. ✅ Termine planen
6. ✅ Tablets/PCs im Netzwerk anbinden

## 🚀 Performance & KI

Der Linux-Server ist optimiert für **Multi-Client-Zugriff**:

- **Lokale KI**: Trainiert automatisch täglich mit Ihren Daten (Zeitschätzung, Arbeiten-Vorschläge)
- **SQLite-Optimierungen**: 5-8x schnellere Queries, 10-15 gleichzeitige Clients möglich
- **WAL-Modus**: Leser blockieren nicht Schreiber
- **Memory-Mapped I/O**: Schnellere Lesezugriffe

➡️ Details: [LINUX-OPTIMIERUNGEN.md](LINUX-OPTIMIERUNGEN.md)

**Viel Erfolg mit dem Werkstatt Terminplaner! 🚗🔧**
