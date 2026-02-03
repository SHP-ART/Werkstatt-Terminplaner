# Datenbank-Dokumentation

**Werkstatt-Terminplaner** - SQLite Datenbank (`backend/database/werkstatt.db`)

---

## Übersicht

| Tabelle | Beschreibung |
|---------|--------------|
| `termine` | Alle Werkstatt-Termine |
| `termine_arbeiten` | Relationstabelle: Arbeiten pro Termin (detailliert) |
| `kunden` | Kundenstammdaten |
| `fahrzeuge` | Fahrzeugdaten mit VIN-Dekodierung |
| `teile_bestellungen` | Teile-Bestellungen für Termine |
| `mitarbeiter` | Mitarbeiter der Werkstatt |
| `lehrlinge` | Auszubildende/Lehrlinge |
| `arbeitszeiten` | Vordefinierte Arbeitsschritte mit Zeitschätzungen |
| `arbeitszeiten_plan` | Individuelle Arbeitszeiten pro Mitarbeiter/Lehrling/Wochentag |
| `schicht_templates` | Schicht-Vorlagen für Arbeitszeitplanung |
| `werkstatt_einstellungen` | Globale Einstellungen |
| `ersatzautos` | Ersatzfahrzeuge für Kunden |
| `termin_phasen` | Mehrtägige Termin-Phasen |
| `abwesenheiten` | ⚠️ **Aktuell**: Individuelle Mitarbeiter-/Lehrling-Abwesenheiten (aktiv genutzt) |
| `_schema_meta` | Interne Schema-Versionierung |

**Hinweis:** Die Tabellen `mitarbeiter_abwesenheiten` und `abwesenheiten_legacy` wurden mit Migration 018 entfernt. Alte Daten wurden automatisch migriert.

---

## Tabellen im Detail

### 📋 `termine`

