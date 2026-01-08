# Version 1.1.0 - Release Notes

**Release**: 8. Januar 2026  
**Basis-Version**: v1.0.17  
**Commit**: 78586c9

---

## 📋 Übersicht

Version 1.1.0 bringt signifikante Verbesserungen für die Werkstatt-Planung, insbesondere für die schnelle Statusverwaltung von Terminen direkt in der Timeline-Ansicht.

---

## ✨ Neue Features

### Feature 1: Shift+Click Schnellstatus
- **Beschreibung**: Mit Shift+Klick auf einen Timeline-Block öffnet sich ein Schnellstatus-Dialog
- **Funktion**: Direktes Ändern des Terminstatus ohne Navigation zum Bearbeitungsformular
- **Status-Optionen**: Offen, Geplant, In Arbeit, Abgeschlossen
- **Betroffene Elemente**:
  - Timeline-Blöcke in "Planung & Zuweisung"
  - Mini-Karten (createTerminMiniCard)
  - Schwebende Terminbalken (createSchwebenderTerminBar)

### Feature 2: Erweiterter Schnellstatus-Dialog
- **Beschreibung**: Der Schnellstatus-Dialog zeigt jetzt detaillierte Termin-Informationen
- **Angezeigte Daten**:
  - 🔧 Arbeit (Beschreibung)
  - 📅 Abholdatum und Abholzeit
  - 🏁 Fertigstellungszeit (berechnet aus Startzeit + Dauer)
- **Zusätzliche Buttons**:
  - ➕ **Erweitern**: Öffnet das Erweiterungs-Modal für den Termin
  - ✏️ **Mehr...**: Öffnet den Schnell-Bearbeitung-Dialog

### Feature 3: Schnell-Bearbeitung-Dialog
- **Beschreibung**: Neuer Popup-Dialog zum schnellen Bearbeiten von Termin-Feldern
- **Editierbare Felder**:
  - 🔧 Arbeit (Beschreibung)
  - 📅 Abholdatum
  - ⏰ Abholzeit
  - 🕐 Startzeit
  - 🏁 Fertigstellungszeit
  - ⏱️ Geschätzte Dauer (Minuten)
  - 📝 Notizen
- **Intelligente Dauer-Berechnung**: Wenn Fertigstellungszeit geändert wird, wird die Dauer automatisch berechnet (Fertigstellung - Startzeit)
- **Status-abhängige Speicherung**:
  - Bei "offen"/"geplant" → Dauer wird in `geschaetzte_zeit` gespeichert
  - Bei "in_arbeit"/"abgeschlossen" → Dauer wird in `tatsaechliche_zeit` gespeichert (Balkenlänge aktualisiert sich)

### Feature 4: Fertigstellungszeit-Tracking
- **Neue Datenbank-Spalte**: `fertigstellung_zeit` (TEXT) in Tabelle `termine`
- **Backend-Unterstützung**: termineModel.js akzeptiert und speichert `fertigstellung_zeit`
- **Frontend-Integration**: Wird im Schnellstatus-Dialog angezeigt und im Schnell-Bearbeitung-Dialog editierbar

---

## 🐛 Bugfixes

### Fix 1: Timeline-Block-Farben aktualisieren nicht
- **Problem**: Nach Statusänderung eines Termins blieb die Farbe des Timeline-Blocks unverändert
- **Ursache**: CSS-Klassen wurden überschrieben durch andere Styles
- **Lösung**: `updateTimelineBlockStatus()` setzt jetzt inline-Styles für `background` und `borderLeft`
- **Betroffene Datei**: `frontend/src/components/app.js`

### Fix 2: Shift+Click funktioniert nicht bei allen Terminen
- **Problem**: Termine wie T-2026-014 waren per Shift+Click nicht erreichbar
- **Ursache**: Event-Handler fehlten bei `createTerminMiniCard()` und `createSchwebenderTerminBar()`
- **Lösung**: Shift+Click Handler zu beiden Funktionen hinzugefügt
- **Betroffene Datei**: `frontend/src/components/app.js`

### Fix 3: "Bearbeiten"-Button Fehler
- **Problem**: Klick auf "Bearbeiten" im Schnellstatus-Dialog führte zu Fehler "this.showTab is not a function"
- **Ursache**: Falscher Kontext beim Aufruf
- **Lösung**: Verwende `window.app` und simuliere Tab-Button-Klick statt direktem Funktionsaufruf
- **Betroffene Datei**: `frontend/src/components/app.js`

