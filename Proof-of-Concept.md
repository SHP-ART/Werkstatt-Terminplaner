# Proof-of-Concept: ChatGPT-Integration für Terminerstellung

## Übersicht

Dieses Dokument beschreibt die geplante Integration von OpenAI's ChatGPT API in den Werkstatt-Terminplaner zur intelligenten Unterstützung bei der Terminerstellung.

### 🔧 Werkstatt-Profil: Citroën-Markenwerkstatt

> **Wichtig:** Diese Werkstatt ist eine **offizielle Citroën-Markenwerkstatt**.
> - Primär: Citroën-Fahrzeuge (alle Modelle)
> - Sekundär: Andere Marken **nur bei Bestandskunden**
> 
> Die KI-Integration muss dies berücksichtigen!

---

## 🎯 Ziele des Proof-of-Concept

1. **Spracheingabe → Strukturierte Daten**: Freitext-Eingabe in Termin-Felder umwandeln
2. **Intelligente Arbeitserkennung**: Umgangssprache → Standardisierte Arbeitsbezeichnungen
3. **Automatische Zeitschätzung**: KI-basierte Zeitvorschläge basierend auf Arbeiten + Fahrzeugtyp
4. **Teileerkennung**: Automatisches Erkennen benötigter Ersatzteile
5. **🆕 Auslastungsoptimierung**: KI schlägt optimale Termine basierend auf Werkstattauslastung vor
6. **🆕 Teile-Bestellungs-Assistent**: Automatische Erinnerungen und Checklisten für Teilebestellungen

---

## 🚗 Citroën-Markenwerkstatt: Spezifische KI-Anpassungen

### Warum ist das wichtig?

Als Citroën-Markenwerkstatt hat die KI Zugang zu:
- **Citroën-Diagnose-Codes** und deren Bedeutung
- **Original-Teilenummern** (PSA-Teilenummernstruktur)
- **Citroën-Wartungsintervalle** und Service-Pakete
- **Modellspezifische Schwachstellen** und häufige Reparaturen

### Automatische Marken-Erkennung

```
┌─────────────────────────────────────────────────────────┐
│ 🚗 Fahrzeug-Erkennung                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Kennzeichen: [OSL-F 159]                               │
│ Fahrzeugtyp: [Citroën BERLINGO        ] ← Auto-erkannt │
│                                                         │
│ ✅ Citroën-Fahrzeug erkannt                            │
│    → Citroën-Originalteile verfügbar                   │
│    → Garantie-Arbeiten möglich                         │
│    → Citroën-Service-Pakete anwendbar                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Fremdmarken-Prüfung (Bestandskunden)

Bei Nicht-Citroën-Fahrzeugen:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ Fremdmarke erkannt: VW Golf                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Als Citroën-Markenwerkstatt nehmen wir Fremdmarken     │
│ nur von Bestandskunden an.                             │
│                                                         │
│ Kunde: [Müller, Hans                 ]                 │
│                                                         │
│ 🔍 Prüfung: Ist dieser Kunde bereits bekannt?          │
│                                                         │
│ ✅ Bestandskunde seit: 15.03.2019                      │
│    Letzte Reparatur: 12.11.2025 (Citroën C3)          │
│    → Fremdmarke wird akzeptiert                        │
│                                                         │
│ ─── ODER ───                                           │
│                                                         │
│ ❌ Neukunde - Fremdmarke nicht akzeptiert              │
│    💡 Empfehlung: An freie Werkstatt verweisen         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Citroën-spezifische Teile-Vorschläge

```javascript
// System-Prompt Ergänzung für Teile-Erkennung
const CITROEN_SYSTEM_PROMPT = `
Du bist ein Teile-Experte für eine Citroën-Markenwerkstatt.

WICHTIG:
- Bevorzuge IMMER Citroën-Originalteile (OE)
- Kenne die PSA-Teilenummernstruktur (z.B. 1109.CK für Ölfilter)
- Bei Citroën-Fahrzeugen: Original-Teile für Garantie erforderlich
- Bei Fremdmarken: Qualitäts-Aftermarket-Teile vorschlagen

Citroën-Modelle und häufige Teile:
- C1/C3/C4/C5: PSA-Motoren (EB/EP/DV)
- Berlingo: Nutzfahrzeug-spezifische Teile
- Jumper/Jumpy: LKW-Teile, höhere Belastung
- DS-Modelle: Premium-Teile erforderlich

Bei Ölwechsel immer Citroën-Spezifikation beachten:
- PSA B71 2290 (Benziner neuere Modelle)
- PSA B71 2296 (Diesel DPF)
`;
```

### Citroën Service-Pakete

Die KI kennt die offiziellen Citroën-Wartungspakete:

| Service-Paket | Enthält | Typische Zeit |
|---------------|---------|---------------|
| **Essential** | Ölwechsel, Sichtprüfung, Reset | 45 Min |
| **Reference** | Essential + Filter, Bremsen prüfen | 90 Min |
| **Serenity** | Reference + Klimaservice, Batterie | 120 Min |
| **HU/AU Vorbereitung** | Citroën-Prüfprotokoll | 60 Min |

### KI-Logik für Marken-Prüfung

```javascript
// Backend: Prüfung bei Terminerstellung
async function pruefeFremdmarke(fahrzeugtyp, kundeId) {
  const istCitroen = /citro[eë]n|citroen|ds\s?\d|berlingo|c[1-8]|jumper|jumpy|spacetourer/i
    .test(fahrzeugtyp);
  
  if (istCitroen) {
    return { 
      akzeptiert: true, 
      grund: 'Citroën-Fahrzeug',
      hinweis: null 
    };
  }
  
  // Fremdmarke - Bestandskunden-Prüfung
  const kunde = await KundenModel.getById(kundeId);
  if (!kunde) {
    return {
      akzeptiert: false,
      grund: 'Neukunde mit Fremdmarke',
      hinweis: 'Als Citroën-Markenwerkstatt nehmen wir Fremdmarken nur von Bestandskunden an.'
    };
  }
  
  // Prüfe ob Kunde schon Termine/Reparaturen hatte
  const vorherigeTermine = await TermineModel.getByKundeId(kundeId);
  if (vorherigeTermine.length === 0) {
    return {
      akzeptiert: false,
      grund: 'Keine vorherigen Aufträge',
      hinweis: 'Kunde ist registriert, hat aber noch keine Reparaturen bei uns.'
    };
  }
  
  return {
    akzeptiert: true,
    grund: 'Bestandskunde',
    hinweis: `Bestandskunde seit ${kunde.erstellt_am}. Fremdmarke akzeptiert.`,
    letzterTermin: vorherigeTermine[0]
  };
}
```

### Citroën-Diagnose-Integration (Zukunft)

Mögliche Erweiterung: KI interpretiert Diagnose-Codes:

```
Eingabe: "Fehlercode P0420"

