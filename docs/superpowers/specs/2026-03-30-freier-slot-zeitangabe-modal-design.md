# Design: Arbeitszeit-Modal beim "Freien Slot finden"

**Datum:** 2026-03-30
**Feature:** Zeitangabe-Popup vor der Slot-Suche

---

## Problemstellung

Beim Klick auf "🔍 Freien Slot finden" wird aktuell die geschätzte Arbeitszeit still auf 60 Minuten defaulted, wenn kein Wert aus dem `zeitschaetzungAnzeige`-Element gelesen werden kann. Der Nutzer hat keine Möglichkeit, die Suchdauer bewusst festzulegen — was zu unpassenden Slot-Vorschlägen führt.

---

## Lösung

Ein kleines Modal-Dialog öffnet sich **vor** dem API-Aufruf und fragt die geschätzte Arbeitszeit ab. Erst nach Bestätigung startet die Slot-Suche.

---

## UI-Design

### Modal-Inhalt (Option B aus Brainstorming)

- **Titel:** `⏱️ Geschätzte Arbeitszeit`
- **Untertitel:** "Wie lange dauert die Arbeit voraussichtlich?"
- **Schnellauswahl-Chips:** 30 min · 1 Std. · 1,5 Std. · 2 Std. · 4 Std.
- **Freitext-Feld:** Eingabe in Minuten (number input)
- **Vorausfüll-Hinweis:** Wenn Arbeiten eingetragen sind, wird `getGeschaetzteZeit()` verwendet und ein blauer Info-Hinweis angezeigt ("Vorausgefüllt aus eingetragenen Arbeiten")
- **Buttons:** "Abbrechen" (grau) und "🔍 Slot suchen" (blau)
- **Schließen:** ✕-Button oben rechts, Klick auf Overlay schließt Modal

### Schnellauswahl-Werte

| Chip | Minuten |
|------|---------|
| 30 min | 30 |
| 1 Std. | 60 |
| 1,5 Std. | 90 |
| 2 Std. | 120 |
| 4 Std. | 240 |

---

## Technische Umsetzung

### Vorausfüll-Logik

```
geschaetzteZeit = getGeschaetzteZeit(aktuelleArbeiten)
falls geschaetzteZeit < 15 → fallback auf 60
```

Der Chip, dessen Wert am nächsten am vorausgefüllten Wert liegt, wird automatisch ausgewählt (highlighted). Falls kein Chip exakt passt, bleibt das Freitext-Feld mit dem Wert befüllt ohne Chip-Auswahl.

### Ablauf

1. User klickt `#btnFreienSlotFinden`
2. `handleNaechsterSlot()` öffnet Modal statt direkt die API aufzurufen
3. Modal zeigt vorausgefüllten Wert + Chips
4. User wählt Chip oder gibt Minuten manuell ein
5. Klick "Slot suchen" → Modal schließt → `getNaechsterSlot(minuten)` wird aufgerufen
6. Slot-Vorschläge erscheinen wie bisher in `#slotVorschlaegeDropdown`

### Implementierungsdetails

- **Modal-HTML:** Wird direkt in `index.html` als Hidden-Element eingefügt (`display:none`), mit ID `#zeitangabeModal`
- **Backdrop:** Halbtransparentes Overlay über der gesamten Seite (`position:fixed`)
- **Chip-Klick:** Setzt das Minuten-Input-Feld und hebt den gewählten Chip hervor
- **Keine neuen Dependencies:** Reines HTML/CSS/JS, passend zum bestehenden App-Stil
- **Modal-Styles:** Inline oder ergänzend in bestehenden Style-Block in `index.html`

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `frontend/index.html` | Modal-HTML hinzufügen |
| `frontend/src/components/app.js` | `handleNaechsterSlot()` umschreiben: erst Modal öffnen, dann Suche |

### Keine Änderung nötig

- `api.js` — `getNaechsterSlot()` bleibt unverändert
- Backend — keine Änderungen
- Slot-Vorschläge-Logik `_zeigeSlotVorschlaege()` — bleibt unverändert

---

## Erfolgs-Kriterien

- Klick auf "Freien Slot finden" öffnet immer das Modal
- Vorausgefüllter Wert kommt aus `getGeschaetzteZeit()`, Fallback 60min
- Passender Chip wird automatisch markiert wenn Wert einem Chip entspricht
- Manuelle Minuten-Eingabe funktioniert
- Abbrechen schließt Modal ohne Suche
- Nach Bestätigung starten Slot-Vorschläge wie bisher
