# Repository Guidelines

## Project Overview
Werkstatt-Terminplaner ist eine Web-App (Node/Express + SQLite) für KFZ-Werkstätten
zur Termin- und Kundenverwaltung. Primär als Linux-Server-Dienst betrieben (systemd),
optional auch als Desktop-App via Electron verfügbar.
Zielgruppe: Einzelne Werkstatt; läuft lokal im Netzwerk, kein Cloud-Backend.

**Tech Stack:**
- Backend: Node.js / Express (Port 3001), läuft als systemd-Dienst auf Linux
- Frontend: Vite-Build (HTML/CSS/JS), wird über Browser oder Electron geladen
- Desktop: Electron optional – kapselt Frontend und startet Backend als lokalen Prozess
- Tablet-App: `electron-intern-tablet/` – eigenständige Electron-App für Werkstatt-Tablets; ruft Backend per HTTP ab; hat eigenes Auto-Update-System (der Server liefert neue Installer über `/api/tablet-update`)
- Datenbank: SQLite (lokal, kein Server nötig)

## Project Structure & Modules
- `backend/`: Node/Express API; `src/config` (DB/Env), `src/controllers`, `src/models`, `src/routes`, `src/server.js`; SQLite-Datei unter `backend/database/werkstatt.db` (automatisch erstellt).
- `frontend/`: Vite-Build; zentrale Einstiegspunkte `index.html`, `src/components`, `src/services` (API-Aufrufe), `src/styles`.
- `electron-intern-tablet/`: Eigenständige Electron-App für Werkstatt-Tablets. Baut separat (`npm run build`), erzeugt Installer (`.exe`). Prüft beim Start automatisch auf neue Version über Backend-API und installiert Updates selbstständig.
- `logs/`: Laufzeit-Logs aus den Start-Skripten.
- Start-/Stop-Skripte im Repo-Wurzelverzeichnis (`start.sh`, `stop.sh`, `.bat`-Varianten) kapseln Setup und Ports.

## Build, Test, and Development Commands
- Komplettstart: `./start.sh` (macOS/Linux) oder `start.bat` (Windows) – installiert fehlende Dependencies, startet Backend (3001) mit Electron-UI und schreibt Logs.
- Backend: `cd backend && npm install` (erstmalig), danach `npm start` für Produktion oder `npm run dev` mit nodemon-Reload.
- Stop: `./stop.sh` (stoppt Backend + Electron)

## Architecture
Electron startet beim Launch `backend/src/server.js` als Child-Process (Port 3001).
Das Frontend läuft im Electron-Renderer und spricht ausschließlich gegen `http://localhost:3001`.
Alle API-Aufrufe gehen über `frontend/src/services/api.js` – dort ist `API_BASE_URL` zentral definiert.

**Kernpfade manuell testen:**
1. Kunden anlegen / bearbeiten
2. Termin erstellen / bearbeiten
3. Auslastungsansicht laden

## Coding Style & Naming
- JavaScript mit 2 Leerzeichen, Semikolons beibehalten; CommonJS (`require/module.exports`) im Backend.
- API-Routen, Controller und Modelle nach Verzeichnis benennen (z.B. `routes/kunden.js`, `controllers/termine.js`).
- Konfiguration in `.env` (Backend) und `frontend/config.js` halten; keine Secrets ins Repo committen.
- Halte Funktionen klein; bevorzugt async/await statt verschachtelter Promises/Callbacks.

## Testing Guidelines
- Aktuell keine automatisierten Tests vorhanden (TODO).
- Änderungen manuell über Kernpfade prüfen (siehe Architecture).
- Vor Merge sicherstellen, dass `npm start` fehlerfrei startet und Frontend API-Aufrufe gegen Port 3001 erreichen.
- Bei neuen Tests: Backend-Tests unter `backend/tests/` (Jest oder Supertest), Dateien als `*.test.js` benennen.

## Commit & Pull Requests
- Commit-Betreff im Imperativ und knapp (`Add kunden import validation`, `Fix auslastung calc`); kleine, thematisch fokussierte Commits bevorzugen.
- PR-Beschreibung: Was/warum, relevante Tickets/Issues, manuelle Testschritte; UI-Änderungen mit kurzen Screenshots oder GIFs dokumentieren.
- Prüfe, dass neue Routen/Services dokumentiert sind (README oder passende Stelle) und Konfigurationsänderungen erwähnt werden.

## Configuration & Data Tips
- Backend-Port und CORS über `.env` steuerbar.
- Wenn das Frontend von einem anderen Host zugreift, `frontend/src/services/api.js` (`API_BASE_URL`) anpassen.
- SQLite-Backups: `cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db`; nie in PRs hochladen.

## Deployment (Produktivserver)

