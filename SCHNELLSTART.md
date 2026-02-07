# ⚡ Schnellstart - Werkstatt-Terminplaner im Netzwerk

## Für den Server-PC (nur 1x einrichten)

### Einmalig:
1. **Node.js installieren** von https://nodejs.org/
2. **IP-Adresse notieren**: `cmd` öffnen → `ipconfig` eingeben → IPv4-Adresse merken (z.B. 192.168.1.100)
3. **Firewall öffnen**: Port 3001 freigeben (siehe NETZWERK-INSTALLATION.md)

### Täglich:
1. Doppelklick auf **`start.bat`** → Fenster offen lassen!
2. Doppelklick auf **`werkstattplaner-oeffnen.bat`**
3. Im Browser → **Einstellungen** → Server-IP: `localhost` → Port: `3001` → Speichern

### Windows-Setup (Details):
1. **Node.js LTS** installieren (empfohlen) und danach den Rechner neu starten
2. Start-Skripte:
   - `start.bat` (Backend + Electron UI)
   - `werkstattplaner-oeffnen.bat` (Alternative: Frontend im Browser)
3. **Ports freigeben**:
   - `3001` (Backend + WebSocket)
   - optional `3000` (Frontend, falls getrennt gestartet)
4. **Logs prüfen**:
   - `logs/backend.log` für Backend-Start und Fehler

---

## Für Client-PCs (Arbeitsplätze)

### Einmalig:
1. **Ordner kopieren**: Den kompletten `Werkstatt-Terminplaner` Ordner auf den PC kopieren
2. Doppelklick auf **`werkstattplaner-oeffnen.bat`**
3. Im Browser → **Einstellungen** → Server-IP: `192.168.1.100` (IP vom Server-PC!) → Port: `3001` → Speichern
4. Auf **"Verbindung testen"** klicken → sollte "✓ Verbindung erfolgreich!" zeigen

### Täglich:
1. Doppelklick auf **`werkstattplaner-oeffnen.bat`**
2. Fertig!

---

## 🔴 Probleme?

**"Verbindung fehlgeschlagen":**
- Ist der Server-PC an und läuft `start.bat`?
- Ist die IP-Adresse in den Einstellungen richtig?
- Firewall prüfen!

**Server startet nicht:**
- Node.js installiert? → https://nodejs.org/

**Detaillierte Hilfe:**
→ Siehe **NETZWERK-INSTALLATION.md**
