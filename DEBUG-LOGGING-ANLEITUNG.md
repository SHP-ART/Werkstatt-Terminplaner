# Debug-Logging für Produktivsystem

## Übersicht

Umfangreiches Debug-Logging wurde hinzugefügt, um Bugs im Produktivsystem besser identifizieren und fixen zu können.

---

## Bug 1: Termin kann nicht auf Mitarbeiter gespeichert werden

### Symptom
- In der Planung kann ein Termin nicht auf einen Mitarbeiter zugeordnet werden
- Log zeigt: `[DEBUG] T-2026-037 - Arbeit "HU/AU" NICHT zugeordnet, Zuordnung: Object { type: null, id: null }`

### Hinzugefügte Debug-Logs

#### Frontend (app.js)

**Beim Speichern der Mitarbeiter-Zuordnung (`updateTerminMitarbeiter`):**
```javascript
console.log('[DEBUG] updateTerminMitarbeiter - Start');
console.log('[DEBUG] Termin-ID:', terminId);
console.log('[DEBUG] Selected Value:', selectedValue);  // z.B. "ma_5" oder "l_2"
console.log('[DEBUG] Mitarbeiter ID (wird gespeichert):', mitarbeiterIdValue);
console.log('[DEBUG] Schwebend-Status:', istSchwebend);
console.log('[DEBUG] Existing Details:', existingDetails);
console.log('[DEBUG] Update Data:', updateData);
console.log('[DEBUG] Sende API-Request: PUT /termine/' + terminId);
console.log('[DEBUG] Request Body:', JSON.stringify(updateData, null, 2));
console.log('[DEBUG] API Response:', response);
```

**Im Fehlerfall:**
```javascript
console.error('[ERROR] Fehler beim Speichern der Zuordnung:', error);
console.error('[ERROR] Stack:', error.stack);
```

#### Backend (termineController.js)

**Beim Empfang der Update-Anfrage:**
```javascript
console.log('[DEBUG] TermineController.update - Termin-ID:', req.params.id);
console.log('[DEBUG] Request Body:', JSON.stringify(req.body, null, 2));
console.log('[DEBUG] mitarbeiter_id aus Body:', mitarbeiter_id);
console.log('[DEBUG] arbeitszeiten_details aus Body:', req.body.arbeitszeiten_details);
console.log('[DEBUG] mitarbeiter_id_wert (geparst):', mitarbeiter_id_wert);
console.log('[DEBUG] updateData nach Parsing:', JSON.stringify(updateData, null, 2));
```

**Nach der Datenbank-Aktualisierung:**
```javascript
console.log('[DEBUG] Führe Datenbank-Update aus...');
console.log('[DEBUG] Datenbank-Update Ergebnis:', result);
console.log('[DEBUG] Anzahl geänderter Zeilen:', changes);
console.log('[DEBUG] Cache wird invalidiert');  // oder "NICHT invalidiert"
```

#### Backend (termineModel.js)

**In der Update-Methode:**
```javascript
console.log('[DEBUG] TermineModel.update - mitarbeiter_id wird aktualisiert:', mitarbeiter_id);
console.log('[DEBUG] TermineModel.update - arbeitszeiten_details wird aktualisiert');
console.log('[DEBUG] TermineModel.update - arbeitszeiten_details Inhalt:', arbeitszeiten_details);
console.log('[DEBUG] TermineModel.update - SQL:', sqlQuery);
console.log('[DEBUG] TermineModel.update - Values:', values);
console.log('[DEBUG] TermineModel.update - Result:', result);
console.log('[DEBUG] TermineModel.update - Changes:', result.changes);
```

## Verwendung im Produktivsystem

### 1. Browser-Konsole öffnen
- **Chrome/Edge:** F12 → Console-Tab
- **Firefox:** F12 → Konsole-Tab

### 2. Fehler reproduzieren
1. Gehe zur Planung-Ansicht
2. Wähle einen Termin aus
3. Versuche einen Mitarbeiter zuzuordnen
4. Beobachte die Console-Ausgaben

### 3. Logs auswerten

