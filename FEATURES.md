# FEATURES – Werkstatt-Terminplaner

Bestandsverzeichnis der vorhandenen Funktionen. **Zweck: Regressionsschutz.**
Vor einer Erweiterung hier nachsehen, was es schon gibt; nach der Erweiterung
prüfen, ob noch alles davon funktioniert.

Angelegt am 2026-08-05 aus `.claude/PROJEKT.md`, `CLAUDE.md` und den tatsächlich
gemounteten Routen (`backend/src/routes/index.js`). Bei jeder Änderung mitziehen.

Legende Teststatus:
`automatisiert` = durch Jest abgedeckt · `manuell` = nur über die Kernpfad-Liste in
CLAUDE.md Abschnitt 6 · `ungetestet` = keine Absicherung

---

## Terminverwaltung

| Funktion | Wo | Tests |
|---|---|---|
| Termine anlegen, bearbeiten, löschen (Soft-Delete) | `termineRoutes.js` → `termineController` | automatisiert (`tests/bugs/termine-crud.test.js`) |
| Termin-Status-Lifecycle `geplant → in_arbeit → wartend → abgeschlossen/storniert` | `termineController` | manuell |
| Split-Termine (Termin auf zwei Tage aufteilen) | `TermineModel.splitTermin()` | ungetestet |
| Schwebende Termine (ohne festen Tag, `ist_schwebend`) | `termineModel`, Prioritäten hoch/mittel/niedrig | ungetestet |
| Termin-Nummern `T-JJJJ-NNN` mit Race-Condition-Schutz (`retryOffset`) | `TermineModel.generateTerminNr()` | automatisiert (`tests/bugs/termin-nr-format.test.js`) |
| Wiederkehrende Terminserien | `wiederkehrendeTermineRoutes.js` | ungetestet |
| Papierkorb: gelöschte Termine ansehen und wiederherstellen | Tab `papierkorb` | manuell |
| Phasen je Termin (Bringen, Arbeit, Abholung) | `phasenRoutes.js` | ungetestet |
| Teileerfassung je Termin und Bestellverwaltung | `teileRoutes.js`, `teileBestellung.js` | ungetestet |

## Kapazität und Auslastung

Zwei bewusst getrennte Modelle – Details und Regeln in CLAUDE.md Abschnitt 4.

| Funktion | Wo | Tests |
|---|---|---|
| Tages-Minuten-Topf: belegte Zeit vs. Kapazität, Restzeit, Prozent | `utils/auslastung.js` | **automatisiert** (`tests/auslastung.test.js`, 21 Fälle) |
| Zeitslot-genaue Belegung: Intervalle je Person, freie Slots | `utils/belegung.js` | **automatisiert** (`tests/belegung.test.js`, 14 Fälle) |
| Doppelbuchungs-Warnung je Mitarbeiter/Lehrling | `findeUeberschneidungen()` | automatisiert |
| Warnung bei gleichzeitigen Warte-Kunden (`abholung_typ='warten'`) | `pruefeWarteKonflikt()` | automatisiert |
| Verfügbarkeitsprüfung beim Anlegen (`/api/termine/verfuegbarkeit`) | `termineController.checkAvailability` | teilweise (Kapazität über `berechneKapazitaet`) |
| Nebenzeit-Aufschlag, Servicezeit, Pufferzeit | `utils/auslastung.js`, Einstellungen | automatisiert |
| Lehrlings-Aufgabenbewältigung (wirkt auf die Zeit, nicht die Kapazität) | `verteileLehrlingZeiten()` | automatisiert |
| Freie-Kapazitäts-Panel (freie Slots je MA, Warte-Kunden-Engpass) | `/api/termine/belegung`, Tab Planung | manuell |

## Kunden und Fahrzeuge

| Funktion | Wo | Tests |
|---|---|---|
| Kunden CRUD | `kundenRoutes.js` | automatisiert (`tests/bugs/kunden-crud.test.js`) |
| Locosoft-CSV-Import | `kundenController` | ungetestet |
| Fahrzeuge CRUD, Zuordnung zu Kunden | `fahrzeuge.js`, `models/fahrzeug.js` | ungetestet |
| Globale Volltextsuche | `sucheRoutes.js` | ungetestet |

## Personal und Zeiten

| Funktion | Wo | Tests |
|---|---|---|
| Mitarbeiter CRUD, Flag `nur_service` | `mitarbeiterRoutes.js` | ungetestet |
| Lehrlinge inkl. `aufgabenbewaeltigung_prozent` und Berufsschul-Wochen | `lehrlingeRoutes.js` | ungetestet |
| Abwesenheiten (Urlaub, Krank, …) | `abwesenheitenRoutes.js` | ungetestet |
| Soll-Arbeitszeiten je Wochentag (`arbeitszeiten_plan`) | `arbeitszeitenPlanRoutes.js` | ungetestet |
| Schicht-Templates | `schichtTemplateRoutes.js` | ungetestet |
| Stempelzeiten je Arbeit (Start/Ende) | `stempelzeitenController` | automatisiert (`tests/stempelzeiten.test.js`) |
| Nachträgliches Stempeln | `stempelzeitenController` | automatisiert (`tests/nachstempel.test.js`) |
| Tagesstempel: Arbeitsbeginn/-ende, Unterbrechungen | `tagesstempelRoutes.js` | ungetestet |
| Pausenbuchung und Pausenanzeige | `arbeitspausen.js`, `pause.js` | automatisiert (`tests/arbeitspausen.test.js`, `tests/bugs/pause-hardcoded-30min.test.js`) |
| Pausen-Split bei Terminen über die Mittagspause | `utils/zeitBerechnung.js` | automatisiert (`tests/terminePauseSplit.test.js`) |
| Zeitkonto je Person | `zeitkontoController` | ungetestet |
| Nächster Arbeitstag (Feiertage/freie Tage) | – | automatisiert (`tests/bugs/naechster-arbeitstag.test.js`) |

