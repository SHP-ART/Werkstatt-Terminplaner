# Datenbank-Dokumentation

**Werkstatt-Terminplaner** - SQLite Datenbank (`backend/database/werkstatt.db`)

---

## Übersicht

| Tabelle | Beschreibung |
|---------|--------------|
| `termine` | Zentrale Termin-Tabelle – enthält alle Werkstatt-Aufträge mit Datum, Zuweisung, Status und Fahrzeugdaten |
| `termine_arbeiten` | Relationale Aufschlüsselung der einzelnen Arbeitsschritte eines Termins (ersetzt/ergänzt JSON-Feld) |
| `kunden` | Kundenstammdaten – Name, Kontakt, Standard-Fahrzeug |
| `fahrzeuge` | Erweiterte Fahrzeugdaten mit VIN-Dekodierung, Motorspezifikationen und Wartungshinweisen |
| `teile_bestellungen` | Teile-Bestellungen für Termine oder direkt für Kunden – Status-Tracking von offen bis geliefert |
| `mitarbeiter` | Mitarbeiter-Stammdaten mit individuellen Arbeitszeiten, Nebenzeit-Faktoren und Samstags-Regelungen |
| `lehrlinge` | Lehrlings-Stammdaten mit Leistungsfaktoren (Aufgabenbewältigung) und Berufsschulwochen |
| `arbeitszeiten` | Katalog vordefinierter Arbeitsschritte für Autovervollständigung mit Zeitschätzungen |
| `arbeitszeiten_plan` | Individuelle Arbeitszeiten pro Mitarbeiter/Lehrling und Wochentag – flexible Schichtplanung |
| `schicht_templates` | Wiederverwendbare Schicht-Vorlagen (Früh-/Normal-/Spätschicht) für schnelle Zuweisung |
| `werkstatt_einstellungen` | Globale Werkstatt-Konfiguration (Singleton, id=1) – KI, Puffer, Automatisierung |
| `ersatzautos` | Leihfahrzeuge für Kunden – mit Sperr-/Verfügbarkeitsstatus |
| `termin_phasen` | Phasen für mehrtägige Termine – jede Phase hat eigenes Datum und Zuweisung |
| `abwesenheiten` | Individuelle Abwesenheiten (Urlaub, Krank, Berufsschule, Lehrgang) pro Mitarbeiter/Lehrling |
| `pause_tracking` | Tatsächlich gestartete Mittagspausen mit Start-/Endzeit und Termin-Verschiebungslogik |
| `wiederkehrende_termine` | Regeln für automatisch wiederkehrende Termine (monatlich bis jährlich) |
| `tablet_einstellungen` | Display-Steuerung für Werkstatt-Tablets (Ein-/Ausschaltzeiten, Singleton id=1) |
| `tablet_updates` | Registrierte Tablet-App-Updates (Version, Installer-Pfad, Release-Notes) |
| `tablet_status` | Status aller verbundenen Tablets (Hostname, IP, installierte Version, letzter Kontakt) |
| `automation_log` | Protokoll automatischer Aktionen (Slot-Vorschläge, Duplikat-Erkennung etc.) |
| `ki_zeitlern_daten` | KI-Trainingsdaten: Vergleich geschätzter vs. tatsächlicher Zeiten für Zeitvorhersage |
| `arbeitspausen` | Manuelle Arbeitsunterbrechungen (Teil fehlt, Rückfrage, Vorrang) – eingefrierter Fortschritt bis Fortsetzen |
| `tagesstempel` | Tägliche Arbeitszeitstempel pro Person – Kommen- und Gehen-Zeit je Mitarbeiter/Lehrling pro Tag |
| `arbeitsunterbrechungen` | Kurzzeitige Arbeitsunterbrechungen (Pausen) innerhalb eines Arbeitstages – mit Start- und Endzeit |
| `_schema_meta` | Interne Schema-Versionierung – speichert aktuelle Migrations-Version |

**Hinweis:** Die Tabellen `mitarbeiter_abwesenheiten` und `abwesenheiten_legacy` wurden mit Migration 018 entfernt. Alte Daten wurden automatisch migriert.

---

## Tabellen im Detail

### 📋 `termine`