KI-Antwort:
┌─────────────────────────────────────────────────────────┐
│ 🔧 Diagnose: P0420 - Katalysator Wirkungsgrad          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Bei Citroën-Fahrzeugen (PSA-Motoren) häufig:           │
│ • Lambdasonde defekt (80% der Fälle)                   │
│ • Katalysator verschlissen (15%)                       │
│ • Falsche Kraftstoffgemisch (5%)                       │
│                                                         │
│ Empfohlene Arbeiten:                                   │
│ ☑ FEHLERAUSLESEN KOMPLETT           30 Min            │
│ ☑ LAMBDASONDE PRÜFEN                20 Min            │
│ ☐ LAMBDASONDE WECHSELN (falls def.) 45 Min            │
│                                                         │
│ Citroën-Teile:                                         │
│ • Lambdasonde OE: 1618.HC (~85€)                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🆕 Erweiterte Funktionen: Auslastung & Teile

### 🗓️ Intelligente Terminvorschläge (Auslastungsoptimierung)

#### Konzept
Die KI analysiert die aktuelle Werkstattauslastung und schlägt optimale Zeitfenster für neue Termine vor:

- **Lücken füllen**: Erkennt freie Kapazitäten und schlägt diese bevorzugt vor
- **Arbeitstyp-Matching**: Gruppiert ähnliche Arbeiten (z.B. alle Inspektionen vormittags)
- **Ressourcen-Planung**: Berücksichtigt Mitarbeiter-Spezialisierungen und Hebebühnen
- **Vorlaufzeit für Teile**: Termine mit Teilebestellung nicht zu früh einplanen

#### Beispiel-Dialog
```
Benutzer: "Citroën Reference Service für C4, ca. 90 Minuten"

KI-Antwort:
┌─────────────────────────────────────────────────────────┐
│ 🤖 Terminvorschläge für: Reference Service (90 Min)     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ⭐ EMPFOHLEN: Donnerstag, 16.01. um 08:00               │
│    • Auslastung: 45% (viel Kapazität)                  │
│    • Keine Überschneidung mit anderen Inspektionen     │
│    • Citroën-Originalteile vorrätig                    │
│                                                         │
│ 🔵 Alternative 1: Mittwoch, 15.01. um 13:00            │
│    • Auslastung: 72%                                   │
│    • ⚠️ Kurze Vorlaufzeit falls Sonderteile nötig      │
│                                                         │
│ 🔵 Alternative 2: Freitag, 17.01. um 09:00             │
│    • Auslastung: 58%                                   │
│    • Passt gut zu anderen Citroën-Terminen an dem Tag  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### API-Endpunkt
```
POST /api/ai/optimize-termin
{
  "arbeiten": ["CITROËN REFERENCE SERVICE"],
  "geschaetzte_zeit": 90,
  "fahrzeugtyp": "Citroën C4 1.2 PureTech",
  "fruehestes_datum": "2026-01-14",
  "teile_benoetigt": true,
  "ist_citroen": true
}

