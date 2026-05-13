# Vorplan: PDF-Auftragsimport fuer Schnelltermine

## Ziel

Werkstatt-Auftragsbestaetigungen sollen aus einem ueberwachten Netzwerkordner automatisch importiert werden. Locosoft druckt die Auftragsbestaetigung per PDF-Drucker direkt in diesen Ordner. Der Server erkennt neue PDFs, liest daraus automatisch die wichtigsten Daten und erzeugt daraus nach einer Pruefung einen Schnelltermin oder ordnet die PDF einem vorhandenen Termin zu.

Der erzeugte Schnelltermin soll standardmaessig als schwebender Termin im Schnelltermin-Pool landen und spaeter im Planmodus per Drag and Drop auf Tag, Uhrzeit und Mitarbeiter gezogen werden koennen. Alternativ soll ein Auftrag direkt per Softstart einem Mitarbeiter zugewiesen und gestartet werden koennen.

## Grundannahmen

- Es werden keine schlechten/gescannten PDFs verarbeitet.
- OCR ist fuer die erste Version nicht erforderlich.
- PDFs werden nicht manuell hochgeladen.
- Locosoft speichert PDFs ueber einen PDF-Drucker automatisch in einem Netzwerkordner.
- Der Server ueberwacht diesen Ordner und importiert neue PDFs automatisch.
- Ein manueller Upload kann spaeter optional bleiben, ist aber nicht der Hauptablauf.
- PDFs werden im normalen Auftrags-Import-Ordner abgelegt.
- PDFs, die nicht sauber erkannt werden oder in Locosoft geprueft werden sollen, werden in einen separaten Server-Ordner verschoben.
- Kein Auftrag wird blind automatisch als fester Termin angelegt.
- Der Import zeigt immer zuerst eine Vorschau mit Korrekturmoeglichkeit.
- Vor dem Erstellen eines neuen Schnelltermins muss immer geprueft werden, ob bereits ein passender Termin existiert.

## Server- und Netzwerkordner

Geplante Ordner unter dem Datenverzeichnis des Servers:

```text
/var/lib/werkstatt-terminplaner/uploads/auftraege
/var/lib/werkstatt-terminplaner/uploads/auftraege/locosoft-pruefen
```

Der Ordner `uploads/auftraege` soll als Netzwerkfreigabe erreichbar sein, damit Windows/Locosoft dort direkt PDFs speichern kann.

Beispiel-Freigabe:

```text
\\werkstatt-server\auftraege
```

Oder per Server-IP:

```text
\\100.124.168.108\auftraege
```

Locosoft-Ablauf:

```text
Auftragsbestaetigung drucken
-> PDF-Drucker "Werkstatt-Auftrag"
-> Speicherziel: \\server\auftraege
-> Server erkennt neue PDF automatisch
```

Die Implementierung soll das bestehende `dataDir` aus `backend/src/config/database.js` verwenden, damit lokale Entwicklung, Windows/Electron und Linux-Produktion korrekt funktionieren.

Logische Pfade:

```text
<dataDir>/uploads/auftraege
<dataDir>/uploads/auftraege/locosoft-pruefen
```

## Gewuenschter Ablauf

1. Benutzer druckt in Locosoft die Auftragsbestaetigung.
2. Als Drucker wird ein PDF-Drucker gewaehlt, der automatisch in den Netzwerkordner speichert.
3. Server erkennt eine neue PDF im Auftragsordner.
4. Server wartet, bis die Datei vollstaendig geschrieben ist.
5. Backend extrahiert Text aus der PDF.
6. Backend erkennt moegliche Felder.
7. Backend sucht passende vorhandene Termine.
8. Frontend zeigt den Import im Auftrageingang inklusive moeglicher Treffer.
9. Benutzer entscheidet:
   - `Als Schnelltermin speichern`
   - `Jetzt starten`
   - `Vorhandenem Termin zuordnen`
   - `Zu Locosoft-Pruefung`
   - `Verwerfen`
10. Bei vorhandenem passendem Termin:
   - Es wird kein neuer Termin erstellt.
   - Die PDF wird dem vorhandenen Termin zugeordnet.
   - Fehlende/zusaetzliche Informationen aus der PDF werden am Termin ergaenzt oder als Import-Notiz vorgeschlagen.
   - Der Benutzer bestaetigt vor dem Speichern, welche Felder uebernommen werden.
