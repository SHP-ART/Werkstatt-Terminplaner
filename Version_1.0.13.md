# Version 1.0.13 - Entwicklungsplan

**Geplantes Release**: Januar 2026  
**Basis-Version**: v1.0.12  
**Letzte Änderung**: 5. Januar 2026

---

## 📋 Übersicht

Diese Datei dokumentiert alle geplanten Bugfixes und Features für Version 1.0.13.
Status: `[ ]` offen, `[~]` in Arbeit, `[x]` erledigt, `[-]` verschoben

---

## 🐛 BUGS - Kritisch

### Bug 1: Datum verschwindet bei neuem Termin
- [x] **Problem**: Bei neuem Termin wird das eingetragene Datum in der Zusammenfassung nicht angezeigt ✅ BEHOBEN
- [x] **Problem**: Das ausgewählte Datum verschwindet während der Bearbeitung und wird auf den aktuellen Tag zurückgesetzt ✅ BEHOBEN
- **Betroffene Dateien**: `frontend/src/components/app.js` (Termin-Modal)
- **Priorität**: 🔴 KRITISCH ✅ BEHOBEN
- **Lösung implementiert am**: 5. Januar 2026
  - `setTodayDate(forceOverwrite)` Parameter: Datum nur bei leerem Feld setzen
  - `resetTerminForm(preserveDatum)` Parameter: Datum optional erhalten
  - Doppelte ID `vorschauDatum` im HTML behoben (umbenannt zu `erweiterungVorschauDatum`)
  - Datum wird jetzt korrekt in der Termin-Zusammenfassung angezeigt

#### 📋 KORREKTURPLAN Bug 1

**Ursachenanalyse (nach Code-Review):**

1. **`setTodayDate()` überschreibt das Datum** (Zeile 708-720):
   - Setzt `document.getElementById('datum').value = today`
   - Wird aufgerufen von `resetTerminForm()` (Zeile 836)
   - `resetTerminForm()` wird bei Tab-Wechsel via `resetTermineSubTabs()` aufgerufen (Zeile 1677-1681)

2. **Potenzielle Trigger für ungewolltes Datum-Reset:**
   - Tab-Navigation innerhalb der App
   - `showGefundenerKunde()` / `hideGefundenerKunde()` könnten Form-Reset auslösen
   - Event-Handler bei Kundensuche (`handleNameSuche`, `selectKundeVorschlag`)

3. **Vorschau-Modal verwendet korrektes Datum** (Zeile 3272-3280):
   - Liest `termin.datum` aus dem Form direkt vor der Vorschau
   - Problem ist, dass das Datum VOR der Vorschau-Erstellung zurückgesetzt wird

**Korrektur-Schritte:**

| # | Schritt | Datei | Zeilen | Aufwand |
|---|---------|-------|--------|---------|
| 1 | **Debug-Logging hinzufügen** | `app.js` | 710, 836, 1677 | 5 min |
| | `console.log('[DEBUG] setTodayDate called, stack:', new Error().stack)` um Aufrufer zu identifizieren | | | |
| 2 | **`setTodayDate()` entschärfen** | `app.js` | 708-720 | 15 min |
| | Prüfen ob Datum bereits gesetzt, nur überschreiben wenn leer: | | | |
| | `if (!document.getElementById('datum').value) { ... }` | | | |
| 3 | **`resetTerminForm()` anpassen** | `app.js` | 828-900 | 15 min |
| | Option hinzufügen um Datum zu erhalten: | | | |
| | `resetTerminForm(preserveDatum = false)` | | | |
| 4 | **Tab-Wechsel prüfen** | `app.js` | 1677-1681 | 10 min |
| | Eventuell Datum VOR Reset sichern und danach wiederherstellen | | | |
| 5 | **Kundenauswahl-Funktionen prüfen** | `app.js` | 9389 | 10 min |
| | `applyKundeAuswahl()` darf Datum nicht ändern (aktuell OK) | | | |
| 6 | **Testen aller Szenarien** | - | - | 20 min |

**Empfohlene Lösung (Code-Beispiel):**

```javascript
// Option A: setTodayDate nur bei leerem Datum
setTodayDate(forceOverwrite = false) {
  const today = this.formatDateLocal(new Date());
  const datumInput = document.getElementById('datum');
  // Nur setzen wenn leer oder explizit gewollt
  if (forceOverwrite || !datumInput.value) {
    datumInput.value = today;
  }
  // ... Rest der Funktion
}

// Option B: resetTerminForm mit Datum-Erhaltung  
resetTerminForm(preserveDatum = false) {
  const savedDatum = preserveDatum ? document.getElementById('datum')?.value : null;
  // ... Form Reset ...
  if (savedDatum) {
    document.getElementById('datum').value = savedDatum;
  } else {
    this.setTodayDate();
  }
}
```

