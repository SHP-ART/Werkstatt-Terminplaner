# Version 1.4.5 - Wochenarbeitszeit-Management

**Release-Datum:** 2. Februar 2026

## 🎯 Hauptfeatures

### Flexible Wochenarbeitszeitverwaltung
- **Individuelle Wochenstunden** statt fixer Tagesstunden
- **Variable Arbeitstage** pro Woche (1-6 Tage)
- **Pausenzeit-Konfiguration** pro Mitarbeiter/Lehrling (0-120 Minuten)
- **Automatische Tageskapazitätsberechnung** basierend auf Wochenarbeitszeit

### Samstagsarbeit-System
- **Aktivierbare Samstagsarbeit** mit individuellen Zeitfenstern
- **Konfigurierbare Start- und Endzeiten** (z.B. 9-12 Uhr)
- **Separate Pausenzeit** für Samstag
- **Automatische Kapazitätsberechnung** für Samstage

### Erweiterte Abwesenheitsverwaltung
- **4 Abwesenheitstypen**: Urlaub 🏖️, Krank 🤒, Lehrgang 📖, Berufsschule 📚
- **Personenbezogene Abwesenheiten** mit Datum-Ranges
- **Beschreibungsfelder** für Details
- **Automatische Kapazitätsreduktion** bei Abwesenheit
- **Visuelle Badges** in Timeline und Planungsansicht

### Intelligente Kapazitätsanzeige
- **Timeline-Integration** mit Echtzeit-Auslastung
- **Farbcodierung**: 
  - 🟢 Grün < 70% Auslastung
  - 🟡 Gelb 70-90% Auslastung
  - 🔴 Rot > 90% Auslastung
- **Stunden-Anzeige**: `⏱️ 3,5h / 8h (44%)`
- **Abwesenheits-Anzeige**: `🏖️ URLAUB`, `🤒 KRANK`, etc.

### Überlastungswarnung mit intelligentem Vorschlag
- **Automatische Prüfung** vor Terminzuweisung
- **Modale Warnung** bei Kapazitätsüberschreitung
- **3 Optionen**:
  1. ❌ Abbrechen
  2. ⚠️ Trotzdem zuweisen (Überlastung ignorieren)
  3. 📅 Auf nächsten freien Tag verschieben (mit Kapazitätsanzeige)
- **Überlauf-Berechnung**: Zeigt wie viele Stunden zu viel

## 🔧 Technische Änderungen

### Backend

#### Datenbank (Migration 010)
- **7 neue Felder** pro mitarbeiter/lehrlinge:
  - `wochenarbeitszeit_stunden` (REAL DEFAULT 40)
  - `arbeitstage_pro_woche` (INTEGER DEFAULT 5)
  - `pausenzeit_minuten` (INTEGER DEFAULT 30)
  - `samstag_aktiv` (INTEGER DEFAULT 0)
  - `samstag_start` (TEXT DEFAULT '09:00')
  - `samstag_ende` (TEXT DEFAULT '12:00')
  - `samstag_pausenzeit_minuten` (INTEGER DEFAULT 0)

- **Neue Tabelle** `abwesenheiten`:
  - Personenbezogene Abwesenheiten (statt tagesbasiert)
  - 4 Typen: urlaub, krank, berufsschule, lehrgang
  - Datum-Ranges mit beschreibung
  - Foreign Keys zu mitarbeiter/lehrlinge

- **Legacy-Unterstützung**:
  - Alte `abwesenheiten` → `abwesenheiten_legacy`
  - Alte Felder bleiben als Fallback erhalten

#### Models
- `mitarbeiterModel.js` - Erweitert mit 7 Feldern
- `lehrlingeModel.js` - Erweitert mit 7 Feldern
- `abwesenheitenModel.js` - Komplett refactored für neue Struktur

#### Controllers
- `mitarbeiterController.js` - Validierung: 1-168h, 1-6 Tage, 0-120min
- `lehrlingeController.js` - Identische Validierung
- `abwesenheitenController.js` - 10 neue Endpoints (CRUD + Queries)