11. Bei Schnelltermin:
   - Termin wird als `ist_schwebend = 1` gespeichert.
   - PDF bleibt im normalen Auftrags-Import-Ordner.
   - Import wird mit Termin-ID verknuepft.
12. Bei Jetzt starten:
   - Termin wird fuer heute erstellt.
   - Mitarbeiter wird ausgewaehlt.
   - Status wird auf `in_arbeit` gesetzt.
   - Startzeit wird auf jetzt gesetzt.
   - PDF bleibt im normalen Auftrags-Import-Ordner.
13. Bei Locosoft-Pruefung:
   - PDF wird nach `locosoft-pruefen` verschoben.
   - Es wird kein Termin erzeugt.

## Watch-Ordner statt Upload

Der Hauptimport laeuft ueber einen Watch-Ordner.

Technischer Ablauf:

1. Server startet und stellt sicher, dass die Ordner existieren.
2. Server ueberwacht `<dataDir>/uploads/auftraege`.
3. Wenn eine neue `.pdf` erscheint, wird sie zunaechst nicht sofort gelesen.
4. Server prueft, ob die Datei stabil ist:
   - Dateigroesse bleibt fuer einige Sekunden gleich.
   - Datei laesst sich exklusiv/lesbar oeffnen.
5. Erst dann wird sie importiert.
6. Importierte Dateien werden in `auftragsimporte` gespeichert.
7. Doppelte Importe werden ueber Dateiname, Groesse und optional Hash verhindert.

Wichtig: PDF-Drucker schreiben Dateien oft in mehreren Schritten. Deshalb ist die Stabilitaetspruefung Pflicht, sonst liest der Server halbfertige PDFs.

## Dubletten- und Zuordnungslogik

Bevor aus einem Import ein neuer Schnelltermin entsteht, muss das System nach vorhandenen Terminen suchen.

Prioritaet 1: sehr sicherer Treffer

```text
Datum gleich
Kundenname gleich oder sehr aehnlich
Kennzeichen/Fahrzeug gleich
```

Wenn diese drei Punkte passen, wird der Import dem vorhandenen Termin zugeordnet. Es wird kein neuer Termin erstellt.

Prioritaet 2: wahrscheinlicher Treffer

```text
Datum gleich
Kennzeichen gleich
Name fehlt oder ist leicht abweichend
```

Oder:

```text
Datum gleich
Name gleich
Fahrzeugtyp/VIN gleich
Kennzeichen fehlt
```

Dann zeigt die Vorschau den Treffer als Vorschlag, aber der Benutzer muss bestaetigen.

Prioritaet 3: unsicherer Treffer

```text
Name gleich
Kennzeichen gleich
Datum abweichend oder fehlt
```

Dann wird der Treffer nur als Hinweis angezeigt. Standardaktion bleibt neuer schwebender Schnelltermin, sofern der Benutzer nichts anderes auswaehlt.

Bei Zuordnung zu einem vorhandenen Termin sollen nur zusaetzliche Informationen ergaenzt werden. Bestehende wichtige Felder duerfen nicht still ueberschrieben werden.

Moegliche Ergaenzungen:

```text
auftragsnummer
vin
fahrzeugtyp
telefon
arbeit/zusatzarbeiten
umfang/notizen
bring_zeit
abholung_zeit
ersatzauto
PDF-Verknuepfung
```

Wenn ein Feld im Termin bereits befuellt ist und die PDF einen anderen Wert liefert, muss der Vorschau-Dialog einen Konflikt anzeigen:

```text
Bestehender Wert: ...
PDF-Wert: ...
Aktion: behalten / PDF uebernehmen / als Notiz anhaengen
```

## Zu erkennende Datenfelder

Erste Zielliste:

```text
kunde_name
kunde_telefon
kennzeichen
fahrzeugtyp
vin
auftragsnummer
datum
arbeit
umfang
geschaetzte_zeit
ersatzauto
abholung_typ
bring_zeit
abholung_zeit
```

Pflichtfelder fuer einen verwertbaren Schnelltermin:

```text
arbeit
geschaetzte_zeit oder schaetzbarer Arbeitsumfang
```

Sehr wichtige Felder:

```text
kennzeichen
kunde_name
auftragsnummer
```

Optionale Felder:

