# Tablet manuell auf Version 1.6.2 aktualisieren

## Schnellste Methode (vom Tablet aus)

### Option 1: Direkt vom SMB-Share installieren

**Auf dem Tablet:**

1. Windows-Explorer öffnen
2. In die Adressleile eingeben: `\\100.124.168.108\Werkstatt-Upload`
3. Login mit SMB-Zugangsdaten (siehe interne Dokumentation)
4. Doppelklick auf: `Werkstatt-Intern-Setup-1.6.2-ia32.exe`
5. Installation läuft automatisch durch
6. App startet automatisch neu mit Version 1.6.2

> ✅ **Empfohlen für 32-Bit Tablets**

---

### Option 2: Über lokales Netzwerk (192.168.0.x)

Falls Tailscale auf dem Tablet nicht läuft:

**Auf deinem PC:**
```cmd
# Datei vom Server holen
copy \\100.124.168.108\Werkstatt-Upload\Werkstatt-Intern-Setup-1.6.2-ia32.exe C:\Temp\

# Per USB-Stick oder Netzwerk-Freigabe zum Tablet bringen
# Dann auf Tablet: Doppelklick auf die .exe
```

---

### Option 3: Direkt vom Linux-Server (wenn im gleichen Netzwerk)

**HTTP-Download einrichten (temporär):**

```bash
# Auf dem Server:
ssh root@192.168.0.57
cd /opt/werkstatt-upload
python3 -m http.server 8080
```

**Auf dem Tablet:**
- Browser öffnen
- `http://192.168.0.57:8080` aufrufen
- `Werkstatt-Intern-Setup-1.6.2-ia32.exe` herunterladen
- Installieren

---

## Version auf Tablet prüfen

Nach der Installation:
- Rechtsklick in der Tablet-App → **Über**
- Sollte anzeigen: **Version 1.6.2**

Oder in der Config:
```
C:\Users\<Benutzer>\AppData\Roaming\werkstatt-intern-tablet\config.json
```

---

## Was sich in Version 1.6.2 geändert hat

- ✅ Automatisches Update-System (wird beim nächsten Update genutzt)
- ✅ Verbesserte Pausenberechnung
- ✅ GitHub v1.5.9 Features integriert
- ✅ Backend-Kompatibilität mit Linux-Server
