# Design: Status-Popup mit Zeitfeld in Zeitverwaltung

**Datum:** 2026-04-02  
**Bereich:** Zeitverwaltung (⏱️) — Tabelle, Spalte „Status"

---

## Ziel

Beim Klick auf den Status-Badge in der Zeitverwaltungs-Tabelle öffnet sich ein Floating-Dropdown, das zwei Dinge vereint:

1. **Status ändern** — alle 5 Status wählbar (Wartend, Geplant, In Arbeit, Abgeschlossen, Abgesagt)
2. **Zeit erfassen** — kontextabhängig: bei „In Arbeit" die tatsächliche Startzeit, bei „Abgeschlossen" die tatsächliche Fertigstellungszeit

---

## UI/UX

### Trigger
- Klick auf den Status-Badge in der Zeile öffnet ein **schwebendes Dropdown** direkt unterhalb des Badge (Floating Dropdown, Ansatz B).
- Klick außerhalb schließt das Popup ohne Änderung.

### Popup-Struktur

**Oberer Bereich — Status-Liste (immer sichtbar):**
```
⏳ Wartend
📋 Geplant
🔧 In Arbeit       ← aktuell aktiver Status hervorgehoben (border-left + Hintergrund)
✅ Abgeschlossen
❌ Abgesagt
```
- Klick auf einen Eintrag wechselt die Auswahl sofort visuell (kein API-Call)
- Der zuvor aktive Status verliert die Hervorhebung

**Unterer Bereich — Zeitfeld (kontextabhängig):**

| Ausgewählter Status | Zeitbereich sichtbar | Label | Vorbelegung | DB-Feld |
|---|---|---|---|---|
| `in_arbeit` | Ja | „Startzeit" | `termin.startzeit` → `termin.bring_zeit` → `—` | `termine.startzeit` |
| `abgeschlossen` | Ja | „Fertigstellungszeit" | `termin.fertigstellung_zeit` (ISO→HH:MM) → `termin.endzeit_berechnet` → `—` | `termine.fertigstellung_zeit` |
| `geplant` / `wartend` / `abgesagt` | Nein | — | — | — |

Zeitfeld zeigt zwei Zeilen:
- **Geplant/Berechnet:** nicht editierbar, dient als Referenz
- **Tatsächlich:** Textfeld HH:MM, vorbelegt mit dem berechneten Wert

**Speichern-Button:**
- Immer sichtbar, Farbe passt zum gewählten Status
- Schreibt Status + ggf. Zeit in die DB → Popup schließt sich → Tabelle lädt neu

---

## Datenfluss

### Lesen (Popup öffnen)
```
termin.status                    → aktuell hervorgehobener Status
termin.startzeit                 → Vorbelegung Zeitfeld bei in_arbeit
  └─ Fallback: termin.bring_zeit
termin.fertigstellung_zeit       → Vorbelegung Zeitfeld bei abgeschlossen (ISO→HH:MM konvertieren)
  └─ Fallback: termin.endzeit_berechnet (bereits HH:MM)
```

### Schreiben (Speichern-Klick)
Ein einzelner `PUT /termine/:id` mit:

```json
// Bei in_arbeit:
{ "status": "in_arbeit", "startzeit": "HH:MM" }

// Bei abgeschlossen:
{ "status": "abgeschlossen", "fertigstellung_zeit": "ISO-8601" }

// Bei geplant / wartend / abgesagt:
{ "status": "geplant" }
```

`fertigstellung_zeit` wird als ISO-8601-String gespeichert (Datum des Termins + eingegebene HH:MM + `:00`).

---

## Implementierung

### Eingriffspunkt
Das bestehende Status-Dropdown in `loadTermine()` ([app.js:6180](../../../frontend/src/components/app.js)) wird erweitert — kein neues Parallelsystem.

### Änderungen in `app.js`

1. **Status-Badge in `loadTermine()`** (ca. Zeile 6180):  
   Click-Handler ersetzt/erweitert den bestehenden, öffnet das neue Popup.

2. **Neue Funktion `openStatusPopup(terminId, anchorElement)`:**
   - Liest `termin`-Daten aus bestehendem State
   - Rendert Floating-Div mit Status-Liste + Zeitfeld
   - Reagiert auf Status-Klicks (lokale Auswahl)
   - Reagiert auf Zeitfeld-Änderung
   - Speichern-Button ruft `saveStatusPopup(terminId, status, zeit)` auf

3. **Neue Funktion `saveStatusPopup(terminId, status, zeit)`:**
   - Baut Update-Payload je nach Status
   - `PUT /termine/:id` via bestehendem `TermineService.update()`
   - Danach: `loadTermine()` neu aufrufen

4. **Zeitfeld-Konvertierung:**
   - Input: HH:MM  
   - Für `fertigstellung_zeit`: `new Date(\`${terminDatum}T${zeit}:00\`).toISOString()`

### Keine Backend-Änderungen nötig
Die Felder `startzeit` und `fertigstellung_zeit` existieren bereits in der DB (Migration 006) und werden vom bestehenden `PUT /termine/:id` Endpoint verarbeitet.

---

## Validierung

- Zeitfeld: Pattern `HH:MM`, Stunden 0–23, Minuten 0–59
- Ungültige Eingabe: Speichern-Button disabled + rote Umrandung des Feldes
- Kein Zeitfeld bei Geplant/Wartend/Abgesagt → Speichern immer aktiv

---

## Out of Scope

- Kein Einfluss auf die Timeline-Darstellung in Planung & Zuweisung (separates System)
- Keine Änderung der `arbeitszeiten_details` JSON-Struktur
- Kein Abgesagt-Bestätigungsdialog
