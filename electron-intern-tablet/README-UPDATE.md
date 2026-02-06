# Tablet-App Build & Update - Quick Guide

## 🚀 Schnellstart: Neue Version erstellen

### Option 1: Automatisch (EMPFOHLEN)

**Windows (PowerShell):**
```powershell
.\build-and-register.ps1
```

**Windows (CMD):**
```cmd
build-and-register.bat
```

**Fertig!** Das Skript:
1. ✅ Baut die Tablet-App
2. ✅ Findet die Installer-Datei
3. ✅ Registriert das Update automatisch am Server
4. ✅ Tablets werden innerhalb von 30 Minuten benachrichtigt

---

### Option 2: Mit npm-Skript

```bash
# Build + Auto-Registrierung
npm run build:auto

# Oder nur registrieren (falls bereits gebaut)
npm run register
```

---

### Option 3: Manuell (2 Schritte)

```bash
# 1. Build
npm run build

# 2. Registrieren
npm run register
```

---

## ⚙️ Konfiguration

### Server-URL ändern

**In PowerShell-Skript:**
```powershell
# In build-and-register.ps1, Zeile ~67
$serverUrl = "http://192.168.1.100:3001"  # Ihre Server-IP
```

**In Batch-Skript:**
```batch
REM In build-and-register.bat, Zeile ~47
set SERVER_URL=http://192.168.1.100:3001
```

**In npm-Skript:**
```bash
# Umgebungsvariable setzen
set SERVER_URL=http://192.168.1.100:3001
npm run build:auto
```

---

## 📋 Was passiert?

### Beim Build:
1. `electron-builder` erstellt Installer in `dist/`
2. Dateiname: `Werkstatt-Intern-Setup-1.6.0-x64.exe`

### Bei der Registrierung:
1. Version wird aus `package.json` gelesen
2. Installer-Datei wird automatisch gefunden
3. API-Call an Server: `POST /api/tablet-update/register`
4. Server speichert Update-Info in Datenbank

### Auf den Tablets:
1. Tablets prüfen alle 30 Minuten auf Updates
2. Bei verfügbarem Update: Benachrichtigung erscheint
3. Benutzer klickt "Jetzt installieren"
4. Update wird heruntergeladen und installiert
5. Einstellungen bleiben erhalten! ✅

---

## 🔍 Status überprüfen

**Alle Tablets anzeigen:**
```bash
curl http://localhost:3001/api/tablet-update/status
```

**Im Browser:**
```
http://localhost:3001/api/tablet-update/status
```

**Ergebnis:**
```json
[
  {
    "hostname": "WERKSTATT-TABLET-01",
    "ip": "192.168.1.100",
    "version": "1.5.9",
    "last_seen": "2026-02-06T08:00:00Z"
  }
]
```

---

## ❗ Troubleshooting

### "Installer nicht gefunden"
**Ursache:** Build hat nicht geklappt oder falsches Dateiformat

**Lösung:**
```bash
# Prüfen ob Datei existiert
dir dist\*.exe

# Erneut bauen
npm run build
```

---

### "Verbindungsfehler" / "Server nicht erreichbar"
**Ursache:** Server läuft nicht oder falsche URL

**Lösung:**
```bash
# Server starten
cd ..\backend
npm start

# Oder nur API-Server
npm run server

# Server-URL in Skript prüfen
```

---

### "Update erscheint nicht auf Tablet"
**Mögliche Ursachen:**

1. **Tablet hat noch nicht geprüft**
   - Warten Sie bis zu 30 Minuten
   - Oder: Tablet-App neu starten

2. **Tablet hat keine Verbindung zum Server**
   - Backend-URL in Tablet-Einstellungen prüfen
   - Netzwerkverbindung prüfen

3. **Version ist nicht neuer**
   - Version in `package.json` muss höher sein als aktuelle Tablet-Version

---

## 📦 Typischer Workflow

### Neue Version erstellen:

1. **Änderungen machen** (Code, Features, Bugfixes)

2. **Version erhöhen** in `package.json`:
   ```json
   {
     "version": "1.6.1"  // von 1.6.0 erhöht
   }
   ```

3. **Build + Registrierung:**
   ```powershell
   .\build-and-register.ps1
   ```

4. **Fertig!** ☕
   - Installer erstellt
   - Am Server registriert
   - Tablets werden benachrichtigt

5. **Optional: Status prüfen:**
   ```
   http://localhost:3001/api/tablet-update/status
   ```

---

## 💡 Tipps

- **Versionsnummern:** Immer erhöhen! Server vergleicht Versionen
- **Release Notes:** In Skript anpassen für bessere Beschreibung
- **Server-URL:** Bei Netzwerk-Installation IP statt localhost verwenden
- **Testen:** Erst auf einem Test-Tablet ausprobieren

---

## 🎯 Vorteile dieser Lösung

✅ **Ein Befehl** - Build + Registrierung automatisch  
✅ **Keine manuelle Arbeit** - Kein API-Call von Hand  
✅ **Fehlerbehandlung** - Skript prüft alles  
✅ **Zeit sparen** - Von 30 Minuten auf 2 Minuten  
✅ **Keine Fehler** - Automatisch korrekte Pfade und Version  

---

## 📞 Support

Bei Problemen:
1. Prüfe Server-Logs: `backend/logs/server-debug.log`
2. Prüfe ob Build erfolgreich: `dist/*.exe` vorhanden?
3. Teste Server-Verbindung: `curl http://localhost:3001/api/health`