**Geschätzter Gesamtaufwand:** 1-1.5 Stunden (inkl. Tests)

### Bug 2: Teilverwaltung - Klick auf Termine funktioniert nicht
- [x] **Problem**: Bei Sortierung nach Teilestatus und anderen Filteroptionen kann man nicht in die Termine klicken ✅ BEHOBEN
- **Betroffene Dateien**: `frontend/src/components/app.js` (Teilverwaltung-Komponente)
- **Priorität**: 🔴 KRITISCH ✅ BEHOBEN
- **Ursache**: `termineById`-Cache wurde in `loadTeileStatusUebersicht()` nicht befüllt
- **Lösung implementiert am**: 5. Januar 2026
  - `loadTeileStatusUebersicht()` befüllt jetzt `termineById`-Cache
  - `openArbeitszeitenModal()` lädt Termin nach wenn nicht im Cache (Fallback)

### Bug 3: Mitarbeiter-Zuordnung funktioniert nicht
- [x] **Problem**: "Gesamter Auftrag" Zuordnung funktioniert nicht ✅ BEHOBEN
- [x] **Problem**: "Einzelne Positionen" Zuordnung funktioniert nicht ✅ BEHOBEN
- **Betroffene Dateien**: 
  - `frontend/src/components/app.js` (Zuordnungs-Modal)
  - `backend/src/controllers/termineController.js`
- **Priorität**: 🔴 KRITISCH ✅ BEHOBEN
- **Lösung implementiert am**: 5. Januar 2026
  - Mitarbeiter aus `arbeitszeiten_details._gesamt_mitarbeiter_id` wird korrekt vorausgewählt
  - Neuer Button "Auf alle anwenden" synchronisiert Gesamt-Mitarbeiter auf alle Arbeiten
  - Dropdown-Logik für Mitarbeiter und Lehrlinge verbessert

### Bug 4: Termine in Mittagspause verschwinden
- [x] **Problem**: Termine die in einer Zeit erstellt werden wo Mittagspause ist, werden nicht angezeigt ✅ BEHOBEN
- [x] **Problem**: Termine rutschen in die Mittagspause ✅ BEHOBEN
- **Betroffene Dateien**:
  - `backend/src/controllers/termineController.js` (Zeitberechnung)
  - `frontend/src/components/app.js` (Anzeige-Logik)
- **Priorität**: 🔴 KRITISCH ✅ BEHOBEN
- **Lösung implementiert am**: 5. Januar 2026
  - Termine mit Startzeit in der Mittagspause werden nach der Pause verschoben
  - Endzeit wird nach Verschiebung korrekt neu berechnet (nicht mehr alte `endzeitBerechnet` verwenden)

### Bug 7: Kennzeichen-Suche bei neuen Autos
- [x] **Problem**: Bei neu angelegten Fahrzeugen funktioniert die Kennzeichen-Suche nicht ✅ BEHOBEN
- **Betroffene Dateien**:
  - `frontend/src/components/app.js` (Cache-Aktualisierung)
- **Priorität**: 🔴 KRITISCH ✅ BEHOBEN
- **Ursache**: `termineCache` und `kundenCache` wurden nach Termin-Erstellen nicht aktualisiert
- **Lösung implementiert am**: 5. Januar 2026
  - `loadTermineCache()` wird nach jedem Termin-Erstellen aufgerufen
  - `loadTermineCache()` wird nach Termin-Bearbeiten aufgerufen
  - `loadKunden()` wird nach Fahrzeug-Hinzufügen aufgerufen
  - Betrifft: Normaler Termin, Interner Termin, Wartende Aktion

### Bug 8: Mehrere Arbeiten - Mitarbeiter-Zuordnung fehlt in Auslastung
- [x] **Problem**: Bei Terminen mit mehreren Arbeiten können diese nicht einzelnen Mitarbeitern zugeordnet werden ✅ BEHOBEN
- [x] **Problem**: Zugeordnete Arbeiten werden nicht bei der Auslastung angezeigt ✅ BEHOBEN
- **Betroffene Dateien**:
  - `backend/src/models/termineModel.js` (Auslastungsberechnung)
  - `frontend/src/components/app.js` (Zeitleiste-Darstellung)
