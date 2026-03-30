# Design: Mehrere Zeitslots pro Tag in der Slot-Suche

**Datum:** 2026-03-30
**Feature:** Mehrere freie Zeitslots pro Tag anzeigen + Bringzeit übernehmen

---

## Problemstellung

Die Slot-Suche zeigt pro Tag nur einen einzigen Zeitvorschlag (den frühestmöglichen). Der Nutzer kann keine alternative Uhrzeit am selben Tag wählen. Außerdem wird die Bringzeit nicht automatisch ins Formular übernommen — nur Datum und Mitarbeiter werden gesetzt.

---

## Lösung

**Backend:** Pro Tag/Kandidat werden bis zu 4 freie Startzeiten ermittelt (nicht nur die erste). Die API gibt alle Slots strukturiert nach Tag zurück.

**Frontend:** Pro Tag eine Zeile mit Datum links, Zeitchips in der Mitte (bis zu 4), Auslastung rechts. Klick auf einen Chip setzt Datum + Bringzeit + Mitarbeiter.

---

## Backend-Änderungen

### `getNaechsterSlot` in `termineController.js`

**Neue Logik:** Statt beim ersten gefundenen Slot pro Tag aufzuhören, wird `findAvailableSlot` bis zu 4-mal aufgerufen — jedes Mal ab dem Ende des zuletzt gefundenen Slots.

```
slotStart = findAvailableSlot(blocks, tagStart, benoetigt, tagStart, tagEnde)
zeitenProTag = [slotStart]

while zeitenProTag.length < 4:
  nächsterSuch = slotStart + benoetigt  # direkt nach dem letzten Slot
  slotStart = findAvailableSlot(blocks, nächsterSuch, benoetigt, tagStart, tagEnde)
  if slotStart === null: break
  zeitenProTag.push(slotStart)
```

**Neues API-Antwortformat:**

```json
{
  "success": true,
  "slots": [
    {
      "datum": "2026-03-31",
      "mitarbeiter_id": null,
      "lehrling_id": 1,
      "mitarbeiter_name": "Justin",
      "auslastung_prozent": 45,
      "zeiten": ["08:00", "10:00", "13:00", "15:30"]
    },
    {
      "datum": "2026-04-01",
      "mitarbeiter_id": null,
      "lehrling_id": 1,
      "mitarbeiter_name": "Justin",
      "auslastung_prozent": 20,
      "zeiten": ["08:00", "11:30", "14:00"]
    }
  ]
}
```

**Änderung:** `startzeit` (einzelner String) wird durch `zeiten` (Array von Strings) ersetzt. `slotGefunden`-Logik bleibt: ein Tag zählt als gefunden, wenn mindestens 1 Zeitslot vorhanden ist.

---

## Frontend-Änderungen

### `_zeigeSlotVorschlaege` in `app.js`

Pro Slot-Objekt eine Zeile rendern:
- Links: Datum (Wochentag + Datum)
- Mitte: Zeitchips (`zeiten`-Array), je ein klickbarer `<span>`
- Rechts: `mitarbeiter_name` + `auslastung_prozent`%

```html
<div class="slot-item-row">
  <span class="slot-datum">Dienstag, 31.03.</span>
  <span class="slot-zeiten">
    <span class="slot-zeit-chip" onclick="app._uebernimmSlot(...)">08:00</span>
    <span class="slot-zeit-chip" onclick="app._uebernimmSlot(...)">10:00</span>
  </span>
  <span class="slot-info">Justin · 45% ausgelastet</span>
</div>
```

### `_uebernimmSlot` in `app.js`

Signatur erweitert: `_uebernimmSlot(datum, mitarbeiterId, lehrlingId, mitarbeiterName, zeit)`

**NEU:** Bringzeit-Feld (`#bring_zeit`) auf `zeit` setzen.

```js
const bringZeitInput = document.getElementById('bring_zeit');
if (bringZeitInput && zeit) {
  bringZeitInput.value = zeit;
  bringZeitInput.dispatchEvent(new Event('change'));
}
```

---

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `backend/src/controllers/termineController.js` | `getNaechsterSlot`: mehrere Zeiten pro Tag ermitteln, `zeiten`-Array statt `startzeit` |
| `frontend/src/components/app.js` | `_zeigeSlotVorschlaege`: neue Zeilen-Darstellung; `_uebernimmSlot`: Bringzeit setzen |

---

## Erfolgs-Kriterien

- Pro Tag werden bis zu 4 freie Zeiten angezeigt
- Alle Zeiten sind reale Lücken in der Planung (keine Überschneidungen)
- Klick auf eine Zeit setzt Datum + Bringzeit ins Formular
- Tage ohne freien Slot erscheinen nicht in den Vorschlägen (wie bisher)
- Bisheriges Verhalten (Datum übernehmen, Mitarbeiter vorauswählen) bleibt erhalten