```text
telefon
fahrzeugtyp
vin
datum
ersatzauto
bring_zeit
abholung_zeit
umfang/notizen
```

## Erkenntnisse aus echten Beispielen

Stand 2026-05-13: Es liegen 4 Locosoft-Auftragsbestaetigungen in `beispiel-auftraege/` vor.

Text-Extraktion:

- `pdf-parse@1.1.1` kann aus allen 4 PDFs Text extrahieren und passt zur dokumentierten Linux-Backend-Runtime ab Node 18.
- Die PDFs sind keine Scans; OCR ist fuer diese Beispiele nicht erforderlich.
- Umlaute kommen in der PowerShell-Ausgabe teils falsch codiert an, die Feldstruktur bleibt aber stabil erkennbar.

Linux-Produktionshinweise:

- Vor Deployment auf `100.124.168.108` `node -v` pruefen; der Server ist als Linux/systemd-Zielumgebung massgeblich.
- Keine Windows-Pfade verwenden; Importordner immer ueber `dataDir` aus `backend/src/config/database.js` ableiten.
- Watch-Service muss mit Linux-Dateisystemrechten und Samba/Netzwerkfreigabe zusammenspielen: Schreibrechte fuer Locosoft/PDF-Drucker, Leserechte fuer den Node-systemd-Prozess.
- Datei-Stabilitaetspruefung bleibt Pflicht, weil PDFs ueber Netzwerkfreigaben auf Linux nicht zwingend atomar fertig geschrieben werden.
- Native optionale PDF-Abhaengigkeiten vermeiden, solange reine Text-Extraktion reicht.

Stabil erkannte Felder:

```text
kunde_name / kundenblock
datum
abholung_zeit
auftragsnummer
kundennummer
kennzeichen
vin
fahrzeugtyp
km_stand
arbeit / arbeitsblock
```

Wiederkehrende Textanker:

```text
Datum:
Berater:
Auftragsbestaetigung Nr.
Kd.Nr.:
unv. Bringtermin:
unv. Abholtermin:
Fg-Nr:
km-Stand:
Dienstleistung/Benennung
durchzufuehrende Arbeiten
Auftragssumme netto
```

Beobachtete Layout-Varianten:

- Wartungs-/Teileauftraege nutzen Positionszeilen mit `Dienstleistung/Benennung`, `Zwischensumme Position`, Teilezeilen und Summen.
- Kleine Arbeiten koennen als einfacher Block `durchzufuehrende Arbeiten` erscheinen.
- Reifen-/Check-Auftraege koennen eine Dienstleistungs-Zwischensumme und danach einen separaten Teileblock enthalten.
- Firmenkunden enthalten zusaetzliche Namenszeilen, z.B. Firma plus Ansprechpartner.

Parser-Konsequenz fuer Version 1:

- Erst Header-Felder ueber feste Textanker extrahieren.
- Kundenblock als Zeilen vor `Datum:` lesen und daraus Anrede/Firma/Name/Adresse getrennt ableiten.
- Arbeitsblock zwischen Tabellenkopf und erster Summe extrahieren; danach je Layout normalisieren.
- Fuer Arbeiten sowohl eine kompakte Zusammenfassung (`arbeit.summary`) als auch einzelne Arbeitspositionen (`arbeit.items`) erzeugen.
- Material-/Teilezeilen fuer Termin-Arbeiten ausblenden, aber spaeter optional im Import-Detail als Rohtext anzeigen.
- Wenn keine Arbeitszeit aus dem PDF erkannt wird, muessen die erkannten `arbeit.items` gegen die Systemtabelle `arbeitszeiten` gematcht werden.
- Das Ergebnis speichert pro Position `dauer_minuten`, `zeit_quelle` und optional den passenden `zeit_match`; die Summe wird als `geschaetzte_zeit` fuer den Termin verwendet.
- AU/HU/HA duerfen fuer den Terminimport maximal 30 Minuten zaehlen, auch wenn Systemzeiten hoeher hinterlegt sind.
- Wartung ist eine Gesamtposition. Unterpunkte wie Pollenfilter, Bremsfluessigkeit, Oelfilter, Innenraumfilter, Kraftstofffilter oder weitere Filter gehoeren in die Wartung und duerfen nicht zusaetzlich zur Termindauer addiert werden.
- Nur wenn keine Systemzeit passt, darf ein klar markierter Fallback genutzt werden, damit der Auftrageingang die Schaetzung sichtbar korrigierbar macht.
- Kennzeichen ueber die Zeile vor `Fg-Nr:` ableiten, VIN ueber 17-stelliges Muster nach `Fg-Nr:`.
- Bringtermin ist in den Beispielen leer; Abholtermin ist verwertbar.