Die Haupttabelle für alle Werkstatt-Termine.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_nr` | TEXT | Eindeutige Termin-Nr. (z.B. "T-2026-021") |
| `kunde_id` | INTEGER | FK → kunden.id |
| `kunde_name` | TEXT | Kundenname (Kopie für schnellen Zugriff) |
| `kunde_telefon` | TEXT | Telefon (Kopie) |
| `kennzeichen` | TEXT | Fahrzeug-Kennzeichen (**Pflicht**) |
| `arbeit` | TEXT | Beschreibung der Arbeit (**Pflicht**) |
| `umfang` | TEXT | Arbeitsumfang (klein/mittel/groß) |
| `geschaetzte_zeit` | INTEGER | Geschätzte Zeit in Minuten (**Pflicht**) |
| `tatsaechliche_zeit` | INTEGER | Tatsächlich benötigte Zeit (nach Abschluss) |
| `datum` | DATE | Termin-Datum (**Pflicht**) |
| `status` | TEXT | Status: `geplant`, `wartend`, `in Bearbeitung`, `abgeschlossen`, `storniert` |
| `startzeit` | TEXT | **Startzeit** im Format "HH:MM" (für Planung) |
| `endzeit_berechnet` | TEXT | Berechnete Endzeit |
| `fertigstellung_zeit` | TEXT | Geplante Fertigstellungszeit |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (zugewiesener Mitarbeiter) |
| `arbeitszeiten_details` | TEXT | JSON mit Details pro Arbeit (Zeit, Mitarbeiter, Startzeit, teile_status) |
| `abholung_typ` | TEXT | `abholung`, `selbst`, `zustell`, `intern`, `stilllegung` |
| `abholung_details` | TEXT | Zusatzinfos zur Abholung |
| `abholung_zeit` | TEXT | Abholzeit |
| `abholung_datum` | DATE | Abholdatum |
| `bring_zeit` | TEXT | Wann Kunde das Fahrzeug bringt |
| `kontakt_option` | TEXT | Wie Kunde kontaktiert werden möchte |
| `kilometerstand` | INTEGER | KM-Stand des Fahrzeugs |
| `ersatzauto` | INTEGER | 0/1 - Braucht Ersatzauto? |
| `ersatzauto_tage` | INTEGER | Wie viele Tage Ersatzauto? |
| `ersatzauto_bis_datum` | DATE | Ersatzauto bis wann? |
| `ersatzauto_bis_zeit` | TEXT | Ersatzauto Rückgabe-Uhrzeit |
| `dringlichkeit` | TEXT | Dringlichkeit des Termins |
| `vin` | TEXT | Fahrzeug-Identnummer |
| `fahrzeugtyp` | TEXT | Typ des Fahrzeugs |
| `ist_schwebend` | INTEGER | 0/1 - Schwebender Termin (ohne feste Zeit) |
| `schwebend_prioritaet` | TEXT | Priorität bei schwebenden Terminen: `hoch`, `mittel`, `niedrig` |
| `parent_termin_id` | INTEGER | FK für geteilte Termine |
| `split_teil` | INTEGER | Teil-Nr. bei geteilten Terminen |
| `muss_bearbeitet_werden` | INTEGER | 0/1 - Markierung für Nacharbeit |
| `erweiterung_von_id` | INTEGER | FK bei erweiterten Terminen |
| `ist_erweiterung` | INTEGER | 0/1 - Ist eine Erweiterung? |
| `erweiterung_typ` | TEXT | Art der Erweiterung |
| `teile_status` | TEXT | `vorraetig`, `bestellt`, `bestellen`, `eingetroffen` |
| `interne_auftragsnummer` | TEXT | Interne Auftragsnummer |
| `notizen` | TEXT | Zusätzliche Notizen zum Termin |
| `ki_training_exclude` | INTEGER | 0/1 - Termin vom KI-Training ausschließen |
| `ki_training_note` | TEXT | Begründung für KI-Training-Ausschluss |
| `geloescht_am` | DATETIME | Soft-Delete Zeitstempel |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

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

Kundenstammdaten.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Kundenname (**Pflicht**) |
| `telefon` | TEXT | Telefonnummer |
| `email` | TEXT | E-Mail-Adresse |
| `adresse` | TEXT | Anschrift |
| `locosoft_id` | TEXT | ID aus Locosoft (externe Software) |
| `kennzeichen` | TEXT | Standard-Kennzeichen |
| `vin` | TEXT | Fahrzeug-Identnummer |
| `fahrzeugtyp` | TEXT | Fahrzeugtyp |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 👷 `mitarbeiter`

Werkstatt-Mitarbeiter.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Name (**Pflicht**) |
| `arbeitsstunden_pro_tag` | INTEGER | Arbeitszeit pro Tag (Standard: 8) |
| `nebenzeit_prozent` | REAL | Individuelle Nebenzeit in % |
| `nur_service` | INTEGER | 0/1 - Nur für Service-Termine |
| `mittagspause_start` | TEXT | Beginn der Mittagspause (z.B. "12:00") |
| `aktiv` | INTEGER | 0/1 - Aktiver Mitarbeiter? |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 🎓 `lehrlinge`

Auszubildende.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Name (**Pflicht**) |
| `arbeitsstunden_pro_tag` | INTEGER | Arbeitszeit pro Tag (Standard: 8) |
| `nebenzeit_prozent` | REAL | Individuelle Nebenzeit in % |
| `aufgabenbewaeltigung_prozent` | REAL | Leistungsfähigkeit in % (Standard: 100) |
| `mittagspause_start` | TEXT | Beginn der Mittagspause (z.B. "12:00") |
| `berufsschul_wochen` | TEXT | JSON-Array mit Kalenderwochen für Berufsschule (z.B. "[1,3,5,7]") |
| `aktiv` | INTEGER | 0/1 - Aktiver Lehrling? |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 🚗 `fahrzeuge`

Fahrzeugdaten mit VIN-Dekodierung und Wartungsinformationen.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `kunde_id` | INTEGER | FK → kunden.id (optional) |
| `kennzeichen` | TEXT | Fahrzeug-Kennzeichen (**Pflicht**) |
| `vin` | TEXT | Fahrzeug-Identnummer (VIN) |
| `vin_roh` | TEXT | Original-VIN vor Normalisierung |
| `hersteller` | TEXT | Fahrzeughersteller (z.B. "Citroën") |
| `modell` | TEXT | Modellbezeichnung (z.B. "C4") |
| `generation` | TEXT | Generation/Baureihe |
| `baujahr` | INTEGER | Baujahr |
| `motor_code` | TEXT | Motorcode (z.B. "EB2", "DV6") |
| `motor_typ` | TEXT | Motortyp (z.B. "1.2 PureTech 130") |
| `motor_ps` | TEXT | Motorleistung |
| `getriebe` | TEXT | Getriebetyp (Automatik/Manuell) |
| `werk` | TEXT | Produktionswerk |
| `produktionsland` | TEXT | Produktionsland |
| `karosserie` | TEXT | Karosserieform |
| `oel_spezifikation` | TEXT | Erforderliche Öl-Spezifikation (z.B. "PSA B71 2290") |
| `oelfilter_oe` | TEXT | Ölfilter OE-Nummer (z.B. "OE 1109.CK") |
| `besonderheiten` | TEXT | Fahrzeugspezifische Besonderheiten |
| `hinweise` | TEXT | Zusätzliche Hinweise für Werkstatt |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |
| `aktualisiert_am` | DATETIME | Letztes Update |

**Hinweis:** Die Fahrzeugdaten werden automatisch per OpenAI VIN-Dekodierung befüllt.

---

### 📦 `teile_bestellungen`

Teile-Bestellungen für Werkstatt-Termine.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_id` | INTEGER | FK → termine.id (**Pflicht**) |
| `teil_name` | TEXT | Name des Teils (**Pflicht**) |
| `teil_oe_nummer` | TEXT | OE-Nummer des Teils (optional) |
| `menge` | INTEGER | Bestellmenge (Standard: 1) |
| `fuer_arbeit` | TEXT | Für welche Arbeit benötigt |
| `status` | TEXT | Status: `offen`, `bestellt`, `geliefert` |
| `bestellt_am` | DATETIME | Wann bestellt |
| `geliefert_am` | DATETIME | Wann geliefert |
| `notiz` | TEXT | Zusätzliche Notizen |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |
| `aktualisiert_am` | DATETIME | Letztes Update |

