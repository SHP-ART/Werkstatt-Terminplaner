# Zettel-Board: Lehrlinge und gemeinsame Zeitplanung

Stand: 2026-11-08 · Status: von Sven in drei Abschnitten freigegeben · Autor: Kimi mit Sven

## Ausgangslage und Ziel

Das Zettel-Board besitzt derzeit nur Mechaniker-Queues und verwaltet deren Reihenfolge ohne
vollständige Integration in die zeitliche Darstellung von Planung (Beta). Lehrlinge fehlen als
Zuweisungsziel. Bring- und Abholzeiten müssen bei der automatischen Planung sichtbar eingehalten
werden; eine Nichteinhaltung muss auf Zettel-Board, Planung (Beta) und Tablet gemeldet werden.

Die Erweiterung verbindet Queue, Zeitplanung und Warnungen über denselben Backend-Datenstand.
Es entsteht keine zweite Planungslogik und kein zweiter Datenbestand.

## Festgelegte Anforderungen

1. Lehrlinge erhalten wie Mechaniker eine eigene Spalte und eine eigene Warteschlange für ganze
   Aufträge per Drag & Drop.
2. Zuweisen und Umsortieren erzeugen automatisch Start- und voraussichtliche Endzeiten aus der
   Reihenfolge. Planung (Beta) zeigt dieselbe zeitliche Einordnung.
3. Ein berechneter Start nach der Bringzeit und ein berechnetes Ende nach der Abholzeit erzeugen
   sofort verständliche Warnungen auf allen drei Oberflächen.
4. Nebenzeit und Lehrlings-Aufgabenbewältigung verwenden die vorhandenen Produktionsregeln.
5. Keine Änderung am PDF-Import, keine KI-Verteilung und keine Ablösung der Planungsansicht.

## Datenmodell und Zuordnung

- Mechaniker verwenden weiterhin `termine.mitarbeiter_id`, Lehrlinge `termine.lehrling_id`.
- `termine.warteschlange_pos` bleibt die gemeinsame Positionsangabe; eine neue additive Migration
  ergänzt einen Index für Lehrlings-Queues. Bestehende Mechanikerdaten bleiben unverändert.
- Eine Lehrlingszuweisung setzt zusätzlich die vorhandenen Zuordnungsinformationen in
  `arbeitszeiten_details` mit `type: 'lehrling'`, damit Planung und Auslastung den Auftrag lesen.
  Beim Wechsel zwischen Mechaniker und Lehrling wird die andere Hauptzuordnung entfernt.
- Jede Queue wird fachlich nach Personentyp, Personen-ID und Datum isoliert. IDs aus fremden Queues
  werden beim Sortieren abgelehnt.

## API und zentrale Berechnung

- Die bestehenden Mechaniker-Aufrufe bleiben kompatibel.
- Zuweisen und Reihenfolge akzeptieren additiv eine Lehrlingsadressierung mit Personentyp und
  Personen-ID. Für das Tablet wird ein Lehrlings-Endpunkt `naechster` ergänzt.
- Nach jeder Zuweisung oder Umsortierung wird die vorhandene Neuzeitberechnung des Backends
  verwendet. Der früheste Start berücksichtigt Arbeitsbeginn und Bringzeit; spätere Zettel folgen
  der Reihenfolge unter Verwendung der effektiven Dauer inklusive Nebenzeit und gegebenenfalls
  Aufgabenbewältigung.
- Die Ergebnisse werden weiterhin in `startzeit` und `endzeit_berechnet` gespeichert. Planung (Beta)
  liest diese bestehenden Felder.
- Eine zentrale Warnungsableitung liefert maschinenlesbare Codes und fertige deutsche Meldungen:
  - `bringzeit_verpasst`: berechneter Start liegt nach `bring_zeit`.
  - `abholzeit_verpasst`: `endzeit_berechnet` liegt nach `abholung_zeit`.
  - Gleichheit mit der jeweiligen Richtzeit ist weiterhin erlaubt.
- Alle Oberflächen verwenden dieselben gelieferten Start-, End- und Warnungswerte, statt eigene
  Schwellen oder Faktoren nachzubauen.

## Oberflächen und Aktualisierung

### Zettel-Board

Mechaniker und Lehrlinge erscheinen als klar bezeichnete Spalten mit Queue, Last und Kapazität.
Warnungen stehen als Text am betroffenen Zettel, beispielsweise:

- `Bringzeit 09:00 nicht eingehalten – frühester Start 10:15`
- `Abholzeit 16:00 nicht erreichbar – fertig ca. 16:30`

### Planung (Beta)

Aufträge erscheinen zeitlich und in Queue-Reihenfolge. Warnungen erscheinen zusätzlich als
Kartenmarkierung und im vorhandenen Warnungsbanner. Die Ansicht und ihre bisherigen
Drag-&-Drop-Funktionen bleiben erhalten.

### Tablet

Der aktuelle und der nächste Auftrag zeigen dieselben Warnungen. Dies gilt für Mechaniker und
Lehrlinge. Aktualisiert wird über die vorhandenen Änderungen und den bestehenden Refresh.

Warnungen blockieren nicht automatisch und verschieben keine Aufträge eigenständig.

## Fehlerbehandlung und Transaktionen

- Unbekannte Personen, ungültige IDs und ungültige Zeit-/Datumsangaben werden vor dem Schreiben
  abgelehnt.
- Queue-Änderungen bleiben atomar und prozessintern serialisiert. Eine fehlgeschlagene
  Neuzeitberechnung darf nicht als erfolgreiche Planung gemeldet werden.
- Bestehende Fehler- und Response-Muster werden wiederverwendet. Es gibt keinen API-Key im
  Frontend und keine neue externe Abhängigkeit.

## Verifikation

Automatisierte Tests werden vor der jeweiligen Implementierung geschrieben und zunächst rot
beobachtet:

1. Mechaniker- und Lehrlings-Queues bleiben getrennt; Zuweisen, Einfügen und vollständiges
   Sortieren funktionieren für beide.
2. Nebenzeit und Aufgabenbewältigung verändern Dauer und Last nach den bestehenden Regeln.
3. Bringzeit als frühester Start, späterer Start mit Warnung und zulässige Gleichheit.
4. Abholzeit exakt erreicht ohne Warnung beziehungsweise überschritten mit Warnung.
5. Dieselben Start-, End- und Warnungswerte erscheinen in Queue, Planung und Tablet.
6. Queue-, Status- und Stempeländerungen aktualisieren betroffene Ansichten; zwei Browser bleiben
   synchron.
7. Unbekannte Ressourcen und ungültige Eingaben erzeugen keine Schreibzugriffe oder Events.

Danach folgen Frontend-Build, vollständige Backend-/Frontend-/Tablet-Tests und eine echte
Browserprüfung mit Mechaniker, Lehrling, zwei Browsern und Tablet-Größe. Produktiv-Deployment
und Tablet-Release sind separat freizugeben.

## Rollback

Der Code kann über einen Revert der Feature-Commits zurückgenommen werden. Die Migration ist
additiv; ihr Index kann nach einem Code-Rollback ungenutzt bleiben. Vor einer
Produktivmigration ist weiterhin ein Backup mit WAL-Checkpoint erforderlich.