## Datenmodell-Vorschlag

Neue Tabelle per Migration:

```sql
CREATE TABLE auftragsimporte (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  termin_id INTEGER NULL,
  original_dateiname TEXT NOT NULL,
  dateipfad TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'neu',
  text_extract TEXT,
  erkannte_daten TEXT,
  fehler TEXT,
  zuordnungs_treffer TEXT,
  dateigroesse INTEGER,
  datei_hash TEXT,
  erstellt_am TEXT DEFAULT CURRENT_TIMESTAMP,
  verarbeitet_am TEXT,
  FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE SET NULL
);
```

Moegliche Statuswerte:

```text
neu
erkannt
verarbeitet
locosoft_pruefen
verworfen
fehler
```

## Backend-Entwurf

Neue Route:

```text
GET  /api/auftragsimport
GET  /api/auftragsimport/:id
GET  /api/auftragsimport/:id/treffer
POST /api/auftragsimport/:id/schnelltermin
POST /api/auftragsimport/:id/zuordnen
POST /api/auftragsimport/:id/softstart
POST /api/auftragsimport/:id/locosoft-pruefen
POST /api/auftragsimport/:id/verwerfen
POST /api/auftragsimport/scan
```

Neue Dateien:

```text
backend/src/routes/auftragsimportRoutes.js
backend/src/controllers/auftragsimportController.js
backend/src/models/auftragsimportModel.js
backend/src/services/pdfAuftragsImportService.js
backend/src/services/auftragsParserService.js
backend/src/services/auftragsZuordnungService.js
backend/src/services/auftragsWatchService.js
backend/migrations/0XX_auftragsimporte.js
```

Voraussichtliche Abhaengigkeiten:

```text
pdf-parse
chokidar
```

`multer` ist nur noetig, falls spaeter zusaetzlich ein manueller Upload angeboten werden soll.

Sicherheitsregeln:

- Nur PDF-Dateien aus dem Watch-Ordner importieren.
- Dateigroesse begrenzen, z.B. 10 MB oder 20 MB.
- Dateinamen normalisieren.
- Keine Original-Dateinamen direkt als Serverpfad verwenden.
- Import-Endpunkte mit passendem Rate-Limiter schuetzen.
- Bei produktivem Schreibzugriff API-Key/Auth pruefen, falls passend zum bestehenden Sicherheitsmodell.
- Doppelte Dateien nicht mehrfach importieren.
- Halbfertige PDF-Dateien nicht lesen.

## Parser-Strategie fuer Version 1

Erst regelbasiert, ohne KI:

- Telefonnummer per Regex.
- Kennzeichen per Regex und Normalisierung.
- VIN per 17-stelligem VIN-Muster.
- Datum per deutschem Datumsformat.
- Auftragsnummer ueber Begriffe wie `Auftrag`, `Auftragsnummer`, `AB-Nr`, `Beleg`.
- Arbeiten aus Positions-/Leistungszeilen oder bekannten Abschnittsueberschriften.
- Zeit entweder direkt aus Dokument oder ueber bestehende Standardzeiten/Arbeitszeiten schaetzen.

Spaeter moeglich:

- Layout-spezifische Parser fuer Locosoft-/Werkstatt-Formulare.
- Optional KI/Ollama/OpenAI fuer bessere Feldzuordnung.
- Mehrere Parser-Profile je Dokumenttyp.

## Frontend-Entwurf

Im Bereich `Termine` wird ein neuer Subtab `Auftrageingang` empfohlen.

```text
Auftrageingang
```

Inhalt:

```text
Automatisch erkannte PDFs aus dem Netzwerkordner

[Neu scannen]
[Ordnerpfad anzeigen]

Liste:
- Neu
- Erkannt
- Termin gefunden
- Konflikt
- Locosoft-Pruefung
- Verarbeitet
```

Nach automatischem Import:

