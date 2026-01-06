# Datenbank-Dokumentation

**Werkstatt-Terminplaner** - SQLite Datenbank (`backend/database/werkstatt.db`)

---

## Übersicht

| Tabelle | Beschreibung |
|---------|--------------|
| `kunden` | Kundenstammdaten |
| `termine` | Alle Werkstatt-Termine |
| `mitarbeiter` | Mitarbeiter der Werkstatt |
| `lehrlinge` | Auszubildende/Lehrlinge |
| `arbeitszeiten` | Vordefinierte Arbeitsschritte mit Zeitschätzungen |
| `werkstatt_einstellungen` | Globale Einstellungen |
| `ersatzautos` | Ersatzfahrzeuge für Kunden |
| `abwesenheiten` | (veraltet) Globale Abwesenheiten |
| `mitarbeiter_abwesenheiten` | Urlaub/Krankheit pro Mitarbeiter/Lehrling |
| `termin_phasen` | Mehrtägige Termin-Phasen |

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
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (zugewiesener Mitarbeiter) |
| `arbeitszeiten_details` | TEXT | JSON mit Details pro Arbeit (Zeit, Mitarbeiter, Startzeit) |
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
| `parent_termin_id` | INTEGER | FK für geteilte Termine |
| `split_teil` | INTEGER | Teil-Nr. bei geteilten Terminen |
| `muss_bearbeitet_werden` | INTEGER | 0/1 - Markierung für Nacharbeit |
| `erweiterung_von_id` | INTEGER | FK bei erweiterten Terminen |
| `ist_erweiterung` | INTEGER | 0/1 - Ist eine Erweiterung? |
| `erweiterung_typ` | TEXT | Art der Erweiterung |
| `teile_status` | TEXT | `vorraetig`, `bestellt`, `fehlt` |
| `interne_auftragsnummer` | TEXT | Interne Auftragsnummer |
| `geloescht_am` | DATETIME | Soft-Delete Zeitstempel |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

**JSON-Struktur `arbeitszeiten_details`:**
```json
{
  "_gesamt_mitarbeiter_id": { "type": "mitarbeiter", "id": 1 },
  "_startzeit": "08:30",
  "Ölwechsel": { "zeit": 30, "mitarbeiter_id": 1, "startzeit": "08:30" },
  "Bremsen prüfen": { "zeit": 45, "mitarbeiter_id": 2, "startzeit": "09:00" }
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
| `mittagspause_start` | TEXT | Beginn der Mittagspause |
| `aktiv` | INTEGER | 0/1 - Aktiver Lehrling? |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

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

### 🏖️ `mitarbeiter_abwesenheiten`

Urlaub und Krankheit pro Mitarbeiter/Lehrling.

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `id` | INTEGER | Primärschlüssel (auto) |
| `mitarbeiter_id` | INTEGER | FK → mitarbeiter.id (oder NULL) |
| `lehrling_id` | INTEGER | FK → lehrlinge.id (oder NULL) |
| `typ` | TEXT | `urlaub` oder `krank` |
| `von_datum` | DATE | Beginn der Abwesenheit |
| `bis_datum` | DATE | Ende der Abwesenheit |
| `erstellt_am` | DATETIME | Erstellungszeitpunkt |

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
| `idx_ma_abw_mitarbeiter` | mitarbeiter_abwesenheiten | mitarbeiter_id |
| `idx_ma_abw_lehrling` | mitarbeiter_abwesenheiten | lehrling_id |
| `idx_ma_abw_datum` | mitarbeiter_abwesenheiten | von_datum, bis_datum |

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
- `bestellt` - Teile bestellt
- `fehlt` - Teile fehlen noch

---

## Backup

SQLite-Datenbank sichern:
```bash
cp backend/database/werkstatt.db backup_$(date +%Y%m%d).db
```

---

*Letzte Aktualisierung: Januar 2026*
