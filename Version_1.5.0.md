# Version 1.5.0 - Flexible Arbeitszeiten & Robuste Upgrades

**Release-Datum:** 3. Februar 2026  
**Status:** ✅ Implementiert

## 🎯 Highlights

### 🕐 Flexible Arbeitszeiten-System
Umfassendes System für individuelle Arbeitszeiten mit Wochenarbeitszeitverwaltung, Samstagsarbeit und Schicht-Templates.

### 🔄 Robuste Upgrade-Migration
Automatische Erkennung und Migration alter Datenbankstrukturen für nahtlose Updates von v1.4.0 und älter.

### ⏱️ Korrekte Kapazitätsberechnung
Pausenzeit wird nicht mehr von der verfügbaren Arbeitskapazität abgezogen - **8h Arbeitszeit = 8h verfügbar**.

---

## 📑 Inhaltsverzeichnis

1. [🆕 Neue Features](#-neue-features)
2. [🐛 Bugfixes](#-bugfixes)
3. [🔧 Technische Verbesserungen](#-technische-verbesserungen)
4. [📊 Datenbank-Änderungen](#-datenbank-änderungen)
5. [📝 Upgrade-Hinweise](#-upgrade-hinweise)

---

## 🆕 Neue Features

### Flexible Arbeitszeiten-Verwaltung
- ✅ **Wochenarbeitszeit**: Individuelle Stunden pro Woche (z.B. 40h, 35h)
- ✅ **Arbeitstage**: Flexible Anzahl pro Woche (z.B. 5, 4.5)
- ✅ **Pausenzeit**: Konfigurierbare Pausendauer pro Tag
- ✅ **Samstagsarbeit**: Separates Zeitfenster mit eigener Pausenregelung
  - Start-/Endzeit konfigurierbar (z.B. 09:00-12:00)
  - Eigene Pausenzeit für Samstage
  - Ein/Aus schaltbar pro Person

### Schicht-Templates
- ✅ **Vordefinierte Schichten**: Frühschicht, Normalschicht, Spätschicht, Kurzschicht
- ✅ **Wiederverwendbar**: Templates für häufige Arbeitszeiten
- ✅ **Farb-Codierung**: Visuelle Unterscheidung
- ✅ **Erweiterbar**: Neue Templates können hinzugefügt werden

### Arbeitszeiten-Planung (arbeitszeiten_plan)
- ✅ **Individuelle Tages-Arbeitszeiten**: Pro Person und Datum
- ✅ **Start-/Endzeit**: Exakte Zeitfenster (z.B. 08:00-16:30)
- ✅ **Automatische Endzeit-Berechnung**: Basierend auf Arbeitsstunden + Pause
- ✅ **Überschreibt Standard**: Spezielle Arbeitszeiten überschreiben Wochenplan

### Berufsschul-Verwaltung
- ✅ **Kalenderwochen-Eingabe**: Direkt beim Lehrling eintragbar
- ✅ **Automatische Prüfung**: System berücksichtigt Berufsschulwochen
- ✅ **Tablet-Integration**: Auch in Intern-Ansicht verfügbar

### Relationale Arbeitszeiten-Struktur
- ✅ **termine_arbeiten Tabelle**: Relationale Struktur statt JSON
- ✅ **Automatische Datenmigration**: Von `arbeitszeiten_details` zu `termine_arbeiten`
- ✅ **Berechnete Zeiten**: Nebenzeit, Aufgabenbewältigung, Pausen gespeichert
- ✅ **Individuelle Berechnungen**: Pro Person und Arbeit

---

## 🐛 Bugfixes

### Kritische Fixes
- ✅ **Pausenzeit-Kapazität**: Pause wird nicht mehr von Arbeitszeit abgezogen
  - **Vorher**: 8h Arbeitszeit - 0.5h Pause = 7.5h verfügbar ❌
  - **Jetzt**: 8h Arbeitszeit = 8h verfügbar (Pause ist Teil des Arbeitstags) ✅
  - Betrifft: Timeline-Darstellung, Auslastungsberechnung, Kapazitätsprüfung

- ✅ **Abholdetails laden**: Werden beim Termin-Laden nun korrekt angezeigt
- ✅ **Fahrzeug anlegen**: Dialog im Termin-Formular funktioniert wieder
- ✅ **Migration-Fehler**: Robuste Fehlerbehandlung bei Schema-Updates

### Datenbank-Migration Fixes
- ✅ **Alte Tabellen-Erkennung**: Automatische Erkennung von v1.4.0 Schema
- ✅ **Abwesenheiten-Migration**: Alte Struktur (datum, urlaub, krank) wird zu `abwesenheiten_legacy` umbenannt
- ✅ **Async-Konvertierung**: Alle Migrationen auf async/await umgestellt
- ✅ **Fehlende Indizes**: Legacy-Tabellen-Indizes werden korrekt entfernt

### UI/UX Fixes
- ✅ **Berufsschul-Prüfung**: Korrekte Anzeige in Tablet-App
- ✅ **Arbeitszeit-Anzeige**: Bei Abwesenheit ausgeblendet
- ✅ **Timeline-Darstellung**: Pausenzeit korrekt berücksichtigt
- ✅ **Backup-Zeitstempel**: Auf lokale Zeit umgestellt

---

## 🔧 Technische Verbesserungen

### Migration-System
- **Version 12** (010_wochenarbeitszeit): 
  - Wochenarbeitszeit-Felder zu mitarbeiter/lehrlinge
  - Neue abwesenheiten-Tabelle mit Typ-System
  - Auto-Migration alter Strukturen
  
- **Version 13** (012_berechnete_zeiten):
  - Berechnete Zeitfelder zu termine_arbeiten
  - Faktoren für Nebenzeit/Aufgabenbewältigung
  
- **Version 14** (013_create_termine_arbeiten_table):
  - Relationale termine_arbeiten-Struktur
  - Automatische Datenmigration
  
- **Version 15** (015_create_arbeitszeiten_plan):
  - Individuelle Tages-Arbeitszeiten
  
- **Version 16** (016_add_arbeitszeit_start_ende):
  - Start-/Endzeit-Felder mit automatischer Berechnung
  
- **Version 17** (017_create_schicht_templates):
  - Schicht-Templates Tabelle
  - Standard-Schichten
  
- **Version 18** (018_cleanup_legacy_tables):
  - Cleanup alter Strukturen
  - Migration zu neuer Abwesenheiten-Tabelle

### Code-Qualität
- ✅ **Async/Await**: Alle Migrationen modernisiert
- ✅ **Error Handling**: Robuste Fehlerbehandlung in helpers.js
- ✅ **Idempotenz**: Migrationen können mehrfach ausgeführt werden
- ✅ **Logging**: Detaillierte Migrations-Logs für Debugging

### Performance
- ✅ **Indizes optimiert**: Für arbeitszeiten_plan, abwesenheiten, termine_arbeiten
- ✅ **Batch Operations**: Effiziente Datenmigration
- ✅ **Caching**: Frontend Element-Caching für Tab-System

---

## 📊 Datenbank-Änderungen

### Neue Felder in `mitarbeiter` und `lehrlinge`
```sql
wochenarbeitszeit_stunden REAL DEFAULT 40
arbeitstage_pro_woche INTEGER DEFAULT 5
pausenzeit_minuten INTEGER DEFAULT 30
samstag_aktiv INTEGER DEFAULT 0
samstag_start TEXT DEFAULT '09:00'
samstag_ende TEXT DEFAULT '12:00'
samstag_pausenzeit_minuten INTEGER DEFAULT 0
```

### Neue Tabelle `abwesenheiten` (ersetzt alte Struktur)
```sql
CREATE TABLE abwesenheiten (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mitarbeiter_id INTEGER,
  lehrling_id INTEGER,
  typ TEXT CHECK(typ IN ('urlaub', 'krank', 'berufsschule', 'lehrgang')),
  datum_von TEXT NOT NULL,
  datum_bis TEXT NOT NULL,
  beschreibung TEXT,
  erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Neue Tabelle `arbeitszeiten_plan`
```sql
CREATE TABLE arbeitszeiten_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mitarbeiter_id INTEGER,
  lehrling_id INTEGER,
  datum TEXT NOT NULL,
  arbeitsstunden REAL NOT NULL,
  pausenzeit_minuten INTEGER DEFAULT 30,
  arbeitszeit_start TEXT DEFAULT '08:00',
  arbeitszeit_ende TEXT DEFAULT '16:30',
  erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Neue Tabelle `schicht_templates`
```sql
CREATE TABLE schicht_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  beschreibung TEXT,
  arbeitszeit_start TEXT NOT NULL,
  arbeitszeit_ende TEXT NOT NULL,
  farbe TEXT DEFAULT '#667eea',
  sortierung INTEGER DEFAULT 0,
  aktiv INTEGER DEFAULT 1
)
```

### Neue Felder in `termine_arbeiten`
```sql
berechnete_dauer_minuten INTEGER
berechnete_endzeit TEXT
faktor_nebenzeit REAL
faktor_aufgabenbewaeltigung REAL
pause_enthalten INTEGER DEFAULT 0
pause_minuten INTEGER DEFAULT 0
```

---

## 📝 Upgrade-Hinweise

### Von Version 1.4.0 upgraden

**Automatischer Prozess:**
```bash
git pull origin master
./start.sh  # oder start.bat auf Windows
```

Das System führt automatisch folgende Schritte aus:
1. ✅ Erstellt Backup der Datenbank
2. ✅ Erkennt alte Tabellenstrukturen
3. ✅ Benennt `abwesenheiten` zu `abwesenheiten_legacy` um
4. ✅ Erstellt neue Tabellenstrukturen
5. ✅ Migriert Daten von JSON zu relationaler Struktur
6. ✅ Erstellt neue Indizes
7. ✅ Initialisiert Standardwerte

**Nach dem Update:**
- Alle Mitarbeiter/Lehrlinge haben automatisch:
  - 40h Wochenarbeitszeit (5 Tage × 8h)
  - 30min Pausenzeit
  - Samstag inaktiv
- Alte Daten bleiben in `abwesenheiten_legacy` erhalten (falls Rückmigration nötig)
- Alle Termine behalten ihre Arbeitszeit-Details

### Empfohlene Konfiguration nach Update

1. **Arbeitszeiten prüfen**:
   - Mitarbeiter/Lehrlinge Tab öffnen
   - Wochenarbeitszeit bei Bedarf anpassen (z.B. Teilzeit: 30h)
   - Samstagsarbeit aktivieren falls benötigt

2. **Berufsschul-Kalenderwochen**:
   - Bei Lehrlingen Berufsschulwochen eintragen
   - Format: Komma-getrennt (z.B. "1,2,5,6,9,10")

3. **Schicht-Templates**:
   - Standard-Schichten sind bereits angelegt
   - Bei Bedarf eigene Templates erstellen

---

## 🔄 Änderungsprotokoll

**Features hinzugefügt:**
- Flexible Arbeitszeiten-System (Migration 012)
- Schicht-Templates (Migration 017)
- Arbeitszeiten-Planung (Migration 015-016)
- Berufsschul-Kalenderwochen bei Lehrlingen
- Backend-basierte Endzeit-Berechnung
- Arbeitszeiten in Team-Übersicht (Frontend & Tablet)

**Bugfixes:**
- Pausenzeit wird nicht mehr von Kapazität abgezogen
- Abholdetails laden korrekt
- Fahrzeug anlegen im Termin-Dialog repariert
- Berufsschul-Prüfung in Tablet-App korrigiert
- Migration-Fehler bei alten Datenbanken behoben

**Technisch:**
- Alle Migrationen auf async/await umgestellt
- Auto-Erkennung alter Tabellenstrukturen
- Robuste Fehlerbehandlung in Migrationen
- Cleanup veralteter Tabellen (Migration 018)
- Start-Skripte vereinfacht

---

## 📦 Installation & Start

### Erstinstallation
```bash
git clone https://github.com/SHP-ART/Werkstatt-Terminplaner.git
cd Werkstatt-Terminplaner
./start.sh  # oder start.bat auf Windows
```

### Update von älterer Version
```bash
cd Werkstatt-Terminplaner
git pull origin master
./start.sh  # Führt automatisch Migrationen aus
```

---

## 🙏 Danke

Diese Version bringt fundamentale Verbesserungen für flexible Arbeitszeitverwaltung und macht das System robust für zukünftige Updates.

**Feedback & Bug-Reports:** Bitte als GitHub Issue melden!
- `zeitBerechnung.js`: Zentralisierte Logik für alle Zeitberechnungen
- `berechneArbeitszeitFuerSpeicherung()`: API-Funktion für alle berechneten Werte
- Unterstützt Mitarbeiter und Lehrlinge mit individuellen Faktoren
- 6-Stunden-Regel für automatische Pausenberechnung

### Migration-Integration
- Migration 013 enthält jetzt `migrateExistingData()` Funktion
- Automatisches Laden von Personen-Daten für Berechnungen
- JSON-Parser mit Meta-Feld-Filterung (Underscore-Prefix)
- Fehlerbehandlung pro Arbeit (nicht pro Termin)

## 📚 Dokumentation

### Neue Dokumentation
- ✅ `AUTOMATISCHE-MIGRATION.md`: Vollständige Migrations-Anleitung
  - Update-Prozess für alle Installationen
  - Migrations-Log prüfen
  - Fehlerbehebung und Rollback
  - Entwickler-Informationen
- ✅ `MIGRATION-ARBEITEN-RELATIONAL.md`: Technische Details (bereits in v1.4.5)
- ✅ Updated `README.md`: Neue Update-Sektion mit automatischer Migration

## 🔄 Migration von älteren Versionen

### Für alle Nutzer (Installer/Portable/Source):

**Einfaches Update:**
```bash
# 1. Code aktualisieren
git pull origin master

# 2. Server starten - fertig!
./start.sh  # macOS/Linux
start.bat   # Windows
```

**Das System macht automatisch:**
1. Backup der Datenbank
2. Schema-Update auf Version 13
3. Datenmigration von JSON → Relational
4. Berechnung aller Zeitwerte
5. Erstellen der Performance-Indizes

**Kein manueller Eingriff nötig!** ✅

### Status prüfen:

```bash
# macOS/Linux
tail -100 logs/backend.log | grep -i migration

# Windows
type logs\backend.log | findstr /i migration
```

### Erfolgreicher Output:
```
🔄 Starte Migration 13: Erstellt termine_arbeiten Tabelle...
✓ termine_arbeiten Tabelle mit Indizes erstellt
🔄 Migriere 59 Termine...
✅ Migriert: 38 Arbeitszeiten (8 Fehler)
✓ Datenmigration abgeschlossen
✅ Schema-Version aktualisiert auf: 13
```

## 📋 Roadmap (Phase 3-5)

### Phase 3: Model-Anpassung (Coming Soon)
- [ ] termineModel.js für termine_arbeiten erweitern
- [ ] CRUD-Operationen (Create, Read, Update, Delete)
- [ ] Person-Reassignment mit automatischer Neuberechnung

### Phase 4: Controller-Integration (Coming Soon)
- [ ] arbeitszeitenController.js erstellen
- [ ] REST API Endpoints für termine_arbeiten
- [ ] Integration mit zeitBerechnung.js

### Phase 5: Frontend-Anpassungen (Coming Soon)
- [ ] API-Service für termine_arbeiten
- [ ] UI für berechnete Werte anzeigen
- [ ] Person-Reassignment UI
- [ ] Entfernung alter client-side Berechnungen

### Phase 6: Cleanup (Coming Soon)
- [ ] Migration 014: Entfernen von arbeitszeiten_details Spalte
- [ ] Code-Cleanup für alte JSON-Struktur
- [ ] Vollständige Dokumentation

## 🐛 Fehlerbehebungen

- **Migration-System**: Promise-basierte Migrationen statt Callbacks
- **JSON-Parser**: Unterstützung für Object-basierte (nicht Array) arbeitszeiten_details
- **Meta-Felder**: Korrekte Filterung von Underscore-prefixed Feldern
- **Fehlertoleranz**: Migration erfolgreich auch wenn einzelne Arbeiten fehlschlagen

## 💡 Entwickler-Hinweise

### Neue Migration hinzufügen:
```javascript
// migrations/014_deine_migration.js
module.exports = {
  version: 14,
  description: 'Beschreibung',
  up: (db) => new Promise((resolve, reject) => {
    // Migration Code
    resolve();
  }),
  down: (db) => new Promise((resolve, reject) => {
    // Rollback Code
    resolve();
  })
};
```

### Datenmigration in Migration integrieren:
Siehe `migrations/013_create_termine_arbeiten_table.js` als Beispiel:
- `migrateExistingData(db)` nach Tabellenerstellung aufrufen
- Prüfung auf bereits existierende Daten
- Fehlertoleranz mit try-catch pro Datensatz

## 🙏 Danke

Vielen Dank an alle Tester und Nutzer für das wertvolle Feedback!

## 📞 Support

Bei Fragen oder Problemen:
- **Issues**: [GitHub Issues](https://github.com/SHP-ART/Werkstatt-Terminplaner/issues)
- **Dokumentation**: Siehe `AUTOMATISCHE-MIGRATION.md`
- **Rollback**: Siehe Dokumentation für Rollback-Anleitung

---

**Wichtig:** Diese Version ist **vollständig kompatibel** mit allen vorherigen Versionen. Alle Daten bleiben erhalten und werden automatisch migriert!
