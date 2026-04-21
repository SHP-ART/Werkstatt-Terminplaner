# 🏗️ Planung & Zuweisung – Drag & Drop Dokumentation

> Tab: **🏗️ Planung (Beta)** → `auslastung-dragdrop`

---

## 1. Übersicht der Ansicht

Die Planungsansicht teilt sich in vier Bereiche:

```
┌─────────────────────────────────────────────────────────┐
│  📊 Tagesauslastungsbalken (gesamt)                      │
├─────────────────────────────────────────────────────────┤
│  ⚠️ Warnungs-Banner (nur bei Anomalien des Tages)        │
├─────────────────────────────────────────────────────────┤
│  ⏰ Zeitplan (Timeline 8:00–18:00)                       │
│     👷 Mitarbeiter 1  [ Termin A ][ Termin B ]           │
│     👷 Mitarbeiter 2  [ Termin C ]                       │
│     🎓 Lehrling 1     [ Termin D ]                       │
├─────────────────────────────────────────────────────────┤
│  📋 Nicht zugeordnet (Pool – Gestern / Heute / Morgen)  │
├─────────────────────────────────────────────────────────┤
│  ⏸️ Schwebende Termine │ ⚠️ Überfällige Termine          │
└─────────────────────────────────────────────────────────┘
```

> Das Warnungs-Banner (`auslastungWarnungBanner`) erscheint nur, wenn für den
> ausgewählten Tag Anomalien erkannt wurden (z.B. Überlastung, fehlende Zuordnungen,
> Konflikte). Es ist per × ausblendbar.

---

## 2. Steuerleiste – Bedienelemente

| Element | Funktion |
|---|---|
| `◀ Tag` / `Tag ▶` | Einen Tag zurück / vor navigieren |
| `◀◀ Woche` / `Woche ▶▶` | Eine Woche zurück / vor springen |
| `Heute` | Direkt auf heute springen |
| Datum-Eingabefeld | Beliebiges Datum direkt wählen |
| Wochen-Info / Aktueller-Tag-Badge | Zeigt KW und Wochentag des gewählten Datums (z.B. `Montag, KW 16`) |
| **Raster-Dropdown** | Snap-Raster für Drag & Drop: **5 / 10 / 15 / 30 Minuten** |
| `💾 Speichern` | Alle ungespeicherten Zuweisungen auf einmal ins Backend schreiben |
| `↩️ Verwerfen` | Alle noch nicht gespeicherten Änderungen rückgängig machen |
| `🤖 KI-Tagesvorschlag` | KI verteilt die Termine des aktuellen Tages optimal auf Mitarbeiter (erfordert lokales KI-Modell oder Ollama/OpenAI) |
| `📅 KI-Wochenverteilung` | KI verteilt schwebende Termine auf die gesamte Woche |

### Änderungs-Badge

Solange noch ungespeicherte Zuweisungen vorliegen, erscheint ein oranger Badge
`N Änderungen` neben dem Speichern-Button. Beim Datumswechsel mit offenen
Änderungen erscheint eine Bestätigungsabfrage.

---

## 3. Schätzzeiten & Richtzeiten

### Woher kommt die Blockbreite eines Termins?

Die Funktion `getTerminGesamtdauer(termin)` ermittelt die Dauer in dieser Priorität:

```
1. tatsaechliche_zeit  (wenn Termin in_arbeit oder abgeschlossen)
   └─ Bei in_arbeit: Livemessung (Jetzt − Startzeit) gewinnt wenn größer
   └─ Bei abgeschlossen: Min(tatsaechliche_zeit, fertigstellung_zeit − startzeit)

2. _dauer_override     (manuell im Schnell-Bearbeitungs-Dialog gesetzt)

3. Summe der Einzel-Arbeiten aus arbeitszeiten_details
   └─ Bei abgeschlossenen Einzel-Arbeiten: tatsaechliche_zeit der Arbeit

4. geschaetzte_zeit    (Fallback – direkt am Termin gespeichert)
```

