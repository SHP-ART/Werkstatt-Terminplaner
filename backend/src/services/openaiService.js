/**
 * OpenAI Service für Citroën-Werkstatt Terminplaner
 * 
 * Dieses Modul stellt die Verbindung zur OpenAI API her und bietet
 * spezialisierte Funktionen für die Citroën-Markenwerkstatt.
 * 
 * @version 1.2.0
 */

const OpenAI = require('openai');

// =============================================================================
// KONFIGURATION
// =============================================================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS) || 1000;
const TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3;

// Kostentracking (ungefähre Werte für GPT-4o-mini)
const COST_PER_1K_INPUT_TOKENS = 0.00015;  // $0.15 / 1M
const COST_PER_1K_OUTPUT_TOKENS = 0.0006;  // $0.60 / 1M
let monthlyTokensUsed = { input: 0, output: 0 };
let lastResetMonth = new Date().getMonth();

// =============================================================================
// CITROËN-SPEZIFISCHE KONFIGURATION
// =============================================================================

const CITROEN_SYSTEM_PROMPT = `Du bist ein KI-Assistent für eine autorisierte Citroën-Markenwerkstatt in Deutschland.

WICHTIGE REGELN:
1. Du bist spezialisiert auf Citroën-Fahrzeuge (C1, C3, C4, C5, Berlingo, SpaceTourer, etc.)
2. Andere Marken (VW, BMW, Mercedes, etc.) werden NUR für Bestandskunden angenommen
3. Bei Fremdmarken IMMER auf "fremdmarke: true" setzen
4. Verwende das deutsche Datumsformat (TT.MM.JJJJ)
5. Uhrzeiten im 24-Stunden-Format (HH:MM)
6. Zeitschätzungen basieren auf Citroën-Erfahrungswerten

CITROËN SERVICE-PAKETE:
- Inspektion Klein (1.0h): Ölwechsel, Filter, Sichtprüfung
- Inspektion Groß (2.5h): Komplettcheck + Flüssigkeiten
- Zahnriemenwechsel (3-4h): Je nach Motor (EB2, DV6, etc.)
- Bremsenwartung (1-2h): Beläge und/oder Scheiben
- Klimaservice (1h): Desinfektion + Kältemittel
- HU/AU Vorbereitung (1h): TÜV-Vorbereitung

PSA-TEILE-PRÄFIXE:
- 16xxx: Motorteile
- 45xxx: Bremsanlage  
- 96xxx: Elektrik/Sensoren
- 98xxx: Karosserie

Antworte IMMER im angeforderten JSON-Format.`;

// Citroën-Modelle für Erkennung
const CITROEN_MODELLE = [
  'C1', 'C2', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 X', 'C4 Picasso',
  'C5', 'C5 X', 'C5 Aircross', 'C6', 'C8',
  'Berlingo', 'SpaceTourer', 'Jumpy', 'Jumper',
  'DS3', 'DS4', 'DS5', 'DS7', 'DS9',  // DS ist Citroën-Tochter
  'Saxo', 'Xsara', 'Xantia', 'ZX', 'AX', 'BX', 'CX',
  'Ami', 'ë-C4', 'ë-Berlingo', 'ë-SpaceTourer'
];

// Fremdmarken-Schlüsselwörter
const FREMDMARKEN = [
  'VW', 'Volkswagen', 'Golf', 'Passat', 'Polo', 'Tiguan',
  'BMW', 'Mercedes', 'Benz', 'Audi', 'Opel', 'Ford',
  'Renault', 'Peugeot', 'Fiat', 'Skoda', 'Seat', 'Toyota',
  'Honda', 'Mazda', 'Nissan', 'Hyundai', 'Kia', 'Suzuki',
  'Dacia', 'Volvo', 'Mini', 'Smart', 'Porsche', 'Alfa Romeo'
];