```text
Erkannte Daten pruefen

Moeglicher vorhandener Termin:
Termin-Nr / Datum / Kunde / Kennzeichen / Arbeit
[Diesem Termin zuordnen]

Kunde
Telefon
Kennzeichen
Fahrzeug
VIN
Auftragsnummer
Datum
Arbeiten
Notizen
Geschaetzte Zeit

[Als Schnelltermin speichern]
[Jetzt starten]
[Vorhandenem Termin zuordnen]
[Zu Locosoft-Pruefung]
[Verwerfen]
```

Schnelltermin-Speicherung:

```js
{
  ist_schwebend: 1,
  datum: "9999-12-31",
  status: "geplant",
  schwebend_prioritaet: "mittel"
}
```

Softstart:

```js
{
  ist_schwebend: 0,
  datum: heute,
  status: "in_arbeit",
  mitarbeiter_id: ausgewaehlterMitarbeiter,
  startzeit: aktuelleUhrzeit
}
```

## Auftrageingang / Pruef-Tab

Der Tab `Auftrageingang` ist die Kontrollstelle fuer alle automatisch erkannten PDFs aus dem Netzwerkordner.

Ziel des Tabs:

- Neue PDF-Importe sehen.
- Erkennung pruefen.
- Falsche oder fehlende Daten korrigieren.
- Vorhandene Termine zuordnen.
- Schnelltermine erstellen.
- Auftraege direkt starten.
- Unbrauchbare PDFs nach `locosoft-pruefen` verschieben.

### Aufbau des Tabs

Empfohlene Bereiche:

```text
Toolbar
Import-Liste
Pruefbereich / Detailansicht
PDF-Vorschau oder Textauszug
Aktionen
```

### Toolbar

Oben im Tab:

```text
[Neu scannen] [Nur offene] [Konflikte] [Locosoft-Pruefung] [Alle]
Suchfeld: Kunde, Kennzeichen, Auftragsnummer
```

Anzeigen:

```text
Offen: X
Termin gefunden: X
Konflikte: X
Locosoft-Pruefung: X
```

### Import-Liste

Jede erkannte PDF erscheint als Zeile oder Karte:

```text
Status
Dateiname
Erkannt am
Kunde
Kennzeichen
Auftragsnummer
Datum
Erkannte Arbeiten
Moeglicher Termin-Treffer
Warnungen
```

Statuswerte in der Liste:

```text
Neu
Erkannt
Termin gefunden
Konflikt
Bereit fuer Schnelltermin
Verarbeitet
Locosoft-Pruefung
Fehler
Verworfen
```

### Detailansicht

Wenn ein Import ausgewaehlt wird, zeigt die Detailansicht die erkannten Daten und die moegliche Termin-Zuordnung.

Bearbeitbare Felder:

```text
Kunde
Telefon
Kennzeichen
Fahrzeugtyp
VIN
Auftragsnummer
Datum
Bringzeit
Abholzeit
Abholungstyp
Ersatzauto ja/nein
Prioritaet
Arbeiten
Geschaetzte Zeit
Notizen/Umfang
```

Die Felder sollen aus der PDF vorbefuellt sein, aber manuell korrigierbar bleiben.

### Arbeiten Bearbeiten

Arbeiten sollen nicht nur als ein langer Text angezeigt werden, sondern als Liste:

```text
[ ] Inspektion                  90 min
[ ] Bremsen vorne pruefen       30 min
[ ] Oelwechsel                  30 min
```

Moegliche Anpassungen:

- Arbeit umbenennen.
- Arbeit loeschen.
- Arbeit hinzufuegen.
- Zeit je Arbeit anpassen.
- Reihenfolge aendern.
- Arbeit als Zusatzinfo/Notiz statt Termin-Arbeit markieren.

Gesamtzeit wird automatisch aus den Arbeiten berechnet, kann aber manuell ueberschrieben werden.

### Termin-Treffer Pruefen

Wenn das System einen vorhandenen Termin findet, soll der Tab PDF-Daten und Termin-Daten vergleichen:

```text
PDF-Daten                  Vorhandener Termin
Kunde: Max Mustermann      Max Mustermann
Datum: 2026-05-13          2026-05-13
Kennzeichen: BOR AB 123    BOR AB 123
Arbeit: Oelwechsel         Inspektion
```

Moegliche Aktionen:

```text
[Diesem Termin zuordnen]
[Anderen Termin suchen]
[Trotzdem neuer Schnelltermin]
```

Bei Konflikten soll pro Feld entschieden werden koennen:

