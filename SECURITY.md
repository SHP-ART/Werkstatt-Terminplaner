# SECURITY.md

Sicherheitsstand des Werkstatt-Terminplaners. Keine Zugangsdaten hier eintragen
(die stehen lokal in `.claude/SECRETS.md`, gitignored).

Stand: 2026-11-07

## Vertrauensmodell

Betrieb nur im LAN (und Tailscale). Frontend und Backend kommen vom selben Server,
das Frontend sendet keinen API-Key. `requireAuth` (`backend/src/middleware/auth.js`)
schützt nur schreibende und destruktive Routen, Lesezugriffe sind offen.

## Bekannte Schwachstellen

### 1. API-Key ist ohne Anmeldung abrufbar (offen)

- Fundort: `backend/src/routes/index.js:81`, `GET /api/client-config` liefert
  `{ apiKey: process.env.API_KEY }` an jeden, der den Server erreicht.
- Folge: Der Key schützt nichts. Wer im LAN ist, holt ihn per Browser und darf damit
  Backup, Restore, `POST /api/system/update` und die übrigen `requireAuth`-Routen aufrufen.
- Grund für die Route: `electron-intern-tablet/main.js` (`fetchApiKey`) holt den Key
  dort ab, damit das Tablet Update- und Statusaufrufe signieren kann.
- Mögliche Lösung: Tablet bekommt den Key einmalig bei der Einrichtung (Konfigdatei),
  die Route liefert nur noch `{ apiKey: null }` oder wird entfernt. Vorher klären, welche
  Tablet-Funktionen den Key brauchen.

### 2. Key-Erneuerung nur mit Root (organisatorisch)

- Der Key steht in `/etc/werkstatt-terminplaner/.env` (`API_KEY=`). Ändern geht nur als
  root auf dem Server, danach `systemctl restart werkstatt-terminplaner`.
- Wurde der Key im Chat oder in einem Terminal-Verlauf gezeigt, gilt er als verbraucht:
  neu erzeugen (`openssl rand -hex 32`), in die `.env` eintragen, Dienst neu starten.
- Das Tablet holt den neuen Key beim nächsten Start selbst (siehe Punkt 1). Gibt es
  später eine Konfigdatei auf dem Tablet, muss der neue Key dort nachgetragen werden.

### 3. Öffentliche Lesezugriffe liefern interne Felder (behoben für Auftragsimport)

- `GET /api/auftragsimport` und `/:id` lieferten `text_extract` und `dateipfad`.
  Behoben in Commit 2c422e5, Test `backend/tests/auftragsimportController.test.js`.
- Auf dem Produktivserver seit 2026-11-07 16:12 aktiv, per Abruf geprüft.

### 4. `update-check` meldet fälschlich "aktuell" (offen)

- Fundort: `backend/src/controllers/systemController.js:344`, `git fetch` läuft in einem
  `try/catch` ohne Meldung. Der Dienstbenutzer kann in `/opt/werkstatt-terminplaner`
  vermutlich nicht schreiben, der Fetch scheitert still.
- Folge: `GET /api/system/update-check` zeigte `upToDate: true` (Hash `ed25775`), obwohl
  GitHub neuere Commits hatte. Dasselbe Rechteproblem betrifft `POST /api/system/update`,
  deshalb nicht darauf verlassen.
- Lösung: Fetch-Fehler in die Antwort aufnehmen und Besitzer von `/opt/werkstatt-terminplaner`
  klären.

### 5. Dienst nach `update-linux.sh` nicht neu gestartet (offen)

- Beim Update am 2026-11-07 lief der Dienst nach dem Skript mit altem Code: Start um 16:07:41,
  neue Dateien um 16:07:53. Erst ein manueller Neustart als root (16:12:30) brachte den
  neuen Stand.
- Nach jedem Update prüfen: `systemctl show werkstatt-terminplaner -p ActiveEnterTimestamp`
  muss später liegen als die Änderungszeit der Dateien, sonst neu starten.
- Ursache im Skript nicht untersucht.

## Zugang zum Produktivserver

- SSH als `shp` mit Schlüssel, ohne sudo, ohne Schreibrechte in `/opt/werkstatt-terminplaner`.
- Updates brauchen root: `/opt/werkstatt-terminplaner/update-linux.sh` (`su -`) oder
  `POST /api/system/update` mit `x-api-key` (setzt eine sudoers-Regel für den Dienstbenutzer
  voraus, nicht geprüft).
- Tailscale-Schlüssel des Servers läuft ab, solange "Disable key expiry" in der
  Tailscale-Verwaltung nicht gesetzt ist (offen).

## Regeln

- Keine Keys oder Passwörter in Chat, Repo, Commits oder Logs.
- Nach jedem Teilen eines Keys außerhalb des Servers: Key erneuern (Punkt 2).
- Neue Routen mit `requireAuth` schützen, sobald sie schreiben oder löschen.