Die Haupttabelle für alle Werkstatt-Termine. Jeder Termin repräsentiert einen Werkstatt-Auftrag – vom Anlegen über die Bearbeitung bis zum Abschluss. Enthält Fahrzeug- und Kundendaten (teils denormalisiert für schnellen Zugriff), Zeitplanung, Abholung/Zustellung und KI-Training-Flags.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_nr` | TEXT | Eindeutige Termin-Nr. (z.B. "T-2026-021") – wird automatisch generiert |
| `kunde_id` | INTEGER | FK → kunden.id – Zuordnung zum Kunden |
| `kunde_name` | TEXT | Kundenname (Kopie für schnellen Zugriff ohne JOIN) |
| `kunde_telefon` | TEXT | Telefon (Kopie für schnellen Zugriff) |
| `kennzeichen` | TEXT | Fahrzeug-Kennzeichen (**Pflicht**) |
| `arbeit` | TEXT | Beschreibung der Arbeit (**Pflicht**) – Freitext oder aus Katalog |
| `umfang` | TEXT | Arbeitsumfang: `klein`, `mittel`, `groß` – bestimmt Basis-Zeitschätzung |
| `geschaetzte_zeit` | INTEGER | Geschätzte Gesamtzeit in Minuten (**Pflicht**) |
| `tatsaechliche_zeit` | INTEGER | Tatsächlich benötigte Zeit in Minuten (wird nach Abschluss eingetragen) |
| `datum` | DATE | Termin-Datum (**Pflicht**) – wann der Auftrag bearbeitet wird |
| `status` | TEXT | Aktueller Status: `geplant`, `wartend`, `in Bearbeitung`, `abgeschlossen`, `storniert` |
| `startzeit` | TEXT | Geplante Startzeit im Format "HH:MM" – für Timeline-Planung |
| `endzeit_berechnet` | TEXT | Automatisch berechnete Endzeit basierend auf Startzeit + geschätzte Zeit |
| `fertigstellung_zeit` | TEXT | Geplante Fertigstellungszeit – kann von Endzeit abweichen (z.B. bei Wartezeiten) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id – zugewiesener Hauptmitarbeiter |
| `arbeitszeiten_details` | TEXT | JSON mit Details pro Arbeit (Zeit, Mitarbeiter, Startzeit, teile_status) – wird durch `termine_arbeiten` ergänzt |
| `abholung_typ` | TEXT | Wie das Fahrzeug zur Werkstatt kommt: `abholung`, `selbst`, `zustell`, `intern`, `stilllegung` |
| `abholung_details` | TEXT | Freitext-Zusatzinfos zur Abholung (z.B. Adresse) |
| `abholung_zeit` | TEXT | Uhrzeit der Fahrzeug-Abholung |
| `abholung_datum` | DATE | Datum der Fahrzeug-Abholung (kann vor Termin-Datum liegen) |
| `bring_zeit` | TEXT | Wann der Kunde das Fahrzeug bringt |
| `kontakt_option` | TEXT | Wie der Kunde kontaktiert werden möchte (z.B. Anruf, SMS) |
| `kilometerstand` | INTEGER | Aktueller KM-Stand des Fahrzeugs bei Annahme |
| `ersatzauto` | INTEGER | 0/1 – Braucht der Kunde ein Ersatzauto? |
| `ersatzauto_tage` | INTEGER | Für wie viele Tage wird das Ersatzauto benötigt? |
| `ersatzauto_bis_datum` | DATE | Ersatzauto bis wann? |
| `ersatzauto_bis_zeit` | TEXT | Uhrzeit der Ersatzauto-Rückgabe |
| `dringlichkeit` | TEXT | Dringlichkeit des Termins (z.B. für Priorisierung in der Planung) |
| `vin` | TEXT | Fahrzeug-Identnummer (VIN) |
| `fahrzeugtyp` | TEXT | Typ des Fahrzeugs (z.B. "Citroën C4") |
| `ist_schwebend` | INTEGER | 0/1 – Schwebender Termin ohne feste Uhrzeit (wird eingeplant wenn Lücke frei) |
| `schwebend_prioritaet` | TEXT | Priorität bei schwebenden Terminen: `hoch`, `mittel`, `niedrig` |
| `parent_termin_id` | INTEGER | FK → termine.id – Referenz auf Eltern-Termin bei geteilten Terminen |
| `split_teil` | INTEGER | Teil-Nummer bei geteilten Terminen (1, 2, 3...) |
| `muss_bearbeitet_werden` | INTEGER | 0/1 – Markierung für Nacharbeit nötig |
| `erweiterung_von_id` | INTEGER | FK → termine.id – Referenz auf Original-Termin bei Erweiterungen |
| `ist_erweiterung` | INTEGER | 0/1 – Ist dieser Termin eine Erweiterung eines anderen? |
| `erweiterung_typ` | TEXT | Art der Erweiterung (z.B. "Zusatzarbeit entdeckt") |
| `teile_status` | TEXT | Globaler Teile-Status: `vorraetig`, `bestellt`, `bestellen`, `eingetroffen` |
| `interne_auftragsnummer` | TEXT | Werkstatt-interne Auftragsnummer (z.B. aus DMS) |
| `notizen` | TEXT | Freitext-Notizen zum Termin |
| `verschoben_von_datum` | TEXT | Ursprüngliches Datum, falls der Termin verschoben wurde |
| `nacharbeit_start_zeit` | TEXT | Startzeit der Nacharbeit (bei Terminen die nachbearbeitet werden müssen) |
| `ist_wiederholung` | INTEGER | 0/1 – Termin wurde als Wiederholungstermin markiert (gleiches Kennzeichen ±7 Tage zuvor bereits da) |
| `ki_training_exclude` | INTEGER | 0/1 – Termin vom KI-Zeitlern-Training ausschließen (z.B. Ausreißer) |
| `ki_training_note` | TEXT | Begründung für den KI-Training-Ausschluss |
| `geloescht_am` | DATETIME | Soft-Delete Zeitstempel – NULL = aktiv, gesetzt = gelöscht |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt des Termins |

**JSON-Struktur `arbeitszeiten_details`:**
```json
{
  "_gesamt_mitarbeiter_id": { "type": "mitarbeiter", "id": 1 },
  "_startzeit": "08:30",
  "Ölwechsel": { 
    "zeit": 30, 
    "mitarbeiter_id": 1, 
    "startzeit": "08:30",
    "teile_status": "bestellen"
  },
  "Bremsen prüfen": { 
    "zeit": 45, 
    "mitarbeiter_id": 2, 
    "startzeit": "09:00",
    "teile_status": "vorraetig"
  }
}
```

---

### 👤 `kunden`

Kundenstammdaten. Jeder Kunde kann mehrere Termine und Fahrzeuge haben. Das Kennzeichen/VIN/Fahrzeugtyp hier ist das Standard-Fahrzeug – detaillierte Fahrzeugdaten werden in der `fahrzeuge`-Tabelle gepflegt.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Kundenname (**Pflicht**) |
| `telefon` | TEXT | Telefonnummer für Rückrufe |
| `email` | TEXT | E-Mail-Adresse |
| `adresse` | TEXT | Postanschrift |
| `locosoft_id` | TEXT | ID aus Locosoft DMS (externes Werkstatt-Management-System) |
| `kennzeichen` | TEXT | Standard-Kennzeichen des Kunden |
| `vin` | TEXT | Fahrzeug-Identnummer des Standard-Fahrzeugs |
| `fahrzeugtyp` | TEXT | Fahrzeugtyp des Standard-Fahrzeugs |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 👷 `mitarbeiter`

Werkstatt-Mitarbeiter mit individuellen Arbeitszeit- und Leistungsparametern. Jeder Mitarbeiter hat eigene Arbeitszeiten, Nebenzeit-Faktoren und optionale Samstagsarbeit.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Name (**Pflicht**) |
| `arbeitsstunden_pro_tag` | INTEGER | Reguläre Arbeitszeit pro Tag in Stunden (Standard: 8) |
| `wochenarbeitszeit_stunden` | REAL | Wochenarbeitszeit in Stunden (Standard: 40) |
| `arbeitstage_pro_woche` | INTEGER | Arbeitstage pro Woche (Standard: 5) |
| `pausenzeit_minuten` | INTEGER | Pausenzeit pro Tag in Minuten (Standard: 30) |
| `nebenzeit_prozent` | REAL | Individueller Nebenzeit-Aufschlag in % – wird auf jede Arbeit aufgeschlagen (z.B. 15 = +15%) |
| `nur_service` | INTEGER | 0/1 – Mitarbeiter nur für Service-Termine verfügbar (nicht für reguläre Arbeiten) |
| `mittagspause_start` | TEXT | Geplanter Beginn der Mittagspause (z.B. "12:00") |
| `samstag_aktiv` | INTEGER | 0/1 – Arbeitet dieser Mitarbeiter samstags? (Standard: 0) |
| `samstag_start` | TEXT | Samstags-Arbeitsbeginn (Standard: "09:00") |
| `samstag_ende` | TEXT | Samstags-Arbeitsende (Standard: "12:00") |
| `samstag_pausenzeit_minuten` | INTEGER | Pausenzeit am Samstag in Minuten (Standard: 0) |
| `aktiv` | INTEGER | 0/1 – Aktiver Mitarbeiter? Inaktive werden nicht in Planung angezeigt |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 🎓 `lehrlinge`

Auszubildende mit speziellem Leistungsfaktor (Aufgabenbewältigung). Die geschätzte Zeit wird mit dem Aufgabenbewältigungs-Prozentsatz multipliziert – ein Lehrling mit 70% braucht für eine 60-Min-Arbeit ca. 86 Minuten.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Name (**Pflicht**) |
| `arbeitsstunden_pro_tag` | INTEGER | Reguläre Arbeitszeit pro Tag in Stunden (Standard: 8) |
| `wochenarbeitszeit_stunden` | REAL | Wochenarbeitszeit in Stunden (Standard: 40) |
| `arbeitstage_pro_woche` | INTEGER | Arbeitstage pro Woche (Standard: 5) |
| `pausenzeit_minuten` | INTEGER | Pausenzeit pro Tag in Minuten (Standard: 30) |
| `nebenzeit_prozent` | REAL | Individueller Nebenzeit-Aufschlag in % (Standard: 0) |
| `aufgabenbewaeltigung_prozent` | REAL | Leistungsfähigkeit in % (Standard: 100) – niedrigere Werte verlängern die geschätzte Zeit |
| `mittagspause_start` | TEXT | Geplanter Beginn der Mittagspause (z.B. "12:00") |
| `samstag_aktiv` | INTEGER | 0/1 – Arbeitet samstags? (Standard: 0) |
| `samstag_start` | TEXT | Samstags-Arbeitsbeginn (Standard: "09:00") |
| `samstag_ende` | TEXT | Samstags-Arbeitsende (Standard: "12:00") |
| `samstag_pausenzeit_minuten` | INTEGER | Pausenzeit am Samstag in Minuten (Standard: 0) |
| `berufsschul_wochen` | TEXT | JSON-Array oder Komma-getrennte Kalenderwochen für Berufsschule (z.B. "[1,3,5,7]" oder "KW10,KW20") |
| `aktiv` | INTEGER | 0/1 – Aktiver Lehrling? Inaktive werden nicht in Planung angezeigt |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 🚗 `fahrzeuge`

Erweiterte Fahrzeugdaten mit automatischer VIN-Dekodierung via OpenAI. Enthält Hersteller, Motor, Öl-Spezifikationen und werkstattspezifische Hinweise. Wird beim Anlegen eines Termins automatisch befüllt, wenn eine VIN vorhanden ist.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `kunde_id` | INTEGER | FK → kunden.id – Zuordnung zum Kunden (optional) |
| `kennzeichen` | TEXT | Fahrzeug-Kennzeichen (**Pflicht**) |
| `vin` | TEXT | Fahrzeug-Identnummer (VIN) – für automatische Dekodierung |
| `vin_roh` | TEXT | Original-VIN vor Normalisierung (Groß-/Kleinschreibung, Leerzeichen) |
| `hersteller` | TEXT | Fahrzeughersteller (z.B. "Citroën", "Peugeot") |
| `modell` | TEXT | Modellbezeichnung (z.B. "C4", "308") |
| `generation` | TEXT | Generation/Baureihe (z.B. "2. Generation") |
| `baujahr` | INTEGER | Baujahr des Fahrzeugs |
| `motor_code` | TEXT | Motorcode (z.B. "EB2", "DV6") – wichtig für Teilebestellung |
| `motor_typ` | TEXT | Motortyp-Beschreibung (z.B. "1.2 PureTech 130") |
| `motor_ps` | TEXT | Motorleistung (z.B. "130 PS") |
| `getriebe` | TEXT | Getriebetyp (Automatik/Manuell/DSG etc.) |
| `werk` | TEXT | Produktionswerk |
| `produktionsland` | TEXT | Produktionsland |
| `karosserie` | TEXT | Karosserieform (z.B. "Limousine", "Kombi") |
| `oel_spezifikation` | TEXT | Erforderliche Öl-Spezifikation (z.B. "PSA B71 2290") – direkt in der Werkstatt nutzbar |
| `oelfilter_oe` | TEXT | Ölfilter OE-Nummer (z.B. "OE 1109.CK") – für Teilebestellung |
| `besonderheiten` | TEXT | Fahrzeugspezifische Besonderheiten (z.B. "Steuerkette statt Zahnriemen") |
| `hinweise` | TEXT | Zusätzliche Werkstatt-Hinweise (z.B. "Spezialwerkzeug nötig") |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |
| `aktualisiert_am` | DATETIME | Letztes Update der Fahrzeugdaten |

---

### 📦 `teile_bestellungen`

Teile-Bestellungen mit vollständigem Status-Tracking. Können entweder einem Termin zugeordnet sein (häufigster Fall) oder direkt einem Kunden (für Bestellungen ohne konkreten Termin).

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_id` | INTEGER | FK → termine.id – Zuordnung zum Termin (NULL bei Direkt-Bestellungen) |
| `kunde_id` | INTEGER | FK → kunden.id – Für Direktbestellungen ohne Termin |
| `teil_name` | TEXT | Name des Teils (**Pflicht**, z.B. "Bremsscheiben vorne") |
| `teil_oe_nummer` | TEXT | OE-Nummer des Teils (z.B. "4249.34") – für eindeutige Bestellung |
| `menge` | INTEGER | Bestellmenge (Standard: 1) |
| `fuer_arbeit` | TEXT | Für welche Arbeit wird das Teil benötigt (z.B. "Bremsen vorne") |
| `status` | TEXT | Bestellstatus: `offen`, `bestellt`, `geliefert` |
| `bestellt_am` | DATETIME | Wann die Bestellung aufgegeben wurde |
| `geliefert_am` | DATETIME | Wann die Teile eingetroffen sind |
| `notiz` | TEXT | Zusätzliche Notizen (z.B. Lieferant, Bestellnummer) |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |
| `aktualisiert_am` | DATETIME | Letztes Update |

