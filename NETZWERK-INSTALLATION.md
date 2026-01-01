# Werkstatt-Terminplaner - Netzwerk-Installation

Diese Anleitung zeigt, wie Sie den Werkstatt-Terminplaner auf mehreren PCs im Netzwerk verwenden können.

## 📋 Voraussetzungen

- **Windows-PCs** im gleichen Netzwerk (WLAN oder LAN)
- **Node.js** muss auf dem Server-PC installiert sein
  - Download: https://nodejs.org/ (LTS Version empfohlen)
- Alle PCs sollten sich gegenseitig erreichen können (Firewall-Einstellungen beachten)

## 🖥️ Setup: Ein PC als Server

### Schritt 1: Server-PC bestimmen
Wählen Sie einen PC, der als zentraler Server dient:
- Dieser PC sollte während der Arbeitszeiten eingeschaltet sein
- Die Datenbank liegt auf diesem PC
- Alle anderen PCs verbinden sich mit diesem Server

### Schritt 2: Node.js installieren (auf Server-PC)
1. Laden Sie Node.js von https://nodejs.org/ herunter
2. Installieren Sie Node.js mit den Standardeinstellungen
3. Öffnen Sie die Eingabeaufforderung und prüfen Sie die Installation:
   ```
   node --version
   ```
   Sie sollten eine Versionsnummer sehen (z.B. v20.11.0)

### Schritt 3: IP-Adresse des Server-PCs herausfinden
1. Öffnen Sie die Eingabeaufforderung (cmd)
2. Geben Sie ein: `ipconfig`
3. Suchen Sie nach "IPv4-Adresse" unter Ihrer Netzwerkverbindung
4. Notieren Sie sich diese Adresse (z.B. `192.168.1.100`)

**Beispiel:**
```
Ethernet-Adapter Ethernet:
   IPv4-Adresse . . . . . . . . . . : 192.168.1.100
```

### Schritt 4: Firewall-Regel erstellen (auf Server-PC)
Der Server muss auf Port 3001 erreichbar sein:

**Windows Defender Firewall:**
1. Öffnen Sie die Windows-Einstellungen
2. Gehen Sie zu "Update & Sicherheit" → "Windows-Sicherheit" → "Firewall & Netzwerkschutz"
3. Klicken Sie auf "Erweiterte Einstellungen"
4. Klicken Sie links auf "Eingehende Regeln"
5. Klicken Sie rechts auf "Neue Regel..."
6. Wählen Sie "Port" → Weiter
7. Wählen Sie "TCP" und geben Sie Port `3001` ein → Weiter
8. Wählen Sie "Verbindung zulassen" → Weiter
9. Aktivieren Sie alle Profile (Domäne, Privat, Öffentlich) → Weiter
10. Name: `Werkstatt-Terminplaner Server` → Fertig stellen

### Schritt 5: Server starten (auf Server-PC)
1. Navigieren Sie zum Ordner `Werkstatt-Terminplaner`
2. Doppelklicken Sie auf **`start-server.bat`**
3. Ein Fenster öffnet sich und zeigt:
   ```
   Server läuft jetzt!
   Zugriff auf diesem PC: http://localhost:3001
   Zugriff von anderen PCs: http://192.168.1.100:3001
   ```
4. **Lassen Sie dieses Fenster geöffnet!** Der Server läuft nur, solange das Fenster offen ist.

### Schritt 6: Werkstattplaner öffnen (auf Server-PC)
1. Doppelklicken Sie auf **`werkstattplaner-oeffnen.bat`**
2. Der Browser öffnet die Anwendung
3. Gehen Sie zu **Einstellungen** (oben rechts)
4. Unter "Server-Verbindung":
   - **Server-IP-Adresse:** `localhost`
   - **Port:** `3001`
5. Klicken Sie auf "Verbindung speichern"

## 💻 Setup: Client-PCs

### Schritt 1: Ordner kopieren
1. Kopieren Sie den kompletten Ordner `Werkstatt-Terminplaner` auf jeden Client-PC
2. Speichern Sie ihn z.B. unter `C:\Werkstatt-Terminplaner`

### Schritt 2: Werkstattplaner öffnen
1. Doppelklicken Sie auf **`werkstattplaner-oeffnen.bat`**
2. Der Browser öffnet die Anwendung

### Schritt 3: Server-Verbindung einstellen
1. Gehen Sie zu **Einstellungen** (oben rechts)
2. Unter "Server-Verbindung":
   - **Server-IP-Adresse:** `192.168.1.100` (Die IP-Adresse Ihres Server-PCs!)
   - **Port:** `3001`