#### API Endpoints (neu)
```
GET    /api/abwesenheiten
GET    /api/abwesenheiten/:id
GET    /api/abwesenheiten/datum/:datum
GET    /api/abwesenheiten/mitarbeiter/:id
GET    /api/abwesenheiten/lehrling/:id
GET    /api/abwesenheiten/range?datum_von=X&datum_bis=Y
POST   /api/abwesenheiten
PUT    /api/abwesenheiten/:id
DELETE /api/abwesenheiten/:id
```

### Frontend

#### UI-Erweiterungen (index.html)
- **Mitarbeiter/Lehrlinge-Tabellen**: 6 → 13 Spalten
- **Neue Felder**: Woche(h), Arbeitstage, Pause(Min), Sa aktiv, Sa Start, Sa Ende, Sa Pause
- **Toggle-Buttons** für Samstag-Felder (aktivieren/deaktivieren)
- **4 Abwesenheits-Tabs**:
  - 🏖️ Urlaub
  - 🤒 Krank
  - 📖 Lehrgang
  - 📚 Berufsschule
- **Forms** mit Person-Selector, Datum-Range, Beschreibung
- **Tabellen** mit Liste und Löschen-Button

#### JavaScript (app.js)
- `calculateTageskapazitaetMinuten()` - Neue Haupt-Berechnungslogik
- `calculateTageskapazitaetMinutenSync()` - Synchrone Version für Timeline
- `findeNaechstenVerfuegbarenTag()` - 14-Tage-Lookahead
- `checkKapazitaetVorZuweisung()` - Überlastungsprüfung
- `showVerschiebeWarnung()` - Modale Warnung mit 3 Optionen
- `toggleSamstagFelder()` - UI-Toggle für Samstag-Felder
- `loadAbwesenheitenPersonen()` - Dropdown-Befüllung
- `handleUrlaubSubmit()` - Urlaubsformular
- `handleKrankSubmit()` - Krankmeldungsformular
- `handleLehrgangSubmit()` - Lehrgangsformular
- `handleBerufsschuleSubmit()` - Berufsschulformular
- `loadUrlaubListe()` / `loadKrankListe()` / etc. - Listen-Rendering
- Timeline-Rendering erweitert mit Kapazitätsanzeige

#### Services (api.js)
- `EinstellungenService.getAllAbwesenheiten()`
- `EinstellungenService.createAbwesenheit(data)`
- `EinstellungenService.deleteAbwesenheit(id)`
- Route-Korrekturen für neue API-Struktur

## 📦 Migration & Kompatibilität

### Automatische Migration
- **Beim ersten Start** läuft Migration 010 automatisch
- **Bestehende Daten** bleiben vollständig erhalten
- **Neue Felder** erhalten Standardwerte (40h, 5 Tage, 30min Pause)

### Konvertierungs-Script
```bash
cd backend
node convert-old-data.js
```

**Funktionen**:
- Konvertiert `arbeitsstunden_pro_tag` × 5 = `wochenarbeitszeit_stunden`
- Beispiel: 8h/Tag → 40h/Woche
- Nur Standardwerte werden überschrieben
- Bereits konfigurierte Werte bleiben unverändert

### Fallback-Logik
```javascript
// System nutzt ALTE oder NEUE Werte:
if (person.wochenarbeitszeit_stunden) {
  // Neue Berechnung
} else if (person.arbeitsstunden_pro_tag) {
  // Alte Berechnung als Fallback
}
```

**Ergebnis**: System funktioniert mit v1.0-1.3 Daten ohne Änderungen!

## 📚 Dokumentation

### Neue Dateien
- `MIGRATION-ALT-NEU.md` - Vollständiger Migrations-Guide
- `backend/convert-old-data.js` - Konvertierungs-Script
- `backend/run-migration-010.js` - Standalone Migration-Runner
- `backend/migrations/010_wochenarbeitszeit.js` - Migration-Definition