Response:
{
  "vorschlaege": [
    {
      "datum": "2026-01-16",
      "uhrzeit": "08:00",
      "score": 95,
      "gruende": [
        "Geringe Auslastung (45%)",
        "Citroën-Originalteile vorrätig",
        "Freie Hebebühne verfügbar",
        "Citroën-Diagnosegerät frei"
      ],
      "warnungen": []
    },
    ...
  ]
}
```

---

### 📦 Teile-Bestellungs-Assistent

#### Konzept
Die KI hilft dabei, keine Teilebestellung zu vergessen und optimiert den Bestellzeitpunkt:

1. **Automatische Teile-Erkennung** bei Terminerstellung
2. **Bestellerinnerungen** basierend auf Lieferzeiten
3. **Sammelbestellungen** für mehrere Termine vorschlagen
4. **Verfügbarkeitsprüfung** vor Terminbestätigung

#### Funktionen im Detail

##### A) Teile-Checkliste bei Terminerstellung
```
┌─────────────────────────────────────────────────────────┐
│ 📦 Teile-Check für: REFERENCE SERVICE - Citroën C3      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ✅ Citroën-Originalteile (meist vorrätig):              │
│    ☑ Ölfilter PSA 1109.CK (EB2 Motor)                  │
│    ☑ Motoröl Total Quartz 5W-30 PSA B71 2290 (4L)      │
│    ☑ Luftfilter OE 1444.XE                             │
│    ☑ Innenraumfilter OE 6479.C9                        │
│    ☑ Ablassschraube-Dichtring OE 0313.40               │
│                                                         │
│ ⚠️ Verschleißteile (nach Prüfung):                     │
│    ☐ Bremsbeläge VA (Verschleißanzeige prüfen)         │
│    ☐ Bremsscheiben VA (Mindestmaß prüfen)              │
│    ☐ Wischerblätter Citroën Original                   │
│                                                         │
│ 🔧 PSA-Spezialteile (Vorlaufzeit 2-3 Tage):            │
│    ☐ Zahnriemensatz (falls >80.000km bei PureTech)     │
│    ☐ Zündkerzen (falls >60.000km)                      │
│                                                         │
│ ─────────────────────────────────────────────────       │
│ 💡 KI-Empfehlung (Citroën-spezifisch):                 │
│ "Letzte Inspektion war vor 28.000km. Bei PureTech-     │
│  Motoren Steuerkette auf Längung prüfen. Citroën       │
│  empfiehlt Bremsflüssigkeitswechsel alle 2 Jahre."     │
│                                                         │
│ [Alles als "bestellen" markieren]  [Checkliste drucken]│
└─────────────────────────────────────────────────────────┘
```

##### B) Bestellerinnerungs-Dashboard
```
┌─────────────────────────────────────────────────────────┐
│ 🔔 Teile-Bestellungen - Citroën Werkstatt               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ 🔴 DRINGEND (Termin in <2 Tagen, Teile fehlen):        │
│ ─────────────────────────────────────────────────       │
│ • T-2026-012: Mo 13.01. - Zahnriemen Citroën C4 HDi    │
│   ⚠️ PSA Zahnriemensatz + Wasserpumpe FEHLT            │
│   [Bei Citroën bestellen] [Termin verschieben]         │
│                                                         │
│ 🟡 BALD BESTELLEN (Termin in 3-5 Tagen):               │
│ ─────────────────────────────────────────────────       │
│ • T-2026-015: Do 16.01. - Reference Service C3         │
│   → Ölfilter 1109.CK, Luftfilter 1444.XE bestellen     │
│ • T-2026-016: Fr 17.01. - Kupplung Berlingo            │
│   → PSA Kupplungssatz bestellen (Lieferzeit 2 Tage)    │
│                                                         │
│ 🟢 EINGEPLANT (Teile bestellt/vorrätig):               │
│ ─────────────────────────────────────────────────       │
│ • T-2026-010: Di 14.01. - Ölwechsel Citroën C5 ✓       │
│ • T-2026-011: Di 14.01. - Bremsenwechsel DS3 ✓         │
│                                                         │
│ ─────────────────────────────────────────────────       │
│ 💡 KI-Vorschlag: "4 Citroën-Termine diese Woche        │
│    brauchen Ölfilter 1109.CK. Sammelbestellung bei     │
│    PSA-Teilevertrieb spart 18€."                       │
│                     [Sammelbestellung erstellen]       │
└─────────────────────────────────────────────────────────┘
```

##### C) Automatische Benachrichtigungen
```javascript
// Täglicher Cronjob: Teile-Erinnerungen prüfen
async function pruefeTeileBedarf() {
  // Hole alle Termine der nächsten 5 Tage
  const termine = await getTermineNextDays(5);
  
  for (const termin of termine) {
    // Prüfe Teile-Status
    if (termin.teile_status === 'bestellen') {
      const tageNochZeit = daysBetween(today, termin.datum);
      
      if (tageNochZeit <= 2) {
        // DRINGEND - Push-Notification / E-Mail
        await sendNotification({
          typ: 'dringend',
          titel: `⚠️ Teile für ${termin.termin_nr} fehlen!`,
          text: `Termin in ${tageNochZeit} Tag(en), Teile noch nicht bestellt.`
        });
      } else if (tageNochZeit <= 4) {
        // Erinnerung im Dashboard anzeigen
        await addDashboardWarning(termin);
      }
    }
  }
}
```

---

### 🧠 KI-Logik für Auslastungsoptimierung

#### Bewertungskriterien (Score 0-100)
```javascript
function berechneTerminScore(slot, termin, werkstattDaten) {
  let score = 100;
  
  // 1. Auslastung (max -40 Punkte)
  const auslastung = getAuslastung(slot.datum);
  if (auslastung > 90) score -= 40;
  else if (auslastung > 80) score -= 30;
  else if (auslastung > 70) score -= 20;
  else if (auslastung > 60) score -= 10;
  
  // 2. Teile-Vorlaufzeit (max -30 Punkte)
  if (termin.teile_benoetigt) {
    const vorlaufTage = daysBetween(today, slot.datum);
    if (vorlaufTage < 1) score -= 30; // Zu kurzfristig
    else if (vorlaufTage < 2) score -= 20;
    else if (vorlaufTage < 3) score -= 10;
  }
  
  // 3. Ähnliche Arbeiten am Tag (Bonus +10)
  const aehnlicheTermine = getTermineMitAehnlicherArbeit(slot.datum, termin.arbeiten);
  if (aehnlicheTermine.length > 0) score += 10; // Effizienz-Bonus
  
  // 4. Mitarbeiter-Verfügbarkeit (max -20 Punkte)
  const passendeMitarbeiter = getMitarbeiterFuerArbeit(slot.datum, termin.arbeiten);
  if (passendeMitarbeiter.length === 0) score -= 20;
  
  // 5. Kundenwunsch berücksichtigen
  if (termin.wunschDatum === slot.datum) score += 15;
  
  return Math.max(0, Math.min(100, score));
}
```

#### System-Prompt für KI-Optimierung
```
Du bist ein Werkstattplaner-Assistent für eine Citroën-Markenwerkstatt.
Analysiere die Auslastungsdaten und schlage optimale Termine vor.