**Zugang:** SSH via Tailscale: `root@100.124.168.108`
Bei SSH-Fehler (Tailscale Re-Auth): URL aus Fehlermeldung im Browser öffnen.

**Serverpfade:**
- App: `/opt/werkstatt-terminplaner/`
- Datenbank: `/var/lib/werkstatt-terminplaner/database/werkstatt.db`
- Backups: `/var/lib/werkstatt-terminplaner/backups/`

### Reihenfolge bei Frontend + Backend Update
```powershell
# 1. Frontend bauen
cd frontend ; npm run build ; cd ..

# 2. Git push
git add -A ; git commit -m "Beschreibung" ; git push

# 3. Frontend-Dateien hochladen (Dateinamen nach Build anpassen! IMMER JS + CSS)
scp "frontend\dist\assets\main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\assets\main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/

# 4. Datenbank-Backup erstellen (IMMER vor dem Update!)
ssh root@100.124.168.108 "mkdir -p /var/lib/werkstatt-terminplaner/backups && cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-update_$(date +%Y%m%d_%H%M%S).db && echo 'BACKUP OK'"

# 5. Backend auf Server aktualisieren
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git stash && git pull && systemctl restart werkstatt-terminplaner && echo 'DEPLOY OK'"
```

### Server-Status prüfen
```powershell
ssh root@100.124.168.108 "systemctl is-active werkstatt-terminplaner"
ssh root@100.124.168.108 "journalctl -u werkstatt-terminplaner -n 50"
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git log --oneline -5"
```

### Tablet-App aktualisieren
```powershell
# 1. Version in electron-intern-tablet\package.json erhöhen (z.B. 1.7.1 → 1.7.2)

# 2. Build erstellen
cd electron-intern-tablet
npm run build
cd ..

# 3. Installer auf den Server hochladen
scp "electron-intern-tablet\dist\Werkstatt-Intern-Setup-X.X.X-ia32.exe" root@100.124.168.108:/opt/werkstatt-upload/

# 4. Update am Server registrieren
$json = '{"version":"X.X.X","filePath":"/opt/werkstatt-upload/Werkstatt-Intern-Setup-X.X.X-ia32.exe","releaseNotes":"Beschreibung"}'
$json | ssh root@100.124.168.108 'cat > /tmp/update.json && curl -s -X POST http://localhost:3001/api/tablet-update/register -H "Content-Type: application/json" -d @/tmp/update.json'
```
Die Tablets laden das Update beim nächsten automatischen Check-Intervall herunter und installieren es selbstständig.

### Häufige Deploy-Probleme
| Problem | Lösung |
|---|---|
| `git pull` schlägt fehl (lokale Änderungen) | `git stash` davor ausführen |
| `git pull` schlägt fehl (untracked files) | Datei nach `/tmp/` verschieben, dann pull |
| Backend startet nicht | `systemctl status werkstatt-terminplaner` für Logs |
| Frontend zeigt alte Version | Browser-Cache leeren (Strg+Shift+R) |
| Tablet aktualisiert nicht | Version in `package.json` erhöht? Update korrekt registriert? (`/api/tablet-update/latest` prüfen) |

## Workflow Guidelines

### Task Management
- Vor komplexen Änderungen (3+ Schritte): Plan in `tasks/todo.md` schreiben und vor Umsetzung kurz bestätigen
- Tasks erst als erledigt markieren wenn verifiziert
- Nach Korrekturen durch den User: Muster in `tasks/lessons.md` dokumentieren um denselben Fehler nicht zu wiederholen
- `tasks/lessons.md` zu Sessionbeginn lesen wenn vorhanden

### Verification
- Nie "fertig" ohne Beweis dass es funktioniert (Logs, manueller Test, Statuscheck)
- Bei Bugs: direkt fixen ohne Rückfragen – Logs und Errors zeigen den Weg
- Wenn ein Fix sich hacky anfühlt: elegante Lösung implementieren statt weitermachen

### Code Quality
- Jede Änderung so minimal wie möglich – nur das Nötige anfassen
- Keine temporären Fixes – immer die Ursache finden
- Bei nicht-trivialen Änderungen kurz prüfen: "Gibt es einen eleganteren Weg?"
- Einfache, offensichtliche Fixes nicht überdenken

## Do NOT
- SQLite-Datei (`werkstatt.db`) in PRs oder Commits hochladen
- Secrets oder API-Keys in `frontend/config.js` oder ins Repo committen
- Port 3001 im Frontend-Code hardcoden – immer `API_BASE_URL` aus `api.js` nutzen
- `node_modules/` committen
- Direkt in `werkstatt.db` schreiben ohne vorheriges Backup
- CORS-Ziel oder Ports im Code hardcoden statt über `.env` steuern
- Backend auf dem Server updaten OHNE vorher Datenbank-Backup zu erstellen