**Teile-Status Workflow:**
```
offen → bestellt → geliefert
```

---

### ⚙️ `werkstatt_einstellungen`

Globale Werkstatt-Konfiguration (nur 1 Zeile mit id=1).

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Immer 1 |
| `mitarbeiter_anzahl` | INTEGER | Anzahl Mitarbeiter (veraltet, wird berechnet) |
| `arbeitsstunden_pro_tag` | INTEGER | Standard-Arbeitszeit (8h) |
| `pufferzeit_minuten` | INTEGER | Puffer zwischen Terminen |
| `servicezeit_minuten` | INTEGER | Standard-Servicezeit |
| `ersatzauto_anzahl` | INTEGER | Anzahl Ersatzautos (veraltet) |
| `nebenzeit_prozent` | REAL | Globaler Nebenzeit-Aufschlag % |
| `mittagspause_minuten` | INTEGER | Dauer der Mittagspause (Standard: 30) |
| `chatgpt_api_key` | TEXT | OpenAI ChatGPT API-Key |
| `ki_enabled` | INTEGER | 0/1 - KI-Funktionen aktiviert |
| `realtime_enabled` | INTEGER | 0/1 - Echtzeit-Funktionen aktiviert |
| `ki_mode` | TEXT | KI-Modus: `local`, `external` |
| `smart_scheduling_enabled` | INTEGER | 0/1 - Smart Scheduling aktiviert |
| `anomaly_detection_enabled` | INTEGER | 0/1 - Anomalie-Erkennung aktiviert |
| `ki_external_url` | TEXT | URL für externen KI-Service |

