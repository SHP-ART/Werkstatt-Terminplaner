# Zettel-Board: Mitarbeiter oben, neue Zettel unten

## Ziel

Auf der Zettel-Board-Seite stehen alle Mitarbeiter und Lehrlinge oben nebeneinander. Ihre zugewiesenen Zettel bleiben in der jeweiligen Spalte sichtbar. Der gemeinsame Bereich `NEU` liegt unterhalb der Personenbereiche und enthält die neuen Zettel zum Draufziehen.

## Darstellung

```text
[ Mitarbeiter 1 ] [ Mitarbeiter 2 ] [ Lehrling ]
[ eigene Zettel ] [ eigene Zettel ] [ eigene Zettel ]

NEU – Zettel zum Draufziehen
[ neuer Zettel ] [ neuer Zettel ] [ neuer Zettel ]
```

Die Personenbereiche behalten Name, Auslastung, Warnungen, laufende und auf morgen verschobene Zettel. Bei geringer Fensterbreite darf die Personenreihe wie bisher horizontal scrollen. Der NEU-Bereich nutzt die verfügbare Breite unterhalb der Personen.

## Umsetzung

Die Änderung bleibt auf das Frontend beschränkt:

- `frontend/src/features/warteschlange/warteschlangeFeature.js` trennt die gerenderten Personenbereiche vom NEU-Bereich und ordnet sie in der freigegebenen Reihenfolge an.
- `frontend/src/styles/style.css` ordnet die Personen in einer Reihe an und setzt den NEU-Bereich darunter.
- Die vorhandenen DOM-Attribute für Drag & Drop und die Warteschlangen-API bleiben unverändert.
- Backend, Datenmodell und Tablet-App werden nicht geändert.

## Erhaltenes Verhalten

- Neue Zettel können weiterhin auf Mitarbeiter und Lehrlinge gezogen werden.
- Zugewiesene Zettel können innerhalb ihrer Spalte sortiert und an andere Personen übergeben werden.
- Auslastungsbalken, Zeitwarnungen, Kollegenauswahl und Auftragsimporte funktionieren weiterhin.
- Leere Zustände und Ladefehler bleiben sichtbar.

## Verifikation

- Ein Frontend-Test prüft die Reihenfolge: Personenbereich vor NEU-Bereich; zugewiesene Zettel bleiben bei ihrer Person und neue Zettel im NEU-Bereich.
- Die vorhandenen Frontend-Tests für die Warteschlange müssen weiterhin bestehen.
- `npm run build` im Frontend muss erfolgreich sein.
- Die Anordnung und ein Drag & Drop vom NEU-Bereich zu einer Person werden im Browser geprüft, sofern eine lauffähige lokale Oberfläche verfügbar ist.
