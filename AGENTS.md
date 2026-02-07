# Repository Guidelines

Kurzleitfaden für neue Beiträge zum Werkstatt-Terminplaner. Fokus: Klarheit, kleine PRs und reproduzierbare Schritte.

## Project Structure & Modules
- `backend/`: Node/Express API; `src/config` (DB/Env), `src/controllers`, `src/models`, `src/routes`, `src/server.js`; SQLite-Datei unter `backend/database/werkstatt.db` (automatisch erstellt).
- `frontend/`: Statisches HTML/CSS/JS; zentrale Einstiegspunkte `index.html`, `src/components`, `src/services` (API-Aufrufe), `src/styles`.
- `logs/`: Laufzeit-Logs aus den Start-Skripten.
- Start-/Stop-Skripte im Repo-Wurzelverzeichnis (`start.sh`, `stop.sh`, `.bat`-Varianten) kapseln Setup und Ports.

## Build, Test, and Development Commands
- Komplettstart: `./start.sh` (macOS/Linux) oder `start.bat` (Windows) – installiert fehlende Dependencies, startet Backend (3001) mit Electron-UI und schreibt Logs.
- Backend: `cd backend && npm install` (erstmalig), danach `npm start` für Produktion oder `npm run dev` mit nodemon-Reload.
- Stop: `./stop.sh` (stoppt Backend + Electron)

## Coding Style & Naming
- JavaScript mit 2 Leerzeichen, Semikolons beibehalten; CommonJS (`require/module.exports`) im Backend.
- API-Routen, Controller und Modelle nach Verzeichnis benennen (z.B. `routes/kunden.js`, `controllers/termine.js`).
- Konfiguration in `.env` (Backend) und `frontend/config.js` halten; keine Secrets ins Repo committen.
- Halte Funktionen klein; bevorzugt async/await statt verschachtelter Promises/Callbacks.

## Testing Guidelines
- Aktuell keine automatisierten Tests; prüfe Änderungen manuell über Kernpfade: Kunden anlegen/bearbeiten, Termin erstellen/bearbeiten, Auslastung laden.
- Bei neuen Tests: sammele Backend-Tests unter `backend/tests/` (Vorschlag: Jest oder Supertest), benenne Dateien `*.test.js`.
- Vor Merge sicherstellen, dass `npm start` (Backend) fehlerfrei startet und Frontend API-Aufrufe gegen Port 3001 erreichen.

## Commit & Pull Requests
- Commit-Betreff im Imperativ und knapp (`Add kunden import validation`, `Fix auslastung calc`); kleine, thematisch fokussierte Commits bevorzugen.
- PR-Beschreibung: Was/warum, relevante Tickets/Issues, manuelle Testschritte; UI-Änderungen mit kurzen Screenshots oder GIFs dokumentieren.
- Prüfe, dass neue Routen/Services dokumentiert sind (README oder passende Stelle) und Konfigurationsänderungen erwähnt werden.

## Configuration & Data Tips
- Backend-Port und CORS über `.env` steuerbar; Standard-CORS-Ziel `http://localhost:3000`.
- Wenn das Frontend von einem anderen Host zugreift, `frontend/src/services/api.js` (`API_BASE_URL`) anpassen.
- SQLite-Backups: `cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db`; nie in PRs hochladen.
