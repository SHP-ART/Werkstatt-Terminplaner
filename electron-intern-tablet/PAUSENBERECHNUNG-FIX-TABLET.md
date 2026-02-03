# Fix: Pausenberechnung in Tablet-App & Frontend

**Datum:** 3. Februar 2026  
**Version:** Tablet 1.5.1 / Frontend 1.4.2  
**Problem:** Fertigstellungszeit wurde ohne Mittagspause berechnet, wenn Arbeit über die Pause ging

---

## 🐛 Problem

In der Tablet-App (Werkstatt Intern) wurde die **Fertigstellungszeit** (Endzeit) eines Auftrags **ohne Berücksichtigung der Mittagspause** berechnet.

### Beispiel-Szenario:
- **Mitarbeiter:** Max (40h/Woche, 5 Tage → 8h/Tag)
- **Pausenzeit:** 12:00 - 12:30 Uhr (30 Minuten)
- **Auftrag:** Start 11:00 Uhr, Dauer 3 Stunden

**❌ FALSCH (vorher):**
```
11:00 + 3h = 14:00 Uhr
```

**✅ RICHTIG (nachher):**
```
11:00 + 3h geht über 12:00 Pause
→ +30 Minuten Pause
→ 14:30 Uhr
```

---

## 🔧 Behobene Probleme

### 1. Tablet-App: Funktion `berechneEndzeit()` (Zeile 733)
- **Datei:** `electron-intern-tablet/index.html`
- **Vorher:** Einfache Addition: `startzeit + dauer`
- **Nachher:** Berücksichtigt Pause mit 6h-Regel

### 2. Tablet-App: Erkennung aktueller Auftrag (Zeile 917)
- **Datei:** `electron-intern-tablet/index.html`
- **Vorher:** Endzeit ohne Pause berechnet → Auftrag wurde zu früh als "beendet" erkannt
- **Nachher:** Nutzt `berechneEndzeit()` für korrekte Pausenberücksichtigung

### 3. Frontend: Funktion `berechneEndzeitMitFaktoren()` (Zeile 25154)
- **Datei:** `frontend/src/components/app.js`
- **Vorher:** Einfache Addition: `startzeit + dauer`
- **Nachher:** Berücksichtigt Pause mit 6h-Regel
- **Auswirkung:** Frontapp Tab zeigt jetzt korrekte Fertigstellungszeit

---Tablet-App
- **electron-intern-tablet/index.html**
  - Zeile 733-784: Neue `berechneEndzeit()` mit Pausenlogik
  - Zeile 917-926: Aktueller-Auftrag-Erkennung nutzt jetzt `berechneEndzeit()`

### Frontend
- **frontend/src/components/app.js**
  - Zeile 25154-25206: Neue `berechneEndzeitMitFaktoren()` mit Pausenlogik

### `electron-intern-tablet/index.html`
- **Zeile 733-784:** Neue `berechneEndzeit()` mit Pausenlogik
- **Zeile 917-926:** Aktueller-Auftrag-Erkennung nutzt jetzt `berechneEndzeit()`
 - Tablet-App
Datei: `electron-intern-tablet/test-pause-berechnung.js`

**8 Testfälle:**
1. ✅ Arbeit vor Pause (kein Überlapp) → 08:00 + 2h = 10:00
2. ✅ Arbeit über Pause → 11:00 + 3h = 14:30 (mit +30min Pause)
3. ✅ Start während Pause → 12:15 + 2h = 14:30 (verschoben auf 12:30)
4. ✅ Arbeit nach Pause → 13:00 + 2h = 15:00
5. ✅ Person unter 6h (keine Pausenpflicht) → 11:00 + 3h = 14:00
6. ✅ Lehrling mit 150% über Pause → 11:00 + (2h * 1.5) = 14:30
7. ✅ Kurzer Auftrag vor Pause → 11:30 + 1h = 13:00 (mit Pause)
8. ✅ Langer Auftrag über Pause → 10:00 + 5h = 15:30 (mit +30min)

**Ergebnis:** 100% (8/8) Tests bestanden

### Automatische Tests - Frontend
Datei: `frontend/test-pause-berechnung.js`

**7 Testfälle:**
1. ✅ Arbeit vor Pause (kein Überlapp) → 08:00 + 2h = 10:00
2. ✅ Arbeit über Pause → 11:00 + 3h = 14:30 (mit +30min Pause)
3. ✅ Start während Pause → 12:15 + 2h = 14:30 (verschoben auf 12:30)
4. ✅ Arbeit nach Pause → 13:00 + 2h = 15:00
5. ✅ Person unter 6h (keine Pausenpflicht) → 11:00 + 3h = 14:00
6. ✅ Abgeschlossener Termin → nutzt fertigstellung_zeit
7. ✅ Langer Auftrag über Pause → 10:00 + 5h = 15:30 (mit +30min)

**Ergebnis:** 100% (7/7eine Pausenpflicht) → 11:00 + 3h = 14:00
6. ✅ Lehrling mit 150% über Pause → 11:00 + (2h * 1.5) = 14:30
7. ✅ Kurzer Auftrag vor Pause → 11:30 + 1h = 13:00 (mit Pause)
8. ✅ Langer Auftrag über Pause → 10:00 + 5h = 15:30 (mit +30min)

**Ergebnis:** 100% (8/8) Tests bestanden

---

## 🧪 Manuelle Testanleitung

