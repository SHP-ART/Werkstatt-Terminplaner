# Proof-of-Concept: ChatGPT-Integration für Terminerstellung

## Übersicht

Dieses Dokument beschreibt die geplante Integration von OpenAI's ChatGPT API in den Werkstatt-Terminplaner zur intelligenten Unterstützung bei der Terminerstellung.

---

## 🎯 Ziele des Proof-of-Concept

1. **Spracheingabe → Strukturierte Daten**: Freitext-Eingabe in Termin-Felder umwandeln
2. **Intelligente Arbeitserkennung**: Umgangssprache → Standardisierte Arbeitsbezeichnungen
3. **Automatische Zeitschätzung**: KI-basierte Zeitvorschläge basierend auf Arbeiten + Fahrzeugtyp
4. **Teileerkennung**: Automatisches Erkennen benötigter Ersatzteile

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
   * @param {string} freitext - z.B. "Herr Müller morgen 10 Uhr Golf Ölwechsel"
   * @returns {Object} - Strukturierte Termin-Daten
   */
  async parseTerminFromText(freitext) {
    const systemPrompt = `Du bist ein Assistent für eine KFZ-Werkstatt. 
Extrahiere aus dem Freitext folgende Informationen für einen Termin:
- kunde_name: Name des Kunden
- datum: Datum (im Format YYYY-MM-DD, "morgen" = nächster Tag)
- bring_zeit: Uhrzeit (im Format HH:MM)
- kennzeichen: Fahrzeug-Kennzeichen
- fahrzeugtyp: Fahrzeugmarke und Modell
- arbeiten: Array der durchzuführenden Arbeiten (standardisierte Bezeichnungen)

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
    const systemPrompt = `Du bist ein KFZ-Meister. Basierend auf der Problembeschreibung,
schlage passende Werkstatt-Arbeiten vor.

Verwende diese Standard-Arbeiten wenn passend:
- ÖLWECHSEL
- INSPEKTION KLEIN/GROSS
- BREMSBELÄGE VORNE/HINTEN
- BREMSSCHEIBEN VORNE/HINTEN
- REIFENWECHSEL
- HAUPTUNTERSUCHUNG (HU/TÜV)
- ABGASUNTERSUCHUNG (AU)
- KLIMASERVICE
- ZAHNRIEMENWECHSEL
- AUSPUFF REPARATUR
- STODDÄMPFER WECHSEL
- KUPPLUNG WECHSEL
- BATTERIEWECHSEL
- LICHTCHECK
- FEHLERAUSLESEN

Antworte mit JSON: { "arbeiten": ["ARBEIT1", "ARBEIT2"], "erklaerung": "kurze Begründung" }`;

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
    const systemPrompt = `Du bist ein erfahrener KFZ-Werkstattleiter.
Schätze die Arbeitszeit in Minuten für die angegebenen Arbeiten.

Berücksichtige:
- Fahrzeugtyp (manche Fahrzeuge sind aufwändiger)
- Kombinationseffekte (mehrere Arbeiten gleichzeitig sparen Zeit)
- Realistische Werkstatt-Zeiten inkl. Nebenzeiten

Antworte mit JSON:
{
  "gesamt_minuten": 120,
  "details": [
    { "arbeit": "ÖLWECHSEL", "minuten": 30, "kommentar": "Standard" }
  ],
  "hinweise": ["Optional: Hinweise für die Werkstatt"]
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
    const systemPrompt = `Du bist ein KFZ-Teile-Experte.
Liste die typischerweise benötigten Ersatzteile für die Arbeiten auf.

Kategorisiere:
- "sicher_benoetigt": Teile die definitiv gebraucht werden
- "eventuell_benoetigt": Teile die je nach Zustand gebraucht werden könnten
- "verbrauchsmaterial": Öl, Filter, Dichtungen etc.

Antworte mit JSON:
{
  "sicher_benoetigt": ["Ölfilter", "Motoröl 5W-30 5L"],
  "eventuell_benoetigt": ["Luftfilter"],
  "verbrauchsmaterial": ["Ablassschraube-Dichtring"],
  "hinweis": "Ölmenge abhängig von Motorvariante prüfen"
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
│  Neuer Termin                                    [🤖 KI] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 💬 Beschreiben Sie den Auftrag in eigenen       │   │
│  │    Worten oder diktieren Sie:                   │   │
│  │                                                 │   │
│  │ "Frau Schmidt kommt morgen um 9 mit ihrem      │   │
│  │  roten Golf, Kennzeichen B-MS 1234, zum        │   │
│  │  Ölwechsel und die Bremsen quietschen auch"    │   │
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
│  🔧 Erkannte Teile für: BREMSBELÄGE VORNE              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ✅ Sicher benötigt:                                    │
│     • Bremsbeläge Vorderachse (Satz)                   │
│     • Bremsbelag-Verschleißanzeiger                    │
│                                                         │
│  ⚠️ Eventuell benötigt:                                │
│     • Bremsscheiben VA (wenn unter Mindestmaß)         │
│     • Führungsbolzen-Set                               │
│                                                         │
│  📦 Verbrauchsmaterial:                                 │
│     • Bremsenreiniger                                  │
│     • Kupferpaste                                      │
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
| 6 | Testing & Feinschliff | 3 Tage | ⬜ Offen |

**Gesamt: ~3 Wochen**

---

## ✅ Nächste Schritte

1. [ ] OpenAI Account erstellen und API-Key generieren
2. [ ] `openai` npm-Paket im Backend installieren
3. [ ] `.env` um `OPENAI_API_KEY` erweitern
4. [ ] `openaiService.js` implementieren
5. [ ] Erste Tests mit API durchführen
6. [ ] Frontend UI-Mockups erstellen
7. [ ] Schrittweise Integration ins Termin-Formular

---

## 🧪 Test-Szenarien

### Test 1: Freitext-Parsing
**Input:** 
```
"Herr Müller kommt übermorgen um halb 10 mit seinem blauen Passat, 
Kennzeichen B-MM 4567, zum großen Service und TÜV"
```

**Erwarteter Output:**
```json
{
  "kunde_name": "Müller",
  "datum": "2026-01-13",
  "bring_zeit": "09:30",
  "kennzeichen": "B-MM 4567",
  "fahrzeugtyp": "VW Passat",
  "arbeiten": ["INSPEKTION GROSS", "HAUPTUNTERSUCHUNG"]
}
```

### Test 2: Arbeiten-Vorschläge
**Input:** 
```
"Das Auto ruckelt beim Anfahren und der Motor geht manchmal aus"
```

**Erwarteter Output:**
```json
{
  "arbeiten": ["ZÜNDKERZEN PRÜFEN", "FEHLERAUSLESEN", "LUFTFILTER PRÜFEN"],
  "erklaerung": "Ruckeln beim Anfahren kann auf Zündprobleme oder Luftmangel hindeuten"
}
```

---

*Dokument erstellt: 11. Januar 2026*
*Version: 1.0*