## Ersatzfahrzeuge

| Funktion | Wo | Tests |
|---|---|---|
| Ersatzautos CRUD, Buchungen, Verfügbarkeitsprüfung | `ersatzautosRoutes.js` | teilweise (`tests/bugs/einstellungen-ersatzauto.test.js`) |

## Auftragsimport (PDF)

| Funktion | Wo | Tests |
|---|---|---|
| Watch-Ordner überwacht `/opt/werkstatt-upload/Auftraege` | `auftragsWatchService.js` | ungetestet |
| PDF parsen: Kunde, Kennzeichen, Arbeiten, AW-Zeiten, Auftragsnummer | `auftragsParserService.js` | automatisiert (`tests/auftragsParserService.test.js`) |
| Termin- bzw. Schwebend-Anlage je nach Datum | `auftragsImportService.js` | automatisiert (`tests/auftragsImportService.test.js`) |
| Korrektur erkannter Arbeiten, Schnelltermin, Zuordnung | `auftragsimportController.js` | ungetestet |

## KI-Funktionen (alle optional, nie betriebskritisch)

| Funktion | Wo | Tests |
|---|---|---|
| Lokales ML-Modell, trainiert täglich aus abgeschlossenen Terminen | `localAiService.js` | ungetestet |
| IQR-Ausreißerfilterung (ab 3 Samples) | `localAiService.js` | ungetestet |
| Externe KI-Zeitschätzung (Ollama lokal / OpenAI) | `externalAiService.js`, `ollamaService.js`, `openaiService.js` | ungetestet |
| KI-Dienst-Erkennung via mDNS | `kiDiscoveryService.js` | ungetestet |
| KI-gestützte Terminoptimierung | `kiPlanungRoutes.js` | teilweise (`tests/bugs/ki-planung-verbesserungen.test.js`) |

**Regel:** `externalAiService.js` gibt `null` zurück, wenn kein Dienst erreichbar ist –
jeder Aufrufer muss das abfangen.

## System und Betrieb

| Funktion | Wo | Tests |
|---|---|---|
| Backup erstellen (mit WAL-Checkpoint), Liste, Restore | `backupRoutes.js` | ungetestet |
| Migrationssystem (`migrations/`, aktuell bis 044) | `migrations/index.js` | **stillgelegt** (siehe `.claude/ERRORS.md`) |
| WebSocket-Live-Updates an alle Clients (`broadcastEvent`) | `utils/websocket.js` | ungetestet |
| Health-Check, Systeminfo, Serverstatus | `systemRoutes.js`, `status.js` | ungetestet |
| App-Einstellungen (Nebenzeit, Servicezeit, Pufferzeit, Mittagspause) | `einstellungenRoutes.js` | teilweise |
| Rate-Limiting (200/min, KI 30/min, System 5/min) | `middleware/rateLimiter.js` | automatisiert (`tests/middleware/`) |
| API-Key-Schutz für destruktive Endpunkte | `middleware/auth.js` | automatisiert (`tests/security/`) |
| Berichte und Auswertungen | `reportingRoutes.js` | ungetestet |

## Clients

| Funktion | Wo | Tests |
|---|---|---|
| Browser-Frontend (Vite-Build, Vanilla JS) | `frontend/` | ungetestet |
| Tabs: dashboard, heute, termine, kalender, kunden, zeitverwaltung, zeitstempelung, auslastung, intern, papierkorb, einstellungen, ersatzautos | `frontend/index.html` | manuell (Prüfbefehl in CLAUDE.md Abschnitt 4) |
| Electron-Desktop-App (optional) | `backend/electron-main.js` | ungetestet |
| Tablet-App (Windows ia32) mit Auto-Update | `electron-intern-tablet/` | teilweise (`tests/bugs/tablet-funktionen.test.js`) |
| Backend-Discovery für Electron | `backendDiscoveryService.js` | ungetestet |

---

## Nicht vorhanden (bewusst)

- Kein Benutzer-Login – der API-Key schützt nur destruktive Endpunkte
- Kein Cloud-Backend, keine externen Abhängigkeiten im laufenden Betrieb
- Kein Zero-Downtime-Restore
- Keine macOS-/Linux-Tablet-App
- Keine halben Abwesenheitstage im Kapazitätsmodell
