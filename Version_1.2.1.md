# Version 1.2.1 - Release Notes

**Release-Datum:** 17. Januar 2026  
**Commits:** 14 (von d8e49aa bis b346508)  
**Änderungen:** 40+ Dateien, +17.000 Zeilen

---

## 🎯 Hauptfeatures

### 1. Tablet-Modus für Intern-Tab
- Neuer **Tablet-Modus Button** im Intern-Tab
- **Vollbild-Ansicht** mit ausgeblendetem Header und Tabs
- Nur Mitarbeiter/Lehrlings-Kacheln sichtbar
- Mini-Header mit Refresh und Exit-Button
- Touch-optimierte Kacheln für Tablet-Bedienung

### 2. Neuer "Intern" Tab - Team-Übersicht
- Neuer Tab **'Intern'** für Team-Arbeitsübersicht
- Jeder Mitarbeiter und Lehrling hat **eigene Kachel**
- Zeigt **aktuellen Auftrag** mit Fortschrittsbalken
- Zeigt **nächsten geplanten Auftrag** und Wartezeit
- Berufsschul-Hinweis für Lehrlinge
- Auto-Refresh alle 60 Sekunden
- Responsive Design für alle Bildschirmgrößen
- **Interne Termine werden nicht mehr separat angezeigt** (Zuordnung bei Mitarbeitern)

### 3. Interne Termine - Erweiterte Verwaltung (NEU)
- **Bearbeitungs-Modal** für interne Termine direkt im Sub-Tab
- **Interne Auftragsnummer** optional hinzufügbar (z.B. INT-2026-001)
- **Liste bestehender interner Termine** unter dem Erstellungsformular
- Auftragsnummer wird in der Kachel-Anzeige prominent dargestellt
- Bearbeitung von Arbeit, Datum, Zeit, Dringlichkeit, Mitarbeiter, Status
- Löschen-Button im Bearbeitungs-Modal

### 4. KI-Planungsoptimierung mit ChatGPT
- **ChatGPT API-Key Verwaltung** in Einstellungen (verschlüsselt gespeichert)
- **KI-Tagesplanung:** Optimiert Terminzuordnung zu Mitarbeitern
- **KI-Wochenplanung:** Verteilt schwebende Termine auf die Woche
- Vorschau-Modal mit Einzelaktionen (übernehmen/verwerfen)
- Alle/Keine auswählen für Sammelaktionen
- Visuelles Feedback bei Übernahme/Verwerfung

### 4. Fahrzeuge-Tabelle mit VIN-Decoder
- Neue **fahrzeuge-Tabelle** für Fahrzeugdaten (VIN, Kennzeichen, Motor, etc.)
- VIN-Decoder erweitert mit **40+ Citroën Modellcodes**
- C5 Aircross (C84) korrekt erkannt
- 1.6 PureTech 180 PS Motor korrekt zugeordnet
- Auto-Save Fahrzeugdaten bei Termin-Erstellung
- OpenAI API jetzt optional (VIN-Decode lokal ohne API-Key)

---

## � Bug-Fixes

### Arbeiten-Trennung korrigiert
- **Problem:** Lange Arbeitsbeschreibungen mit Kommas wurden fälschlich als mehrere Arbeiten gespeichert (z.B. "Bremsen vorne, hinten" → 2 Einträge)
- **Lösung:** Neuer Separator ` || ` statt `, ` zum Trennen mehrerer Arbeiten
- **Rückwärtskompatibel:** Alte Einträge mit `, ` werden weiterhin korrekt gelesen

### HTML-Struktur im Intern-Tab
- Fehlendes `</div>`-Tag im Sub-Tab `internerTermin` behoben
- Sub-Tab-Navigation funktioniert wieder korrekt

---

## �🔧 Verbesserungen