---

### 🔧 `arbeitszeiten`

Vordefinierte Arbeitsschritte für Autovervollständigung.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `bezeichnung` | TEXT | Name der Arbeit (**Pflicht**) |
| `standard_minuten` | INTEGER | Geschätzte Dauer in Minuten |
| `aliase` | TEXT | Alternative Bezeichnungen (kommasepariert) |

---

### ⏰ `arbeitszeiten_plan`

Individuelle Arbeitszeiten pro Mitarbeiter/Lehrling und Wochentag. Ermöglicht flexible Arbeitszeit-Planung mit Ausnahmen für bestimmte Datumsbereiche.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (oder NULL wenn lehrling_id gesetzt) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (oder NULL wenn mitarbeiter_id gesetzt) |
| `wochentag` | INTEGER | Wochentag: 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa, 7=So |
| `datum_von` | TEXT | Gültig ab Datum (optional, für zeitliche Ausnahmen) |
| `datum_bis` | TEXT | Gültig bis Datum (optional, für zeitliche Ausnahmen) |
| `arbeitsstunden` | REAL | Arbeitsstunden für diesen Tag (**Pflicht**) |
| `pausenzeit_minuten` | INTEGER | Pausenzeit in Minuten (Standard: 30) |
| `ist_frei` | INTEGER | 0/1 - Ist dieser Tag frei? (Standard: 0) |
| `beschreibung` | TEXT | Optional: Beschreibung/Grund (z.B. "Sonderurlaub", "Teilzeit") |
| `arbeitszeit_start` | TEXT | Arbeitsbeginn (z.B. "08:00", Standard: "08:00") |
| `arbeitszeit_ende` | TEXT | Arbeitsende (z.B. "16:30", Standard: "16:30") |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt (Standard: CURRENT_TIMESTAMP) |
| `aktualisiert_am` | DATETIME | Letztes Update (Standard: CURRENT_TIMESTAMP) |

**Hinweise:**
- Pro Mitarbeiter/Lehrling kann es mehrere Einträge pro Wochentag geben (z.B. für zeitliche Ausnahmen)
- Wenn `datum_von`/`datum_bis` gesetzt sind, gilt die Regel nur für diesen Zeitraum
- Ohne Datumsbereich gilt die Regel dauerhaft für den Wochentag
- `ist_frei=1` markiert einen Tag als arbeitsfreien Tag
- Wird in der Team-Übersicht und Auslastungsberechnung verwendet

---

### 📋 `schicht_templates`

Wiederverwendbare Schicht-Vorlagen für die Arbeitszeitplanung. Definiert Standard-Schichtmodelle, die schnell Mitarbeitern/Lehrlingen zugewiesen werden können.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `name` | TEXT | Name der Schicht-Vorlage (**Pflicht**, z.B. "Frühschicht", "Spätschicht") |
| `beschreibung` | TEXT | Beschreibung der Schicht (optional) |
| `arbeitszeit_start` | TEXT | Schichtbeginn im Format "HH:MM" (**Pflicht**) |
| `arbeitszeit_ende` | TEXT | Schichtende im Format "HH:MM" (**Pflicht**) |
| `farbe` | TEXT | Farbe für UI-Darstellung (Hex-Code, Standard: '#667eea') |
| `sortierung` | INTEGER | Sortierreihenfolge in der UI (Standard: 0) |
| `aktiv` | INTEGER | 0/1 - Ist die Vorlage aktiv? (Standard: 1) |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt (Standard: CURRENT_TIMESTAMP) |