**Erwarteter Ablauf (erfolgreich):**
```
[DEBUG] updateTerminMitarbeiter - Start
[DEBUG] Termin-ID: 123
[DEBUG] Selected Value: ma_5
[DEBUG] Mitarbeiter ID (wird gespeichert): 5
[DEBUG] Update Data: { mitarbeiter_id: 5, arbeitszeiten_details: "...", ist_schwebend: 0 }
[DEBUG] Sende API-Request: PUT /termine/123
[DEBUG] API Response: { changes: 1, message: "Termin aktualisiert" }
```

**Im Fehlerfall suchen nach:**
- `[ERROR]` - zeigt den genauen Fehler
- `mitarbeiter_id: null` - Mitarbeiter wurde nicht korrekt übernommen
- `arbeitszeiten_details: null` - Details fehlen
- `Changes: 0` - Datenbank wurde nicht aktualisiert

### 4. Backend-Logs prüfen (Server)

**Logs anzeigen:**
```bash
# Windows
type logs\server.log | findstr DEBUG

# Linux/Mac
cat logs/server.log | grep DEBUG
```

**Oder live verfolgen:**
```bash
# Windows PowerShell
Get-Content logs\server.log -Wait -Tail 50

# Linux/Mac
tail -f logs/server.log
```

## Häufige Fehlerquellen

### 1. Mitarbeiter-ID ist NULL
**Symptom:** `mitarbeiter_id: null` in den Logs

**Mögliche Ursachen:**
- Falsches Select-Value Format (sollte `ma_5` sein, nicht `5`)
- JavaScript-Fehler beim Parsen
- Select-Element hat keinen Value

**Debug-Schritte:**
1. Prüfe `Selected Value` im Frontend-Log
2. Prüfe `mitarbeiterIdValue` - sollte eine Nummer sein
3. Prüfe `updateData.mitarbeiter_id` - sollte nicht null/undefined sein

### 2. arbeitszeiten_details ist NULL
**Symptom:** `arbeitszeiten_details: null` in den Logs

**Mögliche Ursachen:**
- `existingDetails` ist leer
- JSON.stringify schlägt fehl
- Details wurden nicht korrekt geladen

**Debug-Schritte:**
1. Prüfe `Existing Details` im Frontend-Log
2. Sollte mindestens `_gesamt_mitarbeiter_id` enthalten
3. Prüfe ob JSON.stringify funktioniert

### 3. Datenbank-Update schlägt fehl
**Symptom:** `Changes: 0` obwohl Daten gesendet wurden

**Mögliche Ursachen:**
- Termin-ID existiert nicht
- Daten sind identisch (keine Änderung)
- SQL-Fehler

**Debug-Schritte:**
1. Prüfe Backend-Logs für SQL-Fehler
2. Prüfe `TermineModel.update - Values` - sind die Werte korrekt?
3. Prüfe ob Termin in Datenbank existiert

## Performance-Hinweis

Diese Debug-Logs sind ausführlich und können die Performance leicht beeinträchtigen. 

**Nach dem Bugfix:**
- Logs können reduziert werden (nur ERROR-Logs behalten)
- Oder mit Environment-Variable steuern: `if (process.env.DEBUG_MODE) console.log(...)`

## Weitere Debug-Funktionen

### WebSocket-Verbindung prüfen
Die Logs zeigen bereits:
```
Connecting WebSocket to ws://192.168.0.42:3001
WebSocket-Verbindung hergestellt.
```

### Cache-Invalidierung verfolgen
Im Backend wird geloggt wann Caches invalidiert werden:
```
[DEBUG] Cache wird invalidiert
```

### API-Requests verfolgen
Alle API-Requests werden mit Body geloggt:
```
[DEBUG] Request Body: { ... }
```

## Nächste Schritte

1. **Fehler reproduzieren** und Logs sammeln
2. **Logs analysieren** - wo genau schlägt es fehl?
3. **Fix implementieren** basierend auf den Erkenntnissen
4. **Tests durchführen** um sicherzustellen dass es behoben ist
5. **Debug-Logs optional reduzieren** (nach Stabilisierung)

