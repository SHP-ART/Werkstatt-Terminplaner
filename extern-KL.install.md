# Externe KI Installation (Debian)

Dieses Dokument beschreibt die vollautomatische Installation des externen KI-Services
auf einem separaten Geraet sowie die noetigen Schritte am Werkstatt-Server.

## 1) One-Liner Installation (empfohlen)

Ersetze `<WERKSTATT-SERVER>` durch die IP/den Host deines Werkstatt-Servers.
Der KI-Service laeuft auf Port 5000.

```bash
REPO_URL=https://github.com/SHP-ART/Werkstatt-Terminplaner.git \
SERVICE_PORT=5000 \
bash <(curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/tools/ki-service/bootstrap.sh)
```

Alternativ mit `wget`:

```bash
REPO_URL=https://github.com/SHP-ART/Werkstatt-Terminplaner.git \
SERVICE_PORT=5000 \
bash <(wget -qO- https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/tools/ki-service/bootstrap.sh)
```

## 1b) Standalone Installer (ohne lokales Repo)

Dieser Installer laedt nur die KI-Dateien aus GitHub und richtet den Service ein.

```bash
SERVICE_PORT=5000 \
bash <(curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/tools/ki-service/standalone-install.sh)
```

Alternativ mit `wget`:

```bash
SERVICE_PORT=5000 \
bash <(wget -qO- https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/tools/ki-service/standalone-install.sh)
```

## 2) Status pruefen

```bash
sudo systemctl status werkstatt-ki
```

Health-Check (vom KI-Geraet oder im Netzwerk):

```bash
curl http://<KI-GERAET>:5000/health
```

## 3) Werkstatt-Server vorbereiten

Damit die Auto-Erkennung (mDNS) funktioniert und die neue UI sichtbar ist:

```bash
cd backend && npm install
cd ../frontend && npm run build
./start.sh
```

Hinweis: Die Auto-Erkennung der KI zum Backend nutzt mDNS (`_werkstatt-backend._tcp`).
Falls das im Netzwerk blockiert ist, setze `BACKEND_URL` manuell.

## 4) Im UI aktivieren

Einstellungen -> KI/API:
- Betriebsmodus: **Extern**
- Falls Auto-Discovery nichts findet: Fallback-IP/URL eintragen

## 5) Wichtige Umgebungsvariablen (optional)

Diese Variablen kannst du beim One-Liner setzen:

- `BACKEND_URL` (optional, falls Auto-Discovery nicht funktioniert)
- `SERVICE_PORT` (Default: 5000)
- `TRAINING_INTERVAL_MINUTES` (Default: 1440)
- `TRAINING_LOOKBACK_DAYS` (Default: 14)
- `TRAINING_MAX_RETRIES` (Default: 5)
- `TRAINING_BACKOFF_INITIAL_SECONDS` (Default: 5)
- `TRAINING_BACKOFF_MAX_SECONDS` (Default: 300)

Beispiel:

```bash
BACKEND_URL=http://<WERKSTATT-SERVER>:3001 \
REPO_URL=https://github.com/SHP-ART/Werkstatt-Terminplaner.git \
SERVICE_PORT=5000 \
TRAINING_INTERVAL_MINUTES=720 \
TRAINING_LOOKBACK_DAYS=7 \
bash <(curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/tools/ki-service/bootstrap.sh)
```
## 6) Service aktualisieren (auf dem externen KI-Gerät)

### **Schnellste Methode: Update-Skript (empfohlen)**

Das Update-Skript ist automatisch im Installationsverzeichnis vorhanden:

```bash
# Auf das KI-Gerät verbinden
ssh benutzer@<KI-GERAET-IP>

# Ins Verzeichnis wechseln und Update ausführen
cd /opt/werkstatt-ki
sudo ./update.sh
```

Das Skript führt automatisch aus:
- Service stoppen
- Code aktualisieren (git pull oder Download)
- Dependencies aktualisieren
- Service neu starten
- Status und Health-Check anzeigen

### **Alternative: Manuelle Schritte**

Um den externen KI-Service manuell auf die neueste Version zu aktualisieren:

```bash
# Auf das KI-Gerät verbinden (ersetze IP und Benutzer)
ssh benutzer@<KI-GERAET-IP>

# Service stoppen
sudo systemctl stop werkstatt-ki

# Zum Service-Verzeichnis wechseln
cd /opt/werkstatt-ki

# Code aktualisieren (falls über Git installiert)
sudo git pull origin master

# Dependencies aktualisieren
cd tools/ki-service
sudo /opt/werkstatt-ki/venv/bin/pip install -r requirements.txt --upgrade

# Service neu starten
sudo systemctl restart werkstatt-ki

# Status und Logs prüfen
sudo systemctl status werkstatt-ki
sudo journalctl -u werkstatt-ki -n 50
```

**Alternativ: Neuinstallation mit dem Standalone-Installer**

Diese Methode überschreibt die Installation komplett:

```bash
ssh benutzer@<KI-GERAET-IP>

# Service stoppen
sudo systemctl stop werkstatt-ki

# Neuinstallation mit Backend-URL (empfohlen)
BACKEND_URL=http://<WERKSTATT-SERVER-IP>:3001 \
SERVICE_PORT=5000 \
bash <(curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/master/tools/ki-service/standalone-install.sh)
```

**Wichtig:** Ersetze `<WERKSTATT-SERVER-IP>` mit der IP-Adresse deines Werkstatt-Servers (nicht localhost!).

**Nach dem Update prüfen:**

```bash
# Prüfe ob der Service läuft
curl http://<KI-GERAET-IP>:5000/health

# Prüfe ob neue Endpoints verfügbar sind (z.B. manuelles Training)
curl -X POST http://<KI-GERAET-IP>:5000/api/retrain
```

Wenn die Antwort `{"success": true, ...}` statt `{"detail":"Not Found"}` ist, wurde das Update erfolgreich durchgeführt.