Berücksichtige:
1. Gleichmäßige Verteilung der Auslastung über die Woche
2. Gruppierung ähnlicher Arbeiten für Effizienz (z.B. alle Citroën-Services vormittags)
3. Vorlaufzeit für Teilebestellungen:
   - Citroën-Standardteile: 1 Tag (oft vorrätig)
   - PSA-Spezialteile: 2-3 Tage
   - Fremdmarken-Teile: 3-5 Tage (nicht bevorzugt vorrätig)
4. Mitarbeiter-Spezialisierungen und Citroën-Schulungen
5. Puffer für Notfälle (nicht über 85% Auslastung planen)
6. Citroën-Diagnosegerät-Verfügbarkeit bei elektronischen Arbeiten
7. Bei Fremdmarken: Prüfe ob Bestandskunde

Antworte mit JSON-Array sortiert nach Empfehlungs-Score.
```

---

## 📋 Implementierungsplan

### Phase 1: Backend-Grundlagen (Woche 1)

#### 1.1 OpenAI API Integration
```
backend/
├── src/
│   ├── services/
│   │   └── openaiService.js      # NEU: OpenAI API Wrapper
│   ├── controllers/
│   │   └── aiController.js       # NEU: AI-Endpunkte
│   └── routes/
│       └── aiRoutes.js           # NEU: /api/ai/*
```

#### 1.2 Konfiguration
- `.env` erweitern um `OPENAI_API_KEY`
- Einstellungen für AI-Features in Werkstatt-Einstellungen
- Rate-Limiting für API-Aufrufe

#### 1.3 API-Endpunkte
| Endpunkt | Methode | Beschreibung |
|----------|---------|--------------|
| `/api/ai/parse-termin` | POST | Freitext → Termin-Objekt |
| `/api/ai/suggest-arbeiten` | POST | Problembeschreibung → Arbeiten |
| `/api/ai/estimate-zeit` | POST | Arbeiten + Fahrzeug → Zeitschätzung |
| `/api/ai/erkennen-teile` | POST | Arbeiten → Benötigte Teile |
| `/api/ai/optimize-termin` | POST | 🆕 Optimale Terminvorschläge basierend auf Auslastung |
| `/api/ai/teile-checkliste` | POST | 🆕 Generiert Teile-Checkliste für Arbeiten |
| `/api/ai/bestellerinnerung` | GET | 🆕 Offene Teilebestellungen mit Dringlichkeit |
| `/api/ai/sammelbestellung` | POST | 🆕 Schlägt Sammelbestellungen vor |

---

### Phase 2: OpenAI Service (Woche 1-2)

#### 2.1 openaiService.js - Grundstruktur
```javascript
// backend/src/services/openaiService.js
const OpenAI = require('openai');

class OpenAIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = 'gpt-4o-mini'; // Kostengünstig für einfache Tasks
  }

  /**
   * Parsed Freitext-Eingabe zu strukturiertem Termin
   * @param {string} freitext - z.B. "Frau Schmidt morgen 10 Uhr C3 Inspektion"
   * @returns {Object} - Strukturierte Termin-Daten
   */
  async parseTerminFromText(freitext) {
    const systemPrompt = `Du bist ein Assistent für eine Citroën-Markenwerkstatt.

WICHTIG: Dies ist eine offizielle Citroën-Werkstatt.
- Primär werden Citroën-Fahrzeuge betreut
- Fremdmarken nur bei Bestandskunden

Extrahiere aus dem Freitext folgende Informationen für einen Termin:
- kunde_name: Name des Kunden
- datum: Datum (im Format YYYY-MM-DD, "morgen" = nächster Tag)
- bring_zeit: Uhrzeit (im Format HH:MM)
- kennzeichen: Fahrzeug-Kennzeichen
- fahrzeugtyp: Fahrzeugmarke und Modell
- arbeiten: Array der durchzuführenden Arbeiten (Citroën-Standardbezeichnungen)
- ist_citroen: Boolean ob es ein Citroën/DS-Fahrzeug ist
- fremdmarke_warnung: Falls Fremdmarke, Hinweis "Bestandskunde prüfen"

Citroën-Modelle: C1, C3, C4, C5, Berlingo, Jumper, Jumpy, SpaceTourer, DS3, DS4, DS5, DS7

Antworte NUR mit einem JSON-Objekt. Fehlende Infos als null.`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: freitext }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1 // Niedrig für konsistente Ergebnisse
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Konvertiert Problembeschreibung zu Standard-Arbeiten
   */
  async suggestArbeiten(problembeschreibung, fahrzeugtyp = null) {
    const systemPrompt = `Du bist ein Citroën-Meister in einer Citroën-Markenwerkstatt.
Basierend auf der Problembeschreibung, schlage passende Arbeiten vor.

Citroën Service-Pakete (bevorzugt bei Inspektionen):
- CITROËN ESSENTIAL SERVICE (Ölwechsel, Sichtprüfung)
- CITROËN REFERENCE SERVICE (Essential + Filter, Bremsenprüfung)
- CITROËN SERENITY SERVICE (Reference + Klima, Batterie)

Standard-Arbeiten:
- ÖLWECHSEL (PSA-Spezifikation beachten)
- BREMSBELÄGE VORNE/HINTEN
- BREMSSCHEIBEN VORNE/HINTEN
- REIFENWECHSEL
- HAUPTUNTERSUCHUNG (HU/TÜV)
- ABGASUNTERSUCHUNG (AU)
- KLIMASERVICE (Citroën-Kältemittel)
- ZAHNRIEMENWECHSEL (PSA-Intervalle beachten)
- STEUERKETTE PRÜFEN (PureTech-Motoren!)
- AUSPUFF REPARATUR
- STOSSDÄMPFER WECHSEL
- KUPPLUNG WECHSEL
- BATTERIEWECHSEL
- LICHTCHECK
- FEHLERAUSLESEN (Citroën-Diagnosegerät)
- DPF REGENERATION (Diesel)
- ADBLUE NACHFÜLLEN (BlueHDi)

Bei Citroën-spezifischen Problemen:
- PureTech-Motoren: Steuerkettenlängung beachten
- BlueHDi: DPF und AdBlue-System prüfen
- Hydropneumatik (C5/C6): Spezialprüfung

Antworte mit JSON: { "arbeiten": ["ARBEIT1", "ARBEIT2"], "erklaerung": "kurze Begründung", "citroen_hinweis": "optional: modellspezifischer Hinweis" }`;

    const userMessage = fahrzeugtyp 
      ? `Fahrzeug: ${fahrzeugtyp}\nProblem: ${problembeschreibung}`
      : problembeschreibung;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Schätzt Arbeitszeit basierend auf Arbeiten und Fahrzeug
   */
  async estimateZeit(arbeiten, fahrzeugtyp = null) {
    const systemPrompt = `Du bist Werkstattleiter einer Citroën-Markenwerkstatt.
Schätze die Arbeitszeit in Minuten für die angegebenen Arbeiten.

Berücksichtige Citroën-spezifische Zeiten:
- Citroën Essential Service: 45 Min
- Citroën Reference Service: 90 Min  
- Citroën Serenity Service: 120 Min
- Ölwechsel PureTech/BlueHDi: 30-40 Min
- Zahnriemenwechsel PSA: 180-240 Min (modellabhängig)
- Steuerkette PureTech: 300-360 Min
- DPF Regeneration: 45-60 Min

Modellspezifische Aufwände:
- C1/C3: Kompakt, meist schnell
- C4/C5: Mittelklasse, Standardzeiten
- Berlingo: Nutzfahrzeug, etwas mehr Zeit
- Jumper/Jumpy: Transporter, deutlich mehr Zeit
- DS-Modelle: Premium, sorgfältige Arbeit

Antworte mit JSON:
{
  "gesamt_minuten": 90,
  "details": [
    { "arbeit": "CITROËN REFERENCE SERVICE", "minuten": 90, "kommentar": "Standard PSA-Zeit" }
  ],
  "hinweise": ["Optional: Citroën-spezifische Hinweise"]
}`;

    const userMessage = fahrzeugtyp
      ? `Fahrzeug: ${fahrzeugtyp}\nArbeiten: ${arbeiten.join(', ')}`
      : `Arbeiten: ${arbeiten.join(', ')}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    return JSON.parse(response.choices[0].message.content);
  }

  /**
   * Erkennt benötigte Teile aus Arbeiten
   */
  async erkenneTeilebedarf(arbeiten, fahrzeugtyp = null) {
    const systemPrompt = `Du bist Teile-Experte in einer Citroën-Markenwerkstatt.
Liste die benötigten Ersatzteile auf - bevorzuge Citroën-Originalteile (OE).

PSA-Teilenummern-System:
- Ölfilter: 1109.xx (z.B. 1109.CK für PureTech)
- Luftfilter: 1444.xx
- Innenraumfilter: 6479.xx
- Zündkerzen: 5960.xx
- Bremsbeläge: 4254.xx (vorne), 4253.xx (hinten)

Öl-Spezifikationen:
- Benziner (neuere): PSA B71 2290 (0W-30 oder 5W-30)
- Diesel mit DPF: PSA B71 2296
- Ältere Modelle: PSA B71 2294

Kategorisiere:
- "sicher_benoetigt": Teile die definitiv gebraucht werden (mit OE-Nummer wenn bekannt)
- "eventuell_benoetigt": Teile die je nach Zustand gebraucht werden könnten
- "verbrauchsmaterial": Öl, Filter, Dichtungen
- "citroen_spezifisch": Modellspezifische PSA-Teile

Antworte mit JSON:
{
  "sicher_benoetigt": ["Ölfilter OE 1109.CK", "Motoröl Total Quartz 5W-30 B71 2290 (4L)"],
  "eventuell_benoetigt": ["Luftfilter OE 1444.XE"],
  "verbrauchsmaterial": ["Ablassschraube-Dichtring OE 0313.40"],
  "citroen_spezifisch": ["Hinweis zu PSA-Spezialteilen"],
  "hinweis": "Bei PureTech-Motor: Ölstand nach 1000km kontrollieren"
}`;

    const userMessage = fahrzeugtyp
      ? `Fahrzeug: ${fahrzeugtyp}\nArbeiten: ${arbeiten.join(', ')}`
      : `Arbeiten: ${arbeiten.join(', ')}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    });

    return JSON.parse(response.choices[0].message.content);
  }
}