### Richtzeiten aus der Zeitverwaltung

Richtzeiten sind in der Tabelle `arbeitszeiten` hinterlegt:

| Feld | Bedeutung |
|---|---|
| `bezeichnung` | Name der Arbeit (z.B. "Reifenwechsel") |
| `standard_minuten` | Richtwert in Minuten |
| `aliase` | Alternative Bezeichnungen, kommagetrennt |

**Wo wird der Richtwert genutzt:**
- **Folgetermin-Anlage** (beim Arbeitsende mit laufenden Terminen):  
  Richtwert − bereits gestempelte Minuten = Restzeit des neuen Folgetermins
- **Neue Termin-Erstellung**: Auto-Vorschlag der Dauer beim Eintippen der Arbeit
- **KI-Schätzung**: Lokales Modell lernt aus abgeschlossenen Terminen und
  verfeinert die Richtwerte

**Fuzzy-Match-Logik** (Reihenfolge):
1. Exakter Treffer auf `bezeichnung` (normalisiert: Kleinbuchstaben, Sonderzeichen→Leerzeichen)
2. Teilstring-Treffer (Suchwort ⊂ Bezeichnung oder umgekehrt)
3. Treffer in `aliase`-Feld

---

## 4. Nebenzeiten

Nebenzeiten sind Zusatzaufwände, die auf die reine Arbeitszeit aufgeschlagen werden
(Rüstzeiten, Aufräumen, Dokumentation, …).

### Konfiguration

**Einstellungen → Werkstatt → Nebenzeit:**
- `nebenzeit_prozent` (global, z.B. `15` = +15 %)
- Pro Mitarbeiter: `mitarbeiter.nebenzeit_prozent` (überschreibt den globalen Wert)
- Pro Lehrling: `lehrlinge.nebenzeit_prozent`

### Auswirkung auf die Timeline

```
Blockbreite = round(Arbeitszeit × (1 + nebenzeit_prozent / 100))
```

**Beispiel:** Arbeit = 60 min, Nebenzeit = 15 % → Blockbreite = 69 min

### Wo wird Nebenzeit angewendet?

| Stelle | Verhalten |
|---|---|
| Timeline-Blockbreite | Immer mit Nebenzeit (visuell größer) |
| Auslastungsberechnung | `belegt_minuten` (mit NZ) vs. `belegt_minuten_roh` (ohne NZ) |
| Sequentielle Arbeitsblöcke | Jede Arbeit verlängert sich, nächste startet versetzt |
| Kapazitäts-Check beim Drop | Prüft gegen Tagespuffer inkl. Nebenzeit |
| Fertigstellung-Schätzung | Endzeit = Startzeit + Dauer × (1 + NZ/100) |

> **Hinweis:** In der Kapazitätsanzeige (`⏱️ Xh / Yh (Z%)`) ist `Y` die Nettokapazität
> ohne Nebenzeit. Die Nebenzeit verringert die verfügbare Restkapazität automatisch.

---

## 5. Mitarbeiterzuordnung

### Wie wird einem Termin ein Mitarbeiter zugewiesen?

Zuordnung wird im Feld `arbeitszeiten_details` (JSON) gespeichert.

**Struktur:**
```json
{
  "_gesamt_mitarbeiter_id": { "type": "mitarbeiter", "id": 3 },
  "_startzeit": "09:30",
  "Reifenwechsel": { "zeit": 60, "mitarbeiter_id": 3, "startzeit": "09:30" },
  "Inspektion":   { "zeit": 45, "mitarbeiter_id": 3, "startzeit": "10:30" }
}
```

**Zuordnungs-Priorität beim Rendern:**
1. `details._gesamt_mitarbeiter_id` → Hauptzuordnung
2. Erste Arbeit mit eigener Zuordnung (bei nur 1 Arbeit)
3. Fallback auf `termin.mitarbeiter_id` (direktes DB-Feld)