**Beispiele:**
```
Frühschicht:  07:00 - 15:30
Normalschicht: 08:00 - 16:30
Spätschicht:   11:00 - 19:30
```

---

### 🔨 `termine_arbeiten`

Relationstabelle: Speichert einzelne Arbeiten eines Termins mit detaillierten Zeit- und Zuweisungsinformationen. Ersetzt/ergänzt das JSON-Feld `arbeitszeiten_details` in der `termine`-Tabelle für bessere Abfragen und Auswertungen.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_id` | INTEGER | FK → termine.id (**Pflicht**) |
| `arbeit` | TEXT | Bezeichnung der Arbeit (**Pflicht**) |
| `zeit` | INTEGER | Geschätzte Zeit in Minuten (**Pflicht**) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (oder NULL wenn lehrling_id gesetzt) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (oder NULL wenn mitarbeiter_id gesetzt) |
| `startzeit` | TEXT | Geplante Startzeit der Arbeit (Format "HH:MM") |
| `reihenfolge` | INTEGER | Reihenfolge der Arbeiten im Termin (Standard: 0) |
| `berechnete_dauer_minuten` | INTEGER | Berechnete Dauer inkl. Nebenzeit/Faktoren |
| `berechnete_endzeit` | TEXT | Berechnete Endzeit (Format "HH:MM") |
| `faktor_nebenzeit` | REAL | Angewandter Nebenzeit-Faktor (z.B. 1.15 = +15%) |
| `faktor_aufgabenbewaeltigung` | REAL | Angewandter Aufgabenbewältigungs-Faktor für Lehrlinge |
| `pause_enthalten` | INTEGER | 0/1 - Ist eine Pause in dieser Arbeit enthalten? |
| `pause_minuten` | INTEGER | Dauer der enthaltenen Pause in Minuten |
| `created_at` | TEXT | Erstellungszeitpunkt (Standard: CURRENT_TIMESTAMP) |
| `updated_at` | TEXT | Letztes Update (Standard: CURRENT_TIMESTAMP) |

**Vorteile gegenüber JSON:**
- Bessere Abfragbarkeit und Filterung
- Einfachere Joins mit Mitarbeiter-/Lehrlings-Tabellen
- Klare Typisierung und Constraints
- Bessere Performance bei komplexen Auswertungen

---

### 🚗 `ersatzautos`

Ersatzfahrzeuge für Kunden.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `kennzeichen` | TEXT | Kennzeichen (**Pflicht**, **Unique**) |
| `name` | TEXT | Bezeichnung (**Pflicht**) |
| `typ` | TEXT | Fahrzeugtyp |
| `aktiv` | INTEGER | 0/1 - Aktiv/verfügbar? |
| `manuell_gesperrt` | INTEGER | 0/1 - Manuell gesperrt? |
| `gesperrt_bis` | TEXT | Gesperrt bis Datum |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

### 🏖️ `abwesenheiten`

**Aktuelle Tabelle** für individuelle Urlaube und Krankheiten pro Mitarbeiter/Lehrling mit Datumsbereich.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (oder NULL wenn lehrling_id gesetzt) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (oder NULL wenn mitarbeiter_id gesetzt) |
| `typ` | TEXT | `urlaub` oder `krank` |
| `datum_von` | DATE | Beginn der Abwesenheit (Format: YYYY-MM-DD) |
| `datum_bis` | DATE | Ende der Abwesenheit (Format: YYYY-MM-DD) |
| `beschreibung` | TEXT | Optional: Grund/Notiz zur Abwesenheit |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

**API-Endpunkt:** `/api/abwesenheiten` (aktiv genutzt)

**Migration:** Daten aus der veralteten Tabelle `mitarbeiter_abwesenheiten` wurden automatisch mit Migration 018 übertragen.

---

### 📅 `termin_phasen`

Für mehrtägige Termine mit mehreren Phasen.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `termin_id` | INTEGER | FK → termine.id (**Pflicht**) |
| `phase_nr` | INTEGER | Phasen-Nummer (1, 2, 3...) |
| `bezeichnung` | TEXT | Name der Phase |
| `datum` | DATE | Datum dieser Phase |
| `geschaetzte_zeit` | INTEGER | Geschätzte Dauer in Minuten |
| `tatsaechliche_zeit` | INTEGER | Tatsächliche Dauer |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id |
| `lehrling_id` | INTEGER | FK → lehrlinge.id |
| `status` | TEXT | Status dieser Phase |
| `notizen` | TEXT | Zusätzliche Notizen |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

---

## Indizes

Für Performance optimiert:

| Index | Tabelle | Spalte(n) |
|-------|---------|-----------|
| `idx_termine_datum` | termine | datum |
| `idx_termine_status` | termine | status |
| `idx_termine_kunde_id` | termine | kunde_id |
| `idx_termine_mitarbeiter_id` | termine | mitarbeiter_id |
| `idx_termine_datum_status` | termine | datum, status |
| `idx_termine_geloescht_am` | termine | geloescht_am |
| `idx_kunden_name` | kunden | name |
| `idx_kunden_kennzeichen` | kunden | kennzeichen |
| `idx_phasen_termin` | termin_phasen | termin_id |
| `idx_phasen_datum` | termin_phasen | datum |
| `idx_teile_termin` | teile_bestellungen | termin_id |
| `idx_teile_status` | teile_bestellungen | status |
| `idx_fahrzeuge_kennzeichen` | fahrzeuge | kennzeichen |
| `idx_fahrzeuge_vin` | fahrzeuge | vin |
| `idx_fahrzeuge_kunde` | fahrzeuge | kunde_id |
| `idx_arbeiten_termin` | termine_arbeiten | termin_id |
| `idx_arbeiten_mitarbeiter` | termine_arbeiten | mitarbeiter_id |
| `idx_arbeiten_lehrling` | termine_arbeiten | lehrling_id |
| `idx_arbeitszeiten_plan_ma` | arbeitszeiten_plan | mitarbeiter_id |
| `idx_arbeitszeiten_plan_lehr` | arbeitszeiten_plan | lehrling_id |
| `idx_arbeitszeiten_plan_tag` | arbeitszeiten_plan | wochentag |
| `idx_abwesenheiten_mitarbeiter` | abwesenheiten | mitarbeiter_id |
| `idx_abwesenheiten_lehrling` | abwesenheiten | lehrling_id |
| `idx_abwesenheiten_datum` | abwesenheiten | datum_von, datum_bis |

---

## Migration & Versionierung

### Schema-Versionierung

Die Tabelle `_schema_meta` speichert die aktuelle Schema-Version:

| Key | Value |
|-----|-------|
| `schema_version` | `18` |

Bei jedem Server-Start wird geprüft, ob Migrationen nötig sind.

### Migration 018: Cleanup veralteter Tabellen

**Was wurde entfernt:**
1. ❌ `mitarbeiter_abwesenheiten` - Alte Abwesenheits-Tabelle mit inkonsistenten Spaltennamen
2. ❌ `abwesenheiten_legacy` - Globale Abwesenheiten (nur Anzahl, nicht individuell)

**Was wurde migriert:**
- Alle Daten aus `mitarbeiter_abwesenheiten` wurden automatisch nach `abwesenheiten` übertragen
- Spalten-Mapping: `von_datum` → `datum_von`, `bis_datum` → `datum_bis`
- Alte Indizes (`idx_ma_abw_*`) wurden entfernt
- Neue Indizes für `abwesenheiten` wurden erstellt

**Für Entwickler:**
- Alle Referenzen auf `mitarbeiter_abwesenheiten` wurden auf `abwesenheiten` aktualisiert
- `kiPlanungController.js` nutzt jetzt die aktuelle Tabelle
- Legacy-API unter `/api/abwesenheiten/legacy/:datum` bleibt für Rückwärtskompatibilität (falls `abwesenheiten_legacy` Daten enthält)

**Rollback:** Falls nötig, kann die Migration rückgängig gemacht werden (siehe `018_cleanup_legacy_tables.js`)

---

## Status-Werte

### Termin-Status
- `geplant` - Termin angelegt, noch nicht begonnen
- `wartend` - Fahrzeug da, wartet auf Bearbeitung
- `in Bearbeitung` - Wird gerade bearbeitet
- `abgeschlossen` - Fertig
- `storniert` - Abgesagt/storniert

### Abholung-Typ
- `abholung` - Kunde holt ab
- `selbst` - Kunde bringt selbst
- `zustell` - Zustellung durch Werkstatt
- `intern` - Interner Termin
- `stilllegung` - Stilllegung/Abmeldung

### Teile-Status
- `vorraetig` - Teile vorhanden
- `bestellen` - Teile müssen bestellt werden ⚠️
- `bestellt` - Teile bestellt, warten auf Lieferung 📦
- `eingetroffen` - Teile eingetroffen/geliefert 🚚

### Teile-Bestellungen Status
- `offen` - Bestellung noch nicht aufgegeben
- `bestellt` - Bestellung aufgegeben
- `geliefert` - Teile geliefert

### Schwebende Termine Priorität
- `hoch` - Hohe Priorität 🔴
- `mittel` - Mittlere Priorität 🟡
- `niedrig` - Niedrige Priorität 🟢

---

## Datenquellen für Teile-Bestellen Tab

Der **🛒 Teile-Bestellen** Tab aggregiert Daten aus mehreren Quellen:

1. **`teile_bestellungen` Tabelle** - Konkrete Teile-Bestellungen
2. **`termine.teile_status`** - Termine mit `teile_status = 'bestellen'`
3. **`termine.arbeitszeiten_details`** - Einzelne Arbeiten im JSON mit `teile_status: 'bestellen'`

---

## Backup

SQLite-Datenbank sichern:
```bash
cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db
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
| POST | `/api/teile-bestellungen/bulk` | Mehrere Bestellungen |
| PUT | `/api/teile-bestellungen/:id/status` | Status ändern |
| PUT | `/api/teile-bestellungen/mark-bestellt` | Mehrere als bestellt markieren |
| DELETE | `/api/teile-bestellungen/:id` | Bestellung löschen |