**Teile-Status Workflow:**
```
offen → bestellt → geliefert
```

---

### ⚙️ `werkstatt_einstellungen`

Globale Werkstatt-Konfiguration – Singleton-Tabelle mit genau einer Zeile (id=1). Enthält alle systemweiten Einstellungen: Arbeitszeiten, KI-Konfiguration, Automatisierungs-Features.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Immer 1 (CHECK constraint) |
| `mitarbeiter_anzahl` | INTEGER | Anzahl Mitarbeiter (veraltet – wird jetzt aus `mitarbeiter`-Tabelle berechnet) |
| `arbeitsstunden_pro_tag` | INTEGER | Standard-Arbeitszeit pro Tag (8h) – Fallback wenn kein individueller Wert |
| `pufferzeit_minuten` | INTEGER | Zeitpuffer zwischen zwei Terminen in Minuten |
| `servicezeit_minuten` | INTEGER | Standard-Dauer für Service-Termine |
| `ersatzauto_anzahl` | INTEGER | Anzahl verfügbarer Ersatzautos (veraltet – jetzt über `ersatzautos`-Tabelle) |
| `nebenzeit_prozent` | REAL | Globaler Nebenzeit-Aufschlag % – wird verwendet wenn Mitarbeiter keinen individuellen Wert hat |
| `mittagspause_minuten` | INTEGER | Dauer der Mittagspause in Minuten (Standard: 30) |
| `chatgpt_api_key` | TEXT | OpenAI API-Key (verschlüsselt gespeichert) – für VIN-Dekodierung und KI-Features |
| `ki_enabled` | INTEGER | 0/1 – Sind KI-Funktionen generell aktiviert? |
| `ki_mode` | TEXT | KI-Modus: `local` (Ollama), `openai` (ChatGPT API) |
| `ki_external_url` | TEXT | URL für externen KI-Service (z.B. Ollama-Server) |
| `ollama_model` | TEXT | Welches Ollama-Modell verwendet werden soll |
| `realtime_enabled` | INTEGER | 0/1 – Echtzeit-Updates via WebSocket aktiviert? |
| `smart_scheduling_enabled` | INTEGER | 0/1 – Intelligente Terminplanung mit KI-Unterstützung |
| `anomaly_detection_enabled` | INTEGER | 0/1 – Erkennung von Zeitabweichungen und Anomalien |
| `ki_zeitlern_enabled` | INTEGER | 0/1 – KI-basierte Zeitschätzung aus historischen Daten aktiviert? |
| `dynamischer_puffer_enabled` | INTEGER | 0/1 – Pufferzeit dynamisch basierend auf Auslastung anpassen? |
| `autopilot_modus` | INTEGER | 0/1 – Automatische Terminplanung ohne manuelle Bestätigung? |
| `slot_nachfuellung_enabled` | INTEGER | 0/1 – Freie Slots automatisch mit schwebenden Terminen füllen? (Standard: 1) |
| `duplikat_erkennung_enabled` | INTEGER | 0/1 – Warnung bei doppelten Terminen? (Standard: 1) |
| `auto_slot_enabled` | INTEGER | 0/1 – Automatische Slot-Zuweisung bei neuen Terminen? (Standard: 1) |
| `letzter_zugriff_datum` | DATE | Datum des letzten Zugriffs auf die App – für Inaktivitäts-Tracking |

