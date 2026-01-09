# Version 1.1.1 - Release Notes

**Release**: 9. Januar 2026  
**Basis-Version**: v1.1.0  
**Status**: ✅ Fertig

---

## 📋 Übersicht

Version 1.1.1 bringt umfangreiche Verbesserungen für die Werkstatt-Verwaltung:
- **Ersatzfahrzeuge**: Detaillierte Zeitanzeigen und Sperrgrund-Funktion
- **Terminplanung**: Auslastungsbalken und Schnellzugriffe
- **Lehrlinge**: Berufsschul-Turnus mit automatischer Abwesenheitsberechnung

---

## ✨ Neue Features / Verbesserungen

### Verbesserung 1: Detaillierte Zeitanzeige bei vergebenen Fahrzeugen
- **Beschreibung**: Bei "🔑 Aktuell vergebene Fahrzeuge" wird nun der vollständige Zeitraum mit Hol- und Bringzeit angezeigt
- **Vorher**: 
  ```
  📅 Zeitraum: 09.01.2026
  ```
- **Nachher**:
  ```
  📅 Zeitraum: 09.01.2026
  🕐 Abholung: 08:00 Uhr
  🕐 Rückgabe: 17:00 Uhr
  ```
- **Vorteil**: Werkstatt-Personal sieht auf einen Blick, wann Ersatzfahrzeuge verfügbar werden
- **Betroffene Bereiche**:
  - Frontend: Ersatzauto-Übersicht
  - API: Ersatzauto-Buchungsdaten erweitern

### Verbesserung 2: Sperrgrund für manuell gesperrte Fahrzeuge
- **Beschreibung**: Beim manuellen Sperren eines Ersatzfahrzeugs wird nach einem Grund gefragt
- **Ablauf**:
  1. Benutzer klickt auf "Sperren" bei einem Ersatzfahrzeug
  2. Dialog erscheint: "Grund für die Sperrung eingeben"
  3. Eingabefeld für Freitext (z.B. "In Reparatur", "TÜV", "Unfall")
  4. Sperrgrund wird gespeichert und bei "Aktuell vergebene Fahrzeuge" angezeigt
- **Anzeige bei gesperrten Fahrzeugen**:
  ```
  🚗 SFB-GU 892 • GESPERRT
  ⛔ Grund: In Reparatur
  📅 Gesperrt seit: 09.01.2026
  ```

### Verbesserung 3: Schnellauswahl Service-Art bei Neuer Termin
- **Beschreibung**: Bei der Terminerstellung gibt es jetzt eine Checkbox-Schnellauswahl für die Service-Art
- **Checkbox-Optionen**:
  - ☐ Kunde wartet
  - ☐ Hol-/Bring-Service
  - ☐ Holt/bringt selbst
- **Vorteil**: Schnellere Auswahl ohne Dropdown-Menü, übersichtlicher

### Verbesserung 4: Auslastungsbalken in Planung & Zuweisung
- **Beschreibung**: Auf der Seite "🏗️ Planung & Zuweisung (Beta)" wird unter der Überschrift ein Auslastungsbalken angezeigt
- **Funktion**: Zeigt die aktuelle Werkstatt-Auslastung für den ausgewählten Tag
- **Anzeige**:
  ```
  🏗️ Planung & Zuweisung (Beta)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Auslastung: ████████████░░░░░░░░ 62%
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```
- **Vorteil**: Schneller Überblick über die Tagesauslastung direkt in der Planungsansicht
- **Betroffene Bereiche**:
  - Frontend: Planung & Zuweisung Ansicht
  - API: Auslastungsdaten abrufen

### Verbesserung 5: Schnellzugriff "Neuer Termin" über Banner
- **Beschreibung**: Klick auf den Header-Banner öffnet direkt das "Neuer Termin erstellen" Formular
- **Betroffener Bereich**:
  ```
  🔧 🚗
  Werkstatt Terminplaner
  Professionelle Terminverwaltung für Ihre Werkstatt
  ```
- **Funktion**: 
  - Banner wird klickbar (Cursor: Pointer)
  - Klick wechselt zum Tab "Neuer Termin"
  - Optional: Visuelles Feedback beim Hover
