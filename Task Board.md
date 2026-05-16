# Task Board - Werkstatt-Terminplaner

## Today

- [ ] Produktionsfixes im Browser nach Hard-Reload testen: Kalender-Umschalter, Kalender-Kundensuche, Neuer-Kunde-Modal
- [ ] Lokale Aenderungen sortieren, committen und falls gewuenscht pushen
- [ ] Neuen PDF-Testauftrag ueber `\\100.124.168.108\Werkstatt-Upload\Auftraege` importieren und pruefen

## Backlog

- [ ] Entscheiden, ob geloeschte Testimporte 670/671 wiederhergestellt oder im Papierkorb gelassen werden (vom 2026-05-16 verschoben, nicht kritisch fuer heutige Kalenderfixes)
- [ ] Lokale Backend-Testdatenbank/Schema-Probleme untersuchen, damit `npm test` wieder komplett nutzbar wird (vom 2026-05-16 verschoben, groesserer separater Block)
- [ ] WebSocket-Event-Naming vereinheitlichen (Unterstrich -> Punkt-Notation, alte Events bereinigen)
- [ ] Frontend `app.js` Monolith evaluieren - ggf. in Teilkomponenten aufteilen
- [ ] Jest-Test-Coverage erhoehen

## Done (letzte 2 Wochen)

- [x] Kalender-Neutermin: Kundenanlage aus Suche ermoeglicht und Modal in Vordergrund gebracht
- [x] Kalender-Neutermin: Kundensuche/Kennzeichensuche an Terminplanung angeglichen
- [x] Kalender-Ansichtsschalter Zeitleiste/Liste/Mitarbeiter repariert
- [x] Kalender-Monatsansicht zeigt verfuegbare Mitarbeiter und Lehrlinge farblich an
- [x] Kalender-Crash bei fehlendem `kalenderState` behoben
- [x] Zeitverwaltung zeigt Fallback-Stempelzeiten fuer manuell/fertig gesetzte Zeiten
- [x] PDF-Auftragsimport umgesetzt: Netzwerkordner, Parser, `Auftrageingang`, Schnellanlage, Locosoft-Pruefordner
- [x] PDF-Importordner fuer Linux/Samba konfiguriert: `/opt/werkstatt-upload/Auftraege`
- [x] PDF-Arbeitszeitregeln umgesetzt: AU/HU/HA max. 30 min; Wartung als Gesamtposition inkl. Unterpunkte
- [x] PDF-Importe fuer heutige Zeitverwaltung sichtbar gemacht
- [x] PDF-Importe werden beim Anlegen als heutige `Nicht zugeordnet`-Auftraege erstellt statt schwebend
- [x] Beispiel-PDFs fuer Auftragsimport in `beispiel-auftraege/` abgelegt
- [x] Parser-Prototyp fuer echte Locosoft-Beispiele gebaut und mit 4 PDFs getestet
- [x] `neuerKundeModal` - Kunden direkt aus Terminformular anlegen (Popup-Workflow)
- [x] Tagesansicht Mitarbeiter-Spalten Toggle (MA-Modus mit Stempelzeiten)
- [x] Mitarbeiter-Karten in Planung
- [x] Interne Termine in Planung-Karten und Zeitleiste mit Arbeit anzeigen
- [x] Monatsansicht aufraeumen (Mini-Termine raus, Auslastung prominenter)