- **Priorität**: 🔴 KRITISCH ✅ BEHOBEN
- **Lösung implementiert am**: 5. Januar 2026
  - Backend: `getAuslastungProMitarbeiter()` verarbeitet jede Arbeit einzeln
  - Jede Arbeit prüft auf eigene `mitarbeiter_id` in arbeitszeiten_details
  - Fallback auf `_gesamt_mitarbeiter_id` wenn keine individuelle Zuordnung
  - Frontend Zeitleiste: Gruppierung nach individuellem Mitarbeiter pro Arbeit
  - Frontend Zeitleiste: Zeitberechnung nutzt `zeitMinuten` statt `endzeitBerechnet`

### Bug 11: All-in-One Version - Hohe CPU-Auslastung
- [x] **Problem**: Die Server All-in-One Electron-Version hat sehr hohe CPU-Auslastung
- **Betroffene Dateien**:
  - `backend/electron-main.js`
  - `backend/electron-builder-allinone.json`
  - `backend/src/server.js` (evtl. ineffiziente Polling-Loops)
- **Priorität**: 🔴 KRITISCH ✅ BEHOBEN
- **Ursachen gefunden & behoben**:
  1. ~~Fehlerhafte CPU-Berechnung~~ → Korrigiert mit Differenz-Methode
  2. ~~Zu häufiges Polling (2s)~~ → Auf 5s erhöht
  3. ~~Array-Filter bei jedem Request~~ → Optimiert (nur bei >100 Einträgen)
- **Lösung implementiert am**: 5. Januar 2026
  - CPU-Berechnung korrigiert (Differenz zwischen Messungen / Anzahl CPUs)
  - Stats-Intervall von 2s auf 5s erhöht
  - Array-Operationen optimiert

---

## 🎨 FEATURES - UI/UX Verbesserungen

### Feature 5: Schwebende Termine farblich hervorheben
- [ ] **Anforderung**: Schwebende Termine in der Liste der nicht zugeordneten Termine sollen eine andere Farbe bekommen
- **Betroffene Dateien**: 
  - `frontend/src/styles/style.css`
  - `frontend/src/components/app.js`
- **Priorität**: ⚠️ WICHTIG
- **Umsetzung**: 
  - CSS-Klasse `.termin-schwebend` mit auffälliger Farbe (z.B. orange/gelb)
  - Beim Rendern der Liste prüfen ob `status === 'schwebend'`

### Feature 6: Button "Neues Fahrzeug anlegen" bei Fahrzeugauswahl
- [ ] **Anforderung**: Bei neuem Termin mit existierendem Kunden fehlt bei der Fahrzeugauswahl ein Button zum Anlegen eines neuen Fahrzeugs
- **Betroffene Dateien**: `frontend/src/components/app.js` (Termin-Modal, Fahrzeugauswahl)
- **Priorität**: ⚠️ WICHTIG
- **Umsetzung**:
  - Button "➕ Neues Fahrzeug" unter Fahrzeug-Dropdown
  - Öffnet Mini-Modal für Kennzeichen, Fahrzeugtyp, VIN
  - Nach Speichern: Dropdown aktualisieren, neues Fahrzeug auswählen

---

## 🚀 FEATURES - Große Erweiterungen

### Feature 9: Drag & Drop für Termine in Auslastungsanzeige
- [ ] **Anforderung**: Termine und Arbeiten per Drag & Drop in die Auslastungsanzeige schieben
- [ ] **Anforderung**: Termine zwischen Mitarbeitern verschieben können
- **Betroffene Dateien**:
  - `frontend/src/components/app.js` (Auslastung-Komponente)
  - `frontend/src/styles/style.css` (Drag-Feedback)
  - `backend/src/controllers/termineController.js` (Update-Endpoint)
- **Priorität**: 📊 MITTEL (größere Änderung)
- **Umsetzung**:
  1. HTML5 Drag & Drop API oder Library (z.B. SortableJS)
  2. Termine als `draggable` markieren
  3. Mitarbeiter-Zeilen als Drop-Zones
  4. Bei Drop: API-Call zum Aktualisieren der Zuordnung
  5. Visuelles Feedback beim Ziehen
- **Geschätzter Aufwand**: 4-6 Stunden

