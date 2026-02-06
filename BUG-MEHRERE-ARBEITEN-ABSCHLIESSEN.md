# Bug: Zwei Arbeiten in einem Termin - beide werden abgeschlossen

## Problem

Wenn ein Termin mehrere Arbeiten hat und man eine Arbeit in der Tablet-App abschließt, werden BEIDE Arbeiten als abgeschlossen markiert.

## Ursache

In `electron-intern-tablet/index.html`:
- Der `handleBeenden()` Handler setzt den gesamten Termin auf `status: 'abgeschlossen'`
- Es gibt keine Logik für einzelne Arbeiten-Status
- Die Tablet-App zeigt Termine als eine Einheit (mit `termin.arbeit` Feld)

## Lösung

### Option 1: Arbeiten-basierte Anzeige (Empfohlen)

**Vorteile:**
- Jede Arbeit wird separat angezeigt
- Jede Arbeit kann einzeln gestartet/abgeschlossen werden
- Konsistent mit Frontend "Planung & Zuweisung"

**Implementierung:**
1. Parse `arbeitszeiten_details` in der Tablet-App
2. Zeige jede Arbeit als separate Card
3. Füge `bearbeitung_abgeschlossen` Flag pro Arbeit hinzu
4. Termin ist erst komplett abgeschlossen wenn ALLE Arbeiten fertig sind

### Option 2: Termin-Status bleibt, aber Arbeiten-Progress tracken

**Vorteile:**
- Weniger UI-Änderungen
- Termin bleibt die Haupteinheit

**Implementierung:**
1. Füge `arbeiten_fortschritt` JSON-Feld hinzu
2. Track welche Arbeiten erledigt sind
3. Zeige Fortschritt in % (z.B. "1/2 Arbeiten erledigt")
4. "Fertig"-Button erscheint nur wenn alle Arbeiten fertig

## Aktueller Stand

**arbeitszeiten_details Format:**
```json
{
  "HU/AU": {
    "zeit": 60,
    "mitarbeiter_id": 5,
    "type": "mitarbeiter"
  },
  "Ölwechsel": {
    "zeit": 30,
    "mitarbeiter_id": 5,
    "type": "mitarbeiter"
  },
  "_gesamt_mitarbeiter_id": {
    "type": "mitarbeiter",
    "id": 5
  }
}
```

**Problem-Stelle:**
```javascript
async function handleBeenden(terminId, kundeName) {
  // ❌ Setzt GESAMTEN Termin auf abgeschlossen
  await ApiService.put(`/termine/${terminId}`, { 
    status: 'abgeschlossen',
    fertigstellung_zeit: new Date().toISOString()
  });
}
```

## Empfohlene Lösung: Option 1 (Arbeiten-basiert)

### Schritt 1: Erweitere arbeitszeiten_details

Füge `bearbeitung_abgeschlossen` Flag hinzu:

```json
{
  "HU/AU": {
    "zeit": 60,
    "mitarbeiter_id": 5,
    "type": "mitarbeiter",
    "bearbeitung_abgeschlossen": false
  },
  "Ölwechsel": {
    "zeit": 30,
    "mitarbeiter_id": 5,
    "type": "mitarbeiter",
    "bearbeitung_abgeschlossen": true
  }
}
```

### Schritt 2: Tablet-UI anpassen

Statt ein Termin-Block:
```
🔧 Aktueller Auftrag
T-2026-123
Kunde XYZ
WI-AB 123
HU/AU, Ölwechsel
[✓ Fertig]  ← Schließt ALLES ab
```

Mehrere Arbeiten-Blocks:
```
🔧 Aufträge für Kunde XYZ (WI-AB 123)

┌─────────────────────┐
│ 📋 HU/AU            │
│ ⏰ 60 Min           │
│ [▶️ Starten]        │
└─────────────────────┘

┌─────────────────────┐
│ 📋 Ölwechsel        │
│ ⏰ 30 Min           │
│ ✅ Abgeschlossen    │
└─────────────────────┘
```

### Schritt 3: Backend API anpassen

Neuer Endpoint: `PUT /termine/:id/arbeit/:arbeitName`

```javascript
// Markiere einzelne Arbeit als abgeschlossen
app.put('/termine/:id/arbeit/:arbeitName', async (req, res) => {
  const { id, arbeitName } = req.params;
  const termin = await TermineModel.getById(id);
  
  const details = JSON.parse(termin.arbeitszeiten_details || '{}');
  if (details[arbeitName]) {
    details[arbeitName].bearbeitung_abgeschlossen = true;
    details[arbeitName].fertigstellung_zeit = new Date().toISOString();
  }
  
  // Prüfe ob ALLE Arbeiten fertig sind
  const alleArbeiten = Object.keys(details).filter(k => !k.startsWith('_'));
  const alleAbgeschlossen = alleArbeiten.every(k => 
    details[k].bearbeitung_abgeschlossen === true
  );
  
  await TermineModel.update(id, {
    arbeitszeiten_details: JSON.stringify(details),
    status: alleAbgeschlossen ? 'abgeschlossen' : 'in_arbeit'
  });
  
  res.json({ success: true, alleAbgeschlossen });
});
```

## Debug-Logs hinzufügen

Füge in `handleBeenden` Debug-Logs hinzu:

```javascript
async function handleBeenden(terminId, kundeName) {
  try {
    console.log('[DEBUG] handleBeenden - terminId:', terminId);
    
    // Lade Termin-Details
    const termin = await ApiService.get(`/termine/${terminId}`);
    console.log('[DEBUG] Termin-Details:', termin);
    console.log('[DEBUG] arbeitszeiten_details:', termin.arbeitszeiten_details);
    
    // Parse Arbeiten
    if (termin.arbeitszeiten_details) {
      const details = JSON.parse(termin.arbeitszeiten_details);
      const arbeiten = Object.keys(details).filter(k => !k.startsWith('_'));
      console.log('[DEBUG] Anzahl Arbeiten:', arbeiten.length);
      console.log('[DEBUG] Arbeiten:', arbeiten);
      
      // WARNUNG wenn mehrere Arbeiten
      if (arbeiten.length > 1) {
        console.warn('[WARNUNG] Termin hat mehrere Arbeiten - alle werden abgeschlossen!');
        const bestaetigung = confirm(
          `⚠️ Dieser Termin hat ${arbeiten.length} Arbeiten:\n\n` +
          arbeiten.map((a, i) => `${i+1}. ${a}`).join('\n') +
          `\n\nAlle Arbeiten als abgeschlossen markieren?`
        );
        if (!bestaetigung) {
          console.log('[DEBUG] Abgeschlossen abgebrochen durch Benutzer');
          return;
        }
      }
    }
    
    await ApiService.put(`/termine/${terminId}`, { 
      status: 'abgeschlossen',
      fertigstellung_zeit: new Date().toISOString()
    });
    
    await loadTeamUebersicht();
    showToast(`Auftrag abgeschlossen: ${kundeName}`, 'success');
  } catch (error) {
    console.error('[ERROR] Fehler beim Beenden:', error);
    showToast(`Fehler: ${error.message}`, 'error');
  }
}
```

## Sofort-Fix (Temporär)

Als Sofort-Fix kann eine Bestätigung hinzugefügt werden wenn mehrere Arbeiten vorhanden sind (siehe Debug-Logs oben).

Dies warnt den Benutzer, löst aber nicht das eigentliche Problem.

## Langfristige Lösung

Implementiere Option 1 (Arbeiten-basierte Anzeige) für saubere Trennung der Arbeiten.
