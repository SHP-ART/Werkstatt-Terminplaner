# Tablet-App Windows – Build & Installation

Anleitung zum Erstellen und Installieren der **Werkstatt Intern** Electron-App als Windows-EXE.

---

## Voraussetzungen

- **Windows-PC** mit Node.js ≥ 18 installiert → [nodejs.org](https://nodejs.org)
- Zugriff auf das GitHub-Repository (oder ZIP-Download)
- Ordner `electron-intern-tablet/` aus dem Repository

> **macOS/Linux:** Auf macOS lässt sich keine Windows-EXE bauen. Den Build immer auf einem Windows-PC oder einer Windows-VM durchführen.

---

## Schritt 1 – Quellcode holen

**Option A: Git**
```cmd
git clone https://github.com/SHP-ART/Werkstatt-Terminplaner.git
cd Werkstatt-Terminplaner\electron-intern-tablet
```

**Option B: ZIP von GitHub**
- Auf GitHub → „Code" → „Download ZIP"
- Entpacken, in den Ordner `electron-intern-tablet\` wechseln

---

## Schritt 2 – Server-URL einstellen (vor dem Build!)

Die Datei `config.json` im Ordner `electron-intern-tablet\` enthält die Verbindungseinstellungen.  
Vor dem Build auf die **richtige Server-IP** anpassen:

```json
{
  "backendUrl": "http://192.168.0.57:3001",
  "refreshInterval": 30,
  "fullscreen": true,
  "kiosk": false,
  "autostart": true,
  "displayOffTime": "18:10",
  "displayOnTime": "07:30"
}
```

> `192.168.0.57` = IP des Linux-Servers im lokalen Netzwerk.  
> Diese Einstellung kann nach der Installation auch in der App unter ⚙️ **Einstellungen** geändert werden.

---

## Schritt 3 – Build erstellen

**Methode A: Doppelklick auf `build.bat`**
```
electron-intern-tablet\build.bat
```
→ Öffnet sich automatisch, installiert Abhängigkeiten und startet den Build.

**Methode B: Manuell in der Kommandozeile**
```cmd
cd electron-intern-tablet
npm install
npm run build:win
```

Der Build dauert ca. 1–3 Minuten.

---

## Schritt 4 – Installer finden und installieren

Nach erfolgreichem Build liegt die EXE im Ordner:
```
electron-intern-tablet\dist\
```

Dateiname:
```
Werkstatt-Intern-Setup-1.6.2-x64.exe   ← für 64-Bit Windows (Standard)
Werkstatt-Intern-Setup-1.6.2-ia32.exe  ← für 32-Bit Windows (ältere PCs)
```

- EXE auf den Windows-PC kopieren (USB, Netzlaufwerk, SMB-Share)
- Doppelklick → Installation läuft automatisch durch (One-Click-Installer)
- App startet danach automatisch

---

## Nach der Installation

### App-Speicherort
```
C:\Users\<Benutzer>\AppData\Local\Programs\Werkstatt Intern\
```

### Config-Datei (Einstellungen nachträglich ändern)
```
C:\Users\<Benutzer>\AppData\Roaming\werkstatt-intern-tablet\config.json
```
Diese Datei bleibt bei Updates erhalten.

### Autostart
Falls `"autostart": true` in der config.json gesetzt ist, startet die App automatisch mit Windows.

---

## Update (neue Version einspielen)

1. Auf dem Build-PC: `git pull` → neuen Build erstellen (`build.bat`)
2. Neue EXE auf den Windows-PC kopieren
3. EXE ausführen → überschreibt die alte Installation automatisch

> Die `config.json` (mit Server-URL und Einstellungen) bleibt beim Update erhalten.

---

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| „Verbindung fehlgeschlagen" | Server-IP in ⚙️ Einstellungen prüfen. Standard: `http://192.168.0.57:3001` |
| App startet nicht (schwarzes Fenster) | Backend-Server auf dem Linux-PC läuft? `curl http://192.168.0.57:3001/api/health` |
| Display bleibt dunkel | In der Web-Oberfläche unter **Einstellungen → Tablet** den Display-Status auf „AN" setzen |
| Build schlägt fehl | `node_modules\` löschen und `npm install` erneut ausführen |
| Windows Defender blockiert EXE | „Trotzdem ausführen" wählen (unsigned app) |