### Fix 4: Langer Balken bei Termin T-2026-014
- **Problem**: Termin hatte unverhältnismäßig langen Balken (10+ Stunden)
- **Ursache**: `tatsaechliche_zeit` war auf 630 Minuten gesetzt
- **Lösung**: Datenbankkorrektur `UPDATE termine SET tatsaechliche_zeit = NULL WHERE id = 424`

### Fix 5: Ersatzauto-Buchungen - Termine entfernen
- **Problem**: Termine konnten nicht korrekt von Ersatzauto-Buchungen entfernt werden
- **Lösung**: Anpassungen in `ersatzautosController.js`, `ersatzautosModel.js` und `ersatzautosRoutes.js`

---

## 🔧 Technische Änderungen

### Neue Funktionen in app.js
| Funktion | Beschreibung |
|----------|--------------|
| `showSchnellStatusDialog(termin, event)` | Zeigt Schnellstatus-Dialog mit Termin-Details |
| `showSchnellBearbeitungDialog(termin)` | Öffnet Schnell-Bearbeitung-Popup |
| `speichereSchnellBearbeitung(terminId)` | Speichert Änderungen aus Schnell-Bearbeitung |
| `closeSchnellBearbeitungDialog()` | Schließt Schnell-Bearbeitung-Dialog |
| `openErweiterungModalForTermin(terminId)` | Öffnet Erweiterungs-Modal für spezifischen Termin |
| `updateTimelineBlockStatus(block, status)` | Aktualisiert Inline-Styles für Status-Farben |

### Neue CSS-Klassen in style.css
| Klasse | Beschreibung |
|--------|--------------|
| `.schnell-bearbeitung-dialog` | Modal-Overlay für Schnell-Bearbeitung |
| `.schnell-bearbeitung-content` | Inhalt des Schnell-Bearbeitung-Modals |
| `.schnell-status-zeit-eingabe` | Zeit-Eingabefeld im Status-Dialog |
| `.schnell-dialog-footer button.erweitern` | Grüner Erweitern-Button |

### Datenbank-Änderungen
```sql
ALTER TABLE termine ADD COLUMN fertigstellung_zeit TEXT;
```

### Backend-Änderungen
- `termineModel.js`: Neue Felder `fertigstellung_zeit` und `notizen` in Update-Funktion
- `backupController.js`: Optimierungen
- `ersatzautosController.js`: Fixes für Termin-Entfernung
- `ersatzautosModel.js`: Anpassungen
- `ersatzautosRoutes.js`: Route-Anpassungen

---

## 📁 Geänderte Dateien

| Datei | Änderungen |
|-------|------------|
| `backend/src/config/version.js` | Version auf 1.1.0, Release-Datum 08.01.2026 |
| `backend/src/models/termineModel.js` | Neue Felder: fertigstellung_zeit, notizen |
| `backend/src/controllers/backupController.js` | Optimierungen |
| `backend/src/controllers/ersatzautosController.js` | Fixes |
| `backend/src/models/ersatzautosModel.js` | Anpassungen |
| `backend/src/routes/ersatzautosRoutes.js` | Route-Fixes |
| `frontend/src/components/app.js` | Schnellstatus & Schnell-Bearbeitung Features (+1500 Zeilen) |
| `frontend/src/styles/style.css` | Neue Dialog-Styles |
| `frontend/src/services/api.js` | API-Anpassungen |
| `frontend/index.html` | HTML-Anpassungen |
| `TODO-v1.1.0.md` | Dokumentation aktualisiert |

---

## 🚀 Upgrade-Anleitung

1. **Code aktualisieren**: `git pull origin master`
2. **Datenbank migrieren**: 
   ```bash
   sqlite3 backend/database/werkstatt.db "ALTER TABLE termine ADD COLUMN fertigstellung_zeit TEXT;"
   ```
   *(Nur nötig wenn Datenbank bereits existiert)*
3. **Server neu starten**: `./start.sh` oder `start.bat`

---

## 📝 Verwendung der neuen Features

### Schnellstatus ändern
1. Halte **Shift** gedrückt
2. Klicke auf einen **Timeline-Block** in "Planung & Zuweisung"
3. Wähle den neuen Status im Dialog

### Termin schnell bearbeiten
1. **Shift+Klick** auf Timeline-Block
2. Klicke auf **✏️ Mehr...**
3. Bearbeite die gewünschten Felder
4. Klicke **💾 Speichern**

### Termin erweitern
1. **Shift+Klick** auf Timeline-Block
2. Klicke auf **➕ Erweitern**
3. Das Erweiterungs-Modal öffnet sich mit dem ausgewählten Termin

---

**Version**: 1.1.0  
**Autor**: Werkstatt-Terminplaner Team  
**Lizenz**: MIT
