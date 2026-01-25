# Externe KI Installation (Debian)

Dieses Dokument beschreibt die vollautomatische Installation des externen KI-Services
auf einem separaten Geraet sowie die noetigen Schritte am Werkstatt-Server.

## 1) One-Liner Installation (empfohlen)

Ersetze `<WERKSTATT-SERVER>` durch die IP/den Host deines Werkstatt-Servers.
Der KI-Service laeuft auf Port 5000.

```bash
BACKEND_URL=http://<WERKSTATT-SERVER>:3001 \
REPO_URL=https://github.com/SHP-ART/Werkstatt-Terminplaner.git \
SERVICE_PORT=5000 \
bash <(curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/main/tools/ki-service/bootstrap.sh)
```

Alternativ mit `wget`:

```bash
BACKEND_URL=http://<WERKSTATT-SERVER>:3001 \
REPO_URL=https://github.com/SHP-ART/Werkstatt-Terminplaner.git \
SERVICE_PORT=5000 \
bash <(wget -qO- https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/main/tools/ki-service/bootstrap.sh)
```

## 1b) Standalone Installer (ohne lokales Repo)

Dieser Installer laedt nur die KI-Dateien aus GitHub und richtet den Service ein.

```bash
BACKEND_URL=http://<WERKSTATT-SERVER>:3001 \
SERVICE_PORT=5000 \
bash <(curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/main/tools/ki-service/standalone-install.sh)
```

Alternativ mit `wget`:

```bash
BACKEND_URL=http://<WERKSTATT-SERVER>:3001 \
SERVICE_PORT=5000 \
bash <(wget -qO- https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/main/tools/ki-service/standalone-install.sh)
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
./start_server.sh
```

## 4) Im UI aktivieren

Einstellungen -> KI/API:
- Betriebsmodus: **Extern**
- Falls Auto-Discovery nichts findet: Fallback-IP/URL eintragen

## 5) Wichtige Umgebungsvariablen (optional)

Diese Variablen kannst du beim One-Liner setzen:

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
bash <(curl -fsSL https://raw.githubusercontent.com/SHP-ART/Werkstatt-Terminplaner/main/tools/ki-service/bootstrap.sh)
```