- **Vorteil**: Schnellster Weg einen neuen Termin zu erstellen - direkt vom Hauptbanner aus
- **Betroffene Bereiche**:
  - Frontend: Header-Banner klickbar machen
  - CSS: Hover-Effekt für Banner

### Verbesserung 6: Turnusplan für Lehrlinge (Berufsschule)
- **Beschreibung**: Lehrlinge können Schulwochen hinterlegt bekommen, in denen sie abwesend sind
- **Funktionen**:
  1. **Individuelle Schulwochen**: Für jeden Lehrling einzeln einstellbar
  2. **Gemeinsamer Turnus**: Option für alle Lehrlinge den gleichen Turnus zu setzen
  3. **Wochennummer-Eingabe**: Schulwochen werden per Kalenderwoche (KW) eingegeben
  4. **Abwesenheitsanzeige**: In Schulwochen werden Lehrlinge automatisch als "abwesend" markiert
- **Eingabe-Beispiel**:
  ```
  ┌─────────────────────────────────────────────────┐
  │  📚 Berufsschul-Turnus                         │
  ├─────────────────────────────────────────────────┤
  │  Lehrling: Max Mustermann                      │
  │                                                 │
  │  ☐ Gemeinsamer Turnus für alle Lehrlinge      │
  │                                                 │
  │  Schulwochen (KW):                             │
  │  ┌─────────────────────────────────────────┐   │
  │  │ 2, 4, 6, 8, 10, 12, 14, 16, 18, 20     │   │
  │  └─────────────────────────────────────────┘   │
  │                                                 │
  │  Vorschau 2026:                                │
  │  KW 2: 06.01. - 10.01. ✓                      │
  │  KW 4: 20.01. - 24.01. ✓                      │
  │  ...                                           │
  │                                                 │
  │  [Abbrechen]  [💾 Speichern]                   │
  └─────────────────────────────────────────────────┘
  ```
- **Anzeige in Planung & Zuweisung**:
  ```
  👨‍🔧 Max Mustermann (Lehrling)
  📚 KW 2 - Berufsschule
  ```
- **Vorteil**: Automatische Berücksichtigung der Lehrlings-Abwesenheiten bei der Terminplanung
- **Betroffene Bereiche**:
  - Datenbank: Neue Tabelle `lehrling_turnus` oder Feld in `mitarbeiter`
  - Backend: Turnus-Verwaltung API
  - Frontend: Turnus-Eingabe Dialog, Anzeige in Planung

---

## 🐛 Bugfixes

*(Platzhalter für zukünftige Bugfixes)*

---

## 🔧 Technische Änderungen

### Datenbank-Änderungen (geplant)
```sql
-- Neues Feld für Sperrgrund (automatische Migration beim Start/Restore)
ALTER TABLE ersatzautos ADD COLUMN sperrgrund TEXT;

-- Neues Feld für Sperrdatum (automatische Migration beim Start/Restore)
ALTER TABLE ersatzautos ADD COLUMN gesperrt_seit TEXT;

-- Neues Feld für Berufsschul-Wochen bei Lehrlingen (automatische Migration)
ALTER TABLE lehrlinge ADD COLUMN berufsschul_wochen TEXT;
-- Beispielwert: "1,5,9,13,17,21" (Komma-getrennte Kalenderwochennummern)
```

### Backend-Änderungen (geplant)
| Datei | Änderungen |
|-------|------------|
| `ersatzautosModel.js` | Sperrgrund beim Sperren speichern/laden |
| `ersatzautosController.js` | Sperrgrund-Parameter verarbeiten |
| `ersatzautosRoutes.js` | API-Endpunkt anpassen |
| `lehrlingeModel.js` | berufsschul_wochen Feld hinzufügen |
| `database.js` | Auto-Migration für neue Felder |

### Frontend-Änderungen (geplant)
| Datei | Änderungen |
|-------|------------|
| `app.js` | Sperr-Dialog mit Grund-Eingabe, erweiterte Zeitanzeige, Berufsschul-Turnus |
| `style.css` | Styles für Sperrgrund-Dialog, Berufsschul-Zeile in Zeitleiste |
| `index.html` | Berufsschul-KW Spalte in Lehrlinge-Tabelle |