3. Klicken Sie auf "Verbindung speichern"
4. Die Seite lädt neu

### Schritt 4: Verbindung testen
1. In den Einstellungen, klicken Sie auf **"Verbindung testen"**
2. Sie sollten sehen: "✓ Verbindung erfolgreich!"
3. Falls nicht, prüfen Sie:
   - Ist der Server-PC eingeschaltet?
   - Läuft `start-server.bat` auf dem Server-PC?
   - Ist die IP-Adresse korrekt?
   - Ist die Firewall richtig konfiguriert?

## 🚀 Täglicher Betrieb

### Auf dem Server-PC:
1. PC einschalten
2. `start-server.bat` starten (Fenster offen lassen!)
3. `werkstattplaner-oeffnen.bat` starten

### Auf Client-PCs:
1. `werkstattplaner-oeffnen.bat` starten
2. Sofort loslegen!

## 🔧 Problemlösung

### "Verbindung fehlgeschlagen" auf Client-PC

**Mögliche Ursachen:**

1. **Server-PC ist nicht erreichbar**
   - Prüfen Sie: Können Sie den Server-PC anpingen?
   - Öffnen Sie cmd und geben Sie ein: `ping 192.168.1.100`
   - Sie sollten Antworten erhalten

2. **Firewall blockiert**
   - Prüfen Sie die Firewall-Einstellungen auf dem Server-PC
   - Eventuell Antivirus-Software deaktivieren (temporär zum Testen)

3. **Falsche IP-Adresse**
   - IP-Adressen können sich ändern (bei DHCP)
   - Prüfen Sie die aktuelle IP mit `ipconfig` auf dem Server-PC
   - Tipp: Richten Sie eine statische IP-Adresse ein

4. **Server läuft nicht**
   - Ist `start-server.bat` auf dem Server-PC geöffnet?
   - Prüfen Sie, ob dort Fehlermeldungen angezeigt werden

### Server-Fenster schließt sich sofort

- Node.js ist nicht installiert oder nicht im PATH
- Installieren Sie Node.js neu von https://nodejs.org/

### "Cannot find module" Fehler

- Die node_modules fehlen
- Öffnen Sie cmd im `backend` Ordner
- Führen Sie aus: `npm install`

## 💾 Datenbank-Sicherung

Die Datenbank liegt auf dem Server-PC unter:
```
Werkstatt-Terminplaner\backend\database\werkstatt.db
```

**Empfehlung:**
- Erstellen Sie täglich eine Sicherungskopie dieser Datei
- Speichern Sie die Kopie auf einem anderen Laufwerk oder USB-Stick

**Automatische Sicherung (optional):**
Erstellen Sie eine .bat-Datei für automatische Backups:

```batch
@echo off
set QUELLE=C:\Werkstatt-Terminplaner\backend\database\werkstatt.db
set ZIEL=D:\Backups\werkstatt_%date:~-4,4%%date:~-7,2%%date:~-10,2%.db
copy "%QUELLE%" "%ZIEL%"
```

Richten Sie diese Datei als geplante Aufgabe in Windows ein (täglich ausführen).

## 🌐 Statische IP-Adresse einrichten (optional)

Um zu verhindern, dass sich die IP-Adresse des Server-PCs ändert:

1. Öffnen Sie "Netzwerk- und Freigabecenter"
2. Klicken Sie auf Ihre Netzwerkverbindung
3. Klicken Sie auf "Eigenschaften"
4. Wählen Sie "Internetprotokoll Version 4 (TCP/IPv4)"
5. Klicken Sie auf "Eigenschaften"
6. Wählen Sie "Folgende IP-Adresse verwenden:"
   - IP-Adresse: `192.168.1.100` (oder eine andere freie Adresse)
   - Subnetzmaske: `255.255.255.0`
   - Standardgateway: `192.168.1.1` (oder die IP Ihres Routers)
   - Bevorzugter DNS-Server: `192.168.1.1` (oder 8.8.8.8 für Google DNS)

## 📞 Support

Bei Problemen überprüfen Sie:
1. Ist Node.js auf dem Server-PC installiert?
2. Läuft `start-server.bat` auf dem Server-PC?
3. Ist die Firewall richtig konfiguriert?
4. Sind alle PCs im selben Netzwerk?
5. Ist die IP-Adresse in den Einstellungen korrekt?

---

**Viel Erfolg mit Ihrem Werkstatt-Terminplaner!**