**Lehrlinge** verwenden `type: "lehrling"` und werden auf der Lehrlings-Zeile
angezeigt (🎓).

### Abwesenheiten

Abwesende Personen (Urlaub, Krank, Lehrgang, Berufsschule) erhalten:
- Ein Badge in der Timeline-Zeile: `🏖️ URLAUB` / `🤒 KRANK` / `📖 LEHRGANG` / `📚 BERUFSSCHULE`
- Graue Zeile (`abwesend-track`) – keine Drop-Zone
- Kapazität = 0

---

## 6. Lehrling – Aufgabenbewältigung (%)

Lehrlinge können langsamer oder schneller arbeiten als ein ausgelernter Mitarbeiter.
Das wird über das Feld `aufgabenbewaeltigung_prozent` (in der Lehrlingsverwaltung)
gesteuert.

### Auswirkung

```
Effektive Blockdauer = Grundzeit × (aufgabenbewaeltigung_prozent / 100)
```

**Beispiele:**
| Wert | Bedeutung | Beispiel (60 min Arbeit) |
|---|---|---|
| `100` | Normal (kein Effekt) | 60 min |
| `150` | Lehrling braucht 50 % länger | 90 min |
| `80` | Lehrling ist schneller | 48 min |

**Berechnungsreihenfolge:**
```
1. Nebenzeit anwenden: Dauer × (1 + nebenzeit_prozent / 100)
2. Aufgabenbewältigung anwenden: Ergebnis × (aufgabenbewaeltigung_prozent / 100)
```

**Wo wird es angewendet:**
- `getTerminGesamtdauer()` – Blockbreite in der Timeline
- `createTimelineTermin` / `createArbeitBlockElement` – Breite des Balkens
- Kapazitätsberechnung – Lehrling belegt entsprechend mehr/weniger Minuten

---

## 7. Drag & Drop – Was passiert beim Ziehen?

### Termin ziehen (aus Pool oder Timeline)

1. **Dragstart:** Termin-ID, Arbeitname, Arbeit-Index, Dauer werden in `dataTransfer` gelegt
2. **Dragover (kontinuierlich):**
   - Berechnet Snap-Position (Raster-Einstellung)
   - Prüft ob Position gesperrt ist (Arbeitsbeginn-Block, Feierabend-Block, aktive Pause)
   - Prüft Mittagspausen-Kollision
   - Prüft Termin-Überlappungen (oranges `⚠️` im Zeit-Indikator)
   - Zeigt **schwimmenden Zeit-Indikator** mit Start- und Endzeit
   - Zeigt **blaue/rote Positionslinie** auf der Zielbahn
3. **Drop:**
   - Berechnet finale Snap-Zeit (identisch zu Dragover → kein Drift)
   - Auto-Korrektur bei Mittagspausen-Kollision (schiebt Termin nach der Pause)
   - Smart-Anhängen: Wenn ein Termin <45 min vor einem anderen endet, wird der
     neue Termin mit 10 min Puffer dahinter positioniert (Toast-Meldung)
   - Kapazitätscheck (bei Neuzuweisung): Warnung wenn Mitarbeiter überlastet
   - Schreibt Änderung in lokalen Puffer (`planungAenderungen`)
   - Batch-Speicherung durch Klick auf `💾 Speichern`

### Einzelne Arbeitsblöcke ziehen

Bei Terminen mit mehreren Arbeiten (z.B. Inspektion + Reifenwechsel) kann jeder
Block einzeln auf eine andere Person gezogen werden.

```
[Reifenwechsel → MA 1][Inspektion → Lehrling 2]
                              ↑ separater Block, separat ziehbar
```

### Gesperrte Bereiche (nicht droppbar)

