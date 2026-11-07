# Zettel-Board: Umsetzungsplan

Design: `docs/superpowers/specs/2026-11-07-zettel-board-design.md` (Entwurf, vor Start freigeben lassen).
Regeln: Test-First, Route -> Controller -> Model, `dbHelper`, `asyncHandler`, `broadcastEvent('termin.*')`.
Vor jedem Commit: `cd backend && npm test`. Höchstens 5 Korrekturversuche je Fehler.

Messlatte für "fertig": Ein Zettel lässt sich per Drag & Drop einem Mechaniker zuweisen,
Last-Balken und "morgen"-Markierung stimmen mit der Auslastungsansicht überein, das Tablet
zeigt den nächsten Zettel, Anstempeln startet die Zeit, ein zweiter Browser aktualisiert sich.

## Phase 0: Vorbereitung (klein)

1. Offene Entscheidungen 1 bis 4 aus dem Design mit Sven klären.
2. Höchste Migrationsnummer prüfen (`ls backend/src/migrations`, laut `CLAUDE.md` zuletzt 034)
   und die nächste freie verwenden.
3. Baseline: `cd backend && npm test` (Stand 2026-11-07: 170 grün, 9 übersprungen).
4. `FEATURES.md` lesen: berührte Endpunkte (`/api/termine`, `/api/stempelzeiten`,
   `/api/auftragsimport`) notieren.

## Phase 1: Backend-Warteschlange

Dateien: `backend/src/migrations/NNN_warteschlange_pos.js`, `models/warteschlangeModel.js`,
`controllers/warteschlangeController.js`, `routes/warteschlangeRoutes.js`,
`routes/index.js`, Tests in `backend/tests/warteschlange*.test.js`.

1. Tests schreiben (müssen rot sein):
   - Zuweisen ohne Position hängt ans Ende (`warteschlange_pos` = max + 1).
   - Zuweisen mit Position schiebt die folgenden Zettel nach hinten, ohne Lücken oder Doppelte.
   - Neu-Sortieren speichert die Reihenfolge, fremde Mechaniker bleiben unberührt.
   - Überlauf: Summe `geschaetzte_zeit` gegen Kapazität, erster nicht passender Zettel
     und alle danach sind `morgen = true`.
   - Abgeschlossene/stornierte Termine erscheinen nicht in der Schlange.
   - Unbekannte `termin_id` oder `mitarbeiter_id` ergibt 404 mit Fehlerklasse aus `utils/errors.js`.
2. Migration anlegen (Spalte `warteschlange_pos`, Index auf `mitarbeiter_id, warteschlange_pos`).
   Migrationstest in `migrations.test.js` ergänzen.
3. Model, dann Controller (Geschäftslogik, Transaktion über `withTransaction()`), dann Route
   mit `generalLimiter` und `asyncHandler`. In `routes/index.js` mounten.
4. `broadcastEvent('termin.queue_updated', { mitarbeiter_id })` nach jeder Änderung.
5. Tests grün, Gesamtlauf grün, Commit.

Prüfung: `curl` gegen lokalen Server: zuweisen, neu sortieren, GET zeigt erwartete Reihenfolge.

## Phase 2: Zettel-Board im Frontend

Dateien: `frontend/src/features/warteschlange/warteschlangeFeature.js` (neu),
`frontend/src/services/api.js` (`WarteschlangeService`), `frontend/index.html` (Tab + Template),
Einbindung wie die anderen Features.

1. Reine Berechnung (Balken-Prozent, Farbe, "morgen") als eigene Funktion mit Test.
2. Tab "Zettel-Board" anlegen: Button in der Navigation, `<div id>` und `<template>`.
   Danach die Tab-Prüfung aus `CLAUDE.md` ausführen (`grep -c "data-tab="`).
3. Spalte NEU (schwebende Termine plus offene Aufträge aus dem Import), je Mechaniker eine Spalte
   mit Last-Balken.
4. Drag & Drop (HTML5): auf Mechaniker ziehen ruft `PUT /warteschlange/zuweisen`; Ziehen
   innerhalb der Spalte ruft `reihenfolge`.
5. "Zu Kollegen"-Knopf am "morgen"-Zettel: Auswahl der Mechaniker mit freier Kapazität.
6. WebSocket: auf `termin.queue_updated` neu laden (`handleWebSocketMessage` wertet `termin.*` aus).
7. `API_BASE_URL` nur aus `api.js`, kein hartkodierter Port. `npm run build`, im Browser prüfen.

Prüfung: im Browser Zettel ziehen, zweiter Tab aktualisiert sich; Balken stimmt mit der
Auslastungsansicht für dasselbe Datum überein (Stichprobe).

## Phase 3: Display und Anstempeln

Abhängig von Entscheidung 1 und 2. Annahme: Tablet-App zeigt die Server-Oberfläche.

1. Test: `GET /api/warteschlange/mitarbeiter/:id/naechster` liefert den obersten Zettel
   mit Status `geplant` oder `in_arbeit`.
2. Endpunkt, dann Ansicht "Mein nächster Auftrag" mit Knopf "Anstempeln", der den
   bestehenden `PUT /api/stempelzeiten/stempel` aufruft.
3. Nach Abschluss rückt die Schlange nach, das Event aktualisiert Board und Display.

Prüfung: auf dem Tablet (oder Browser mit Tablet-Größe) anstempeln, im Board erscheint
der Zettel als "läuft", Zeit wird in `termine_arbeiten` gespeichert.

## Phase 4: Abschluss

1. Doku: `CLAUDE.md` Abschnitt 9 (neue Route), `.claude/PROJEKT.md` (Komponenten, Datenmodell,
   TDD-Status), `FEATURES.md` (neue Endpunkte), `.claude/RETRO.md`.
2. Manuelle Kernpfade aus `CLAUDE.md` Abschnitt 6 durchgehen (insbesondere Punkt 4, WebSocket).
3. Deploy erst nach Freigabe: DB-Backup auf dem Server, dann Update laut `CLAUDE.md`
   Abschnitt 5. Zugang: `.claude/SECRETS.md`.

## Reihenfolge und Abhängigkeiten

Phase 0 -> 1 -> 2 -> 3 -> 4. Phase 2 und 3 brauchen die API aus Phase 1. Phase 3 braucht zusätzlich
die Antworten zu Entscheidung 1 und 2.

## Nicht in diesem Plan

PDF-Import ändern, KI-Verteilung, Ablösung der bestehenden Planungsansicht.