### Schwebende Termine
- **Neu-Einplanen Modal** für überfällige Termine mit 'Nicht zugeordnet' Option
- Schwebende Termine können per **Drag&Drop** in 'Nicht zugeordnet' gezogen werden
- Einplanen-Modal für schwebende Termine mit Checkbox für 'Nicht zugeordnet'
- Klick auf schwebenden Termin zeigt Details-Modal
- `ist_schwebend = 0` wird korrekt gesetzt beim Einplanen
- Checkbox 'In Nicht zugeordnet einplanen' standardmäßig aktiviert

### Ersatzautos
- **3-Status-Anzeige:** verfügbar (grün), vergeben (orange), gesperrt (rot)
- Vergebene Autos können per Klick **vorzeitig zurückgegeben** werden
- Manuell gesperrte Autos werden in der Buchungsliste angezeigt
- SQL-Queries für ersatzauto_bis_datum Priorität korrigiert
- Neuer API-Endpoint: `markiereAlsZurueckgegeben`

### Teile-Bestellen
- Bestellungen können jetzt auch **direkt einem Kunden** zugeordnet werden (ohne Termin)
- Neue Bestellung: Dropdown zur Auswahl zwischen Termin und Nur-Kunde
- SQL-Abfragen optimiert: **Nur Termine ab heute** werden angezeigt
- Neuer optimierter Endpoint `/termine/teile-status`
- Schwebend-Support für Teile-Bestellungen

### Kundensuche
- **Fahrzeugtyp mit 🚗 Symbol** bei Kunden-Vorschlägen
- Neue CSS-Klassen für bessere Darstellung
- Kennzeichen und Fahrzeugtyp in einer Zeile

### Duplikatprüfung
- Neue Backend-Route `/termine/duplikat-check`
- Model-Methode `checkDuplikate()` prüft ob Kunde bereits Termin am Tag hat
- Frontend zeigt **Warnung** mit bestehenden Terminen vor dem Speichern
- Benutzer kann trotzdem speichern wenn gewünscht

---

## ⚡ Performance-Optimierungen

### Teile-Bestellen Performance
- Neuer optimierter Endpoint `/termine/teile-status`
- **DB-Queries parallel** statt sequentiell (Promise.all)
- Statistiken direkt in Response integriert
- Dropdowns lazy laden (erst bei Klick)
- Kompakte Dropdown-Endpoints: `/termine/dropdown`, `/kunden/dropdown`
- **Datenmenge reduziert:** Termine 99%, Kunden 95%

### Allgemeine Optimierungen
- **Debouncing** für Filter-Events
- Gleichzeitige API-Aufrufe verhindert
- Termine werden beim Laden im Cache gespeichert
- Database Migration für `fertigstellung_zeit` und `notizen` Spalten

---

## 🤖 ChatGPT Backend Integration

### Neuer OpenAI Service (`openaiService.js`)
- `parseTerminFromText()`: Freitext → strukturierte Daten
- `suggestArbeiten()`: Arbeiten-Vorschläge
- `estimateZeit()`: Zeitschätzung
- `erkenneTeilebedarf()`: PSA-Teile erkennen
- `erkenneFremdmarke()`: VW, BMW etc. warnen
- Kosten-Tracking implementiert

### Neue API-Endpunkte
- `/api/ai/*` Routen für KI-Funktionen
- `/api/ki-planung/*` für Tages- und Wochenplanung

### Citroën-Spezifisch
- Alle Beispiele auf Citroën-Fahrzeuge (C3, C4, Berlingo, DS)
- PSA-Teilenummern (1109.CK, 1444.XE, etc.)
- Citroën Service-Pakete (Essential, Reference, Serenity)
- Fremdmarken-Prüfung für Bestandskunden
- PureTech/BlueHDi-spezifische Hinweise
- PSA-Öl-Spezifikationen (B71 2290, B71 2296)

---

## 📁 Neue Dateien

