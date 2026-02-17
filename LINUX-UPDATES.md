# Linux Update-System

## Übersicht

Der Werkstatt Terminplaner bietet ein **vollautomatisches Update-System** für Linux-Server mit mehreren Methoden:

1. ✅ **Web-Interface** - Ein-Klick-Update im Status-Dashboard
2. ✅ **Manuelles Update-Skript** - Über Terminal
3. ✅ **Automatische Updates** - Via cronjob (wöchentlich/monatlich)

---

## 🌐 Methode 1: Update über Web-Interface (Empfohlen)

### Zugriff

Navigieren Sie zum Status-Dashboard:
```
http://<SERVER-IP>:3001/status
```

### Features

- **Automatischer Update-Check** - Prüft alle 5 Minuten auf neue Versionen
- **Release Notes** - Zeigt Änderungen der neuen Version
- **Ein-Klick-Update** - Button zum Installieren
- **Auto-Reload** - Seite lädt automatisch nach Update neu

### Ablauf

1. Dashboard öffnen
2. Sektion "🔄 System-Updates" prüfen
3. Bei verfügbarem Update: "📥 Update installieren" Button klicken
4. Bestätigen
5. Warten bis Server neu startet (~30 Sekunden)
6. Seite lädt automatisch neu

### Sicherheit

- ✅ **Automatisches Backup** vor Update
- ✅ **Rollback möglich** bei Fehler
- ✅ **Kein Datenverlust** - Nur Code wird aktualisiert

---

## 💻 Methode 2: Manuelles Update-Skript

### Installation des Update-Skripts

Das Skript ist bereits bei der Installation enthalten:
```
/opt/werkstatt-terminplaner/update-linux.sh
```

### Update durchführen

```bash
# Als root/sudo ausführen
sudo /opt/werkstatt-terminplaner/update-linux.sh
```

### Was das Skript macht

1. ✅ Prüft installierte vs. neueste Version
2. ✅ Erstellt automatisches Backup der Datenbank
3. ✅ Stoppt den Server-Service
4. ✅ Sichert aktuellen Code
5. ✅ Lädt neue Version von GitHub
6. ✅ Aktualisiert Dependencies (npm install)
7. ✅ Startet Server neu
8. ✅ Prüft ob Update erfolgreich war

### Output-Beispiel

```
╔════════════════════════════════════════════════════════════╗
║  Werkstatt Terminplaner - Update System                   ║
╚════════════════════════════════════════════════════════════╝

▶ Prüfe installierte Version...
ℹ Installierte Version: 1.6.2
▶ Prüfe auf Updates...
ℹ Neueste Version: 1.6.3
▶ Erstelle Backup vor Update...
✓ Backup erstellt: pre_update_1.6.2_20260217_153045.db
▶ Stoppe Server...
✓ Server gestoppt
▶ Sichere aktuelle Installation...
✓ Gesichert nach: /tmp/werkstatt-backup-20260217_153045
▶ Lade neue Version...
✓ Code aktualisiert via git
▶ Aktualisiere Dependencies...
✓ Dependencies aktualisiert
▶ Starte Server...
✓ Server läuft

╔════════════════════════════════════════════════════════════╗
║  Update erfolgreich abgeschlossen! 🎉                      ║
╚════════════════════════════════════════════════════════════╝

  Alte Version: 1.6.2
  Neue Version: 1.6.3

  Backup: pre_update_1.6.2_20260217_153045.db
  Code-Backup: /tmp/werkstatt-backup-20260217_153045

  Zugriff: http://192.168.1.10:3001
```

---

## ⏰ Methode 3: Automatische Updates (Cronjob)

### Wöchentliche Updates (Empfohlen)

Installiert Updates automatisch **jeden Sonntag um 3 Uhr nachts**:

```bash
# Crontab bearbeiten
sudo crontab -e

# Folgende Zeile hinzufügen:
0 3 * * 0 /opt/werkstatt-terminplaner/update-linux.sh --auto >> /var/log/werkstatt-terminplaner/updates.log 2>&1
```

### Monatliche Updates (Konservativ)

Updates nur **am 1. jeden Monats um 3 Uhr**:

```bash
# In crontab:
0 3 1 * * /opt/werkstatt-terminplaner/update-linux.sh --auto >> /var/log/werkstatt-terminplaner/updates.log 2>&1
```