### Aktualisierte Dateien
- `README.md` - Update-Sektion hinzugefügt
- `AGENTS.md` - Projektstruktur dokumentiert

## 🐛 Bugfixes
- API-Routen für Abwesenheiten korrigiert (`/abwesenheiten/:id` statt `/abwesenheiten/item/:id`)
- Feldnamen in API-Aufrufen korrigiert (`datum_von`/`datum_bis` statt `von_datum`/`bis_datum`)
- Toast-Nachrichten verwenden jetzt konsistent `showToast()` statt `alert()`
- Event-Listener für alle 4 Abwesenheitstypen registriert
- Sub-Tab-Aktivierung für Lehrgang und Berufsschule hinzugefügt

## 🔄 Breaking Changes
**KEINE!** Das System ist vollständig abwärtskompatibel mit v1.0-1.3.

## 💡 Verwendung

### 1. Mitarbeiter konfigurieren
**⚙️ Werkstatt-Einstellungen → Mitarbeiter**

1. Trage Wochenarbeitszeit ein (z.B. 40h für Vollzeit, 20h für Teilzeit)
2. Wähle Arbeitstage pro Woche (Standard: 5)
3. Setze Pausenzeit (Standard: 30 Minuten)
4. Aktiviere Samstag falls benötigt:
   - Checkbox "Sa aktiv" ✓
   - Start: 09:00
   - Ende: 12:00
   - Pause: 15 Minuten
5. Speichern

### 2. Abwesenheiten eintragen
**⚙️ Werkstatt-Einstellungen → Mitarbeiter**

Klicke auf einen der 4 Tabs:
- 🏖️ **Urlaub**: Jahresurlaub, Sonderurlaub
- 🤒 **Krank**: Krankmeldungen
- 📖 **Lehrgang**: Fortbildungen, Schulungen
- 📚 **Berufsschule**: Berufsschul-Zeiten für Lehrlinge

Formular ausfüllen:
1. Person auswählen
2. Von-Datum und Bis-Datum
3. Optional: Beschreibung
4. "Eintragen" klicken

### 3. Planung nutzen
**🏗️ Planung & Zuweisung (Beta)**

- **Timeline** zeigt jetzt Kapazität: `⏱️ 3,5h / 8h (44%)`
- **Farben** signalisieren Auslastung:
  - 🟢 < 70%: Gut verfügbar
  - 🟡 70-90%: Gut ausgelastet
  - 🔴 > 90%: Überlastet
- **Abwesenheiten** werden als Badge angezeigt: `🏖️ URLAUB`
- **Drag & Drop** mit automatischer Überlastungsprüfung
- **Modale Warnung** bei Überlastung mit intelligenten Vorschlägen

## 🔮 Ausblick v1.5.0

Geplant für v1.5.0:
- **Feiertage-System** (bundeslandspezifisch)
- **Schichtplanung** (Früh-/Spätschicht)
- **Team-Kapazitätsansicht** (alle Mitarbeiter auf einen Blick)
- **Urlaubsplanung** mit Genehmigungsworkflow
- **Kapazitätsprognose** (14-Tage-Vorschau)

## 📊 Statistik

- **7 neue Datenbank-Felder** pro Person
- **1 neue Tabelle** (abwesenheiten)
- **10 neue API-Endpoints**
- **15+ neue JavaScript-Funktionen**
- **4 neue UI-Formulare**
- **~2.000 Zeilen Code** hinzugefügt

## 🙏 Credits

Entwickelt für den täglichen Werkstatt-Einsatz mit Fokus auf Benutzerfreundlichkeit und Flexibilität.

---

**Installation:**
```bash
./start.sh
```

**Update von v1.0-1.3:**
```bash
./start.sh  # Migration läuft automatisch
cd backend
node convert-old-data.js  # Optional: Alte Daten konvertieren
```

**Dokumentation:** [MIGRATION-ALT-NEU.md](MIGRATION-ALT-NEU.md)