// Standard-Arbeitszeiten für Citroën
const CITROEN_ARBEITSZEITEN = {
  'Ölwechsel': 0.5,
  'Inspektion klein': 1.0,
  'Inspektion groß': 2.5,
  'Bremsbeläge vorne': 1.0,
  'Bremsbeläge hinten': 1.0,
  'Bremsscheiben + Beläge vorne': 1.5,
  'Bremsscheiben + Beläge hinten': 1.5,
  'Zahnriemenwechsel': 3.5,
  'Wasserpumpe': 1.5,
  'Zahnriemen + Wasserpumpe': 4.0,
  'Klimaservice': 1.0,
  'Klimadesinfektion': 0.5,
  'Kältemittel nachfüllen': 0.5,
  'HU/AU Vorbereitung': 1.0,
  'Reifenwechsel': 0.5,
  'Stoßdämpfer vorne': 2.0,
  'Stoßdämpfer hinten': 1.5,
  'Kupplung': 4.0,
  'Getriebeöl wechseln': 1.0,
  'Batterie wechseln': 0.5,
  'Lichtmaschine': 1.5,
  'Anlasser': 1.5,
  'Auspuffanlage': 1.5,
  'Lambdasonde': 1.0,
  'Zündkerzen': 1.0,
  'Luftfilter': 0.25,
  'Innenraumfilter': 0.25,
  'Kraftstofffilter': 0.5
};

// =============================================================================
// HILFSFUNKTIONEN
// =============================================================================

/**
 * Prüft ob die API konfiguriert ist
 */
function isConfigured() {
  return !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-');
}

/**
 * Prüft ob ein Text eine Fremdmarke enthält
 */
function erkenneFremdmarke(text) {
  const upperText = text.toUpperCase();
  
  // Prüfe zuerst auf Citroën
  const istCitroen = CITROEN_MODELLE.some(modell => 
    upperText.includes(modell.toUpperCase())
  ) || upperText.includes('CITRO') || upperText.includes('CITROEN');
  
  if (istCitroen) {
    return { istFremdmarke: false, erkannteMarke: 'Citroën' };
  }
  
  // Prüfe auf Fremdmarken
  for (const marke of FREMDMARKEN) {
    if (upperText.includes(marke.toUpperCase())) {
      return { istFremdmarke: true, erkannteMarke: marke };
    }
  }
  
  return { istFremdmarke: false, erkannteMarke: null };
}

/**
 * Aktualisiert das Kosten-Tracking
 */
function updateCostTracking(usage) {
  const currentMonth = new Date().getMonth();
  
  // Reset bei neuem Monat
  if (currentMonth !== lastResetMonth) {
    monthlyTokensUsed = { input: 0, output: 0 };
    lastResetMonth = currentMonth;
  }
  
  if (usage) {
    monthlyTokensUsed.input += usage.prompt_tokens || 0;
    monthlyTokensUsed.output += usage.completion_tokens || 0;
  }
}

/**
 * Berechnet die geschätzten monatlichen Kosten
 */
function getMonthlyEstimatedCost() {
  const inputCost = (monthlyTokensUsed.input / 1000) * COST_PER_1K_INPUT_TOKENS;
  const outputCost = (monthlyTokensUsed.output / 1000) * COST_PER_1K_OUTPUT_TOKENS;
  return {
    inputTokens: monthlyTokensUsed.input,
    outputTokens: monthlyTokensUsed.output,
    estimatedCostUSD: inputCost + outputCost,
    estimatedCostEUR: (inputCost + outputCost) * 0.92 // Ungefährer Wechselkurs
  };
}

/**
 * Prüft ob das Kosten-Limit erreicht ist
 */
function checkCostLimit() {
  const limit = parseFloat(process.env.OPENAI_COST_LIMIT) || 0;
  if (limit === 0) return { withinLimit: true, remaining: Infinity };
  
  const current = getMonthlyEstimatedCost().estimatedCostEUR;
  return {
    withinLimit: current < limit,
    remaining: Math.max(0, limit - current),
    current,
    limit
  };
}

// =============================================================================
// HAUPT-FUNKTIONEN
// =============================================================================

/**
 * Parst einen Freitext in strukturierte Termin-Daten
 * 
 * @param {string} text - Freitext-Beschreibung des Termins
 * @returns {Promise<Object>} - Strukturierte Termin-Daten
 */
