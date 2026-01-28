# Version 1.4.0 - Bugfixes & Verbesserungen

**Status:** ✅ Implementiert
**Release-Datum:** 28. Januar 2026
**Fokus:** Bugfixes für Intern-Ansicht, Arbeitszeitberechnung

---

## 📑 Inhaltsverzeichnis

1. [📋 Executive Summary](#-executive-summary)
2. [🐛 Bugfixes](#-bugfixes)
3. [🔧 Technische Verbesserungen](#-technische-verbesserungen)
4. [📝 Changelog](#-changelog)

---

## 📋 Executive Summary

Version 1.4.0 behebt kritische Bugs in der Intern-Ansicht und verbessert die Arbeitszeitberechnung.

### 🎁 Was ist neu?

**Bugfixes:**
- 🐛 **Fertig ca. Anzeige** - Intern-Tab zeigt jetzt korrekte Endzeit basierend auf manueller Arbeitszeit
- ⏱️ **Arbeitszeitberechnung** - Neue zentrale Funktion für konsistente Zeitberechnung
- 🚀 **Start-Skript** - `start.bat` repariert für Electron All-in-One

**Dokumentation:**
- 📚 **DATENBANK.md** - Aktualisiert mit fehlenden KI-Feldern (Schema Version 11)

---

## 🐛 Bugfixes

### Fertig ca. Anzeige in Intern-Tab

**Problem:**
Die Anzeige "Fertig ca." in der Intern-Ansicht (Mitarbeiter-Kacheln) zeigte eine falsche Endzeit an. Es wurde `geschaetzte_zeit` (aus dem Arbeitskatalog) verwendet statt der manuell eingegebenen Arbeitszeit aus `arbeitszeiten_details`.

**Beispiel:**
- Termin mit Startzeit 08:30
- `geschaetzte_zeit`: 30 Minuten (aus Arbeitskatalog)
- `arbeitszeiten_details`: `{"Wartung":132}` (= 2h 12min, manuell eingegeben)
- **Vorher**: Fertig ca. 09:00 ❌
- **Nachher**: Fertig ca. 10:42 ✅

**Lösung:**
Neue Hilfsfunktion `getEffektiveArbeitszeit(termin)` mit korrekter Priorität:
1. `tatsaechliche_zeit` (für abgeschlossene Termine)
2. **`arbeitszeiten_details`** (manuell eingegebene Zeiten) ← NEU
3. `geschaetzte_zeit` (Fallback aus Arbeitskatalog)
4. 60 Minuten (Standard-Fallback)

**Betroffene Funktionen:**
- `berechneEndzeit(termin)` - Endzeit-Berechnung
- `berechneAuftragFortschritt(termin)` - Fortschrittsbalken
- `berechneRestzeit(termin)` - Restzeit-Anzeige

### Start-Skript repariert

**Problem:**
`start.bat` versuchte separate Frontend/Backend-Server zu starten, was nicht mehr der aktuellen Architektur entspricht.

**Lösung:**
`start.bat` startet jetzt die Electron All-in-One App mit `npm start` im Backend-Verzeichnis.

---

## 🔧 Technische Verbesserungen

### Neue Funktion: getEffektiveArbeitszeit()

```javascript
/**
 * Ermittelt die effektive Arbeitszeit eines Termins
 * Priorität: arbeitszeiten_details > geschaetzte_zeit > 60 Min (Fallback)
 */
getEffektiveArbeitszeit(termin) {
  // 1. Für abgeschlossene Termine: tatsaechliche_zeit
  if (termin.status === 'abgeschlossen' && termin.tatsaechliche_zeit) {
    return termin.tatsaechliche_zeit;
  }
  
  // 2. arbeitszeiten_details (manuell eingegebene Arbeitszeiten)
  if (termin.arbeitszeiten_details) {
    // Summe aller Arbeitszeiten berechnen
    // ...
  }
  
  // 3. geschaetzte_zeit (Fallback aus Arbeitskatalog)
  return termin.geschaetzte_zeit || 60;
}
```

### Datenbank-Dokumentation aktualisiert

DATENBANK.md wurde mit folgenden fehlenden Feldern aktualisiert:

**Tabelle `termine`:**
- `notizen` - Interne Notizen zum Termin
- `ki_training_exclude` - Termin vom KI-Training ausschließen
- `ki_training_note` - Notiz für KI-Training

**Tabelle `werkstatt_einstellungen`:**
- `chatgpt_api_key` - API-Key für OpenAI
- `ki_enabled` - KI aktiviert (0/1)
- `realtime_enabled` - Echtzeit-Updates aktiviert (0/1)
- `ki_mode` - KI-Modus (local/openai)
- `smart_scheduling_enabled` - Smart Scheduling aktiviert (0/1)
- `anomaly_detection_enabled` - Anomalie-Erkennung aktiviert (0/1)
- `ki_external_url` - URL für externen KI-Service

---

## 📝 Changelog

### Added
- Neue Hilfsfunktion `getEffektiveArbeitszeit(termin)` für zentrale Arbeitszeitberechnung
- Unterstützung für manuell eingegebene Arbeitszeiten in allen Zeitberechnungen

### Changed
- `start.bat` angepasst für Electron All-in-One Start
- `berechneEndzeit()` nutzt jetzt `arbeitszeiten_details` mit höherer Priorität
- `berechneAuftragFortschritt()` berücksichtigt korrekte Arbeitszeit
- `berechneRestzeit()` berücksichtigt korrekte Arbeitszeit
- DATENBANK.md aktualisiert (Schema Version 11)

### Fixed
- "Fertig ca." bei Intern-Ansicht zeigte falsches Feld
- Intern-Tab zeigt jetzt korrekt die manuell eingegebene Arbeitszeit

---

## 📦 Dateien

**Geändert:**
- `frontend/src/components/app.js` - Bugfix Arbeitszeitberechnung
- `start.bat` - Electron All-in-One Start
- `DATENBANK.md` - Dokumentation aktualisiert
- `CHANGELOG.md` - Version 1.4.0 hinzugefügt