```text
Bestehenden Wert behalten
PDF-Wert uebernehmen
PDF-Wert als Notiz anhaengen
Ignorieren
```

### Manuelle Termin-Suche

Falls der automatische Treffer falsch ist oder keiner gefunden wurde:

```text
Termin suchen nach:
- Name
- Kennzeichen
- Datum
- Auftragsnummer
```

Ergebnisliste:

```text
Termin-Nr
Datum
Kunde
Kennzeichen
Arbeit
Status
Mitarbeiter
```

Dann kann der Import manuell einem bestehenden Termin zugeordnet werden.

### PDF-Vorschau / Textauszug

Der Pruef-Tab sollte mindestens den extrahierten Text anzeigen.

Optional spaeter:

- PDF direkt im Browser anzeigen.
- Erkannte Textstellen markieren.
- Originaldatei oeffnen/downloaden.

Fuer Version 1 reicht:

```text
Original-Dateiname
Dateipfad
Extrahierter Text
```

### Hauptaktionen

Unten oder rechts im Detailbereich:

```text
[Aenderungen speichern]
[Vorhandenem Termin zuordnen]
[Als Schnelltermin speichern]
[Jetzt starten]
[Zu Locosoft-Pruefung]
[Verwerfen]
```

`Aenderungen speichern`

- Speichert korrigierte Erkennungsdaten am Import.
- Erstellt noch keinen Termin.

`Vorhandenem Termin zuordnen`

- Verknuepft PDF/Import mit bestehendem Termin.
- Fuegt nur bestaetigte Zusatzinfos hinzu.
- Erstellt keinen neuen Termin.

`Als Schnelltermin speichern`

- Erstellt schwebenden Termin.
- Setzt `ist_schwebend = 1`.
- Termin erscheint im Schnelltermin-Pool/Planmodus.

`Jetzt starten`

- Fragt Mitarbeiter ab.
- Setzt Datum auf heute.
- Setzt Status auf `in_arbeit`.
- Setzt Startzeit auf jetzt.

`Zu Locosoft-Pruefung`

- Verschiebt PDF nach `locosoft-pruefen`.
- Markiert Import als `locosoft_pruefen`.
- Erstellt keinen Termin.

`Verwerfen`

- Markiert Import als verworfen.
- Loescht die PDF nicht automatisch, ausser dies wird spaeter bewusst gewuenscht.

### Warnungen

Der Tab soll sichtbare Warnungen anzeigen, wenn wichtige Daten fehlen:

```text
Kein Kennzeichen erkannt
Kein Kunde erkannt
Kein Datum erkannt
Keine Arbeiten erkannt
Zeit nur geschaetzt
Moeglicher Dubletten-Treffer
Konflikt mit vorhandenem Termin
```

### Was Dort Angepasst Werden Kann

Im Pruef-Tab darf der Benutzer anpassen:

- Kunde und Telefon
- Kennzeichen und Fahrzeugdaten
- Datum und Zeiten
- Auftragsnummer
- Arbeitsliste
- Zeit je Arbeit
- Gesamtzeit
- Prioritaet
- Notizen
- Ersatzauto-Information
- Zuordnung zu vorhandenem Termin
- Status `Locosoft-Pruefung`

Nicht direkt dort angepasst werden sollten:

- Mitarbeiter-Stammdaten
- Kunden-Stammdaten im grossen Umfang
- Komplexe Terminplanung per Kalender
- Migrations-/Systemdaten

Fuer solche Faelle soll der Tab nur verlinken:

```text
Kunde oeffnen
Termin oeffnen
Im Planmodus anzeigen
```

## Integration mit Planmodus

Der Import soll keine neue Planungslogik einfuehren. Er nutzt vorhandene schwebende Termine:

- Importierter Schnelltermin erscheint im Pool der schwebenden Termine.
- Bestehendes Drag and Drop hebt `ist_schwebend` auf.
- Beim Drop werden Datum, Mitarbeiter und Startzeit gesetzt.
- Auslastung zaehlt den Auftrag erst, wenn er fest eingeplant ist.

## Umsetzungsphasen

### Phase 1: Netzwerkordner und Beispiele klaeren

Sobald echte PDFs vorliegen:

