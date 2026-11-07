# Zettel-Board: schnellere Zuweisung per Warteschlange

Stand: 2026-11-07 · Status: Entwurf, nicht freigegeben · Autor: Claude mit Sven

## Warum

Die Zuweisung in "Planung & Zuweisung (Beta)" ist umständlich, und der Tag passt am Ende
trotzdem nicht: Ein Mechaniker schafft die Zeitvorgabe nicht, es kommt etwas Neues dazu,
und alles muss umsortiert werden. Der Aufwand entsteht beim Neu-Sortieren, nicht beim
ersten Zuweisen.

## Ziel

- Neue Aufträge werden per Drag & Drop auf einen Mechaniker gezogen (ein Zettel = ein Auftrag).
- Jeder Mechaniker hat eine **Warteschlange ohne feste Uhrzeiten**. Dauert ein Auftrag
  länger, rutscht die Liste von selbst nach.
- Ein **Tageslast-Balken** je Mechaniker zeigt, wie voll er ist. Überlauf wird rot, der
  überzählige Zettel ist als "morgen" markiert und lässt sich mit einem Klick zu einem
  Kollegen mit freier Kapazität verschieben.
- Am Display (Tablet) sieht der Mechaniker seinen nächsten Zettel und stempelt darauf an.

## Nicht-Ziele

- Kein neuer Import-Weg. Der PDF-Import aus Locosoft bleibt unverändert (Bildschirmfoto
  mit Texterkennung wurde geprüft und ist ungenauer als das PDF).
- Die bestehende Ansicht "Planung & Zuweisung (Beta)" wird nicht ersetzt oder entfernt.
- Keine automatische Verteilung durch KI in dieser Stufe.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Der Mechaniker muss etwas neu sortieren oder eintippen, nur weil es länger dauert.
- Bestehende Termine, Stempelzeiten oder die Auslastungsansicht werden verändert oder
  zeigen andere Werte.
- Ein API-Key im Frontend (das Frontend wird vom selben Server ausgeliefert, ein Key
  dort schützt nichts).

## Bestehendes, auf das wir bauen (geprüft am 2026-11-07)

| Baustein | Fundort | Nutzen |
|---|---|---|
| Zuweisung | `termine.mitarbeiter_id` | Zettel gehört einem Mechaniker |
| Unzugewiesen | `termine.ist_schwebend`, `schwebend_prioritaet` | Zettel in der Spalte "NEU" |
| Zeitvorgabe | `termine.geschaetzte_zeit`, `termine_arbeiten` | Last-Balken |
| Kapazität | `backend/src/utils/auslastung.js` (`berechneKapazitaet`) | Tageslast je Mitarbeiter |
| Anstempeln | `PUT /api/stempelzeiten/stempel` (`termine_arbeiten.stempel_start/ende`) | Zeit läuft |
| Echtzeit | `broadcastEvent('termin.*')` | alle Clients aktualisieren |
| Import | `auftragsimport` (PDF, Schnelltermin, Zuordnen) | Quelle der Zettel |
| Drag & Drop | `frontend/src/features/planung/` | Muster, nicht wiederverwenden |

Es gibt **keine** Spalte für die Reihenfolge in der Warteschlange. Sie muss neu angelegt werden.

## Entwurf

**Daten:** neue Spalte `termine.warteschlange_pos` (INTEGER, NULL = nicht in einer
Warteschlange). Sortiert wird je `mitarbeiter_id` aufsteigend nach `warteschlange_pos`.
Nur abgeschlossene/stornierte Termine fallen aus der Warteschlange.

**Backend:** neue Route `/api/warteschlange` (Route -> Controller -> Model).
- `GET /api/warteschlange?datum=` liefert je Mechaniker die Zettel samt Last (Minuten,
  Kapazität, Überlauf-Markierung) und die Spalte NEU.
- `PUT /api/warteschlange/zuweisen` (`termin_id`, `mitarbeiter_id`, optional `position`)
  hängt an oder fügt ein; ohne `position` ans Ende.
- `PUT /api/warteschlange/reihenfolge` sortiert die Liste eines Mechanikers neu.
- `POST /api/warteschlange/:terminId/naechster-tag` markiert "morgen" (verschiebt das Datum
  auf den nächsten Arbeitstag, Position ans Ende der Schlange dort).
- Jede Änderung sendet `broadcastEvent('termin.queue_updated', { mitarbeiter_id })`
  (Prefix `termin.`, sonst wertet das Frontend das Event nicht aus).
- Limiter: `generalLimiter`. Kein `requireAuth` (Frontend sendet keinen Key).

**Überlauf:** wird berechnet, nicht gespeichert: Summe `geschaetzte_zeit` in Reihenfolge
gegen Kapazität des Tages; der erste Zettel, der nicht mehr passt, und alle danach sind
"morgen".

**Frontend:** neues Feature-Modul `frontend/src/features/warteschlange/` und ein neuer
Tab "Zettel-Board" neben der bestehenden Planung. Links NEU-Zettel, rechts je Mechaniker
eine Spalte mit Last-Balken. Drag & Drop mit dem Browser-Standard (HTML5), kein
Zusatzpaket.

**Display/Anstempeln:** der Mechaniker sieht oben seinen nächsten Zettel und tippt
"Anstempeln". Das nutzt den bestehenden Stempel-Weg, keine neue Stempel-Logik.

## Offene Entscheidungen (nur Sven kann sie beantworten)

1. **Welches Display ist gemeint?** Annahme: die bestehende Tablet-App
   (`electron-intern-tablet`, lädt die Server-Oberfläche). Falls es ein Display am
   Arbeitsplatz je Mechaniker ist, braucht es eine Mechaniker-Auswahl oder feste Zuordnung.
2. **Wie wird angestempelt?** Annahme: Tippen auf den Zettel stempelt die erste noch nicht
   gestempelte Arbeit des Auftrags an. Alternative: Mechaniker wählt die Arbeit selbst.
3. **Woher kommt die Zeitvorgabe bei einem neuen Zettel?** Annahme: `geschaetzte_zeit`
   aus dem Import (Standard 60 Minuten, siehe `auftragsImportService.js`) oder die lokale
   KI-Schätzung. Nicht geprüft, wie verlässlich das ist.
4. **Soll der Import-Zettel beim Ziehen sofort zum Termin werden?** Annahme: ja, über den
   bestehenden Schnelltermin.

## Dem Bauenden überlassen

Aussehen der Zettel und Farben, Tastaturbedienung, genaue Position der Überlauf-Markierung,
Namen der internen Funktionen.

## Risiken

- `planungFeature.js` und `dragDropFeature.js` sind zusammen über 6000 Zeilen. Wir fassen
  sie nicht an, das Board ist ein eigenes Modul.
- `index.html` verliert gelegentlich Tab-Einträge (bekannte Falle in `CLAUDE.md`):
  vor jedem Commit die Tab-Prüfung ausführen.
- Gleichzeitiges Ziehen in zwei Browsern: die letzte Änderung gewinnt, danach lädt die
  Anzeige per Event neu.