### Backend
| Datei | Beschreibung |
|-------|-------------|
| `backend/src/controllers/aiController.js` | KI-API Controller |
| `backend/src/controllers/fahrzeugeController.js` | Fahrzeuge-Verwaltung |
| `backend/src/controllers/kiPlanungController.js` | KI-Planungslogik |
| `backend/src/controllers/teileController.js` | Teile-Bestellungen |
| `backend/src/models/fahrzeug.js` | Fahrzeug-Datenmodell |
| `backend/src/models/teileBestellung.js` | Teile-Bestellungen Model |
| `backend/src/routes/aiRoutes.js` | KI-API Routen |
| `backend/src/routes/fahrzeuge.js` | Fahrzeuge-Routen |
| `backend/src/routes/kiPlanungRoutes.js` | KI-Planung Routen |
| `backend/src/routes/teileRoutes.js` | Teile-Routen |
| `backend/src/services/openaiService.js` | OpenAI Integration |
| `backend/.env.example` | Beispiel-Konfiguration |

### Dokumentation
| Datei | Beschreibung |
|-------|-------------|
| `Plan-Version_1.2.0.md` | Implementierungsplan ChatGPT |
| `Proof-of-Concept.md` | ChatGPT PoC Dokumentation |
| `package.json` (Root) | Root-Paketdefinition |

---

## 🔄 Geänderte Dateien (Auswahl)

| Datei | Änderungen |
|-------|------------|
| `frontend/src/components/app.js` | +4.187 Zeilen (Intern-Tab, KI-UI, Interne Termine) |
| `frontend/src/styles/style.css` | +3.812 Zeilen (Tablet-Modus, Kacheln) |
| `frontend/index.html` | +810 Zeilen (Neue Tabs, Modals, Edit-Modal) |
| `backend/src/controllers/termineController.js` | +215 Zeilen |
| `backend/src/models/termineModel.js` | +71 Zeilen |
| `backend/src/controllers/einstellungenController.js` | +98 Zeilen |
| `backend/src/models/ersatzautosModel.js` | +71 Zeilen |

---

## 📋 Commit-Historie

| Commit | Beschreibung |
|--------|-------------|
| `b346508` | Interne Termine: Bearbeitung im Sub-Tab, Auftragsnummer, Bug-Fix Arbeiten-Trennung |
| `0c3c863` | v1.2.1: Tablet-Modus für Intern-Tab |
| `8e1aae1` | Add Intern Tab: Team-Übersicht mit Kacheln |
| `b059c9e` | Feature: Fahrzeugtyp in Kundensuche |
| `a43b3c6` | Fix: Schwebende Termine korrekt einplanen |
| `c42f87f` | v1.2.0: Neue Features für schwebende Termine |
| `3bb7e22` | Performance-Optimierungen & Ersatzauto-Verbesserungen |
| `d166eec` | KI-Planungsoptimierung mit ChatGPT API |
| `c56b7e3` | Teile-Bestellen: Kunde-Zuordnung, Performance |
| `ccde4d3` | Fahrzeuge-Tabelle + VIN-Decoder |
| `473dce0` | ChatGPT-Integration Backend (Woche 1) |
| `6d53362` | Plan-Version_1.2.0.md hinzugefügt |
| `1c09f98` | Proof-of-Concept Citroën-Anpassung |
| `2b713b9` | Duplikatprüfung + ChatGPT PoC Dokumentation |

---

## 🚀 Upgrade-Hinweise

1. **Neue Dependencies installieren:**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Optional: OpenAI API-Key konfigurieren:**
   - In Einstellungen → ChatGPT API-Key eintragen
   - Ohne API-Key funktioniert VIN-Decode weiterhin lokal

3. **Datenbank-Migration:**
   - Erfolgt automatisch beim Start
   - Neue Spalten: `fertigstellung_zeit`, `notizen`
   - Neue Tabelle: `fahrzeuge`

---

*Erstellt am 16. Januar 2026*