| Bereich | Darstellung | Warum |
|---|---|---|
| Vor Arbeitsbeginn | Grauer Block links | Kommen-Zeit aus Tagesstempel |
| Nach Arbeitsende | Grauer Block rechts | Geplantes Arbeitsende |
| Mittagspause (geplant) | Gelber Streifen | Pausenzeit konfiguriert |
| Mittagspause (aktiv) | Roter Streifen | Pause läuft gerade live |
| Abwesend-Track | Gesamte Zeile gesperrt | Urlaub/Krank/… |

---

## 8. Kontextmenü auf Timeline-Block (Klick auf Termin)

Öffnet per Klick auf einen platzierten Terminblock in der Timeline.

| Menüpunkt | Icon | Funktion |
|---|---|---|
| **Zeiten festlegen** | ⏱️ | Öffnet vollständiges Arbeitszeiten-Modal für den Termin |
| **Termin aufteilen** | ✂️ | Split-Dialog: Termin auf zwei Personen/Tage aufteilen |
| **Auftrag erweitern** | ➕ | Zusatzarbeit anhängen (Anschluss / Morgen / Datum) |
| **Bis Feierabend / Folgearbeit morgen** | 🌙 | Termin läuft bis Feierabend → Rest automatisch als Folgetermin morgen |
| **Termin-Details** | 📋 | Vollständige Termin-Detailansicht öffnen |
| **Löschen** | 🗑️ | Termin in den Papierkorb |

### Schnell-Zeitfelder im Kontextmenü

Direkt im Menü können Zeiten eingetragen werden, ohne das große Modal zu öffnen:

| Feld | Bedeutung |
|---|---|
| 🟢 **Startzeit-Stempelung** | Uhrzeit wann der Techniker mit der Arbeit begonnen hat |
| 🏁 **Fertigstellungszeit** | Uhrzeit der Fertigstellung (wird als ISO-Timestamp gespeichert) |

Enter im Zeitfeld oder `💾 Zeiten speichern` → sofort gespeichert, Timeline wird aktualisiert.

---

## 9. Panels im linken Bereich

### 📋 Nicht zugeordnet

Zeigt alle Termine ohne Mitarbeiterzuweisung. Gruppierung nach Datum:

| Gruppe | Inhalt |
|---|---|
| ⬅️ **Gestern** | Termine vom Vortag ohne abgelaufenes Abholdatum |
| 📌 **Heute** | Termine des aktuell gewählten Tages |
| ➡️ **Morgen** | Termine des nächsten Tages (Vorabplanung) |
| 📋 **Weitere** | Alle anderen Termine bis N Tage (1/2/3/7 über Filter-Buttons) |

Jede Gruppe zeigt Anzahl der Termine und Gesamtdauer (`3 Termine · 2h 30min`).

### ⏸️ Schwebende Termine

Termine mit `ist_schwebend = 1` – noch kein Datum/Mitarbeiter fix.
Sortierung wählbar:

| Option | Beschreibung |
|---|---|
| Nach Datum | Nächste Abholfrist zuerst |
| Nach Dauer | Längste zuerst |
| Nach Kunde | Alphabetisch |
| Nach Dringlichkeit | Kritisch → Hoch → Normal |
| Nach Priorität | Interne Priorität |

### ⚠️ Überfällige Termine

Termine aus vergangenen Tagen mit Status ≠ `abgeschlossen` und ≠ `storniert`.
Werden von der Timeline automatisch erkannt und hier aufgelistet.

---

## 10. Kapazitätsanzeige je Mitarbeiter/Lehrling

```
👷 Max Mustermann  [🏖️ URLAUB]
⏱️ 4.5h / 8.0h (56%)
```

| Farbe | Bedeutung |
|---|---|
| Grün | < 70 % belegt |
| Orange | 70–89 % belegt |
| Rot (fett) | ≥ 90 % – überbucht |

Die Kapazität verwendet `belegt_minuten_roh` (reine Arbeitszeit ohne Nebenzeit)
als Zähler, da Nebenzeit bereits im Zeitplan sichtbar ist.