### Vorbereitung
1. Backend starten: `npm start` (in Hauptverzeichnis)
2. Testdaten in Datenbank:
   - Mitarbeiter mit `wochenarbeitszeit_stunden = 40`, `arbeitstage_pro_woche = 5`
   - Mitarbeiter mit `mittagspause_start = '12:00'`, `pausenzeit_minuten = 30`

### Testfall 1: Auftrag über Pause
1. Termin anlegen:
   - Start: **11:00 Uhr**
   - Geschätzte Zeit: **180 Minuten** (3h)
   - Mitarbeiter: Max (40h/Woche)
2. Tablet-App öffnen
3. **Prüfen:** Fertigstellungszeit zeigt **14:30 Uhr** (nicht 14:00 Uhr)

### Testfall 2: Auftrag vor Pause
1. Termin anlegen:
   - Start: **08:00 Uhr**
   - Geschätzte Zeit: **120 Minuten** (2h)
2. **Prüfen:** Fertigstellungszeit zeigt **10:00 Uhr** (keine Pause)

### Testfall 3: Person unter 6h
1. Mitarbeiter mit nur **25h/Woche** (= 5h/Tag)
2. Termin: Start **11:00 Uhr**, Dauer **180 Minuten**
3. **Prüfen:** Fertigstellungszeit zeigt **14:00 Uhr** (keine Pause wegen 6h-Regel)

### Testfall 4: Aktueller Auftrag
1. Termin: Start **11:00 Uhr**, Dauer **180 Minuten**
2. Warte bis **14:15 Uhr** (reale Zeit)
3. **Prüfen:** 
   - Bei 14:00 Uhr würde Auftrag FALSCH als "beendet" erkannt
   - Bei 14:30 Uhr (korrekt mit Pause) ist Auftrag noch aktiv

---

## 📊 Vergleich Vorher/Nachher

### Vorher (FALSCH)
```javascript
const endMinuten = h * 60 + m + dauer;
return formatTime(endMinuten);
// → 11:00 + 180min = 14:00 (PAUSE FEHLT!)
```

### Tablet-App (Intern)
- ✅ Korrekte Fertigstellungszeit auf Kacheln
- ✅ Richtige Erkennung des aktuellen Auftrags
- ✅ Pausenzeit wird visuell und zeitlich korrekt berücksichtigt

### Frontend (Frontapp Tab)
- ✅ Korrekte Fertigstellungszeit in Auftragsliste
- ✅ Pausenzeit wird bei Zeitberechnungen berücksichtigt
- ✅ Konsistente Darstellung mit Backend-Berechnungen
---

## 🎯 Auswirkungen

### Frontend (Hauptanwendung)
- ✅ Bereits korrekt implementiert (keine Änderung nötig)
- NuTablet-App
Neue Version erstellen:
```bash
cd electron-intern-tablet
npm run build:win  # Installer
```

Dateien zum Release:
- `dist/Werkstatt-Intern-Setup-1.5.1.exe` (Installer)

### Frontend
Build und Neustart:
```bash
cd frontend
npm run build

# Backend neu starten (lädt neues Frontend)
cd ..
npm start
```
```bash
cd electron-intern-tablet
npm run build:win       # Installer
npm run build:portable  # Portable .exe
```

### Dateien zum Release
- `dist/Werkstatt Intern Setup 1.5.1.exe` (Installer)
- `dist/Werkstatt Intern 1.5.1.exe` (Portable)

### Update auf Tablets
1. Installer herunterladen und ausführen **ODER**
2. Portable .exe ersetzen und neu starten

---

## 📝 Code-Referenzen

### Implementierung (Backend - Vorlage)
- [backend/src/models/termineModel.js](../backend/src/models/termineModel.js#L1467-L1500)
- [electron-intern-tablet/test-pause-berechnung.js](test-pause-berechnung.js) - Tests

### Fix (Frontend)
- [frontend/src/components/app.js](../frontend/src/components/app.js#L25154-L25206) - `berechneEndzeitMitFaktoren()`
- [frontend/test-pause-berechnung.js](../frontend/test-pause-berechnung.js) -
- [electron-intern-tablet/index.html](index.html#L733-L784) - `berechneEndzeit()`
- [electron-intern-tablet/index.html](index.html#L917-L926) - Aktueller-Auftrag-Erkennung

### Tests
- [electron-intern-tablet/test-pause-berechnung.js](test-pause-berechnung.js) - Automatische Tests

---

## ⚠️ Wichtige Hinweise

1. **6h-Regel beachten:**
   - Mitarbeiter unter 6h/Tag: **keine Pause**
   - Mitarbeiter >= 6h/Tag: **Pause berücksichtigen**

2. **Pausenzeiten konfigurieren:**
   - Pro Mitarbeiter: `mittagspause_start`, `pausenzeit_minuten`
   - Pro Lehrling: `mittagspause_start`, `pausenzeit_minuten`

3. **Aufgabenbewältigung:**
   - Lehrlinge mit `aufgabenbewaeltigung_prozent != 100`
   - Wird **vor** Pausenberechnung angewendet

---

## 🔗 Verwandte Dokumente

- [PAUSENBERECHNUNG-FIX.md]((Tablet + Frontend)  
**Build:** ✅ v1.5.1 (Tablet) + v1.4.2 (Frontend)ATUS.md](../PAUSENANZEIGE-STATUS.md) - Pausenerkennung-Status
- [TEST-BERECHNETE-ZEITEN.md](../TEST-BERECHNETE-ZEITEN.md) - Backend-Tests

---

**Status:** ✅ BEHOBEN  
**Tests:** ✅ 100% bestanden  
**Build:** ✅ v1.5.1 erfolgreich erstellt