---

## Bug 2: Termin wird in Auslastung angezeigt, aber nicht in Planung & Zuweisung

### Symptom
- Termin wird erfolgreich gespeichert (Meldung: "Zuordnung gespeichert!")
- Termin erscheint in "📈 Auslastungsanzeige" an der richtigen Stelle
- Termin fehlt in "🏗️ Planung & Zuweisung (Beta)" Ansicht

### Hinzugefügte Debug-Logs

#### Frontend - Planung & Zuweisung (app.js → loadAuslastungDragDrop)

**Beim Laden der Ansicht:**
```javascript
console.log('[DEBUG] loadAuslastungDragDrop - Start');
console.log('[DEBUG] loadAuslastungDragDrop - Datum:', datum);
console.log('[DEBUG] Gesamte Termine geladen:', alleTermine.length);
console.log('[DEBUG] Termine für Datum:', termine.length);
console.log('[DEBUG] Schwebende Termine:', schwebendeTermine.length);
console.log('[DEBUG] Starte Termin-Verarbeitung für', termine.length, 'Termine');
```

**Für jeden Termin:**
```javascript
console.log('[DEBUG] Verarbeite Termin:', termin.termin_nr, 'ID:', termin.id);
console.log('[DEBUG] Termin XYZ - Prüfe Zuordnung');
console.log('[DEBUG] - arbeitszeiten_details:', termin.arbeitszeiten_details);
console.log('[DEBUG] - mitarbeiter_id (Feld):', termin.mitarbeiter_id);
console.log('[DEBUG] - Parsed details:', details);
```

**Nach Zuordnungs-Ermittlung:**
```javascript
console.log('[DEBUG] Termin XYZ - Finale Zuordnung:', {
  zuordnungsTyp,
  mitarbeiterId,
  lehrlingId,
  effektiveStartzeit,
  mitarbeiterMapHasKey: mitarbeiterId && !!mitarbeiterMap[mitarbeiterId],
  lehrlingMapHasKey: lehrlingId && !!lehrlingeMap[lehrlingId]
});
```

**Bei Timeline-Platzierung:**
```javascript
// Erfolgreich zugeordnet:
console.log('[DEBUG] Termin XYZ - Platziere auf Mitarbeiter-Timeline:', mitarbeiterId);
console.log('[DEBUG] Termin XYZ - Timeline-Elemente erstellt:', timelineElements.length);

// ODER nicht zugeordnet:
console.log('[DEBUG] Termin XYZ - NICHT ZUGEORDNET - platziere in "Nicht zugeordnet" Container');
console.log('[DEBUG] - Grund: zuordnungsTyp=', zuordnungsTyp, 'mitarbeiterId=', mitarbeiterId);
console.log('[DEBUG] - mitarbeiterMap hat Key?', mitarbeiterId && mitarbeiterMap[mitarbeiterId] !== undefined);
```

### Verwendung im Produktivsystem

**1. Browser-Konsole öffnen (F12)**

**2. Zur Planung & Zuweisung wechseln**

**3. Datum auswählen an dem der Termin sein sollte**

**4. Console-Log prüfen:**

**Erwarteter Ablauf (Termin wird angezeigt):**
```
[DEBUG] loadAuslastungDragDrop - Start
[DEBUG] loadAuslastungDragDrop - Datum: 2026-02-06
[DEBUG] Termine für Datum: 5
[DEBUG] Starte Termin-Verarbeitung für 5 Termine
[DEBUG] Verarbeite Termin: T-2026-037 ID: 123
[DEBUG] Termin T-2026-037 - Prüfe Zuordnung
[DEBUG] - mitarbeiter_id (Feld): 5
[DEBUG] - Parsed details: { _gesamt_mitarbeiter_id: { type: 'mitarbeiter', id: 5 } }
[DEBUG] Termin T-2026-037 - Finale Zuordnung: { zuordnungsTyp: 'mitarbeiter', mitarbeiterId: 5, ... }
[DEBUG] Termin T-2026-037 - Platziere auf Mitarbeiter-Timeline: 5
[DEBUG] Termin T-2026-037 - Timeline-Elemente erstellt: 1
```

