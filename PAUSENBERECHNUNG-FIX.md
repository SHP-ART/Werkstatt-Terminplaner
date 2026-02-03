# Fix: Pausenberücksichtigung in Timeline-Darstellung

## Problem Beschreibung

In der **🏗️ Planung & Zuweisung (Beta)** Ansicht wurden Termine, die über die Mittagspause von Mitarbeitern/Lehrlingen gelegt wurden, nicht korrekt dargestellt.

### Symptome:
1. **Fehlende Minuten**: Bei Terminen über Pausen fehlten Minuten in der Timeline-Darstellung
2. **Falsche Endzeit**: Der zweite Teil nach der Pause endete zu früh
3. **Kapazitätsprobleme**: Bei langen Terminen ab Arbeitsbeginn wurde die Pause "überzeichnet"

### Konkretes Beispiel:

**Ausgangssituation:**
- Mitarbeiter: Max Mustermann
- Mittagspause: 12:00-12:30 Uhr (30 Minuten)
- Termin: "Bremsen wechseln" mit 120 Minuten geschätzter Arbeitszeit
- Startzeit: 11:00 Uhr

**Alte (fehlerhafte) Darstellung:**
```
┌────────────────────────────────────────────────┐
│ 11:00-12:00 │ PAUSE │ 12:30-13:00             │
│   60 min    │ 🍽️ 30m │   30 min   ❌ FALSCH!  │
└────────────────────────────────────────────────┘
Sichtbar: 90 Minuten (30 Minuten fehlen!)
```

**Neue (korrekte) Darstellung:**
```
┌────────────────────────────────────────────────┐
│ 11:00-12:00 │ PAUSE │ 12:30-13:30             │
│   60 min    │ 🍽️ 30m │   60 min   ✅ KORREKT! │
└────────────────────────────────────────────────┘
Arbeitszeit: 120 Minuten
Gesamtdauer inkl. Pause: 150 Minuten (2,5 Stunden)
```

## Technische Details

### Betroffene Funktion:
**Datei:** `frontend/src/components/app.js`  
**Funktion:** `createTimelineTerminWithPause()`  
**Zeile:** ~20115-20185

### Code-Änderung:

**Vorher (FALSCH):**
```javascript
// Teil 2: Nach der Pause
const teil2Dauer = endMinutes - pauseEndMinuten;
if (teil2Dauer > 0) {
  // ... erstelle Teil 2
}
```

**Problem:** Diese Berechnung nahm die ursprüngliche Endzeit des Termins (ohne Pausenverlängerung) und zog die Pausenendzeit ab. Das führte zu fehlenden Minuten.

**Nachher (KORREKT):**
```javascript
// Teil 2: Nach der Pause
// WICHTIG: Die restliche Arbeitsdauer wird NACH der Pause fortgesetzt
// Die Pausenzeit verlängert also die Gesamtdauer des Termins
const teil2Dauer = dauer - teil1Dauer; // Verbleibende Arbeitszeit

if (teil2Dauer > 0) {
  // ... erstelle Teil 2
}
```

**Lösung:** Die verbleibende Arbeitszeit wird korrekt berechnet (Gesamtdauer minus Teil1), unabhängig von der Pausenlänge.

## Testfälle

### ✅ Testfall 1: Standard-Pause-Überschneidung
```
Startzeit:  11:00
Dauer:      120 min (2h Arbeit)
Pause:      12:00-12:30

Erwartet:
- Teil 1: 11:00-12:00 (60 min)
- Pause:  12:00-12:30 (30 min)
- Teil 2: 12:30-13:30 (60 min)
Gesamt:   150 min Kalenderdauer, 120 min Arbeitszeit
```