### Feature 10: Automatisches Nachrücken bei früher fertigen Terminen
- [ ] **Anforderung**: Wenn ein Termin früher fertig ist als vorausgesehen, sollen folgende Termine nach vorne rücken
- **Betroffene Dateien**:
  - `backend/src/controllers/termineController.js`
  - `backend/src/models/termineModel.js`
- **Priorität**: 📊 MITTEL (komplexe Logik)
- **Umsetzung**:
  1. Bei Status "abgeschlossen" prüfen ob tatsächliche_zeit < geschaetzte_zeit
  2. Zeitersparnis berechnen
  3. Nachfolgende Termine des gleichen Mitarbeiters finden
  4. Startzeiten anpassen
  5. Optional: Benutzer fragen ob nachrücken gewünscht
- **Geschätzter Aufwand**: 3-4 Stunden

---

## 📅 Umsetzungsplan

### Phase 1: Kritische Bugs (Priorität 🔴)
| # | Bug | Geschätzte Zeit | Status |
|---|-----|-----------------|--------|
| 1 | Datum verschwindet | 1-2h | [x] ✅ |
| 2 | Teilverwaltung Klick | 1h | [x] ✅ |
| 3 | Mitarbeiter-Zuordnung | 2-3h | [x] ✅ |
| 4 | Mittagspause Termine | 2h | [x] ✅ |
| 7 | Kennzeichen-Suche | 1h | [x] ✅ |
| 8 | Mehrere Arbeiten Auslastung | 2-3h | [x] ✅ |
| 11 | All-in-One hohe CPU | 2-4h | [x] ✅ |

**Gesamt Phase 1**: ~10-14 Stunden (1 + 11 erledigt)

### Phase 2: UI/UX Features (Priorität ⚠️)
| # | Feature | Geschätzte Zeit | Status |
|---|---------|-----------------|--------|
| 5 | Schwebende Termine Farbe | 30min | [ ] |
| 6 | Neues Fahrzeug Button | 1-2h | [ ] |

**Gesamt Phase 2**: ~2-3 Stunden

### Phase 3: Große Features (Priorität 📊)
| # | Feature | Geschätzte Zeit | Status |
|---|---------|-----------------|--------|
| 9 | Drag & Drop | 4-6h | [ ] |
| 10 | Auto-Nachrücken | 3-4h | [ ] |

**Gesamt Phase 3**: ~7-10 Stunden

---

## 🔧 Technische Notizen

### Bug 1 - Datum State
```javascript
// Vermutlich Problem:
const [datum, setDatum] = useState(new Date().toISOString().split('T')[0]);

// Bei irgendeiner Aktion wird datum zurückgesetzt
// Lösung: State sauber trennen, nicht bei Modal-Öffnung überschreiben
```

### Bug 3 - Mitarbeiter Zuordnung
```javascript
// Zu prüfen in arbeitszeiten_details:
{
  "arbeit1": { zeit: 60, mitarbeiter_id: 1, type: "mitarbeiter" },
  "arbeit2": { zeit: 30, mitarbeiter_id: 2, type: "mitarbeiter" },
  "_gesamt_mitarbeiter_id": { id: 1, type: "mitarbeiter" }
}
```

### Feature 9 - Drag & Drop
```javascript
// HTML5 Drag API Grundgerüst:
element.draggable = true;
element.ondragstart = (e) => e.dataTransfer.setData('terminId', termin.id);
dropZone.ondrop = (e) => {
  const terminId = e.dataTransfer.getData('terminId');
  // API Call zum Zuordnen
};
```

---

## 🚀 Release-Checkliste

- [ ] Alle Bugs aus Phase 1 behoben
- [ ] Alle Features aus Phase 2 umgesetzt
- [ ] Phase 3 Features (optional für 1.0.13)
- [ ] Server startet fehlerfrei
- [ ] Frontend funktioniert
- [ ] Manuelle Tests durchgeführt:
  - [x] Neuer Termin mit Datum
  - [x] Teilverwaltung Klick
  - [x] Mitarbeiter zuordnen
  - [x] Termin in Mittagspause
  - [ ] Neues Fahrzeug anlegen
  - [x] Kennzeichen-Suche
  - [x] Mehrere Arbeiten zuordnen
- [ ] Version in `backend/src/config/version.js` auf 1.0.13 setzen
- [ ] Git Tag erstellen

---

## 📝 Notizen während Entwicklung

_Hier während der Umsetzung Erkenntnisse notieren:_

- 

---

## ✅ Abgeschlossene Tasks

_Erledigte Tasks hierher verschieben:_



