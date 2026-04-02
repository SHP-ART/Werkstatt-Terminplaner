# Design: Wiederholungstermin-Erkennung

**Datum:** 2026-04-02  
**Bereich:** Termin-Erstellung, Zeitverwaltung, Planung & Zuweisung, Heute-Ansicht, Dashboard

---

## Ziel

Beim Erstellen eines neuen Termins wird geprüft ob in den letzten/nächsten 7 Tagen bereits ein Termin mit demselben Kennzeichen existiert. Der Nutzer entscheidet dann ob es sich um denselben Termin, einen Wiederholungstermin oder etwas Unzusammenhängendes handelt. Wiederholungstermine werden rot markiert und im Dashboard separat gezählt.

---

## Teil 1 — Erkennungs-Dialog beim Termin erstellen

### Ablauf

1. Nutzer füllt Termin-Formular aus und klickt Speichern
2. **Vor** dem eigentlichen Speichern: API-Call prüft Ähnlichkeit
3. Bei Treffern: Dialog erscheint
4. Bei keinen Treffern: direkt speichern wie bisher

### Ähnlichkeitsprüfung

- **Kriterium:** Gleiches `kennzeichen`, Datum im Bereich `neuesDatum - 7 Tage` bis `neuesDatum + 7 Tage`
- **Ausgeschlossen:** Stornierte Termine (`status = 'abgesagt'`)
- **API:** Bestehender `GET /termine` Endpoint mit Datum-Filter und Kennzeichen-Filter, oder neuer dedizierter Endpoint `GET /termine/aehnliche?kennzeichen=X&datum=YYYY-MM-DD`

### Dialog-Optionen

Der Dialog zeigt die gefundenen Termine (Datum, Arbeit, Status) und 3 Optionen:

| Option | Aktion |
|---|---|
| **„Gleicher Termin"** | Bestehenden Termin in Bearbeitungsformular öffnen, vorausgefüllt mit neuem Datum und neuen Arbeiten aus dem Formular. Nutzer kann ändern und neu speichern. |
| **„Wiederholungstermin"** | Neuen Termin speichern mit `ist_wiederholung = 1` |
| **„Kein Zusammenhang"** | Neuen Termin normal speichern (`ist_wiederholung = 0`) |

### Implementierungspunkt

- Prüfung in `executeTerminSave()` (app.js ~Zeile 4879), direkt vor dem API-Call
- Neues dediziertes Backend-Endpoint: `GET /termine/aehnliche?kennzeichen=X&datum=YYYY-MM-DD`

---

## Teil 2 — Rote Markierung bei `ist_wiederholung = 1`

### Überall sichtbar

| Ort | Darstellung |
|---|---|
| Zeitverwaltung-Tabelle | Rotes `🔁 Wiederholung`-Badge neben `termin_nr` (wie `schwebend-badge`) |
| Planung & Zuweisung (Timeline-Block) | Roter linker Rand (`border-left: 3px solid #dc3545`) + 🔁 im Termin-Mini-Card |
| Heute-Ansicht (Karten) | Rotes Banner oben: `🔁 WIEDERHOLUNGSTERMIN` (wie `KUNDE WARTET`-Banner) |
| Dashboard KPI | Eigene Kachel (siehe Teil 3) |

### Farbe

`#dc3545` — passt zu bestehenden kritischen Farben im Projekt (z.B. `dringlichkeit-dringend`)

---

## Teil 3 — Dashboard KPI „Wiederholungen"

### Neue KPI-Kachel

```
🔁 Wiederholungen
   3          0%
Anzahl    Quote
```

- **Anzahl:** Termine mit `ist_wiederholung = 1` im aktuellen Monatsbereich
- **Quote:** `wiederholungen_anzahl / gesamt_abgeschlossene_termine * 100` (gerundet auf ganze %)
- **Position:** Im bestehenden KPI-Grid, neben den anderen Kacheln

### Backend-Änderungen

**`reportingModel.js`** — zwei neue Felder im KPI-Query:

```sql
-- Anzahl Wiederholungstermine im Zeitraum
SELECT COUNT(*) FROM termine 
WHERE ist_wiederholung = 1 
  AND datum BETWEEN :von AND :bis 
  AND geloescht_am IS NULL

-- Quote: Wiederholungen / Gesamt-Abgeschlossene
```

---

## Teil 4 — Datenbankänderung

### Neue Migration

Datei: `backend/migrations/029_wiederholung.js`

```sql
ALTER TABLE termine ADD COLUMN ist_wiederholung INTEGER DEFAULT 0;
```

- Default `0` → alle bestehenden Termine sind keine Wiederholungen
- Kein NOT NULL nötig (DEFAULT 0 reicht)

---

## Out of Scope

- Kein automatisches Erkennen von Wiederholungen bei bestehenden Terminen (nur bei Neu-Erstellung)
- Keine Verknüpfung zwischen Wiederholungstermin und dem Ursprungstermin (kein FK)
- Kein Rückgängig-Machen der Wiederholungs-Markierung (außer über Termin bearbeiten wenn gewünscht)
- Keine Änderung der bestehenden `Nacharbeitsquote`-Berechnung