module.exports = new OpenAIService();
```

---

### Phase 3: Controller & Routes (Woche 2)

#### 3.1 aiController.js
```javascript
// backend/src/controllers/aiController.js
const openaiService = require('../services/openaiService');

class AIController {
  
  static async parseTermin(req, res) {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: 'Text ist erforderlich' });
      }
      
      const result = await openaiService.parseTerminFromText(text);
      res.json(result);
    } catch (error) {
      console.error('AI parseTermin Fehler:', error);
      res.status(500).json({ error: 'KI-Verarbeitung fehlgeschlagen' });
    }
  }

  static async suggestArbeiten(req, res) {
    try {
      const { beschreibung, fahrzeugtyp } = req.body;
      if (!beschreibung) {
        return res.status(400).json({ error: 'Beschreibung ist erforderlich' });
      }
      
      const result = await openaiService.suggestArbeiten(beschreibung, fahrzeugtyp);
      res.json(result);
    } catch (error) {
      console.error('AI suggestArbeiten Fehler:', error);
      res.status(500).json({ error: 'KI-Verarbeitung fehlgeschlagen' });
    }
  }

  static async estimateZeit(req, res) {
    try {
      const { arbeiten, fahrzeugtyp } = req.body;
      if (!arbeiten || !Array.isArray(arbeiten)) {
        return res.status(400).json({ error: 'Arbeiten-Array ist erforderlich' });
      }
      
      const result = await openaiService.estimateZeit(arbeiten, fahrzeugtyp);
      res.json(result);
    } catch (error) {
      console.error('AI estimateZeit Fehler:', error);
      res.status(500).json({ error: 'KI-Verarbeitung fehlgeschlagen' });
    }
  }

  static async erkenneTeilebedarf(req, res) {
    try {
      const { arbeiten, fahrzeugtyp } = req.body;
      if (!arbeiten || !Array.isArray(arbeiten)) {
        return res.status(400).json({ error: 'Arbeiten-Array ist erforderlich' });
      }
      
      const result = await openaiService.erkenneTeilebedarf(arbeiten, fahrzeugtyp);
      res.json(result);
    } catch (error) {
      console.error('AI erkenneTeilebedarf Fehler:', error);
      res.status(500).json({ error: 'KI-Verarbeitung fehlgeschlagen' });
    }
  }
}

module.exports = AIController;
```

#### 3.2 aiRoutes.js
```javascript
// backend/src/routes/aiRoutes.js
const express = require('express');
const router = express.Router();
const AIController = require('../controllers/aiController');

// Freitext → Termin-Objekt
router.post('/parse-termin', AIController.parseTermin);

// Problembeschreibung → Arbeiten-Vorschläge
router.post('/suggest-arbeiten', AIController.suggestArbeiten);

// Arbeiten → Zeitschätzung
router.post('/estimate-zeit', AIController.estimateZeit);

// Arbeiten → Teile-Erkennung
router.post('/erkennen-teile', AIController.erkenneTeilebedarf);

module.exports = router;
```

---

### Phase 4: Frontend-Integration (Woche 2-3)

#### 4.1 API Service erweitern
```javascript
// frontend/src/services/api.js - Ergänzung

class AIService {
  /**
   * Parsed Freitext zu Termin-Daten
   */
  static async parseTermin(text) {
    return ApiService.post('/ai/parse-termin', { text });
  }

  /**
   * Schlägt Arbeiten basierend auf Problembeschreibung vor
   */
  static async suggestArbeiten(beschreibung, fahrzeugtyp = null) {
    return ApiService.post('/ai/suggest-arbeiten', { beschreibung, fahrzeugtyp });
  }

  /**
   * Schätzt Arbeitszeit
   */
  static async estimateZeit(arbeiten, fahrzeugtyp = null) {
    return ApiService.post('/ai/estimate-zeit', { arbeiten, fahrzeugtyp });
  }

  /**
   * Erkennt benötigte Teile
   */
  static async erkenneTeilebedarf(arbeiten, fahrzeugtyp = null) {
    return ApiService.post('/ai/erkennen-teile', { arbeiten, fahrzeugtyp });
  }
}
```

#### 4.2 UI-Erweiterungen

##### A) KI-Assistent Button im Termin-Formular
```
┌─────────────────────────────────────────────────────────┐
│  Neuer Termin - Citroën Werkstatt               [🤖 KI] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 💬 Beschreiben Sie den Auftrag in eigenen       │   │
│  │    Worten oder diktieren Sie:                   │   │
│  │                                                 │   │
│  │ "Frau Schmidt kommt morgen um 9 mit ihrem      │   │
│  │  blauen C3, Kennzeichen OSL-MS 1234, zum       │   │
│  │  Reference Service und die Bremsen quietschen" │   │
│  │                                                 │   │
│  │                        [🎤 Spracheingabe]       │   │
│  │                        [✨ KI analysieren]      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ───────────── oder manuell ausfüllen ─────────────    │
│                                                         │
│  Kunde: [________________] 🔍                           │
│  Datum: [____.____.____]                               │
│  ...                                                   │
└─────────────────────────────────────────────────────────┘
```

##### B) Arbeiten-Eingabe mit KI-Vorschlägen
```
┌─────────────────────────────────────────────────────────┐
│  Arbeiten                                               │
├─────────────────────────────────────────────────────────┤
│  [Auto macht komische Geräusche beim Bremsen    ] [🤖] │
│                                                         │
│  ┌─ KI-Vorschläge ─────────────────────────────────┐   │
│  │ Basierend auf Ihrer Beschreibung:               │   │
│  │                                                 │   │
│  │ ☑ BREMSBELÄGE VORNE PRÜFEN         (~30 Min)   │   │
│  │ ☑ BREMSSCHEIBEN VORNE PRÜFEN       (~15 Min)   │   │
│  │ ☐ BREMSBELÄGE HINTEN PRÜFEN        (~30 Min)   │   │
│  │                                                 │   │
│  │ 💡 "Quietschen deutet auf verschlissene        │   │
│  │     Beläge hin. Scheiben sollten mitgeprüft    │   │
│  │     werden."                                   │   │
│  │                                                 │   │
│  │              [Ausgewählte übernehmen]          │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