---

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

---

## API-Endpunkte für Arbeitszeiten-Plan

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/arbeitszeiten-plan` | Alle Arbeitszeiten-Einträge |
| GET | `/api/arbeitszeiten-plan/mitarbeiter/:id` | Arbeitszeiten für einen Mitarbeiter |
| GET | `/api/arbeitszeiten-plan/lehrling/:id` | Arbeitszeiten für einen Lehrling |
| GET | `/api/arbeitszeiten-plan/for-date` | Arbeitszeiten für ein bestimmtes Datum (alle MA/Lehrlinge) |
| POST | `/api/arbeitszeiten-plan` | Neue Arbeitszeit-Regel anlegen |
| PUT | `/api/arbeitszeiten-plan/:id` | Arbeitszeit-Regel aktualisieren |
| DELETE | `/api/arbeitszeiten-plan/:id` | Arbeitszeit-Regel löschen |

---

## API-Endpunkte für Schicht-Templates

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/schicht-templates` | Alle aktiven Schicht-Vorlagen |
| GET | `/api/schicht-templates/:id` | Einzelne Schicht-Vorlage |
| POST | `/api/schicht-templates` | Neue Schicht-Vorlage anlegen |
| PUT | `/api/schicht-templates/:id` | Schicht-Vorlage aktualisieren |
| DELETE | `/api/schicht-templates/:id` | Schicht-Vorlage löschen |

---

*Letzte Aktualisierung: Februar 2026*