---

## 11. Überlappungsverhalten

| Situation | Verhalten |
|---|---|
| Termin-Überlappung | ⚠️ Toast-Warnung, Termin wird trotzdem platziert (kein Zwang) |
| Mittagspausen-Überlappung | Termin wird automatisch **nach** der Pause platziert (Toast) |
| Außerhalb Arbeitszeit | Drop wird blockiert: `❌ Termine können nicht außerhalb der Arbeitszeit platziert werden` |
| Überlastung | Dialog mit Optionen: Trotzdem zuweisen / Abbrechen |
| Smart-Anhängen | Bei Termin <45 min hinter Vorgänger: Auto-Anhängen mit 10 min Puffer |

---

## 12. Backend-Endpunkte (Planungs-Relevanz)

| Endpunkt | Methode | Zweck |
|---|---|---|
| `/api/termine` | GET | Alle Termine laden (inkl. schwebende) |
| `/api/termine?datum=` | GET | Termine für ein Datum (mit aktiven Pausen) |
| `/api/auslastung/:datum` | GET | Auslastungsberechnung für Timeline-Kapazitäten |
| `/api/arbeitszeiten-plan/for-date` | GET | Arbeitszeit-Fenster pro Mitarbeiter/Lehrling |
| `/api/tagesstempel?datum=` | GET | Echte Ankunftszeiten (kommen_zeit) |
| `/api/abwesenheiten/datum/:datum` | GET | Abwesenheiten für Kapazitätsberechnung |
| `/api/einstellungen/werkstatt` | GET | Nebenzeit-Prozent und weitere Einstellungen |
| `/api/termine/:id` | PATCH | Startzeit / Mitarbeiter / Datum speichern (Drag & Drop) |
| `/api/ki-planung/tagesvorschlag` | POST | KI-Tagesoptimierung |
| `/api/ki-planung/wochenverteilung` | POST | KI-Wochenverteilung schwebender Termine |

---

## 13. Datenfluss beim Speichern

```
Drag → planungAenderungen Map (lokaler Puffer)
         │
         └─► [💾 Speichern] → savePlanungAenderungen()
                               │  iteriert alle Änderungen
                               └─► PATCH /api/termine/:id
                                   {
                                     mitarbeiter_id / lehrling_id,
                                     arbeitszeiten_details: { _gesamt_mitarbeiter_id, _startzeit, ... },
                                     datum
                                   }
                               └─► broadcastEvent('termin.updated', ...) → alle Clients aktualisieren
```

---

## 14. Häufige Fragen / Fallstricke

### Warum ist der Balken breiter als die Arbeit dauert?

→ Nebenzeit ist aktiv. In den Einstellungen `nebenzeit_prozent` prüfen.

### Warum springt ein Termin beim Drop auf eine andere Uhrzeit?

→ Mittagspausen-Kollision wurde erkannt – der Termin wurde automatisch
nach der Pause platziert (Toast-Meldung mit neuer Uhrzeit).

### Warum erscheint ein Lehrlings-Block breiter?

→ `aufgabenbewaeltigung_prozent > 100` ist gesetzt (Lehrling braucht länger).

### Warum wird ein Termin in „Nicht zugeordnet" angezeigt, obwohl er einen Mitarbeiter hat?

→ Prüfen ob der Mitarbeiter heute als abwesend eingetragen ist.
→ `arbeitszeiten_details._gesamt_mitarbeiter_id` korrekt gesetzt?
→ Mitarbeiter im System vorhanden und aktiv?

### Termin mit mehreren Arbeiten erscheint nicht auf der richtigen Zeile

→ Jede Arbeit braucht eine eigene Zuordnung in `arbeitszeiten_details`.
→ Arbeiten ohne `zeit > 0` werden ignoriert (nicht als separater Block gerendert).