##### C) Teile-Erkennung
```
┌─────────────────────────────────────────────────────────┐
│  🔧 Citroën-Teile für: BREMSBELÄGE VORNE - C3         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✅ Citroën-Originalteile (OE):                         │
│     • Bremsbeläge VA Satz OE 4254.20                    │
│     • Verschleißanzeiger OE 4545.A5                     │
│                                                         │
│  ⚠️ Eventuell benötigt:                                │
│     • Bremsscheiben VA OE 4249.G5 (wenn unter Min.)     │
│     • Führungsbolzen-Set OE 4404.30                     │
│                                                         │
│  📦 Verbrauchsmaterial:                                 │
│     • Bremsenreiniger                                  │
│     • Keramikpaste Citroën                             │
│                                                         │
│  💡 Citroën-Hinweis: Für Garantieerhalt nur OE-Teile   │
│                                                         │
│  [☑ Teile bestellen markieren]                         │
└─────────────────────────────────────────────────────────┘
```

---

### Phase 5: Einstellungen & Konfiguration (Woche 3)

#### 5.1 Einstellungen-Seite erweitern
```
┌─────────────────────────────────────────────────────────┐
│  ⚙️ Einstellungen > KI-Assistent                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  KI-Funktionen aktivieren:        [✓] Ein              │
│                                                         │
│  OpenAI API-Key:                                       │
│  [sk-••••••••••••••••••••••••••••••••••••] [Testen]   │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  Funktionen:                                           │
│  [✓] Freitext-zu-Termin Konvertierung                 │
│  [✓] Arbeiten-Vorschläge                              │
│  [✓] Automatische Zeitschätzung                       │
│  [✓] Teile-Erkennung                                  │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  Kosten-Limit pro Monat: [10.00] €                     │
│  Aktueller Verbrauch:    2.34 € (234 Anfragen)        │
│                                                         │
│  ─────────────────────────────────────────────────      │
│                                                         │
│  ℹ️ Die KI-Funktionen nutzen OpenAI's GPT-4o-mini.     │
│     Geschätzte Kosten: ~0.01€ pro Anfrage.            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 💰 Kostenabschätzung

| Modell | Kosten Input | Kosten Output | Ø pro Anfrage |
|--------|--------------|---------------|---------------|
| GPT-4o-mini | $0.15/1M Token | $0.60/1M Token | ~$0.001 (~0.01€) |
| GPT-4o | $2.50/1M Token | $10.00/1M Token | ~$0.01 (~0.10€) |

**Beispielrechnung (GPT-4o-mini):**
- 50 Termine/Tag × 2 KI-Anfragen = 100 Anfragen/Tag
- 100 × 22 Arbeitstage = 2.200 Anfragen/Monat
- 2.200 × 0.01€ = **~22€/Monat**

---

## 🔒 Datenschutz & Sicherheit

### Zu beachten:
1. **Keine personenbezogenen Daten** an OpenAI senden wenn möglich
   - Kundennamen können anonymisiert werden ("Kunde A")
   - Nur technische Daten senden (Fahrzeugtyp, Arbeiten)

2. **API-Key Sicherheit**
   - Key nur serverseitig speichern
   - Nie im Frontend-Code
   - Regelmäßig rotieren

3. **DSGVO-Konformität**
   - OpenAI als Auftragsverarbeiter dokumentieren
   - Kunden über KI-Nutzung informieren (optional: Opt-out)

---

## 📅 Zeitplan

| Phase | Aufgabe | Dauer | Status |
|-------|---------|-------|--------|
| 1 | Backend-Grundlagen | 3-4 Tage | ⬜ Offen |
| 2 | OpenAI Service | 2-3 Tage | ⬜ Offen |
| 3 | Controller & Routes | 1-2 Tage | ⬜ Offen |
| 4 | Frontend-Integration | 4-5 Tage | ⬜ Offen |
| 5 | Einstellungen & Config | 2 Tage | ⬜ Offen |
| 6 | 🆕 Auslastungsoptimierung | 3-4 Tage | ⬜ Offen |
| 7 | 🆕 Teile-Bestellungs-Assistent | 3-4 Tage | ⬜ Offen |
| 8 | Testing & Feinschliff | 3 Tage | ⬜ Offen |

**Gesamt: ~4-5 Wochen**

---

## ✅ Nächste Schritte

1. [ ] OpenAI Account erstellen und API-Key generieren
2. [ ] `openai` npm-Paket im Backend installieren
3. [ ] `.env` um `OPENAI_API_KEY` erweitern
4. [ ] `openaiService.js` implementieren
5. [ ] Erste Tests mit API durchführen
6. [ ] Frontend UI-Mockups erstellen
7. [ ] Schrittweise Integration ins Termin-Formular
8. [ ] 🆕 Auslastungs-Analyse implementieren
9. [ ] 🆕 Teile-Status Dashboard erstellen
10. [ ] 🆕 Benachrichtigungs-System für Bestellungen einrichten

---

## 🧪 Test-Szenarien

### Test 1: Freitext-Parsing (Citroën)
**Input:** 
```
"Frau Müller kommt übermorgen um halb 10 mit ihrem blauen C4, 
Kennzeichen OSL-MM 4567, zum Reference Service und TÜV"
```

**Erwarteter Output:**
```json
{
  "kunde_name": "Müller",
  "datum": "2026-01-13",
  "bring_zeit": "09:30",
  "kennzeichen": "OSL-MM 4567",
  "fahrzeugtyp": "Citroën C4",
  "arbeiten": ["CITROËN REFERENCE SERVICE", "HAUPTUNTERSUCHUNG"],
  "ist_citroen": true,
  "fremdmarke_warnung": null
}
```

### Test 2: Arbeiten-Vorschläge (Citroën C3 PureTech)
**Input:** 
```
"Der Motor ruckelt beim Anfahren und macht Geräusche, C3 PureTech Baujahr 2018"
```

**Erwarteter Output:**
```json
{
  "arbeiten": ["STEUERKETTE PRÜFEN", "FEHLERAUSLESEN", "ZÜNDKERZEN PRÜFEN"],
  "erklaerung": "Bei PureTech-Motoren ist die Steuerkette bekannt für Längung, was Ruckeln verursachen kann.",
  "citroen_hinweis": "PureTech EB2 Motor: Steuerkettenproblem ab 60.000km häufig. Citroën-Kampagne prüfen!"
}
```

### Test 3: 🆕 Auslastungsoptimierung (Citroën Berlingo)
**Input:**
```json
{
  "arbeiten": ["ZAHNRIEMENWECHSEL"],
  "geschaetzte_zeit": 240,
  "fahrzeugtyp": "Citroën Berlingo 1.6 HDi",
  "teile_benoetigt": true,
  "ist_citroen": true
}
```

**Erwarteter Output:**
```json
{
  "vorschlaege": [
    {
      "datum": "2026-01-20",
      "uhrzeit": "08:00",
      "score": 92,
      "gruende": [
        "Geringe Auslastung (38%)",
        "5 Tage Vorlaufzeit für PSA-Zahnriemensatz",
        "Citroën-Meister verfügbar",
        "Keine parallelen Langzeit-Reparaturen"
      ]
    },
    {
      "datum": "2026-01-17",
      "uhrzeit": "08:00",
      "score": 75,
      "gruende": [
        "Mittlere Auslastung (62%)"
      ],
      "warnungen": [
        "Nur 2 Tage für Teilebestellung - PSA-Express nötig"
      ]
    }
  ]
}
```

### Test 4: 🆕 Teile-Bestellungserinnerung (Citroën)
**Input:** Täglicher Cronjob

**Erwarteter Output:**
```json
{
  "dringend": [
    {
      "termin_nr": "T-2026-012",
      "datum": "2026-01-13",
      "tage_bis_termin": 2,
      "fahrzeug": "Citroën C4 HDi",
      "fehlende_teile": ["PSA Zahnriemensatz", "Wasserpumpe OE"],
      "geschaetzte_lieferzeit": "2-3 Tage bei PSA",
      "empfehlung": "Termin verschieben oder PSA-Express-Bestellung"
    }
  ],
  "bald_bestellen": [
    {
      "termin_nr": "T-2026-015",
      "datum": "2026-01-16",
      "fahrzeug": "Citroën C3 PureTech",
      "teile_bestellen": ["Ölfilter OE 1109.CK", "Luftfilter OE 1444.XE", "Total Quartz 5W-30 4L"]
    }
  ],
  "sammelbestellung_moeglich": {
    "teile": ["Ölfilter OE 1109.CK (PureTech)"],
    "fuer_termine": ["T-2026-015", "T-2026-018", "T-2026-021"],
    "ersparnis": "ca. 18€ bei PSA-Sammelbestellung"
  }
}
```

### Test 5: 🆕 Fremdmarken-Prüfung
**Input:**
```
"Herr Weber kommt Montag mit seinem VW Polo zum Ölwechsel"
```

**Erwarteter Output:**
```json
{
  "kunde_name": "Weber",
  "datum": "2026-01-12",
  "fahrzeugtyp": "VW Polo",
  "arbeiten": ["ÖLWECHSEL"],
  "ist_citroen": false,
  "fremdmarke_warnung": "Achtung: Fremdmarke erkannt! Als Citroën-Markenwerkstatt nur Bestandskunden. Bitte prüfen ob Kunde bereits im System.",
  "bestandskunde_pruefen": true
}
```

---

*Dokument erstellt: 11. Januar 2026*
*Version: 1.2 - Komplett angepasst auf Citroën-Markenwerkstatt*

## Zusammenfassung: Citroën-spezifische Anpassungen

✅ **Alle Beispiele** verwenden Citroën-Fahrzeuge (C3, C4, Berlingo, etc.)
✅ **PSA-Teilenummern** in allen Teile-Beispielen (1109.CK, 1444.XE, etc.)
✅ **Citroën Service-Pakete** (Essential, Reference, Serenity)
✅ **Fremdmarken-Prüfung** bei Neukunden implementiert
✅ **Citroën-spezifische Hinweise** (PureTech-Steuerkette, BlueHDi-DPF)
✅ **PSA-Öl-Spezifikationen** (B71 2290, B71 2296)
✅ **Citroën-Diagnosegerät** Verfügbarkeit berücksichtigt