---

### 🔧 `arbeitszeiten`

Katalog vordefinierter Arbeitsschritte für die Autovervollständigung im Termin-Formular. Wenn ein Mitarbeiter "Öl" tippt, werden passende Einträge wie "Ölwechsel" vorgeschlagen. Aliase ermöglichen Synonyme (z.B. "Inspektion" ↔ "Durchsicht").

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `bezeichnung` | TEXT | Name der Arbeit (**Pflicht**, z.B. "Ölwechsel", "Inspektion klein") |
| `standard_minuten` | INTEGER | Standard-Zeitschätzung in Minuten (z.B. 30 für Ölwechsel, 90 für Bremsen) |
| `aliase` | TEXT | Alternative Bezeichnungen, kommasepariert (z.B. "Durchsicht,Check") – für Fuzzy-Suche |

---

### ⏰ `arbeitszeiten_plan`

Individuelle Arbeitszeiten pro Mitarbeiter/Lehrling und Wochentag. Ermöglicht flexible Arbeitszeitplanung: reguläre Wochentage, freie Tage und zeitlich begrenzte Ausnahmen (z.B. Teilzeit für 3 Monate).

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (entweder dies ODER lehrling_id – nicht beides) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (entweder dies ODER mitarbeiter_id – nicht beides) |
| `wochentag` | INTEGER | Wochentag: 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa, 7=So |
| `datum_von` | TEXT | Gültig ab Datum – für zeitlich begrenzte Ausnahmen (z.B. "2026-03-01") |
| `datum_bis` | TEXT | Gültig bis Datum – für zeitlich begrenzte Ausnahmen (z.B. "2026-05-31") |
| `arbeitsstunden` | REAL | Arbeitsstunden für diesen Tag (**Pflicht**) |
| `pausenzeit_minuten` | INTEGER | Pausenzeit in Minuten (Standard: 30) |
| `ist_frei` | INTEGER | 0/1 – Ist dieser Tag frei? Markiert arbeitsfreie Tage (Standard: 0) |
| `beschreibung` | TEXT | Grund/Beschreibung (z.B. "Sonderurlaub", "Teilzeit-Regelung", "Auto migriert") |
| `arbeitszeit_start` | TEXT | Arbeitsbeginn (z.B. "08:00", Standard: "08:00") |
| `arbeitszeit_ende` | TEXT | Arbeitsende (z.B. "16:30", Standard: "16:30") |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |
| `aktualisiert_am` | DATETIME | Letztes Update |

**Hinweise:**
- Pro Mitarbeiter/Lehrling kann es mehrere Einträge pro Wochentag geben (z.B. für zeitliche Ausnahmen)
- Wenn `datum_von`/`datum_bis` gesetzt sind, gilt die Regel nur für diesen Zeitraum
- Ohne Datumsbereich gilt die Regel dauerhaft für den Wochentag
- `ist_frei=1` markiert einen Tag als arbeitsfreien Tag
- Wird in der Team-Übersicht und Auslastungsberechnung verwendet

---

### 📋 `schicht_templates`

Wiederverwendbare Schicht-Vorlagen für die Arbeitszeitplanung. Definiert Standard-Schichtmodelle, die schnell Mitarbeitern/Lehrlingen zugewiesen werden können. Die Farbe wird in der UI zur visuellen Unterscheidung verwendet.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Name der Schicht-Vorlage (**Pflicht**, **Unique**, z.B. "Frühschicht", "Spätschicht") |
| `beschreibung` | TEXT | Beschreibung der Schicht (z.B. "Standard Frühschicht Mo-Fr") |
| `arbeitszeit_start` | TEXT | Schichtbeginn im Format "HH:MM" (**Pflicht**) |
| `arbeitszeit_ende` | TEXT | Schichtende im Format "HH:MM" (**Pflicht**) |
| `farbe` | TEXT | Farbe für UI-Darstellung als Hex-Code (Standard: '#667eea') |
| `sortierung` | INTEGER | Sortierreihenfolge in der UI (Standard: 0) |
| `aktiv` | INTEGER | 0/1 – Ist die Vorlage aktiv und wählbar? (Standard: 1) |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

**Beispiele:**
```
Frühschicht:    07:00 - 15:30
Normalschicht:  08:00 - 16:30
Spätschicht:    11:00 - 19:30
Kurzschicht:    08:00 - 12:00
```

---

### 🔨 `termine_arbeiten`

