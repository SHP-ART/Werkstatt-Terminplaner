# Design: Neuer-Kunde-Popup im Terminformular

**Datum:** 2026-04-09  
**Status:** Approved

## Kontext

Im "Neuer Termin"-Formular gibt es eine Kundensuche (`#terminNameSuche`). Wenn kein Treffer gefunden wird, erscheint aktuell nur ein Badge `+ Neuer Kunde` und die Meldung "Kein Kunde gefunden - wird als neuer Kunde angelegt". Der Kunde wird dann beim Termin-Speichern still angelegt — nur mit Name und Telefon.

Das Feature ergänzt diesen Flow um ein Popup, das vollständige Kundendaten direkt beim Anlegen abfragt.

## Auslöser

Zwei Wege öffnen das Modal `#neuerKundeModal`:

1. **Badge-Klick**: Der `+ Neuer Kunde`-Badge (`#kundeStatusAnzeige`) bekommt einen click-Handler → `openNeuerKundeModal()`
2. **Dropdown-Button**: In der `"Kein Kunde gefunden"`-Meldung (`.keine-vorschlaege`) erscheint ein `➕ Jetzt anlegen`-Button → `openNeuerKundeModal()`

Beim Öffnen wird der aktuelle Inhalt von `#terminNameSuche` als Vorbelegung in das Nachname-Feld übertragen.

## Modal-Felder

| Feld | ID | Pflicht | Bemerkung |
|---|---|---|---|
| Nachname | `#nkNachname` | Ja | Vorbefüllt aus `#terminNameSuche` |
| Vorname | `#nkVorname` | Nein | |
| Telefon | `#nkTelefon` | Nein | |
| Kennzeichen (3-teilig) | `#nkKzBezirk` / `#nkKzBuchstaben` / `#nkKzNummer` | Ja | Gleiche CSS-Klassen wie im Hauptformular (`kz-feld kz-bezirk` etc.) |
| Auto Modell | `#nkFahrzeugtyp` | Nein | Wird als `fahrzeugtyp` gespeichert |
| Kilometerstand ca. | `#nkKilometerstand` | Nein | Wird auf den Termin übertragen, nicht auf den Kunden |

**Name-Zusammensetzung**: `name = vorname ? "${nachname}, ${vorname}" : nachname`

**Keine DB-Erweiterung** — das Kunden-Modell bleibt unverändert (`name, telefon, kennzeichen, fahrzeugtyp`).

## Speicher-Flow

### 1. Validierung im Modal
- Nachname nicht leer
- Kennzeichen: mindestens Bezirk nicht leer
- Bei Fehler: Fehlermeldung in `#nkFehler` (inline im Modal, kein Alert)

### 2. API-Aufruf
```js
KundenService.create({
  name,       // "Nachname, Vorname" oder nur Nachname
  telefon,
  kennzeichen,  // zusammengesetztes Kennzeichen
  fahrzeugtyp
})
```

### 3. Nach Erfolg: Terminformular befüllen
- `#kunde_id` → neue Kunden-ID
- `#terminNameSuche` → zusammengesetzter Name
- `#kundeStatusAnzeige` → `✓ Kunde angelegt` (Klasse `gefunden`)
- `#kennzeichen` → Kennzeichen aus Popup
- `#fahrzeugtyp` → Auto Modell aus Popup
- `#kilometerstand` → KM-Stand aus Popup
- `#gefundenerKundeAnzeige` → einblenden (grüne Box)
- Kundensuche-Dropdown schließen (`this.hideVorschlaege('name')`)
- `this.kundenCache` auffrischen (`this.loadKunden()`)
- Modal schließen

### 4. Fehlerfall
- Fehlermeldung in `#nkFehler` anzeigen
- Modal bleibt offen

## Dateien die geändert werden

| Datei | Änderung |
|---|---|
| `frontend/index.html` | Modal-HTML `#neuerKundeModal` hinzufügen |
| `frontend/src/components/app.js` | `openNeuerKundeModal()`, `closeNeuerKundeModal()`, `saveNeuerKunde()` hinzufügen; `handleNameSuche()` + `updateKundeStatusBadge()` anpassen |
| `frontend/src/styles/style.css` | CSS für `#neuerKundeModal` (kann vorhandene Modal-Styles nutzen) |

## Was NICHT geändert wird

- `backend/src/models/kundenModel.js` — kein neues DB-Feld
- `frontend/src/services/api.js` — `KundenService.create()` akzeptiert bereits alle nötigen Felder
- `executeTerminSave()` — der bestehende "neuer Kunde"-Pfad bleibt als Fallback erhalten

## Abgrenzung zu anderen Stellen

Das Feature gilt **nur** für den "Neuer Termin"-Flow. Die Wartende-Aktionen-Kundensuche (`setupWartendeAktionenKundensuche`) und der Schnell-Termin-Flow werden **nicht** verändert.
