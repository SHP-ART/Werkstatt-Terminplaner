# Version 1.1.5

**Geplantes Veröffentlichungsdatum:** TBD

## Geplante Features

### Feature: Priorität für schwebende Termine
- **Prioritätsstufen**: Schwebende Termine können mit einer Priorität versehen werden:
  - 🔴 **Hoch** - Dringend einzuplanen
  - 🟡 **Mittel** - Normal wichtig
  - 🟢 **Niedrig** - Kann warten
- **Sortierung**: Schwebende Termine werden nach Priorität sortiert (Hoch zuerst)
- **Visuelle Markierung**: Farbliche Kennzeichnung der Priorität in der schwebenden Termine-Liste
- **Beim Erstellen**: Priorität kann beim Erstellen eines schwebenden Termins gesetzt werden
- **Nachträglich änderbar**: Priorität kann jederzeit angepasst werden

## Änderungen

### Backend
- `termine` Tabelle: Neues Feld `schwebend_prioritaet` (TEXT: 'hoch', 'mittel', 'niedrig')
- `termineModel.js`: Priorität in Create/Update Methoden
- `termineController.js`: Sortierung nach Priorität bei schwebenden Terminen

### Frontend
- `app.js`: 
  - Prioritäts-Auswahl beim Erstellen/Bearbeiten von schwebenden Terminen
  - Sortierung der schwebenden Termine nach Priorität
  - Farbliche Markierung je nach Priorität
- `style.css`: CSS für Prioritäts-Badges und Farben

## Migration
- SQLite Migration: `ALTER TABLE termine ADD COLUMN schwebend_prioritaet TEXT DEFAULT 'mittel';`

## Kompatibilität
- Vollständig abwärtskompatibel mit v1.1.x
- Bestehende schwebende Termine erhalten automatisch Priorität "mittel"