**Fehlerfall (Termin fehlt):**
```
[DEBUG] loadAuslastungDragDrop - Start
[DEBUG] Termine für Datum: 5
[DEBUG] Verarbeite Termin: T-2026-037 ID: 123
[DEBUG] - mitarbeiter_id (Feld): null    ← PROBLEM: Mitarbeiter-ID fehlt!
[DEBUG] - Parsed details: null            ← PROBLEM: Details fehlen!
[DEBUG] Termin T-2026-037 - Finale Zuordnung: { zuordnungsTyp: null, ... }
[DEBUG] Termin T-2026-037 - NICHT ZUGEORDNET
[DEBUG] - Grund: zuordnungsTyp= null mitarbeiterId= null
```

### Diagnose-Schritte

**Schritt 1: Prüfen ob Termin überhaupt geladen wird**
- Suche nach: `Verarbeite Termin: T-2026-XXX`
- **Nicht gefunden?** → Termin ist nicht im Response vom Backend
  - Prüfe Datum (ist es korrekt?)
  - Prüfe ob Termin als "schwebend" markiert ist
  - Prüfe Backend-Logs für API-Request `/termine?datum=...`

**Schritt 2: Prüfen ob Zuordnung vorhanden ist**
- Suche nach: `Finale Zuordnung` für den Termin
- Prüfe `mitarbeiterId` - sollte eine Nummer sein, nicht `null`

**Schritt 3: Vergleich mit Auslastung**
- Wenn Termin in Auslastung erscheint, aber nicht in Planung
- Vergleiche welche Daten die Auslastung verwendet
- Auslastung nutzt: Backend-Berechnung (`/auslastung?datum=...`)
- Planung nutzt: Frontend-Logik mit `termin.mitarbeiter_id` und `arbeitszeiten_details`

**Schritt 4: Datenbank-Daten prüfen**
```sql
-- Im SQLite-Tool oder Backend-Terminal
SELECT id, termin_nr, mitarbeiter_id, arbeitszeiten_details, ist_schwebend 
FROM termine 
WHERE termin_nr = 'T-2026-037';
```

**Erwartetes Ergebnis:**
- `mitarbeiter_id`: NICHT NULL (z.B. `5`)
- `arbeitszeiten_details`: JSON mit `_gesamt_mitarbeiter_id`
- `ist_schwebend`: `0` (nicht schwebend)

### Häufige Fehlerquellen

**1. Mitarbeiter-ID wurde nicht gespeichert**
- Prüfe Backend-Logs: Wurde `mitarbeiter_id` im UPDATE übergeben?
- Prüfe Frontend-Logs: War `mitarbeiterIdValue` korrekt?

**2. arbeitszeiten_details ist NULL**
- Prüfe ob `_gesamt_mitarbeiter_id` gesetzt wurde
- Alte Termine (vor dem Update) haben evtl. nur `mitarbeiter_id`, kein `arbeitszeiten_details`

**3. Termin ist als schwebend markiert**
- Prüfe `ist_schwebend` Feld in Datenbank
- Schwebende Termine werden separat angezeigt (eigenes Panel)

**4. Mitarbeiter existiert nicht in mitarbeiterMap**
- Wurde der Mitarbeiter gelöscht oder deaktiviert?
- Prüfe ob Mitarbeiter in der Liste erscheint

### Fix-Vorschläge

**Wenn mitarbeiter_id gespeichert, aber arbeitszeiten_details fehlt:**
```javascript
// In loadAuslastungDragDrop - nach "Priorität 3"
if (!zuordnungsTyp && termin.mitarbeiter_id) {
  mitarbeiterId = termin.mitarbeiter_id;
  zuordnungsTyp = 'mitarbeiter';
  // ← Bereits implementiert, sollte funktionieren
}
```

**Wenn beide fehlen:**
- Problem liegt beim Speichern (siehe Bug 1)
- Prüfe Backend-Logs ob Update erfolgreich war

---