### Nur Update-Check (ohne Installation)

Prüft täglich auf Updates und benachrichtigt per E-Mail:

```bash
# Update-Check ohne automatische Installation
0 9 * * * /opt/werkstatt-terminplaner/check-updates.sh

# check-updates.sh erstellen:
sudo nano /opt/werkstatt-terminplaner/check-updates.sh
```

```bash
#!/bin/bash
CURRENT=$(/usr/bin/node -p "require('/opt/werkstatt-terminplaner/backend/package.json').version")
LATEST=$(curl -s "https://api.github.com/repos/SHP-ART/Werkstatt-Terminplaner/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v?([^"]+)".*/\1/')

if [ "$CURRENT" != "$LATEST" ]; then
    echo "Update verfügbar: $CURRENT → $LATEST"
    echo "Führe aus: sudo /opt/werkstatt-terminplaner/update-linux.sh"
fi
```

```bash
# Ausführbar machen
sudo chmod +x /opt/werkstatt-terminplaner/check-updates.sh
```

### Cronjob-Syntax Erklärt

```
┌─────── Minute (0-59)
│ ┌───── Stunde (0-23)
│ │ ┌─── Tag des Monats (1-31)
│ │ │ ┌─ Monat (1-12)
│ │ │ │ ┌ Wochentag (0-7, 0=Sonntag)
│ │ │ │ │
* * * * *  Befehl
```

**Beispiele:**
```
0 3 * * 0   # Sonntag um 3 Uhr
0 3 * * 1   # Montag um 3 Uhr
0 3 1 * *   # Erster Tag des Monats um 3 Uhr
0 */6 * * * # Alle 6 Stunden
```

---

## 🔍 Update-Status prüfen

### Aktuelle Version anzeigen

```bash
node -p "require('/opt/werkstatt-terminplaner/backend/package.json').version"
```

### Neueste verfügbare Version

```bash
curl -s "https://api.github.com/repos/SHP-ART/Werkstatt-Terminplaner/releases/latest" \
  | grep '"tag_name":' \
  | sed -E 's/.*"v?([^"]+)".*/\1/'
```

### Update-Logs anzeigen

```bash
# Letzte Update-Logs
sudo tail -100 /var/log/werkstatt-terminplaner/updates.log

# Live-Logs während Update
sudo tail -f /var/log/werkstatt-terminplaner/updates.log
```

### Service-Status nach Update

```bash
# Status prüfen
sudo systemctl status werkstatt-terminplaner

# Logs nach Update
sudo journalctl -u werkstatt-terminplaner -n 100
```

---

## 🛡️ Sicherheits-Features

### Automatische Backups

Vor jedem Update wird automatisch ein Backup erstellt:
```
/var/lib/werkstatt-terminplaner/backups/pre_update_<VERSION>_<TIMESTAMP>.db
```

**Beispiel:**
```
pre_update_1.6.2_20260217_153045.db
```

### Rollback bei Fehler

Falls Update fehlschlägt:

```bash
# 1. Service stoppen
sudo systemctl stop werkstatt-terminplaner

# 2. Alten Code wiederherstellen
sudo rm -rf /opt/werkstatt-terminplaner
sudo mv /tmp/werkstatt-backup-TIMESTAMP /opt/werkstatt-terminplaner

# 3. Service starten
sudo systemctl start werkstatt-terminplaner
```

**Das Update-Skript zeigt Rollback-Befehle bei Fehler an!**

### Code-Backup

Code-Backup bleibt in `/tmp/` bis zum nächsten Reboot oder kann manuell gelöscht werden:

```bash
# Alte Backups auflisten
ls -lh /tmp/werkstatt-backup-*

# Löschen (wenn Update erfolgreich)
sudo rm -rf /tmp/werkstatt-backup-*
```

---

## 🐛 Troubleshooting

### "Update fehlgeschlagen" im Dashboard

```bash
# Prüfe Logs
sudo journalctl -u werkstatt-terminplaner -n 50

# Versuch manuelles Update
sudo /opt/werkstatt-terminplaner/update-linux.sh
```

### "Kann neueste Version nicht abrufen"