---

## 📁 Zu ändernde Dateien

| Datei | Geplante Änderungen |
|-------|---------------------|
| `backend/src/config/version.js` | Version auf 1.1.1 |
| `backend/src/models/ersatzautosModel.js` | Sperrgrund-Felder hinzufügen |
| `backend/src/controllers/ersatzautosController.js` | Sperrgrund-Logik |
| `frontend/src/components/app.js` | Zeitanzeige & Sperr-Dialog |
| `frontend/src/styles/style.css` | Dialog-Styles |

---

## 📝 Geplante UI-Änderungen

### Aktuelle Ansicht (Vorher)
```
🔑 Aktuell vergebene Fahrzeuge

🚗 SFB-GU 892 T-2026-016
   HEUTE
   👤 Kunde: Noack, Gabriele
   📅 Zeitraum: 09.01.2026
```

### Neue Ansicht (Nachher) - Mit Zeitraum
```
🔑 Aktuell vergebene Fahrzeuge

🚗 SFB-GU 892 T-2026-016
   HEUTE
   👤 Kunde: Noack, Gabriele
   📅 Zeitraum: 09.01.2026
   🕐 Abholung: 08:00 Uhr | Rückgabe: 17:00 Uhr
```

### Neue Ansicht (Nachher) - Gesperrtes Fahrzeug
```
🔑 Aktuell vergebene Fahrzeuge

🚗 SFB-GU 123 • GESPERRT
   ⛔ Grund: TÜV-Termin
   📅 Gesperrt seit: 09.01.2026
```

### Sperr-Dialog (Neu)
```
┌─────────────────────────────────────┐
│  🔒 Fahrzeug sperren               │
├─────────────────────────────────────┤
│  Fahrzeug: SFB-GU 123              │
│                                     │
│  Grund für die Sperrung:           │
│  ┌─────────────────────────────┐   │
│  │ z.B. TÜV, Reparatur, ...    │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Abbrechen]  [✓ Sperren]          │
└─────────────────────────────────────┘
```

### Neuer Termin - Service-Art (Neu)
```
┌─────────────────────────────────────┐
│  Service-Art:                      │
│                                     │
│  ☐ Kunde wartet                    │
│  ☐ Hol-/Bring-Service              │
│  ☐ Holt/bringt selbst              │
└─────────────────────────────────────┘
```

---

## 🚀 Upgrade-Anleitung

1. **Code aktualisieren**: `git pull origin master`
2. **Server neu starten**: `./start.sh` oder `start.bat`
   - Datenbank-Migration erfolgt automatisch beim Start
   - Auch beim Wiederherstellen eines alten Backups werden fehlende Felder automatisch hinzugefügt

---

## ✅ Checkliste für Implementierung

- [x] Datenbank-Schema erweitern (sperrgrund, gesperrt_seit) ✅
- [x] Backend: ersatzautosModel.js - Sperrgrund speichern/laden ✅
- [x] Backend: ersatzautosController.js - Sperrgrund-Logik ✅
- [x] Frontend: Sperr-Dialog mit Eingabefeld erstellen ✅
- [x] Frontend: Zeitanzeige (Abholung/Rückgabe) hinzufügen (Verbesserung 1) ✅
- [x] Frontend: Sperrgrund in Übersicht anzeigen ✅
- [x] Frontend: Schnellzugriff "Neuer Termin" über Banner (Verbesserung 5) ✅
- [x] Frontend: Auslastungsbalken in Planung & Zuweisung (Verbesserung 4) ✅
- [x] Frontend: Schnellauswahl Service-Art bei Neuer Termin (Verbesserung 3) ✅
- [x] Frontend: Turnusplan für Lehrlinge - Berufsschule (Verbesserung 6) ✅
- [x] Testen: Fahrzeug sperren mit Grund ✅
- [x] Testen: Zeitanzeige bei vergebenen Fahrzeugen ✅
- [x] Version in config/version.js aktualisieren ✅

---

**Version**: 1.1.1  
**Autor**: Werkstatt-Terminplaner Team  
**Lizenz**: MIT
