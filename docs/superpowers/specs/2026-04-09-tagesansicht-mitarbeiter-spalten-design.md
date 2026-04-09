# Tagesansicht — Mitarbeiter-Spalten

**Datum:** 2026-04-09
**Gewählter Ansatz:** Neuer dritter Modus "Mitarbeiter" mit voller Zeitleiste pro Spalte

## Zusammenfassung

Die Tagesansicht bekommt einen dritten Ansichtsmodus "Mitarbeiter" neben den bestehenden Modi "Zeitleiste" und "Liste". Jeder Mitarbeiter/Lehrling erhält eine eigene Spalte mit Zeitleiste (7-18 Uhr). Termine werden anhand der tatsächlichen Start- und Fertigstellungszeiten (aus `arbeitszeiten_details`) positioniert. Nicht zugewiesene Termine erscheinen in einer eigenen Spalte rechts.

## Probleme (Ist-Zustand)

1. **Alle Termine in einer Spalte** — nicht erkennbar, wer wann was macht
2. **Keine MA-spezifische Sicht** — Termine sind nach Zeit sortiert, nicht nach Mitarbeiter
3. **Tatsächliche Zeiten nicht genutzt** — Zeitleiste zeigt geplante Zeiten, nicht die gestempelten Start-/Fertigstellungszeiten

## Entscheidungen

- **Neuer Modus, kein Ersatz** — Bestehende Zeitleiste und Liste bleiben erhalten
- **Volle Zeitleiste pro Spalte** — Zeitachse 7-18 Uhr wie bestehende Zeitleiste
- **"Nicht zugewiesen"-Spalte** — Für Termine ohne MA, ganz rechts
- **Tatsächliche Zeiten** — `arbeitszeiten_details._startzeit` + `tatsaechliche_zeit` bevorzugt
- **2 MA + Lehrlinge** — Aktuell Sven + Lars, plus ggf. Lehrlinge; 3-4 Spalten passen ohne Scrollen

## 1. Toggle-Button erweitern

**Datei:** `frontend/index.html`

In der Tagesansicht gibt es bereits einen Zeitleiste/Liste-Toggle. Ein dritter Button "Mitarbeiter" wird hinzugefügt. Der `kalenderState.ansicht`-Wert wird erweitert: `'zeitleiste'` | `'liste'` | `'mitarbeiter'`.

Bestehender Toggle-Mechanismus in `app.js` muss den dritten Wert verarbeiten und die passende Render-Methode aufrufen.

## 2. Layout der MA-Ansicht

```
┌────────┬────────────┬────────────┬────────────┬──────────────┐
│  Zeit  │   Sven     │   Lars     │ Lehrling   │ Nicht zugew. │
│        │   85%      │   62%      │ 🏫 Abw.   │              │
├────────┼────────────┼────────────┼────────────┼──────────────┤
│  07:00 │            │            │            │              │
│  08:00 │ ██ Bremse  │            │            │ ▨ TÜV (offen)│
│  09:00 │ ██ vorne   │ ██ Zahn-   │            │              │
│  10:00 │            │ ██ riemen  │            │              │
│  11:00 │ ██ Ölw.    │            │            │              │
│  ...   │            │            │            │              │
└────────┴────────────┴────────────┴────────────┴──────────────┘
```

### Struktur

- **Zeitspalte links** (50px) — Stundenlabels 7-18 Uhr, identisch mit bestehender Zeitleiste
- **MA-Spalten** — gleich breit (`flex: 1`), CSS Grid oder Flexbox
- **Header pro Spalte** — MA-Name, Auslastungs-%, ggf. Abwesenheits-Icon
- **Abwesende MA** — Header ausgegraut mit Abwesenheitsgrund (z.B. "🏖️ Urlaub"), Spalte leer/disabled
- **"Nicht zugewiesen"-Spalte** — Grauer Header, nur sichtbar wenn es Termine ohne MA gibt
- **Termin-Blöcke** — Absolut positioniert innerhalb der Spalte, wie in bestehender Zeitleiste
- **"Jetzt"-Linie** — Horizontal über alle Spalten (wie in bestehender Zeitleiste)