Relationale Speicherung einzelner Arbeitsschritte eines Termins. Jede Arbeit hat eine eigene Zeitschätzung, Mitarbeiter-Zuweisung und berechnete Start-/Endzeit. Ersetzt/ergänzt das JSON-Feld `arbeitszeiten_details` in der `termine`-Tabelle für bessere Abfragbarkeit und Performance.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_id` | INTEGER | FK → termine.id (**Pflicht**, ON DELETE CASCADE) |
| `arbeit` | TEXT | Bezeichnung der Arbeit (**Pflicht**, z.B. "Ölwechsel") |
| `zeit` | INTEGER | Geschätzte Basis-Zeit in Minuten (**Pflicht**) – vor Nebenzeit/Faktoren |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (NULL wenn Lehrling zugewiesen) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (NULL wenn Mitarbeiter zugewiesen) |
| `startzeit` | TEXT | Geplante Startzeit im Format "HH:MM" |
| `reihenfolge` | INTEGER | Reihenfolge der Arbeiten im Termin (Standard: 0) |
| `berechnete_dauer_minuten` | INTEGER | Tatsächlich berechnete Dauer inkl. Nebenzeit + Aufgabenbewältigungs-Faktor |
| `berechnete_endzeit` | TEXT | Berechnete Endzeit im Format "HH:MM" |
| `faktor_nebenzeit` | REAL | Angewandter Nebenzeit-Faktor (z.B. 1.15 = +15% Aufschlag) |
| `faktor_aufgabenbewaeltigung` | REAL | Angewandter Lehrlings-Faktor (z.B. 1.43 bei 70% Aufgabenbewältigung) |
| `pause_enthalten` | INTEGER | 0/1 – Wurde eine Mittagspause in diese Arbeit eingerechnet? |
| `pause_minuten` | INTEGER | Dauer der eingerechneten Pause in Minuten |
| `created_at` | TEXT | Erstellungszeitpunkt |
| `updated_at` | TEXT | Letztes Update |

---

### 🚗 `ersatzautos`

Leihfahrzeuge, die Kunden während der Reparatur zur Verfügung gestellt werden. Können manuell gesperrt werden (z.B. bei TÜV, eigener Reparatur) mit automatischer Freigabe nach Ablauf des Sperrdatums.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `kennzeichen` | TEXT | Kennzeichen (**Pflicht**, **Unique**) |
| `name` | TEXT | Bezeichnung (**Pflicht**, z.B. "Citroën C3 Blau") |
| `typ` | TEXT | Fahrzeugtyp (z.B. "Kleinwagen", "Kombi") |
| `aktiv` | INTEGER | 0/1 – Aktiv/generell verfügbar? |
| `manuell_gesperrt` | INTEGER | 0/1 – Manuell gesperrt (z.B. TÜV, eigene Reparatur)? |
| `gesperrt_bis` | TEXT | Automatische Freigabe nach diesem Datum |
| `gesperrt_seit` | TEXT | Seit wann gesperrt |
| `sperrgrund` | TEXT | Begründung der Sperrung (z.B. "TÜV", "Reparatur") |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 🏖️ `abwesenheiten`

Individuelle Abwesenheiten pro Mitarbeiter oder Lehrling. Wird in der Auslastungsberechnung und Terminplanung berücksichtigt – abwesende Personen erhalten keine Termine. Unterstützt verschiedene Abwesenheitstypen.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (NULL wenn Lehrling) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (NULL wenn Mitarbeiter) |
| `typ` | TEXT | Art der Abwesenheit: `urlaub`, `krank`, `berufsschule`, `lehrgang` |
| `datum_von` | DATE | Beginn der Abwesenheit (Format: YYYY-MM-DD) |
| `datum_bis` | DATE | Ende der Abwesenheit (Format: YYYY-MM-DD) |
| `beschreibung` | TEXT | Optional: Grund/Notiz (z.B. "Sommerurlaub", "Erkältet") |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

**API-Endpunkt:** `/api/abwesenheiten`

**Migration:** Daten aus der veralteten Tabelle `mitarbeiter_abwesenheiten` wurden automatisch mit Migration 018 übertragen.

---

### 🍽️ `pause_tracking`

Tracking-Tabelle für **tatsächlich gestartete** Mittagspausen. Wenn ein Mitarbeiter seine Pause startet, werden alle seine folgenden Termine automatisch um 30 Minuten verschoben. Nach Ablauf der 30 Minuten wird die Pause automatisch als abgeschlossen markiert.

**Unterschied zu geplanten Pausen:**
- `mitarbeiter.mittagspause_start` und `lehrlinge.mittagspause_start` sind die **geplanten** Standard-Pausenzeiten
- `pause_tracking` enthält die **tatsächlichen** Pausen, die aktiv gestartet wurden

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (NULL wenn Lehrling) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (NULL wenn Mitarbeiter) |
| `pause_start_zeit` | TEXT | ISO 8601 Zeitstempel des Pausenstarts (**Pflicht**) |
| `pause_ende_zeit` | TEXT | ISO 8601 Zeitstempel des Pausenendes (NULL solange Pause aktiv) |
| `pause_naechster_termin_id` | INTEGER | FK → termine.id – Nächster Termin der nach der Pause automatisch startet |
| `datum` | DATE | Pausendatum im Format YYYY-MM-DD (**Pflicht**) |
| `abgeschlossen` | INTEGER | 0 = Pause läuft noch, 1 = Pause beendet (Standard: 0) |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

**Verwendung:**
- **Pausenstart:** Über `/api/pause/starten` wird ein neuer Eintrag mit `abgeschlossen=0` erstellt
- **Pausenende:** Nach 30 Minuten setzt ein automatischer Cleanup-Job `abgeschlossen=1` und `pause_ende_zeit`
- **Timeline-Anzeige:** Frontend zeigt aktive Pausen als orangefarbenen Block, geplante Pausen als gestrichelt
- **Terminverschiebung:** Beim Pausenstart werden alle zukünftigen Termine des Mitarbeiters/Lehrlings um 30 Min verschoben
- **Laufende Termine:** Termine mit `status='in_arbeit'` werden unterbrochen und markiert

**Foreign Keys:**
```sql
FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE CASCADE
FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE CASCADE
FOREIGN KEY (pause_naechster_termin_id) REFERENCES termine(id) ON DELETE SET NULL
```

---

### 📅 `termin_phasen`

Für mehrtägige Termine, die in mehrere Arbeitsphasen aufgeteilt werden. Jede Phase hat ein eigenes Datum, eine eigene Zeitschätzung und kann einem anderen Mitarbeiter/Lehrling zugewiesen werden.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_id` | INTEGER | FK → termine.id (**Pflicht**, ON DELETE CASCADE) |
| `phase_nr` | INTEGER | Phasen-Nummer (1, 2, 3...) – Reihenfolge der Phasen |
| `bezeichnung` | TEXT | Name der Phase (z.B. "Demontage", "Lackierung", "Montage") |
| `datum` | DATE | Datum dieser Phase – kann an verschiedenen Tagen liegen |
| `geschaetzte_zeit` | INTEGER | Geschätzte Dauer dieser Phase in Minuten |
| `tatsaechliche_zeit` | INTEGER | Tatsächlich benötigte Zeit (nach Abschluss) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id – zugewiesener Mitarbeiter für diese Phase |
| `lehrling_id` | INTEGER | FK → lehrlinge.id – zugewiesener Lehrling für diese Phase |
| `status` | TEXT | Status der Phase: `geplant`, `abgeschlossen` |
| `notizen` | TEXT | Zusätzliche Notizen zur Phase |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 🔄 `wiederkehrende_termine`

Regeln für automatisch wiederkehrende Termine. Das System erstellt automatisch neue Termine basierend auf dem Wiederholungsintervall. Nützlich für regelmäßige Inspektionen, Ölwechsel etc.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `kunde_id` | INTEGER | FK → kunden.id – Zuordnung zum Kunden |
| `kunde_name` | TEXT | Kundenname (denormalisiert für schnellen Zugriff) |
| `kennzeichen` | TEXT | Fahrzeug-Kennzeichen |
| `arbeit` | TEXT | Zu wiederholende Arbeit (**Pflicht**, z.B. "Inspektion") |
| `geschaetzte_zeit` | INTEGER | Geschätzte Dauer in Minuten (Standard: 60) |
| `wiederholung` | TEXT | Intervall: `monatlich`, `quartal`, `halbjahr`, `jaehrlich` (**Pflicht**) |
| `naechste_erstellung` | DATE | Datum, an dem der nächste Termin automatisch erstellt wird (**Pflicht**) |
| `aktiv` | INTEGER | 0/1 – Regel aktiv? Inaktive Regeln erzeugen keine neuen Termine (Standard: 1) |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 📱 `tablet_einstellungen`

Zentrale Display-Steuerung für Werkstatt-Tablets – Singleton-Tabelle (id=1). Steuert wann das Tablet-Display ein-/ausgeschaltet wird und ermöglicht manuelle Übersteuerung.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (immer 1) |
| `display_ausschaltzeit` | TEXT | Uhrzeit wann das Display automatisch ausschaltet (Standard: "18:10") |
| `display_einschaltzeit` | TEXT | Uhrzeit wann das Display automatisch einschaltet (Standard: "07:30") |
| `manueller_display_status` | TEXT | Manuelle Übersteuerung: `auto` (Zeitsteuerung), `an` (immer an), `aus` (immer aus) |
| `letztes_update` | DATETIME | Wann zuletzt geändert |

---

### 📲 `tablet_updates`

Registrierte Updates für die Tablet-App. Wenn eine neue Version gebaut und auf den Server hochgeladen wird, wird sie hier registriert. Tablets prüfen periodisch auf neue Versionen.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `version` | TEXT | Versionsnummer (**Pflicht**, z.B. "1.7.2") |
| `file_path` | TEXT | Absoluter Pfad zum Installer auf dem Server (**Pflicht**) |
| `release_notes` | TEXT | Beschreibung der Änderungen in dieser Version |
| `published_at` | DATETIME | Veröffentlichungszeitpunkt |

---

### 📊 `tablet_status`

Status aller verbundenen Werkstatt-Tablets. Wird automatisch aktualisiert wenn ein Tablet sich beim Server meldet. Ermöglicht Überblick welche Tablets welche Version installiert haben.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `hostname` | TEXT | Hostname des Tablets (**Unique**) – identifiziert das Gerät |
| `ip` | TEXT | Aktuelle IP-Adresse des Tablets |
| `version` | TEXT | Aktuell installierte App-Version (**Pflicht**) |
| `last_seen` | DATETIME | Wann das Tablet zuletzt Kontakt hatte |

