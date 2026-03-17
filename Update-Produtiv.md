# Anleitung: Deployment auf den Produktivserver

## Voraussetzungen
- SSH-Zugang via Tailscale: `root@100.124.168.108`
- Tailscale muss aktiv sein (ggf. Re-Auth: Link aus Fehlermeldung im Browser öffnen)

---

## 1. Frontend ändern → bauen → deployen

```powershell
# 1. Frontend bauen
cd frontend
npm run build

# 2. Neue Dateien hochladen
# HINWEIS: Die genauen Dateinamen (main-XXXXXXXX.js / main-XXXXXXXX.css) zeigt Vite nach dem Build an
# WICHTIG: Immer BEIDE Asset-Dateien (JS + CSS) hochladen, sonst fehlt das Styling!
scp "frontend\dist\assets\main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\assets\main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/
```

---

## 2. Backend ändern → deployen

```powershell
# 1. Änderungen committen und pushen
git add -A
git commit -m "Beschreibung der Änderungen"
git push

# 2. Datenbank-Backup erstellen (IMMER vor dem Update!)
ssh root@100.124.168.108 "mkdir -p /var/lib/werkstatt-terminplaner/backups && cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-update_\$(date +%Y%m%d_%H%M%S).db && echo 'BACKUP OK'"

# 3. Auf dem Server pullen und Backend neu starten
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git stash && git pull && systemctl restart werkstatt-terminplaner && echo 'DEPLOY OK'"
```

> Falls `git pull` wegen untracked files fehlschlägt:
> ```bash
> ssh root@100.124.168.108 "mv /opt/werkstatt-terminplaner/backend/migrations/XXX.js /tmp/ && cd /opt/werkstatt-terminplaner && git pull && systemctl restart werkstatt-terminplaner"
> ```

---

## 3. Tablet-App (electron-intern-tablet) aktualisieren

```powershell
# 1. Version in electron-intern-tablet\package.json erhöhen (z.B. 1.7.1 → 1.7.2)

# 2. Build erstellen
cd electron-intern-tablet
npm run build

# 3. Installer auf den Server hochladen
scp "dist\Werkstatt-Intern-Setup-X.X.X-ia32.exe" root@100.124.168.108:/opt/werkstatt-upload/

# 4. Update am Server registrieren
$json = '{"version":"X.X.X","filePath":"/opt/werkstatt-upload/Werkstatt-Intern-Setup-X.X.X-ia32.exe","releaseNotes":"Beschreibung der Änderungen"}'
$json | ssh root@100.124.168.108 'cat > /tmp/update.json && curl -s -X POST http://localhost:3001/api/tablet-update/register -H "Content-Type: application/json" -d @/tmp/update.json'
```

Die Tablets laden das Update beim nächsten automatischen Check-Intervall herunter und installieren es.

---

## 4. Alles zusammen (Frontend + Backend)

```powershell
# 1. Frontend bauen
cd frontend ; npm run build ; cd ..

# 2. Git push
git add -A ; git commit -m "Beschreibung" ; git push

# 3. Frontend-Dateien hochladen (Dateinamen anpassen! BEIDE: JS + CSS)
scp "frontend\dist\assets\main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\assets\main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/

# 4. Datenbank-Backup erstellen (IMMER vor dem Update!)
ssh root@100.124.168.108 "mkdir -p /var/lib/werkstatt-terminplaner/backups && cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-update_\$(date +%Y%m%d_%H%M%S).db && echo 'BACKUP OK'"

# 5. Backend auf Server aktualisieren
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git stash && git pull && systemctl restart werkstatt-terminplaner && echo 'DEPLOY OK'"
```

---

## Datenbank-Backups verwalten

Backups liegen auf dem Server unter `/var/lib/werkstatt-terminplaner/backups/` mit dem Muster `pre-update_YYYYMMDD_HHMMSS.db`.

```powershell
# Alle Backups auflisten
ssh root@100.124.168.108 "ls -lh /var/lib/werkstatt-terminplaner/backups/"

# Backup lokal herunterladen (z.B. das neueste)
scp "root@100.124.168.108:/var/lib/werkstatt-terminplaner/backups/pre-update_YYYYMMDD_HHMMSS.db" .

# Alte Backups aufräumen (älter als 30 Tage löschen)
ssh root@100.124.168.108 "find /var/lib/werkstatt-terminplaner/backups/ -name '*.db' -mtime +30 -delete && echo 'Bereinigt'"
```

---

## Häufige Probleme

| Problem | Lösung |
|---|---|
| SSH schlägt fehl (Tailscale Re-Auth) | URL aus Fehlermeldung im Browser öffnen und bestätigen |
| `git pull` schlägt fehl (lokale Änderungen) | `git stash` davor ausführen |
| `git pull` schlägt fehl (untracked files) | Datei nach `/tmp/` verschieben, dann pull wiederholen |
| Backend startet nicht | `ssh root@... "systemctl status werkstatt-terminplaner"` für Logs |
| Frontend zeigt alte Version | Browser-Cache leeren (Strg+Shift+R) |

---

## Server-Status prüfen

```powershell
# Service-Status
ssh root@100.124.168.108 "systemctl is-active werkstatt-terminplaner"

# Aktueller Git-Stand auf dem Server
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git log --oneline -5"

# Backend-Logs (letzte 50 Zeilen)
ssh root@100.124.168.108 "journalctl -u werkstatt-terminplaner -n 50"
```