```bash
# Prüfe Internet-Verbindung
curl -I https://api.github.com

# Falls Proxy nötig:
export https_proxy=http://proxy.example.com:8080
sudo -E /opt/werkstatt-terminplaner/update-linux.sh
```

### Update hängt bei "npm install"

```bash
# Update manuell mit verbose Output
cd /opt/werkstatt-terminplaner/backend
sudo npm install --verbose

# npm Cache leeren falls korrupt
sudo npm cache clean --force
sudo npm install --production
```

### Permission Denied Fehler

```bash
# Repariere Permissions
sudo chown -R werkstatt:werkstatt /opt/werkstatt-terminplaner
sudo chown -R werkstatt:werkstatt /var/lib/werkstatt-terminplaner

# Update erneut versuchen
sudo /opt/werkstatt-terminplaner/update-linux.sh
```

### Cronjob funktioniert nicht

```bash
# Prüfe Cronjob-Syntax
sudo crontab -l

# Cronjob-Logs anzeigen
sudo grep CRON /var/log/syslog

# Manuell testen (simuliert cronjob)
sudo su -c "/opt/werkstatt-terminplaner/update-linux.sh --auto" root
```

---

## ⚙️ Erweiterte Konfiguration

### Update-Benachrichtigung per E-Mail

Installiere `mailutils`:
```bash
sudo apt-get install mailutils
```

Erweitere Cronjob:
```bash
0 3 * * 0 /opt/werkstatt-terminplaner/update-linux.sh --auto 2>&1 | mail -s "Werkstatt Update" admin@example.com
```

### Pre-/Post-Update-Hooks

Erstelle Custom-Skripte:

```bash
# Pre-Update Hook
sudo nano /opt/werkstatt-terminplaner/pre-update-hook.sh
```

```bash
#!/bin/bash
# Dein Code vor dem Update
echo "Führe Pre-Update-Tasks aus..."
```

```bash
# Im update-linux.sh integrieren (nach Zeile "# 5. Service stoppen"):
if [ -f "$INSTALL_DIR/pre-update-hook.sh" ]; then
    bash "$INSTALL_DIR/pre-update-hook.sh"
fi
```

### Update nur bei stabilen Releases

Ignoriere Pre-Releases/Beta-Versionen:

Im `update-linux.sh` ändern:
```bash
# Nur stabile Releases (ohne "beta", "rc", "alpha")
LATEST_VERSION=$(curl -s "https://api.github.com/repos/$GITHUB_REPO/releases" \
  | grep '"tag_name":' \
  | grep -v 'beta\|rc\|alpha' \
  | head -1 \
  | sed -E 's/.*"v?([^"]+)".*/\1/')
```

---

## 📊 Update-Statistiken

### Letzte Updates anzeigen

```bash
# Aus Backups ableiten
ls -lht /var/lib/werkstatt-terminplaner/backups/pre_update_* | head -10
```

### Update-Häufigkeit

```bash
# Count der Backups = Count der Updates
ls /var/lib/werkstatt-terminplaner/backups/pre_update_* | wc -l
```

---

## ✅ Best Practices

1. **Backup vor manuellen Updates** - Wird automatisch gemacht, aber prüfen Sie die Backup-Größe
2. **Updates in Ruhezeiten** - Nachts um 3 Uhr ist gut (wenig Nutzung)
3. **Teste nach Update** - Prüfe: `http://<SERVER-IP>:3001` und `/status`
4. **Alte Backups löschen** - Behalte nur letzte 10-20
5. **Update-Logs beobachten** - Bei automatischen Updates

---

## 🚀 Zusammenfassung

**Für die meisten Benutzer empfohlen:**
- ✅ Web-Interface für manuelle Updates (Dashboard: `/status`)
- ✅ Wöchentlicher Cronjob für automatische Updates (Sonntag 3 Uhr)
- ✅ Automatische Backups laufen vor jedem Update

**Ein einfacher Befehl für sofortiges Update:**
```bash
sudo /opt/werkstatt-terminplaner/update-linux.sh
```

**Vollautomatisch einrichten:**
```bash
# Cronjob für wöchentliche Updates
echo "0 3 * * 0 /opt/werkstatt-terminplaner/update-linux.sh --auto >> /var/log/werkstatt-terminplaner/updates.log 2>&1" | sudo crontab -
```

**Fertig! Updates laufen jetzt vollautomatisch.** 🎉