---

### 🤖 `automation_log`

Protokoll aller automatischen Aktionen des Systems. Dient als Audit-Trail und zur Nachvollziehbarkeit von KI-Vorschlägen, Duplikat-Erkennungen und Slot-Optimierungen.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `typ` | TEXT | Art der Aktion (**Pflicht**): z.B. `slot_vorschlag`, `duplikat_erkennung`, `auto_slot` |
| `beschreibung` | TEXT | Detaillierte Beschreibung was passiert ist |
| `termin_id` | INTEGER | FK → termine.id – Betroffener Termin (falls zutreffend) |
| `ergebnis` | TEXT | Ergebnis der Aktion (JSON oder Freitext) |
| `erstellt_am` | DATETIME | Zeitpunkt der Aktion |

---

### 🧠 `ki_zeitlern_daten`

Trainingsdaten für die KI-basierte Zeitvorhersage. Speichert den Vergleich zwischen geschätzter und tatsächlicher Zeit für abgeschlossene Arbeiten. Die berechneten Felder `abweichung_min` und `abweichung_prozent` sind virtuelle Spalten (GENERATED ALWAYS).

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_id` | INTEGER | FK → termine.id – Zugehöriger abgeschlossener Termin |
| `arbeit` | TEXT | Arbeitsbezeichnung (**Pflicht**, z.B. "Ölwechsel") |
| `kategorie` | TEXT | Arbeitskategorie (z.B. "Service", "Reparatur") |
| `geschaetzte_min` | INTEGER | Geschätzte Dauer in Minuten (**Pflicht**) |
| `tatsaechliche_min` | INTEGER | Tatsächliche Dauer in Minuten (**Pflicht**) |
| `abweichung_min` | INTEGER | **VIRTUAL** – Automatisch berechnet: `tatsaechliche_min - geschaetzte_min` |
| `abweichung_prozent` | REAL | **VIRTUAL** – Automatisch berechnet: prozentuale Abweichung (z.B. 15.0 = 15% länger) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id – Wer die Arbeit ausgeführt hat |
| `datum` | DATE | Datum der Ausführung (**Pflicht**) |
| `exclude` | INTEGER | 0/1 – Datensatz vom Training ausschließen (z.B. Ausreißer) (Standard: 0) |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### ⏸️ `arbeitspausen`

Manuelle Arbeitsunterbrechungen für laufende Werkstattaufträge. Wird angelegt wenn ein Mitarbeiter oder Lehrling die Arbeit unterbricht (z.B. weil ein Teil fehlt). Die Pause ist solange aktiv bis `beendet_am` gesetzt wird.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (AUTO INCREMENT) |
| `termin_id` | INTEGER | Referenz auf `termine.id` (**NOT NULL**) |
| `mitarbeiter_id` | INTEGER | Zuständiger Mitarbeiter (optional, mindestens einer von beiden) |
| `lehrling_id` | INTEGER | Zuständiger Lehrling (optional, mindestens einer von beiden) |
| `grund` | TEXT | Pausengrund: `teil_fehlt`, `rueckfrage_kunde`, `vorrang` (**NOT NULL**, CHECK-Constraint) |
| `gestartet_am` | DATETIME | Zeitstempel Pausenstart (**NOT NULL**) |
| `beendet_am` | DATETIME | Zeitstempel Pausenende – `NULL` solange Pause aktiv |

**Regeln:**
- Pro Termin kann nur eine Pause gleichzeitig aktiv sein (`beendet_am IS NULL`)
- Der Termin muss Status `in_arbeit` haben um eine Pause zu starten
- Pausen werden **nicht** automatisch beendet – nur durch expliziten API-Aufruf

---

### 🗄️ `_schema_meta`

Interne Metadaten-Tabelle für die Schema-Versionierung. Wird bei jedem Server-Start geprüft – fehlende Migrationen werden automatisch ausgeführt.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `key` | TEXT | Schlüssel (**PRIMARY KEY**) – z.B. "schema_version" |
| `value` | TEXT | Wert – z.B. "28" für aktuelle Schema-Version |

---

## Beziehungen

```
kunden (1) ──→ (n) termine
      ├──→ (n) fahrzeuge
      └──→ (n) teile_bestellungen

termine (1) ──→ (n) termine_arbeiten
      ├──→ (n) termin_phasen
      ├──→ (n) teile_bestellungen
      └──→ (n) ki_zeitlern_daten

mitarbeiter (1) ──→ (n) arbeitszeiten_plan
          ├──→ (n) abwesenheiten
          ├──→ (n) pause_tracking
          └──→ (n) termine

lehrlinge (1) ──→ (n) arbeitszeiten_plan
         ├──→ (n) abwesenheiten
         └──→ (n) pause_tracking