async function parseTerminFromText(text) {
  if (!isConfigured()) {
    throw new Error('OpenAI API ist nicht konfiguriert. Bitte OPENAI_API_KEY in .env setzen.');
  }
  
  const costCheck = checkCostLimit();
  if (!costCheck.withinLimit) {
    throw new Error(`Monatliches Kosten-Limit erreicht (${costCheck.limit}€). Bitte Limit erhöhen oder bis nächsten Monat warten.`);
  }
  
  // Prüfe auf Fremdmarke
  const fremdmarkenCheck = erkenneFremdmarke(text);
  
  const prompt = `Analysiere folgenden Text und extrahiere Termin-Informationen für unsere Citroën-Werkstatt.

TEXT: "${text}"

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "kunde": {
    "name": "Kundenname falls erkannt oder null",
    "telefon": "Telefonnummer falls erkannt oder null"
  },
  "fahrzeug": {
    "marke": "Erkannte Automarke",
    "modell": "Erkanntes Modell falls vorhanden",
    "kennzeichen": "Kennzeichen falls erkannt oder null"
  },
  "termin": {
    "datum": "YYYY-MM-DD Format oder null",
    "uhrzeit": "HH:MM Format oder null",
    "dauer_stunden": geschätzte Dauer als Zahl
  },
  "arbeiten": ["Liste der erkannten Arbeiten"],
  "beschreibung": "Zusammenfassung der Arbeiten",
  "fremdmarke": ${fremdmarkenCheck.istFremdmarke},
  "fremdmarke_warnung": "${fremdmarkenCheck.istFremdmarke ? `Achtung: ${fremdmarkenCheck.erkannteMarke} ist keine Citroën. Nur für Bestandskunden!` : ''}",
  "confidence": 0.0-1.0 wie sicher du bei der Interpretation bist
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: CITROEN_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' }
    });
    
    updateCostTracking(response.usage);
    
    const content = response.choices[0].message.content;
    return JSON.parse(content);
    
  } catch (error) {
    console.error('OpenAI parseTerminFromText Fehler:', error.message);
    throw new Error(`KI-Analyse fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Schlägt passende Arbeiten basierend auf einer Problembeschreibung vor
 * 
 * @param {string} beschreibung - Problembeschreibung
 * @param {string} fahrzeug - Optional: Fahrzeuginfo (Modell, Baujahr)
 * @returns {Promise<Object>} - Vorgeschlagene Arbeiten mit Zeiten
 */
async function suggestArbeiten(beschreibung, fahrzeug = '') {
  if (!isConfigured()) {
    throw new Error('OpenAI API ist nicht konfiguriert.');
  }
  
  const costCheck = checkCostLimit();
  if (!costCheck.withinLimit) {
    throw new Error(`Monatliches Kosten-Limit erreicht.`);
  }
  
  const prompt = `Basierend auf dieser Problembeschreibung für ein ${fahrzeug || 'Citroën-Fahrzeug'}:

PROBLEM: "${beschreibung}"

Schlage passende Werkstatt-Arbeiten vor. Antworte NUR mit JSON:
{
  "arbeiten": [
    {
      "name": "Name der Arbeit",
      "beschreibung": "Kurze Beschreibung",
      "dauer_stunden": geschätzte Dauer,
      "prioritaet": "hoch/mittel/niedrig",
      "kategorie": "Inspektion/Bremsen/Motor/Elektrik/Klima/Karosserie/Reifen/Sonstiges"
    }
  ],
  "gesamtdauer_stunden": Summe aller Dauern,
  "empfehlung": "Zusammenfassende Empfehlung",
  "hinweise": ["Wichtige Hinweise für den Kunden"],
  "teile_vermutung": ["Vermutlich benötigte Teile"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: CITROEN_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' }
    });
    
    updateCostTracking(response.usage);
    
    return JSON.parse(response.choices[0].message.content);
    
  } catch (error) {
    console.error('OpenAI suggestArbeiten Fehler:', error.message);
    throw new Error(`KI-Vorschlag fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Schätzt die Zeit für gegebene Arbeiten
 * 
 * @param {Array<string>} arbeiten - Liste der Arbeiten
 * @param {string} fahrzeug - Optional: Fahrzeuginfo
 * @returns {Promise<Object>} - Zeitschätzungen
 */
async function estimateZeit(arbeiten, fahrzeug = '') {
  if (!isConfigured()) {
    throw new Error('OpenAI API ist nicht konfiguriert.');
  }
  
  // Erst lokale Datenbank prüfen
  const lokaleZeiten = arbeiten.map(arbeit => {
    const key = Object.keys(CITROEN_ARBEITSZEITEN).find(k => 
      arbeit.toLowerCase().includes(k.toLowerCase())
    );
    return key ? { arbeit, dauer: CITROEN_ARBEITSZEITEN[key], quelle: 'lokal' } : null;
  }).filter(Boolean);
  
  // Wenn alle lokal gefunden wurden, kein API-Call nötig
  if (lokaleZeiten.length === arbeiten.length) {
    return {
      zeiten: lokaleZeiten,
      gesamtdauer: lokaleZeiten.reduce((sum, z) => sum + z.dauer, 0),
      quelle: 'lokale Datenbank'
    };
  }
  
  // Ansonsten KI fragen
  const costCheck = checkCostLimit();
  if (!costCheck.withinLimit) {
    throw new Error(`Monatliches Kosten-Limit erreicht.`);
  }
  
  const prompt = `Schätze die Arbeitszeit für folgende Arbeiten an einem ${fahrzeug || 'Citroën'}:

ARBEITEN:
${arbeiten.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Antworte NUR mit JSON:
{
  "zeiten": [
    {
      "arbeit": "Name der Arbeit",
      "dauer_stunden": geschätzte Dauer,
      "begruendung": "Kurze Begründung"
    }
  ],
  "gesamtdauer": Summe in Stunden,
  "hinweise": ["Zusätzliche Zeithinweise"],
  "parallelisierbar": ["Arbeiten die parallel gemacht werden können"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: CITROEN_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' }
    });
    
    updateCostTracking(response.usage);
    
    const result = JSON.parse(response.choices[0].message.content);
    result.quelle = 'KI-Schätzung';
    return result;
    
  } catch (error) {
    console.error('OpenAI estimateZeit Fehler:', error.message);
    throw new Error(`Zeitschätzung fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Erkennt benötigte Teile aus einer Arbeitsbeschreibung
 * 
 * @param {string} beschreibung - Beschreibung der Arbeit
 * @param {string} fahrzeug - Fahrzeuginfo (wichtig für Teile-Nummern)
 * @returns {Promise<Object>} - Liste vermutlich benötigter Teile
 */
async function erkenneTeilebedarf(beschreibung, fahrzeug = '') {
  if (!isConfigured()) {
    throw new Error('OpenAI API ist nicht konfiguriert.');
  }
  
  const costCheck = checkCostLimit();
  if (!costCheck.withinLimit) {
    throw new Error(`Monatliches Kosten-Limit erreicht.`);
  }
  
  const prompt = `Identifiziere benötigte Teile für diese Arbeit an einem ${fahrzeug || 'Citroën'}:

ARBEIT: "${beschreibung}"

Antworte NUR mit JSON:
{
  "teile": [
    {
      "name": "Teile-Name",
      "kategorie": "Motor/Bremsen/Elektrik/Filter/Verschleiß/Sonstiges",
      "psa_prefix": "Vermuteter PSA-Nummern-Prefix (16xxx, 45xxx, 96xxx, etc.)",
      "menge": geschätzte Menge,
      "hinweis": "Wichtiger Hinweis zum Teil"
    }
  ],
  "verbrauchsmaterial": ["Öl", "Bremsflüssigkeit", etc.],
  "werkzeug_spezial": ["Spezialwerkzeuge falls nötig"],
  "bestellempfehlung": "Vorlaufzeit-Empfehlung"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: CITROEN_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      response_format: { type: 'json_object' }
    });
    
    updateCostTracking(response.usage);
    
    return JSON.parse(response.choices[0].message.content);
    
  } catch (error) {
    console.error('OpenAI erkenneTeilebedarf Fehler:', error.message);
    throw new Error(`Teile-Erkennung fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Testet die API-Verbindung
 * 
 * @returns {Promise<Object>} - Status der Verbindung
 */
async function testConnection() {
  if (!isConfigured()) {
    return {
      success: false,
      error: 'API-Key nicht konfiguriert',
      configured: false
    };
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'user', content: 'Antworte mit: {"status": "ok"}' }
      ],
      max_tokens: 20,
      temperature: 0
    });
    
    updateCostTracking(response.usage);
    
    return {
      success: true,
      model: MODEL,
      configured: true,
      costStatus: getMonthlyEstimatedCost()
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      configured: true
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Haupt-Funktionen
  parseTerminFromText,
  suggestArbeiten,
  estimateZeit,
  erkenneTeilebedarf,
  
  // Hilfsfunktionen
  isConfigured,
  testConnection,
  erkenneFremdmarke,
  
  // Status & Kosten
  getMonthlyEstimatedCost,
  checkCostLimit,
  
  // Konstanten (für Tests/Debugging)
  CITROEN_MODELLE,
  FREMDMARKEN,
  CITROEN_ARBEITSZEITEN
};
