# Implementierungsplan: Feature 9 - Drag & Drop in Auslastungsanzeige

## Ziel
Ermöglichen der Zuweisung und Verschiebung von Terminen per Drag & Drop direkt in der Auslastungsansicht.

## 1. Frontend: Darstellung erweitern (`frontend/src/components/app.js`)

Die Auslastungsanzeige zeigt aktuell nur statistische Balken. Um Termine verschieben zu können, müssen diese sichtbar sein.

- [ ] **Datenbeschaffung in `loadAuslastung` erweitern**:
  - Abruf aller Termine des Tages (`TermineService.getAll` + Filter).
  - Diese Liste wird für die Darstellung in den Mitarbeiter-Spalten benötigt.

- [ ] **Rendering der Mitarbeiter-Karten anpassen**:
  - Innerhalb der `map`-Schleife für `mitarbeiter_auslastung`:
  - Filtern der Termine, die diesem Mitarbeiter zugewiesen sind.
  - Generieren von HTML für diese Termine (Mini-Cards) unterhalb des Balkens.
  - Attribute hinzufügen: `draggable="true"`, `data-termin-id="..."`.
  - Container-Attribut hinzufügen: `data-mitarbeiter-id="..."`, Klasse `drop-zone`.

- [ ] **Rendering der "Nicht zugeordneten" Termine anpassen**:
  - In `loadNichtZugeordneteTermine`:
  - Attribute hinzufügen: `draggable="true"`.

## 2. Frontend: Drag & Drop Logik (`frontend/src/components/app.js`)

Implementierung der Event-Handler.

- [ ] **`handleDragStart(e)`**:
  - Setzt `e.dataTransfer.setData('text/plain', terminId)`.
  - Setzt `e.dataTransfer.effectAllowed = 'move'`.
  - Optional: Visuelles Feedback (Klasse `dragging` am Element).

- [ ] **`handleDragOver(e)`**:
  - `e.preventDefault()` (notwendig um Drop zu erlauben).
  - `e.dataTransfer.dropEffect = 'move'`.
  - Visuelles Feedback an der Drop-Zone (Klasse `drag-over` hinzufügen).

- [ ] **`handleDragLeave(e)`**:
  - Entfernt Klasse `drag-over`.

- [ ] **`handleDrop(e)`**:
  - `e.preventDefault()`.
  - Liest `terminId` aus `e.dataTransfer`.
  - Liest `targetMitarbeiterId` aus dem Drop-Target (hochwandern im DOM bis zur `.drop-zone`).
  - Ruft `moveTerminToMitarbeiter(terminId, mitarbeiterId)` auf.

- [ ] **`moveTerminToMitarbeiter(terminId, mitarbeiterId)`**:
  - Lädt Termin-Daten.
  - Aktualisiert `mitarbeiter_id`.
  - Aktualisiert `arbeitszeiten_details` (setzt `_gesamt_mitarbeiter_id` auf neuen Mitarbeiter).
  - Ruft `TermineService.update` auf.
  - Bei Erfolg: `loadAuslastung()` neu aufrufen.

## 3. Styling (`frontend/src/styles/style.css`)

- [ ] **Drag & Drop Klassen**:
  - `.drop-zone`: Grundstyling für Drop-Bereiche.
  - `.drop-zone.drag-over`: Hervorhebung (Rahmen, Hintergrundfarbe).
  - `.termin-mini-card`: Styling für die Termine in der Mitarbeiter-Spalte (kompakt, weißer Hintergrund, Schatten).
  - `.draggable`: Cursor `grab`.

## 4. Backend (`backend/src/controllers/termineController.js`)

- [ ] Keine Änderungen notwendig, da der existierende `update`-Endpoint bereits `mitarbeiter_id` und `arbeitszeiten_details` akzeptiert. Die Logik für die Datenaufbereitung liegt im Frontend.

## Zeitplan

1.  **Stunde 1**: Anpassung `loadAuslastung` & Rendering der Termine in Spalten.
2.  **Stunde 2**: CSS-Styling der neuen Mini-Cards.
3.  **Stunde 3**: Implementierung der Drag & Drop Event-Handler.
4.  **Stunde 4**: Implementierung der Speicher-Logik (`moveTerminToMitarbeiter`) und Tests.