### Termin-Block-Inhalt

Gleich wie bestehende Zeitleiste, aber mit Stempelzeit-Info:
```
┌──────────────────────┐
│ AB-CD 123 · Kunde    │  ← Kennzeichen + Kundenname
│ Bremse vorne         │  ← Erste Arbeit
│ 08:00 – 09:24 (84m)  │  ← Tatsächliche Start-/Endzeit + Dauer
└──────────────────────┘
```

Bei abgeschlossenen Terminen: tatsächliche Endzeit + "✓"
Bei laufenden: Startzeit + "läuft..."
Bei geplanten (noch nicht gestartet): geplante Startzeit + geschätzte Dauer

## 3. Datenquellen

Alle Daten sind bereits über bestehende APIs verfügbar:

1. **Termine** — `this.kalenderLadeTermine(datumStr, datumStr)` — liefert `mitarbeiter_id`, `mitarbeiter_name`, `arbeitszeiten_details`, `startzeit`, `bring_zeit`, `geschaetzte_zeit`, `tatsaechliche_zeit`, `status`
2. **Auslastung** — `AuslastungService.getByDatum(datumStr)` — liefert `mitarbeiter_auslastung[]` und `lehrlinge_auslastung[]` mit Name, Auslastungs-%, Abwesenheitsstatus
3. **Abwesenheiten** — `this.kalenderLadeAbwesenheiten(datumStr, datumStr)` — liefert `person_name`, `grund`

## 4. Termin-Zuordnung zu Spalten

### Schritt 1: MA/Lehrling bestimmen

1. Parse `arbeitszeiten_details` (JSON): Prüfe `_gesamt_mitarbeiter_id` → `{type: "mitarbeiter"|"lehrling", id: N}`
2. Fallback: `mitarbeiter_id` vom Termin direkt (Typ = "mitarbeiter")
3. Kein Match → Spalte "Nicht zugewiesen"

### Schritt 2: Startzeit bestimmen

Priorität:
1. `arbeitszeiten_details._startzeit` (tatsächliche Stempelzeit, z.B. "08:15")
2. `startzeit` vom Termin
3. `bring_zeit` vom Termin
4. Fallback: Keine Zeitposition → "Ohne Uhrzeit"-Bereich oben

### Schritt 3: Dauer/Höhe bestimmen

- Abgeschlossen (`status === 'abgeschlossen'` und `tatsaechliche_zeit > 0`): `tatsaechliche_zeit`
- Sonst: `geschaetzte_zeit` (oder 60 Min. Fallback)
- Blockhöhe: `(dauer / 60) * slotHoehe`, mindestens 25px

## 5. Spalten-Liste aufbauen

Die Spalten werden aus der Auslastungs-API aufgebaut (nicht aus den Terminen), damit auch MA ohne Termine an dem Tag erscheinen:

1. `AuslastungService.getByDatum()` liefert alle aktiven MA + Lehrlinge
2. Für jeden: Spalte anlegen mit Name, Typ, ID, Auslastung, Abwesenheit
3. Am Ende: "Nicht zugewiesen"-Spalte falls es unzugewiesene Termine gibt
4. Abwesende MA bekommen ausgegrautem Header mit Abwesenheitsgrund

## 6. Nicht im Scope

- Drag & Drop von Terminen zwischen Spalten
- Inline-Bearbeitung von Terminen
- Änderung der bestehenden Zeitleiste oder Liste
- Neue API-Endpoints (bestehende Services reichen)
- Horizontales Scrollen (bei 2-4 MA nicht nötig)

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `frontend/index.html` | Dritter Toggle-Button "Mitarbeiter" in Tagesansicht |
| `frontend/src/components/app.js` | Neue Methode `renderKalenderTagMitarbeiter()`, Toggle-Logik in `loadKalenderTag()` erweitern |
| `frontend/src/styles/style.css` | Grid-Layout für MA-Spalten, Header-Styles, Spalten-Styles |