wiederkehrende_termine ──→ kunden
```

---

## Indizes

Für Performance optimiert:

| Index | Tabelle | Spalte(n) | Zweck |
|-------|---------|-----------|-------|
| `idx_termine_datum` | termine | datum | Schnelle Filterung nach Datum |
| `idx_termine_status` | termine | status | Schnelle Filterung nach Status |
| `idx_termine_kunde_id` | termine | kunde_id | JOIN mit Kunden-Tabelle |
| `idx_termine_mitarbeiter_id` | termine | mitarbeiter_id | Termine pro Mitarbeiter |
| `idx_termine_datum_status` | termine | datum, status | Kombinierte Abfrage Datum+Status |
| `idx_termine_geloescht_am` | termine | geloescht_am | Soft-Delete Filter |
| `idx_termine_schwebend` | termine | ist_schwebend | Schwebende Termine filtern |
| `idx_termine_erweiterung` | termine | erweiterung_von_id | Erweiterungen finden |
| `idx_termine_ersatzauto` | termine | ersatzauto | Termine mit Ersatzauto-Bedarf |
| `idx_termine_nacharbeit` | termine | nacharbeit_start_zeit | Nacharbeit-Termine |
| `idx_termine_wiederholung` | termine | ist_wiederholung, datum (WHERE ist_wiederholung=1) | Wiederholungstermine nach Datum filtern (partieller Index) |
| `idx_kunden_name` | kunden | name | Kundensuche nach Name |
| `idx_kunden_kennzeichen` | kunden | kennzeichen | Kundensuche nach Kennzeichen |
| `idx_phasen_termin` | termin_phasen | termin_id | Phasen eines Termins |
| `idx_phasen_datum` | termin_phasen | datum | Phasen nach Datum |
| `idx_teile_termin` | teile_bestellungen | termin_id | Teile eines Termins |
| `idx_teile_status` | teile_bestellungen | status | Teile nach Status filtern |
| `idx_fahrzeuge_kennzeichen` | fahrzeuge | kennzeichen | Fahrzeugsuche nach Kennzeichen |
| `idx_fahrzeuge_vin` | fahrzeuge | vin | Fahrzeugsuche nach VIN |
| `idx_fahrzeuge_kunde` | fahrzeuge | kunde_id | Fahrzeuge eines Kunden |
| `idx_arbeiten_termin` | termine_arbeiten | termin_id | Arbeiten eines Termins |
| `idx_arbeiten_mitarbeiter` | termine_arbeiten | mitarbeiter_id | Arbeiten pro Mitarbeiter |
| `idx_arbeiten_lehrling` | termine_arbeiten | lehrling_id | Arbeiten pro Lehrling |
| `idx_arbeitszeiten_plan_ma` | arbeitszeiten_plan | mitarbeiter_id | Arbeitszeiten-Plan pro Mitarbeiter |
| `idx_arbeitszeiten_plan_lehr` | arbeitszeiten_plan | lehrling_id | Arbeitszeiten-Plan pro Lehrling |
| `idx_arbeitszeiten_plan_tag` | arbeitszeiten_plan | wochentag | Arbeitszeiten nach Wochentag |
| `idx_abwesenheiten_mitarbeiter` | abwesenheiten | mitarbeiter_id | Abwesenheiten pro Mitarbeiter |
| `idx_abwesenheiten_lehrling` | abwesenheiten | lehrling_id | Abwesenheiten pro Lehrling |
| `idx_abwesenheiten_datum` | abwesenheiten | datum_von, datum_bis | Abwesenheiten nach Zeitraum |
| `idx_pause_tracking_mitarbeiter` | pause_tracking | mitarbeiter_id | Pausen pro Mitarbeiter |
| `idx_pause_tracking_lehrling` | pause_tracking | lehrling_id | Pausen pro Lehrling |
| `idx_pause_tracking_datum` | pause_tracking | datum | Pausen nach Datum |
| `idx_pause_tracking_abgeschlossen` | pause_tracking | abgeschlossen | Aktive vs. beendete Pausen |
| `idx_mitarbeiter_aktiv` | mitarbeiter | aktiv | Aktive Mitarbeiter filtern |
| `idx_lehrlinge_aktiv` | lehrlinge | aktiv | Aktive Lehrlinge filtern |
| `idx_wiederkehrende_naechste` | wiederkehrende_termine | naechste_erstellung (WHERE aktiv=1) | Nächste fällige Wiederholungen |
| `idx_automation_log_erstellt` | automation_log | erstellt_am DESC | Neueste Log-Einträge zuerst |
| `idx_ki_lern_arbeit` | ki_zeitlern_daten | arbeit | KI-Daten nach Arbeitstyp |
| `idx_ki_lern_datum` | ki_zeitlern_daten | datum | KI-Daten nach Datum |
| `idx_ki_lern_termin` | ki_zeitlern_daten | termin_id | KI-Daten pro Termin |
| `idx_tablet_status_last_seen` | tablet_status | last_seen | Tablets nach letztem Kontakt |
| `idx_arbeitspausen_termin` | arbeitspausen | termin_id | Pausen eines Termins |
| `idx_arbeitspausen_aktiv` | arbeitspausen | beendet_am (WHERE beendet_am IS NULL) | Aktive Pausen schnell abfragen (partieller Index) |

---

## Status-Werte

### Termin-Status
- `geplant` – Termin angelegt, noch nicht begonnen
- `wartend` – Fahrzeug da, wartet auf Bearbeitung
- `in Bearbeitung` – Wird gerade bearbeitet
- `abgeschlossen` – Fertig
- `storniert` – Abgesagt/storniert

### Abholung-Typ
- `abholung` – Werkstatt holt Fahrzeug beim Kunden ab
- `selbst` – Kunde bringt Fahrzeug selbst
- `zustell` – Werkstatt liefert Fahrzeug zum Kunden
- `intern` – Interner Werkstatt-Termin (kein Kundenkontakt)
- `stilllegung` – Fahrzeug-Stilllegung/Abmeldung

### Teile-Status (Termin-Feld)
- `vorraetig` – Teile sind im Lager vorhanden
- `bestellen` – Teile müssen noch bestellt werden ⚠️
- `bestellt` – Teile bestellt, warten auf Lieferung 📦
- `eingetroffen` – Teile eingetroffen und bereit 🚚

### Teile-Bestellungen Status
- `offen` – Bestellung noch nicht aufgegeben
- `bestellt` – Bestellung beim Lieferanten aufgegeben
- `geliefert` – Teile eingetroffen und verfügbar

### Schwebende Termine Priorität
- `hoch` – Muss schnellstmöglich eingeplant werden 🔴
- `mittel` – Normale Einplanung 🟡
- `niedrig` – Kann warten, bei Gelegenheit einplanen 🟢

### Abwesenheits-Typ
- `urlaub` – Geplanter Urlaub
- `krank` – Krankheit
- `berufsschule` – Berufsschulblock (nur Lehrlinge)
- `lehrgang` – Fortbildung/Lehrgang

### Wiederholungs-Intervall
- `monatlich` – Jeden Monat
- `quartal` – Alle 3 Monate
- `halbjahr` – Alle 6 Monate
- `jaehrlich` – Einmal pro Jahr

---

## Datenquellen für Teile-Bestellen Tab

Der **🛒 Teile-Bestellen** Tab aggregiert Daten aus mehreren Quellen:

1. **`teile_bestellungen` Tabelle** – Konkrete Teile-Bestellungen mit Status-Tracking
2. **`termine.teile_status`** – Termine mit `teile_status = 'bestellen'`
3. **`termine.arbeitszeiten_details`** – Einzelne Arbeiten im JSON mit `teile_status: 'bestellen'`

---

## Backup

SQLite-Datenbank sichern:
```bash
cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db
```

Produktivserver-Backup (vor Updates immer ausführen!):
```bash
ssh root@100.124.168.108 "cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-update_$(date +%Y%m%d_%H%M%S).db"
```

---

## API-Endpunkte für Teile-Bestellungen

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/teile-bestellungen` | Alle Bestellungen (mit Filter) |
| GET | `/api/teile-bestellungen/statistik` | Statistiken (offen/bestellt/geliefert) |
| GET | `/api/teile-bestellungen/faellig` | Fällige Bestellungen (gruppiert nach Dringlichkeit) |
| GET | `/api/teile-bestellungen/termin/:id` | Bestellungen für einen Termin |
| POST | `/api/teile-bestellungen` | Neue Bestellung anlegen |
| POST | `/api/teile-bestellungen/bulk` | Mehrere Bestellungen auf einmal |
| PUT | `/api/teile-bestellungen/:id/status` | Status einer Bestellung ändern |
| PUT | `/api/teile-bestellungen/mark-bestellt` | Mehrere als bestellt markieren |
| DELETE | `/api/teile-bestellungen/:id` | Bestellung löschen |

## API-Endpunkte für Fahrzeuge

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/fahrzeuge` | Alle Fahrzeuge |
| GET | `/api/fahrzeuge/:id` | Einzelnes Fahrzeug |
| GET | `/api/fahrzeuge/kennzeichen/:kennzeichen` | Fahrzeug nach Kennzeichen |
| POST | `/api/fahrzeuge` | Neues Fahrzeug anlegen |
| POST | `/api/fahrzeuge/decode` | VIN dekodieren (OpenAI) |
| PUT | `/api/fahrzeuge/:id` | Fahrzeug aktualisieren |
| DELETE | `/api/fahrzeuge/:id` | Fahrzeug löschen |

## API-Endpunkte für Arbeitszeiten-Plan

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/arbeitszeiten-plan` | Alle Arbeitszeiten-Einträge |
| GET | `/api/arbeitszeiten-plan/mitarbeiter/:id` | Arbeitszeiten für einen Mitarbeiter |
| GET | `/api/arbeitszeiten-plan/lehrling/:id` | Arbeitszeiten für einen Lehrling |
| GET | `/api/arbeitszeiten-plan/for-date` | Arbeitszeiten für ein bestimmtes Datum |
| POST | `/api/arbeitszeiten-plan` | Neue Arbeitszeit-Regel anlegen |
| PUT | `/api/arbeitszeiten-plan/:id` | Arbeitszeit-Regel aktualisieren |
| DELETE | `/api/arbeitszeiten-plan/:id` | Arbeitszeit-Regel löschen |