- Gewuenschten Freigabenamen festlegen, z.B. `auftraege`.
- Klaeren, welcher PDF-Drucker unter Windows/Locosoft genutzt wird.
- Pruefen, ob der PDF-Drucker ohne Rueckfrage immer in den Ordner speichern kann.
- Textauszug pruefen.
- Wiederkehrende Feldnamen markieren.
- Pflichtfelder final festlegen.
- Entscheiden, ob ein Parser reicht oder mehrere Profile noetig sind.

### Phase 2: Backend-Grundlage

- Migration `auftragsimporte`.
- Watch-Ordner-Service.
- Manueller Scan-Endpunkt.
- PDF-Text-Extraktion.
- Dateiablage unter `dataDir`.
- Statuswechsel und Verschieben nach `locosoft-pruefen`.
- Doppelte Importe erkennen.
- Stabilitaetspruefung fuer frisch gedruckte PDFs.

### Phase 3: Parser Version 1

- Regex-/Regelparser.
- Rueckgabe mit `confidence`/Warnungen.
- Arbeitszeit-Schaetzung ueber vorhandene Arbeitszeiten.
- Zuordnungslogik fuer vorhandene Termine: Name + Datum + Auto/Kennzeichen zuerst pruefen.
- Konflikte zwischen vorhandenem Termin und PDF-Daten fuer die Vorschau vorbereiten.

### Phase 4: Frontend-Vorschau

- Neuer Subtab `Auftrageingang`.
- Liste automatisch erkannter PDFs.
- Button `Neu scannen`.
- Vorschau-/Bearbeiten-Dialog.
- Moegliche vorhandene Termine anzeigen.
- Zuordnung zu bestehendem Termin erlauben.
- Konflikte sichtbar machen und Felduebernahme bestaetigen lassen.
- Speichern als schwebender Schnelltermin.
- Zu Locosoft-Pruefung verschieben.

### Phase 5: Softstart

- Mitarbeiter-Auswahl.
- Startzeit jetzt.
- Termin direkt `in_arbeit`.
- Bestehende Zeitstempel-/Statuslogik korrekt verwenden.

### Phase 6: Feinschliff

- Duplikatpruefung gegen bestehende Termine.
- Import-Historie anzeigen.
- Parser verbessern.
- Optional KI-Unterstuetzung.

## Offene Punkte fuer spaetere PDF-Besprechung

- Wie soll die Netzwerkfreigabe heissen?
- Welcher PDF-Drucker wird fuer Locosoft genutzt?
- Kann der PDF-Drucker automatisch ohne Rueckfrage in den Ordner speichern?
- Wie sollen Dateinamen entstehen, z.B. Auftragsnummer, Kunde, Datum?
- Wie heissen Auftragsnummern in den echten PDFs?
- Ist das Kennzeichen immer vorhanden?
- Ist der Kundenname im PDF identisch zum vorhandenen Termin oder gibt es typische Abweichungen?
- Welches Datum soll fuer den Abgleich genutzt werden, wenn mehrere Daten im PDF stehen?
- Stehen Arbeiten als Tabelle oder Fliesstext?
- Gibt es eine klare Summe der Arbeitswerte/Zeiten?
- Gibt es immer einen Kundenblock?
- Sind Telefonnummern immer enthalten?
- Gibt es Ersatzwagen-Informationen?
- Gibt es Bring-/Abholzeiten im Dokument?
- Soll die PDF spaeter am Termin sichtbar/downloadbar sein?
- Soll `locosoft-pruefen` im Frontend als Liste sichtbar sein oder reicht der Server-Ordner?

## Erste sinnvolle Minimalversion

Minimaler Nutzen mit kleinem Risiko:

1. Netzwerkordner auf dem Server bereitstellen.
2. PDF-Drucker in Locosoft auf diesen Ordner ausrichten.
3. Server-Watch-Service erkennt neue PDFs.
4. Text extrahieren.
5. Vorhandene Termine ueber Name + Datum + Auto/Kennzeichen suchen.
6. Auftrageingang zeigt Vorschau mit moeglichem Treffer.
7. Entweder vorhandenem Termin zuordnen oder manuell korrigieren.
8. Falls kein Treffer passt: als schwebenden Schnelltermin speichern.
9. PDF im normalen Auftrags-Import-Ordner behalten.
10. Unbrauchbare PDFs nach `locosoft-pruefen` verschieben.

Alles Weitere kann danach anhand echter Auftragsbestaetigungen verbessert werden.