### ✅ Testfall 2: Langer Termin ab Arbeitsbeginn
```
Startzeit:  08:00
Dauer:      300 min (5h Arbeit)
Pause:      12:00-12:30

Erwartet:
- Teil 1: 08:00-12:00 (240 min = 4h)
- Pause:  12:00-12:30 (30 min)
- Teil 2: 12:30-13:30 (60 min = 1h)
Gesamt:   330 min Kalenderdauer, 300 min Arbeitszeit
```

### ✅ Testfall 3: Termin VOR Pause (keine Aufteilung)
```
Startzeit:  09:00
Dauer:      120 min
Pause:      12:00-12:30

Erwartet:
- Kein Split: 09:00-11:00 (120 min)
```

### ✅ Testfall 4: Termin NACH Pause (keine Aufteilung)
```
Startzeit:  13:00
Dauer:      120 min
Pause:      12:00-12:30

Erwartet:
- Kein Split: 13:00-15:00 (120 min)
```

## Auswirkungen

### Positive Effekte:
1. ✅ **Korrekte Timeline-Visualisierung**: Termine zeigen die vollständige Arbeitszeit
2. ✅ **Richtige Kapazitätsplanung**: Termine blockieren korrekt die Zeitslots
3. ✅ **Keine Überschneidungen**: Pausen werden respektiert und Termine verlängert
4. ✅ **Bessere UX**: Planer sehen auf einen Blick die echte Termindauer inkl. Pausen

### Backend/Kapazität:
Die **Backend-Kapazitätsberechnung** war bereits korrekt, da sie auf den `arbeitszeiten_details` basiert und die tatsächliche Arbeitszeit erfasst. Die Änderung betrifft **ausschließlich** die Frontend-Visualisierung in der Timeline.

## Betroffene Ansichten

### 🏗️ Planung & Zuweisung (Beta)
- ✅ Timeline-Darstellung (Hauptview)
- ✅ Drag & Drop Terminzuweisung
- ✅ Kapazitätsbalken

### NICHT betroffen:
- ❌ 📊 Kalenderansicht (nutzt andere Darstellung)
- ❌ 📈 Auslastungsanzeige (Backend-berechnet)
- ❌ 👷 Team-Übersicht Intern (keine Timeline-Splits)

## Manuelle Verifikation

Nach dem Deployment folgende Schritte ausführen:

1. **Öffne 🏗️ Planung & Zuweisung (Beta)**
2. **Wähle einen Arbeitstag** (z.B. heutiges Datum)
3. **Erstelle oder ziehe einen Termin** mit 120 min Dauer auf 11:00 Uhr
4. **Prüfe Timeline-Darstellung:**
   - ✅ Zwei Blöcke sichtbar: 11:00-12:00 und 12:30-13:30
   - ✅ Beide Teile zusammen = 120 min Arbeitszeit
   - ✅ Pause (🍽️) zwischen den Teilen sichtbar
5. **Prüfe Kapazitätsanzeige:**
   - ✅ Belegt-Zeit sollte 120 min (+ Nebenzeit) zeigen
   - ✅ Keine Unterbelegung durch fehlende Minuten

## Commit-Information

```
Commit: 92749a1
Branch: master
Datum: 2026-02-03

Dateien:
- frontend/src/components/app.js (Zeile ~20145)
- test-pause-berechnung.md (neu)
```

## Zusätzliche Hinweise

### Pausenzeit-Konfiguration:
- Standard: **30 Minuten**
- Pausenstart: **individuell pro Mitarbeiter/Lehrling** (z.B. 12:00, 12:15, 12:30)
- Pausendauer: **Fest auf 30 Minuten** (kann bei Bedarf angepasst werden)

### Zukünftige Erweiterungen:
- [ ] Variable Pausendauern pro Person
- [ ] Mehrere Pausen pro Tag (z.B. Kaffeepausen)
- [ ] Automatische Pausenplanung bei sehr langen Terminen

---

**Status:** ✅ BEHOBEN  
**Version:** ab Commit 92749a1  
**Test-Status:** ✅ Build erfolgreich, manueller Test ausstehend