## API-Endpunkte für Schicht-Templates

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/schicht-templates` | Alle aktiven Schicht-Vorlagen |
| GET | `/api/schicht-templates/:id` | Einzelne Schicht-Vorlage |
| POST | `/api/schicht-templates` | Neue Schicht-Vorlage anlegen |
| PUT | `/api/schicht-templates/:id` | Schicht-Vorlage aktualisieren |
| DELETE | `/api/schicht-templates/:id` | Schicht-Vorlage löschen |

---

## Migration & Versionierung

### Schema-Versionierung

Die Tabelle `_schema_meta` speichert die aktuelle Schema-Version:

| Key | Value |
|-----|-------|
| `schema_version` | `28` |

Bei jedem Server-Start wird geprüft, ob Migrationen nötig sind. Fehlende Migrationen werden automatisch ausgeführt.

### Migrations-Übersicht

| Nr. | Migration | Beschreibung |
|-----|-----------|--------------|
| 001 | `001_initial.js` | Basis-Tabellen: termine, kunden, mitarbeiter, lehrlinge, arbeitszeiten, werkstatt_einstellungen, _schema_meta |
| 003 | `003_*.js` | Ersatzautos-Tabelle, ersatzauto_anzahl in Einstellungen |
| 004 | `004_*.js` | Pufferzeit, Servicezeit, Nebenzeit, Mittagspause in Einstellungen; nur_service/mittagspause bei Mitarbeitern |
| 005 | `005_*.js` | Lehrlinge: mittagspause_start, berufsschul_wochen |
| 007 | `007_*.js` | KI-Einstellungen: chatgpt_api_key, ki_enabled, ki_mode etc. |
| 008 | `008_*.js` | Ersatzautos: gesperrt_bis, sperrgrund, gesperrt_seit |
| 009 | `009_performance_indizes.js` | Performance-Indizes, fahrzeuge & teile_bestellungen & termin_phasen Tabellen |
| 010 | `010_wochenarbeitszeit.js` | Wochenarbeitszeit/-tage bei Mitarbeitern/Lehrlingen; abwesenheiten-Tabelle |
| 013 | `013_create_termine_arbeiten_table.js` | Relationale termine_arbeiten Tabelle |
| 015 | `015_create_arbeitszeiten_plan.js` | Arbeitszeiten-Plan Tabelle |
| 017 | `017_create_schicht_templates.js` | Schicht-Templates Tabelle |
| 018 | `018_cleanup_legacy_tables.js` | Entfernung: mitarbeiter_abwesenheiten, abwesenheiten_legacy |
| 019 | `019_add_pause_tracking_and_verschoben.js` | pause_tracking Tabelle; verschoben_von_datum in Terminen |
| 020 | `020_tablet_einstellungen.js` | tablet_einstellungen Tabelle |
| 021 | `021_automatisierung.js` | wiederkehrende_termine, automation_log; Automatisierungs-Einstellungen |
| 022 | `022_*.js` | ollama_model und weitere KI-Einstellungen |
| 024 | `024_*.js` | auto_slot_enabled Einstellung |
| 025 | `025_ki_zeitlern_daten.js` | ki_zeitlern_daten Tabelle |
| 026 | `026_ki_zeitlern_enabled.js` | ki_zeitlern_enabled Einstellung |
| 027 | `027_fix_tablet_einstellungen_schema.js` | Schema-Fix für tablet_einstellungen |
| 028 | `028_nacharbeit_tracking.js` | nacharbeit_start_zeit in Terminen |
| 029 | `029_wiederholung.js` | ist_wiederholung in Terminen + partieller Index für Wiederholungstermin-Erkennung |
| 030 | `030_arbeitspausen.js` | arbeitspausen Tabelle für manuelle Arbeitsunterbrechungen |
| 031 | `031_add_lehrling_id_to_termine.js` | lehrling_id Spalte in termine-Tabelle |
| 032 | `032_stempel_felder.js` | stempel_start und stempel_ende in termine_arbeiten |
| 033 | `033_relax_termine_arbeiten_person_constraint.js` | Constraint-Lockerung in termine_arbeiten |
| 034 | `034_tagesstempel.js` | tagesstempel + arbeitsunterbrechungen Tabellen für Arbeitszeitverfolgung |

---

### 🕐 `tagesstempel`

Täglich gestempelte Arbeitszeiten pro Mitarbeiter oder Lehrling. Ein Eintrag pro Person und Tag. Wird über die Tablet-App (Kommen/Gehen-Button) oder manuell über das Web-Frontend befüllt.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (NULL wenn Lehrling) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (NULL wenn Mitarbeiter) |
| `datum` | TEXT | Arbeitsdatum im Format YYYY-MM-DD (**Pflicht**) |
| `kommen_zeit` | TEXT | Arbeitsbeginn-Zeit im Format HH:MM (**Pflicht**) |
| `gehen_zeit` | TEXT | Arbeitsende-Zeit im Format HH:MM (NULL solange noch nicht gegangen) |
| `erstellt_am` | TEXT | Erstellungszeitpunkt |

**Constraints:**
- `mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL` – immer einer von beiden gesetzt
- Unique Index: `(mitarbeiter_id, datum)` und `(lehrling_id, datum)` – pro Person max. ein Eintrag pro Tag

**Verwendung:**
- Kommen: `POST /api/tagesstempel/kommen` (Tablet) oder `PATCH /api/tagesstempel/zeiten` (manuell)
- Gehen: `POST /api/tagesstempel/gehen` (Tablet) oder `PATCH /api/tagesstempel/zeiten` (manuell)
- Abfrage: `GET /api/tagesstempel?datum=YYYY-MM-DD` → liefert stempel + unterbrechungen + pausen

---

### ⏸ `arbeitsunterbrechungen`

Kurzzeitige Unterbrechungen des Arbeitstags (z.B. Mittagspause, kurze Pause) pro Person und Tag. Mehrere Einträge pro Person und Tag möglich. Wird über die Tablet-App oder das Web-Frontend angelegt und beendet.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (NULL wenn Lehrling) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (NULL wenn Mitarbeiter) |
| `datum` | TEXT | Datum der Unterbrechung im Format YYYY-MM-DD (**Pflicht**) |
| `start_zeit` | TEXT | Startzeitpunkt der Unterbrechung im Format HH:MM (**Pflicht**) |
| `ende_zeit` | TEXT | Endzeitpunkt der Unterbrechung im Format HH:MM (NULL solange laufend) |
| `erstellt_am` | TEXT | Erstellungszeitpunkt |

**Constraints:**
- `mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL`

**Verwendung:**
- Unterbrechung starten: `POST /api/tagesstempel/unterbrechung/start`
- Unterbrechung beenden: `POST /api/tagesstempel/unterbrechung/ende`
- Manuell bearbeiten: `PATCH /api/tagesstempel/unterbrechung/:id`
- Dauer wird von der Netto-Arbeitszeit in der Zeitstempelung-Ansicht abgezogen

**Unterschied zu `pause_tracking`:**
- `pause_tracking` = vollautomatische Mittagspausen-Logik mit Termin-Verschiebung (Tablet-App)
- `arbeitsunterbrechungen` = manuelle Pausen/Unterbrechungen ohne Termin-Verschiebung

---

*Letzte Aktualisierung: April 2026*
