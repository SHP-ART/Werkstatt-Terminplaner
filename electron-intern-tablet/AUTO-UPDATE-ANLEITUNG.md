# Tablet-App Auto-Update System

Automatisches Update-System für die Werkstatt-Intern Tablet-App über den Fernwartungsserver.

---

## 🔄 Wie funktioniert das Auto-Update?

```
┌─────────────────┐
│  Neuen Build    │
│  erstellen      │ → npm run build:win
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Auf Server     │
│  hochladen      │ → upload-und-register-update.bat
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Backend        │
│  registriert    │ → POST /api/tablet-update/register
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Tablets        │
│  prüfen & laden │ → Alle 2 Stunden automatisch
└─────────────────┘
```

---

## 📦 Neues Update veröffentlichen

### Schritt 1: Build erstellen

```cmd
cd electron-intern-tablet
npm install
npm run build:win
```

Ergebnis: `dist\Werkstatt-Intern-Setup-1.6.2-ia32.exe`

### Schritt 2: Upload & Registrierung

**Automatisch (empfohlen):**
```cmd
upload-und-register-update.bat
```

Das Skript:
- ✅ Lädt beide Versionen (32-Bit + 64-Bit) auf den Fernwartungsserver hoch
- ✅ Registriert das Update im Backend
- ✅ Benachrichtigt alle verbundenen Tablets

**Manuell:**

1. Upload:
   ```cmd
   copy dist\Werkstatt-Intern-Setup-1.6.2-ia32.exe \\100.124.168.108\Werkstatt-Upload\
   ```

2. Registrierung auf dem Linux-Server:
   ```bash
   ssh root@192.168.0.57
   curl -X POST http://localhost:3001/api/tablet-update/register \
     -H "Content-Type: application/json" \
     -d '{
       "version": "1.6.2",
       "filePath": "/opt/werkstatt-upload/Werkstatt-Intern-Setup-1.6.2-ia32.exe",
       "releaseNotes": "Update von GitHub"
     }'
   ```

---

## 🖥️ Wie Tablets Updates bekommen

### Automatischer Check

Die Tablet-App prüft **alle 2 Stunden** automatisch auf Updates:

1. **Check:** `GET /api/tablet-update/check?version=1.6.1`
2. **Download:** `GET /api/tablet-update/download` (wenn Update verfügbar)
3. **Installation:** Automatisch + App-Neustart

### Manueller Update-Check

In der Tablet-App:
- Rechtsklick → **Einstellungen** → **Nach Updates suchen**

---

## 📊 Update-Status überwachen

### Alle verbundenen Tablets anzeigen

```bash
curl http://192.168.0.57:3001/api/tablet-update/status
```

Ausgabe:
```json
[
  {
    "hostname": "TABLET-WERKSTATT",
    "ip": "192.168.0.105",
    "version": "1.6.2",
    "last_seen": "2026-03-10 02:15:00"
  }
]
```

### Neueste registrierte Version prüfen

```bash
sqlite3 /opt/werkstatt-terminplaner/database/werkstatt.db \
  "SELECT version, file_path, published_at FROM tablet_updates ORDER BY published_at DESC LIMIT 1;"
```

---

## 🔧 Konfiguration

### Update-Intervall ändern

In `electron-intern-tablet/main.js`:

```javascript
// Aktuell: Alle 2 Stunden
const updateCheckInterval = 2 * 60 * 60 * 1000;

// Ändern z.B. auf 30 Minuten:
const updateCheckInterval = 30 * 60 * 1000;
```

### Update-Server-URL

Standard: Backend-URL aus `config.json` (`http://192.168.0.57:3001`)

Falls anders:
```json
{
  "backendUrl": "http://andere-ip:3001"
}
```

---

## 🐛 Troubleshooting

| Problem | Lösung |
|---|---|
| Tablet findet kein Update | Prüfe ob Update registriert wurde: `curl http://192.168.0.57:3001/api/tablet-update/check?version=1.0.0` |
| Download schlägt fehl | Prüfe ob Datei existiert: `ls -lh /opt/werkstatt-upload/Werkstatt-Intern-Setup-*.exe` |
| Installation startet nicht | Windows Defender blockiert? → In Tab-App unter Einstellungen "Installation erzwingen" |
| Tablets zeigen alte Version | Backend-Server neu starten oder Tablet manuell updaten |

### Backend-Logs prüfen

```bash
ssh root@192.168.0.57
journalctl -u werkstatt-terminplaner -f | grep -i update
```

---

## 📁 Dateien & Pfade

| Was | Wo |
|---|---|
| **Upload-Skript** | `electron-intern-tablet/upload-und-register-update.bat` |
| **SMB-Share (Windows)** | `\\100.124.168.108\Werkstatt-Upload\` |
| **Server-Pfad (Linux)** | `/opt/werkstatt-upload/` |
| **Backend-API** | `http://192.168.0.57:3001/api/tablet-update/` |
| **Datenbank** | `/opt/werkstatt-terminplaner/database/werkstatt.db` |

---

## ✅ Checkliste für Update-Release

- [ ] Version in `package.json` erhöht
- [ ] Build erstellt (`npm run build:win`)
- [ ] Upload-Skript ausgeführt
- [ ] Update im Backend registriert
- [ ] Test auf einem Tablet durchgeführt
- [ ] Update-Status geprüft (alle Tablets aktualisiert?)
