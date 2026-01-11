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

// OpenAI-Client nur initialisieren wenn API-Key vorhanden
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
} else {
  console.warn('⚠️ OPENAI_API_KEY nicht gesetzt - KI-Funktionen deaktiviert');
}

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
// WARTUNGSPLAN FUNKTION
// =============================================================================

/**
 * Erstellt einen Citroën-spezifischen Wartungsplan basierend auf km-Stand
 * 
 * @param {string} fahrzeugtyp - z.B. "Citroën C3 1.2 PureTech"
 * @param {number} kmStand - Aktueller Kilometerstand
 * @param {number} fahrzeugalter - Alter in Jahren (optional)
 * @returns {Object} Wartungsplan mit fälligen und zukünftigen Arbeiten
 */
async function getWartungsplan(fahrzeugtyp, kmStand, fahrzeugalter = null) {
  if (!isConfigured()) {
    return { error: 'OpenAI API nicht konfiguriert' };
  }
  
  const systemPrompt = `Du bist ein Citroën Service-Berater mit Zugriff auf alle PSA-Wartungspläne.

CITROËN WARTUNGSINTERVALLE (PSA Standard):
===========================================

MOTOR-WARTUNG:
- Ölwechsel: alle 20.000 km oder 1 Jahr
- Luftfilter: alle 40.000 km oder 2 Jahre
- Zündkerzen (Benziner): alle 60.000 km
- Zahnriemen (DV6/DW10 Diesel): alle 120.000 km oder 10 Jahre
- Zahnriemen (THP Benziner): alle 180.000 km oder 10 Jahre
- Steuerkette PureTech (EB2): Prüfung alle 80.000 km (Längung!)

BREMSEN:
- Bremsflüssigkeit: alle 2 Jahre
- Bremsbeläge: ca. 30.000-50.000 km (fahrabhängig)
- Bremsscheiben: ca. 80.000-100.000 km

FLÜSSIGKEITEN:
- Kühlmittel: alle 120.000 km oder 5 Jahre
- Getriebeöl (Automatik): alle 60.000 km
- Getriebeöl (Schaltung): lebensdauerfüllung (Kontrolle)
- Servolenkungsöl: bei Bedarf

FILTER:
- Innenraumfilter: alle 15.000 km oder 1 Jahr
- Kraftstofffilter (Diesel): alle 40.000 km
- Pollenfilter mit Aktivkohle: alle 30.000 km

WEITERE:
- Klimaservice: alle 2 Jahre empfohlen
- Batterie: ~5-7 Jahre Lebensdauer
- Keilriemen: alle 120.000 km prüfen
- Stoßdämpfer: alle 80.000 km prüfen

PSA-ÖL-SPEZIFIKATIONEN:
- PureTech Benziner: PSA B71 2290 (0W-30)
- BlueHDi Diesel: PSA B71 2296 (0W-30)
- Ältere Benziner: PSA B71 2294 (5W-30)

CITROËN ESSENTIAL SERVICE enthält:
- Ölwechsel mit PSA-Freigabe
- Ölfilter
- Sichtprüfung
- Computer-Reset

CITROËN REFERENCE SERVICE enthält:
- Alles aus Essential
- Luftfilter
- Innenraumfilter
- Bremsenkontrolle
- Fahrwerksprüfung
- Batterie prüfen

CITROËN SERENITY SERVICE enthält:
- Alles aus Reference
- Klimaservice/Desinfektion
- Bremsflüssigkeit
- Scheibenreiniger
- Alle Flüssigkeiten kontrollieren

Erstelle einen Wartungsplan basierend auf dem Kilometerstand.

Antworte mit JSON:
{
  "fahrzeug": "erkannter Fahrzeugtyp",
  "kmStand": Kilometerstand,
  "motortyp": "erkannter Motor (PureTech, BlueHDi, etc.)",
  "jetzt_faellig": [
    {
      "arbeit": "Name der Arbeit",
      "grund": "Warum jetzt fällig",
      "dauer_stunden": 1.0,
      "prioritaet": "hoch/mittel/niedrig",
      "empfehlung": "CITROËN SERVICE PAKET oder Einzelarbeit"
    }
  ],
  "bald_faellig": [
    {
      "arbeit": "Name der Arbeit", 
      "faellig_bei_km": 50000,
      "noch_km": 5000
    }
  ],
  "service_empfehlung": "Essential/Reference/Serenity",
  "geschaetzte_gesamtzeit": 2.5,
  "citroen_hinweise": ["PSA-spezifische Hinweise zum Fahrzeug"],
  "naechste_inspektion_km": 60000
}`;

  const userMessage = fahrzeugalter 
    ? `Fahrzeug: ${fahrzeugtyp}\nKilometerstand: ${kmStand} km\nFahrzeugalter: ${fahrzeugalter} Jahre\n\nWelche Wartungsarbeiten sind fällig?`
    : `Fahrzeug: ${fahrzeugtyp}\nKilometerstand: ${kmStand} km\n\nWelche Wartungsarbeiten sind fällig?`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    updateCostTracking(response.usage);

    const result = JSON.parse(response.choices[0].message.content);
    
    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error('Wartungsplan Fehler:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// =============================================================================
// VIN-DECODER (Fahrgestellnummer)
// =============================================================================

/**
 * PSA/Citroën VIN-Struktur:
 * Position 1-3: WMI (World Manufacturer Identifier)
 * Position 4-5: Modellreihe
 * Position 6: Karosserieform
 * Position 7: Getriebeart
 * Position 8: Motorcode (WICHTIG für Teile!)
 * Position 9: Prüfziffer
 * Position 10: Modelljahr
 * Position 11: Produktionswerk
 * Position 12-17: Seriennummer
 */

// PSA Hersteller-Codes (WMI)
const PSA_WMI = {
  'VF7': { hersteller: 'Citroën', land: 'Frankreich' },
  'VF3': { hersteller: 'Peugeot', land: 'Frankreich' },
  'VR7': { hersteller: 'Citroën', land: 'Frankreich (Nutzfahrzeuge)' },
  'VF1': { hersteller: 'Renault', land: 'Frankreich' },
  'VF8': { hersteller: 'Opel', land: 'Frankreich' },
  'VSS': { hersteller: 'Seat', land: 'Spanien' },
  'WVW': { hersteller: 'VW', land: 'Deutschland' },
  'WBA': { hersteller: 'BMW', land: 'Deutschland' },
  'WDB': { hersteller: 'Mercedes', land: 'Deutschland' },
  'WF0': { hersteller: 'Ford', land: 'Deutschland' },
  'VF7': { hersteller: 'Citroën', land: 'Frankreich' },
  'W0L': { hersteller: 'Opel', land: 'Deutschland' },
  'WDD': { hersteller: 'Mercedes', land: 'Deutschland' },
  'WAU': { hersteller: 'Audi', land: 'Deutschland' },
  'ZFA': { hersteller: 'Fiat', land: 'Italien' },
  'VNK': { hersteller: 'Toyota', land: 'Frankreich (TPCA)' },
  'VNE': { hersteller: 'Toyota', land: 'Frankreich' },
};

// PSA Modellcodes (Position 4-5) - STARK ERWEITERT
const PSA_MODELLE = {
  // Citroën Modellcodes (aktuell und historisch)
  // C1
  'FK': { modell: 'C1', generation: '1. Gen (2005-2014)', plattform: 'B0' },
  'PM': { modell: 'C1', generation: '2. Gen (2014-2022)', plattform: 'B1' },
  
  // C2
  'JM': { modell: 'C2', generation: '(2003-2009)', plattform: 'PF1' },
  'JN': { modell: 'C2', generation: '(2003-2009)', plattform: 'PF1' },
  
  // C3
  'FC': { modell: 'C3', generation: '1. Gen (2002-2009)', plattform: 'PF1' },
  'FN': { modell: 'C3', generation: '1. Gen (2002-2009)', plattform: 'PF1' },
  'LC': { modell: 'C3', generation: '2. Gen (2009-2016)', plattform: 'PF1' },
  'SA': { modell: 'C3', generation: '3. Gen (ab 2016)', plattform: 'CMP' },
  'SX': { modell: 'C3', generation: '3. Gen (ab 2016)', plattform: 'CMP' },
  '3A': { modell: 'C3', generation: '2. Gen (2009-2016)', plattform: 'PF1' },
  '3B': { modell: 'C3', generation: '2. Gen Facelift (2013-2016)', plattform: 'PF1' },
  
  // C3 Aircross
  'SC': { modell: 'C3 Aircross', generation: 'ab 2017', plattform: 'CMP' },
  '2A': { modell: 'C3 Aircross', generation: 'ab 2017', plattform: 'CMP' },
  
  // C3 Picasso
  'SH': { modell: 'C3 Picasso', generation: '(2009-2017)', plattform: 'PF1' },
  
  // C4
  'NC': { modell: 'C4', generation: '1. Gen (2004-2010)', plattform: 'PF2' },
  'ND': { modell: 'C4', generation: '1. Gen (2004-2010)', plattform: 'PF2' },
  'RD': { modell: 'C4', generation: '2. Gen (2010-2018)', plattform: 'PF2' },
  'UB': { modell: 'C4', generation: '3. Gen (ab 2020)', plattform: 'CMP' },
  '4A': { modell: 'C4', generation: '2. Gen (2010-2018)', plattform: 'PF2' },
  
  // C4 Picasso / SpaceTourer
  'RW': { modell: 'C4 SpaceTourer', generation: '2. Gen (2013-2022)', plattform: 'EMP2' },
  'UA': { modell: 'C4 Picasso', generation: '1. Gen (2006-2013)', plattform: 'PF2' },
  '3C': { modell: 'Grand C4 Picasso', generation: '1. Gen (2006-2013)', plattform: 'PF2' },
  
  // C4 Cactus
  'SE': { modell: 'C4 Cactus', generation: '(2014-2020)', plattform: 'PF1' },
  
  // C5
  'RC': { modell: 'C5', generation: '2. Gen (2008-2017)', plattform: 'PF3' },
  'RE': { modell: 'C5', generation: '2. Gen Tourer (2008-2017)', plattform: 'PF3' },
  'RJ': { modell: 'C5 X', generation: 'ab 2021', plattform: 'EMP2' },
  '5A': { modell: 'C5', generation: '2. Gen (2008-2017)', plattform: 'PF3' },
  
  // C5 Aircross
  'UD': { modell: 'C5 Aircross', generation: 'ab 2018', plattform: 'EMP2' },
  'UE': { modell: 'C5 Aircross Hybrid', generation: 'ab 2020', plattform: 'EMP2' },
  
  // Berlingo
  'EA': { modell: 'Berlingo', generation: '2. Gen (2008-2018)', plattform: 'PF2' },
  'EB': { modell: 'Berlingo', generation: '2. Gen (2008-2018)', plattform: 'PF2' },
  'EK': { modell: 'Berlingo', generation: '3. Gen (ab 2018)', plattform: 'EMP2' },
  'EL': { modell: 'ë-Berlingo', generation: 'Elektro (ab 2021)', plattform: 'EMP2' },
  '7A': { modell: 'Berlingo', generation: '2. Gen (2008-2018)', plattform: 'PF2' },
  'B4': { modell: 'Berlingo', generation: '2. Gen (2008-2018)', plattform: 'PF2' },
  'B5': { modell: 'Berlingo', generation: '2. Gen (2008-2018)', plattform: 'PF2' },
  'B9': { modell: 'Berlingo', generation: '1. Gen (1996-2008)', plattform: 'PF1' },
  'K9': { modell: 'Berlingo', generation: '3. Gen (ab 2018)', plattform: 'EMP2' },
  
  // C5 Aircross (C84)
  'A4': { modell: 'C5 Aircross', generation: 'C84 (ab 2018)', plattform: 'EMP2' },
  'A5': { modell: 'C5 Aircross', generation: 'C84 (ab 2018)', plattform: 'EMP2' },
  'A6': { modell: 'C5 Aircross', generation: 'C84 Hybrid (ab 2020)', plattform: 'EMP2' },
  'C8': { modell: 'C5 Aircross', generation: 'C84 (ab 2018)', plattform: 'EMP2' },
  
  // C6
  'TD': { modell: 'C6', generation: '(2005-2012)', plattform: 'PF3' },
  'TE': { modell: 'C6', generation: '(2005-2012)', plattform: 'PF3' },
  '6A': { modell: 'C6', generation: '(2005-2012)', plattform: 'PF3' },
  
  // C8
  'LA': { modell: 'C8', generation: '(2002-2014)', plattform: 'Eurovan' },
  'LB': { modell: 'C8', generation: '(2002-2014)', plattform: 'Eurovan' },
  '8E': { modell: 'C8', generation: '(2002-2014)', plattform: 'Eurovan' },
  
  // Nemo
  'AA': { modell: 'Nemo', generation: '(2008-2017)', plattform: 'Fiat Fiorino' },
  'AB': { modell: 'Nemo', generation: '(2008-2017)', plattform: 'Fiat Fiorino' },
  
  // C-Zero / C-Crosser
  'HA': { modell: 'C-Zero', generation: 'Elektro (2010-2020)', plattform: 'Mitsubishi' },
  'XA': { modell: 'C-Crosser', generation: '(2007-2012)', plattform: 'Mitsubishi' },
  
  // ë-C4 / ë-Modelle
  'UC': { modell: 'ë-C4', generation: 'Elektro (ab 2020)', plattform: 'e-CMP' },
  
  // Jumpy / SpaceTourer
  'VE': { modell: 'Jumpy', generation: '2. Gen (2007-2016)', plattform: 'PF3' },
  'VF': { modell: 'Jumpy', generation: '2. Gen (2007-2016)', plattform: 'PF3' },
  'VN': { modell: 'Jumpy/SpaceTourer', generation: '3. Gen (ab 2016)', plattform: 'EMP2' },
  'VP': { modell: 'SpaceTourer', generation: '(ab 2016)', plattform: 'EMP2' },
  '8A': { modell: 'Jumpy', generation: '3. Gen (ab 2016)', plattform: 'EMP2' },
  
  // Jumper
  'ZC': { modell: 'Jumper', generation: '2. Gen (2006-2014)', plattform: 'Basis Ducato' },
  'ZD': { modell: 'Jumper', generation: '2. Gen (2006-2014)', plattform: 'Basis Ducato' },
  'ZK': { modell: 'Jumper', generation: '3. Gen (ab 2014)', plattform: 'Basis Ducato' },
  'ZL': { modell: 'Jumper', generation: '3. Gen (ab 2014)', plattform: 'Basis Ducato' },
  
  // DS-Modelle (als Citroën)
  'DS': { modell: 'DS3', generation: '(2010-2019)', plattform: 'PF1' },
  'DW': { modell: 'DS4', generation: '(2011-2018)', plattform: 'PF2' },
  'DX': { modell: 'DS5', generation: '(2011-2018)', plattform: 'PF3' },
  
  // Saxo (historisch)
  'S0': { modell: 'Saxo', generation: '(1996-2003)', plattform: 'AX' },
  'S1': { modell: 'Saxo', generation: '(1996-2003)', plattform: 'AX' },
  
  // Xsara (historisch)
  'N1': { modell: 'Xsara', generation: '(1997-2006)', plattform: 'ZX' },
  'N2': { modell: 'Xsara Picasso', generation: '(1999-2012)', plattform: 'ZX' },
  
  // Ami
  'AM': { modell: 'Ami', generation: 'Elektro (ab 2020)', plattform: 'CMP' },
};

// PSA Motorcodes (Position 8) - STARK ERWEITERT
const PSA_MOTOREN = {
  // PureTech Benziner (EB-Familie)
  '5': { code: 'EB2', typ: '1.2 PureTech', ps: '82-130', 
         hinweise: ['Steuerkette prüfen ab 60.000km', 'Ölverbrauch überwachen'],
         oel: 'PSA B71 2290 (0W-30)',
         oelfilter: '1109.CK',
         besonderheiten: 'Steuerkettenlängung bekannt!' },
  '6': { code: 'EB0', typ: '1.0 VTi', ps: '68',
         hinweise: ['Kleiner Motor, wenig Probleme'],
         oel: 'PSA B71 2290 (0W-30)',
         oelfilter: '1109.AY' },
  'G': { code: 'EP6', typ: '1.6 THP', ps: '150-200',
         hinweise: ['Steuerkette + Spanner prüfen', 'Ölverbrauch häufig'],
         oel: 'PSA B71 2290 (5W-30)',
         oelfilter: '1109.AY',
         besonderheiten: 'Steuerkettenproblem! Timing-Kit prüfen.' },
  'R': { code: 'EP6FADTXD', typ: '1.6 PureTech 16v', ps: '180',
         hinweise: ['Steuerkette + Spanner prüfen', 'Ölverbrauch überwachen', 'Turbolader warten'],
         oel: 'PSA B71 2290 (0W-30)',
         oelfilter: '1109.AY',
         besonderheiten: 'Steuerkette! Timing-Kit ab 80.000km prüfen.' },
  'Y': { code: 'EP6FADTX', typ: '1.6 THP', ps: '165-208',
         hinweise: ['Performance-Motor', 'Regelmäßige Wartung wichtig'],
         oel: 'PSA B71 2290 (5W-30)',
         oelfilter: '1109.AY' },
  'C': { code: 'EB2DT', typ: '1.2 PureTech Turbo', ps: '110-130',
         hinweise: ['Turbomotor - Turboladerkontrolle wichtig'],
         oel: 'PSA B71 2290 (0W-30)',
         oelfilter: '1109.CK' },
  'N': { code: 'EB2ADTS', typ: '1.2 PureTech', ps: '100-110',
         hinweise: ['Steuerkette-Spanner prüfen'],
         oel: 'PSA B71 2290 (0W-30)',
         oelfilter: '1109.CK' },
  
  // VTi / TU-Familie (ältere Benziner) und PureTech 180
  'F': { code: 'EP6FADTXD', typ: '1.6 PureTech 16v', ps: '180',
         hinweise: ['Steuerkette + Spanner prüfen', 'Ölverbrauch überwachen', 'Turbolader warten'],
         oel: 'PSA B71 2290 (0W-30)',
         oelfilter: '1109.AY',
         besonderheiten: 'Steuerkette! Timing-Kit ab 80.000km prüfen.',
         alternativ: { code: 'TU3JP', typ: '1.4 VTi', ps: '75', fuer: 'ältere Modelle' } },
  'K': { code: 'TU5JP4', typ: '1.6 VTi', ps: '110-120',
         hinweise: ['Variabler Ventiltrieb', 'Magnetventile prüfen'],
         oel: 'PSA B71 2290 (5W-30)',
         oelfilter: '1109.AY' },
  'L': { code: 'NFU/TU5', typ: '1.6 16V', ps: '109',
         hinweise: ['Guter Standardmotor'],
         oel: 'PSA B71 2290 (5W-30)',
         oelfilter: '1109.AY' },
  
  // BlueHDi Diesel (DV-Familie)
  'A': { code: 'DV6', typ: '1.6 BlueHDi', ps: '75-120',
         hinweise: ['DPF Regeneration beachten', 'AdBlue nachfüllen'],
         oel: 'PSA B71 2296',
         oelfilter: '1109.CK',
         besonderheiten: 'DPF + AdBlue-System' },
  'B': { code: 'DV6ATED4', typ: '1.6 HDi', ps: '90-110',
         hinweise: ['Älterer Diesel ohne DPF', 'Turbo prüfen'],
         oel: 'PSA B71 2294',
         oelfilter: '1109.R6' },
  'H': { code: 'DW10', typ: '2.0 BlueHDi', ps: '150-180',
         hinweise: ['Zahnriemenwechsel wichtig!', 'DPF + AdBlue'],
         oel: 'PSA B71 2296',
         oelfilter: '1109.AH',
         besonderheiten: 'Zahnriemen alle 180.000km oder 10 Jahre' },
  'D': { code: 'DW10BTED4', typ: '2.0 HDi', ps: '136-163',
         hinweise: ['Turbo-Verschleiß beachten'],
         oel: 'PSA B71 2296',
         oelfilter: '1109.AH' },
  'R': { code: 'DV4', typ: '1.4 HDi', ps: '68-90',
         hinweise: ['Kleiner Dieselmotor'],
         oel: 'PSA B71 2294',
         oelfilter: '1109.R6' },
  'X': { code: 'DW12', typ: '2.2 HDi', ps: '128-170',
         hinweise: ['Großer Diesel - Ölwechsel wichtig'],
         oel: 'PSA B71 2296',
         oelfilter: '1109.AN' },
  
  // Neuere BlueHDi (DV5)
  '9': { code: 'DV5', typ: '1.5 BlueHDi', ps: '100-130',
         hinweise: ['Moderner Diesel', 'AdBlue-System', 'DPF'],
         oel: 'PSA B71 2312 (0W-30)',
         oelfilter: '9818914980',
         besonderheiten: 'SCR-Katalysator + DPF' },
  
  // Neuere PureTech-Motoren
  'P': { code: 'EB2DTS', typ: '1.2 PureTech 130', ps: '130',
         hinweise: ['Turbo PureTech', 'Steuerkette'],
         oel: 'PSA B71 2290 (0W-30)',
         oelfilter: '1109.CK' },
  
  // ältere 1.6 Benziner
  'Z': { code: 'NFP/EC5', typ: '1.6 VTi', ps: '120',
         hinweise: ['Variabler Ventiltrieb', 'VVT-Magnetventil prüfen'],
         oel: 'PSA B71 2290 (5W-30)',
         oelfilter: '1109.AY' },

  // Elektro
  'E': { code: 'ë-Motor', typ: 'Elektro', ps: '100-136',
         hinweise: ['Hochvoltbatterie-Check', 'Klimakompressor elektrisch'],
         besonderheiten: 'Elektrofahrzeug - Hochvolt-Schulung erforderlich!' },
  
  // Hybrid
  'W': { code: 'Hybrid', typ: 'Plug-in Hybrid', ps: '180-300',
         hinweise: ['Hybrid-System prüfen', '12V + Hochvolt-Batterie'],
         besonderheiten: 'PHEV - Hochvolt-Schulung erforderlich!' },
};

// Karosserie-Codes (Position 6)
const PSA_KAROSSERIE = {
  'A': 'Limousine 3-türig',
  'B': 'Limousine 5-türig',
  'C': 'Kombi/Break',
  'D': 'Coupé',
  'E': 'Cabriolet',
  'F': 'Van/Hochdachkombi',
  'G': 'SUV/Crossover',
  'H': 'Fließheck',
  'J': 'Kastenwagen',
  'K': 'Großraumlimousine',
  'L': 'Pickup',
  'M': 'Minivan',
  'N': 'Kombi verlängert',
  'P': 'Pritsche',
  'R': 'Roadster',
  'S': 'Stufenheck',
  'T': 'Kombi',
  'U': 'Utility/Nutzfahrzeug',
  'V': 'Van',
  'W': 'Fahrgestell',
  'X': 'Sonderaufbau',
};

// Modelljahr-Codes (Position 10)
const MODELLJAHR_CODES = {
  'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
  'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019,
  'L': 2020, 'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024,
  'S': 2025, 'T': 2026, 'V': 2027, 'W': 2028, 'X': 2029, 'Y': 2030,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
  '6': 2006, '7': 2007, '8': 2008, '9': 2009
};

// PSA Produktionswerke (Position 11) - ERWEITERT
const PSA_WERKE = {
  'A': 'Aulnay-sous-Bois (Frankreich) - geschlossen 2013',
  'B': 'Vigo (Spanien)',
  'C': 'Caen (Frankreich)',
  'D': 'Mulhouse (Frankreich)',
  'E': 'Eisenach (Deutschland)',
  'F': 'Sevel Sud (Italien) - Ducato/Jumper',
  'G': 'Mangualde (Portugal)',
  'H': 'Hordain (Frankreich) - Toyota Kolín',
  'J': 'Kolín (Tschechien) - TPCA',
  'K': 'Kolin (Tschechien)',
  'L': 'Madrid (Spanien)',
  'M': 'Melfi (Italien)',
  'N': 'Kenitra (Marokko)',
  'P': 'Poissy (Frankreich)',
  'R': 'Rennes-La Janais (Frankreich)',
  'S': 'Sevel Nord (Frankreich)',
  'T': 'Trnava (Slowakei)',
  'U': 'Buenos Aires (Argentinien)',
  'V': 'Sochaux (Frankreich)',
  'W': 'Valenciennes (Frankreich)',
  'X': 'Xuzhou (China)',
  'Y': 'Wuhan (China)',
  'Z': 'Zaragoza (Spanien)',
};

// Teile-Relevanz nach Arbeit
const TEILE_NACH_VIN = {
  'stabilisator': {
    beschreibung: 'Stabilisator-Koppelstangen',
    vin_relevant: ['motorcode'], // Motorgewicht beeinflusst Stabi-Stärke
    varianten: {
      'EB2': { groesse: '19mm', oe_nummer: '5087.51' },
      'DW10': { groesse: '21mm', oe_nummer: '5087.58' },
      'default': { groesse: '19mm', hinweis: 'Motorcode prüfen!' }
    },
    warnung: 'Achtung: 2 verschiedene Stabi-Größen je nach Motor!'
  },
  'bremsen_hinten': {
    beschreibung: 'Bremsen Hinterachse',
    vin_relevant: ['modell', 'ausstattung'],
    varianten: {
      'basis': { typ: 'Trommel', oe_nummer: '4247.24' },
      'gehoben': { typ: 'Scheibe', oe_nummer: '4249.98' }
    },
    warnung: 'Trommel oder Scheibenbremse? Von Ausstattung abhängig!'
  },
  'reifen': {
    beschreibung: 'Reifengröße',
    vin_relevant: ['motorcode', 'ausstattung'],
    varianten: {
      'EB0': { groesse: '185/65 R15', hinweis: 'Kleine Motoren' },
      'EB2': { groesse: '195/65 R15 oder 205/55 R16', hinweis: 'Je nach Ausstattung' },
      'DW10': { groesse: '205/55 R16 oder 225/45 R17', hinweis: 'Diesel schwerer' }
    }
  },
  'oelwechsel': {
    beschreibung: 'Motoröl + Filter',
    vin_relevant: ['motorcode'],
    hinweis: 'Motorcode bestimmt Öl-Spezifikation und Filtergröße!'
  }
};

/**
 * Dekodiert eine Fahrgestellnummer (VIN)
 * @param {string} vin - 17-stellige VIN
 * @returns {Object} Dekodierte Fahrzeugdaten
 */
function decodeVIN(vin) {
  // VIN normalisieren
  vin = (vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  
  // Validierung
  if (vin.length !== 17) {
    return {
      success: false,
      error: `VIN muss 17 Zeichen haben (eingegeben: ${vin.length})`,
      vin: vin
    };
  }
  
  // VIN zerlegen
  const wmi = vin.substring(0, 3);        // Hersteller
  const modellCode = vin.substring(3, 5); // Modell
  const karosserie = vin.charAt(5);       // Karosserieform
  const getriebe = vin.charAt(6);         // Getriebe
  const motorCode = vin.charAt(7);        // Motor (WICHTIG!)
  const pruefziffer = vin.charAt(8);      // Prüfziffer
  const modelljahr = vin.charAt(9);       // Baujahr
  const werk = vin.charAt(10);            // Produktionswerk
  const seriennummer = vin.substring(11); // Seriennummer
  
  // Hersteller ermitteln
  const herstellerInfo = PSA_WMI[wmi] || { hersteller: 'Unbekannt', land: 'Unbekannt' };
  const istCitroen = herstellerInfo.hersteller.includes('Citroën');
  
  // Modell ermitteln (auch Kombination aus erstem Zeichen + Zahl prüfen)
  let modellInfo = PSA_MODELLE[modellCode];
  if (!modellInfo) {
    // Versuche mit erstem Zeichen des Modellcodes (z.B. "3A" -> C3)
    const firstChar = modellCode.charAt(0);
    if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(firstChar)) {
      // Numerischer Modellcode - versuche direkte Zuordnung
      modellInfo = PSA_MODELLE[modellCode];
    }
  }
  modellInfo = modellInfo || { modell: 'Unbekannt', generation: '' };
  
  // Motor ermitteln (WICHTIG für Teile!)
  const motorInfo = PSA_MOTOREN[motorCode] || { 
    code: `Unbekannt (${motorCode})`, 
    typ: 'Motor nicht in Datenbank',
    hinweise: ['Motorcode manuell prüfen!', `VIN-Position 8: "${motorCode}"`]
  };
  
  // Baujahr ermitteln
  const baujahr = MODELLJAHR_CODES[modelljahr] || null;
  
  // Werk ermitteln
  const werkName = PSA_WERKE[werk] || `Unbekanntes Werk (${werk})`;
  
  // Karosserie-Info
  const karosserieTyp = PSA_KAROSSERIE[karosserie] || `Unbekannt (${karosserie})`;
  
  // Getriebe-Info
  const getriebeTyp = {
    'H': 'Schaltgetriebe (manuell)',
    'A': 'Automatik (Wandler)',
    'M': 'Automatisiertes Schaltgetriebe (EAT6/EAT8)',
    'E': 'Elektroantrieb',
    'S': 'Schaltgetriebe 5-Gang',
    '6': 'Schaltgetriebe 6-Gang',
    'T': 'Doppelkupplungsgetriebe',
  }[getriebe] || `Unbekannt (${getriebe})`;
  
  // Teile-Hinweise basierend auf Motor
  const teileHinweise = [];
  
  if (motorInfo.oel) {
    teileHinweise.push(`🛢️ Öl: ${motorInfo.oel}`);
  }
  if (motorInfo.oelfilter) {
    teileHinweise.push(`🔧 Ölfilter: OE ${motorInfo.oelfilter}`);
  }
  if (motorInfo.besonderheiten) {
    teileHinweise.push(`⚠️ ${motorInfo.besonderheiten}`);
  }
  
  // Warnungen für Teilebestellung
  const teileWarnungen = [];
  
  // Stabi-Warnung
  if (TEILE_NACH_VIN.stabilisator.varianten[motorInfo.code]) {
    const stabiInfo = TEILE_NACH_VIN.stabilisator.varianten[motorInfo.code];
    teileWarnungen.push({
      teil: 'Stabilisator VA',
      info: `Größe: ${stabiInfo.groesse}, OE: ${stabiInfo.oe_nummer}`,
      warnung: TEILE_NACH_VIN.stabilisator.warnung
    });
  }
  
  // Bremsen hinten Warnung
  teileWarnungen.push({
    teil: 'Bremsen HA',
    info: 'Trommel oder Scheibe?',
    warnung: TEILE_NACH_VIN.bremsen_hinten.warnung
  });
  
  return {
    success: true,
    vin: vin,
    istCitroen: istCitroen,
    
    // Grunddaten
    hersteller: herstellerInfo.hersteller,
    produktionsland: herstellerInfo.land,
    modell: modellInfo.modell,
    generation: modellInfo.generation,
    plattform: modellInfo.plattform || null,
    baujahr: baujahr,
    werk: werkName,
    karosserie: karosserieTyp,
    
    // Motor (WICHTIG für Teile!)
    motor: {
      code: motorInfo.code,
      typ: motorInfo.typ,
      ps: motorInfo.ps || 'n/a',
      hinweise: motorInfo.hinweise || []
    },
    
    // Getriebe
    getriebe: getriebeTyp,
    
    // Teile-Info
    teile: {
      oelSpezifikation: motorInfo.oel || 'Bitte prüfen',
      oelfilter: motorInfo.oelfilter ? `OE ${motorInfo.oelfilter}` : 'Bitte prüfen',
      hinweise: teileHinweise,
      warnungen: teileWarnungen
    },
    
    // Rohdaten für Debug
    _raw: {
      wmi: wmi,
      modellCode: modellCode,
      karosserieCode: karosserie,
      getriebeCode: getriebe,
      motorCode: motorCode,
      modelljahrCode: modelljahr,
      werkCode: werk,
      seriennummer: seriennummer
    }
  };
}

/**
 * Prüft Teile-Kompatibilität basierend auf VIN
 * @param {string} vin - Fahrgestellnummer
 * @param {string} arbeit - Art der Arbeit
 * @returns {Object} Teile-Empfehlung mit Warnungen
 */
function checkTeileKompatibilitaet(vin, arbeit) {
  const vinData = decodeVIN(vin);
  
  if (!vinData.success) {
    return vinData;
  }
  
  const arbeitLower = arbeit.toLowerCase();
  const ergebnis = {
    success: true,
    vin: vin,
    fahrzeug: `${vinData.hersteller} ${vinData.modell} ${vinData.motor.typ} (${vinData.baujahr})`,
    arbeit: arbeit,
    warnungen: [],
    empfehlungen: []
  };
  
  // Stabilisator-Check
  if (arbeitLower.includes('stabi') || arbeitLower.includes('koppel')) {
    const motorCode = vinData.motor.code;
    const stabiVariante = TEILE_NACH_VIN.stabilisator.varianten[motorCode] 
                       || TEILE_NACH_VIN.stabilisator.varianten['default'];
    
    ergebnis.warnungen.push({
      typ: 'wichtig',
      text: TEILE_NACH_VIN.stabilisator.warnung,
      detail: `Motor ${motorCode}: Stabi-Größe ${stabiVariante.groesse}`
    });
    
    if (stabiVariante.oe_nummer) {
      ergebnis.empfehlungen.push({
        teil: 'Stabilisator-Koppelstange',
        oe_nummer: stabiVariante.oe_nummer,
        hinweis: `Für ${motorCode} mit ${stabiVariante.groesse} Stabi`
      });
    }
  }
  
  // Bremsen hinten Check
  if (arbeitLower.includes('bremse') && arbeitLower.includes('hinten')) {
    ergebnis.warnungen.push({
      typ: 'pruefen',
      text: TEILE_NACH_VIN.bremsen_hinten.warnung,
      detail: 'Ausstattungslinie bestimmt Trommel/Scheibe'
    });
  }
  
  // Reifen Check
  if (arbeitLower.includes('reifen') || arbeitLower.includes('räder')) {
    const motorCode = vinData.motor.code;
    const reifenInfo = TEILE_NACH_VIN.reifen.varianten[motorCode];
    
    if (reifenInfo) {
      ergebnis.empfehlungen.push({
        teil: 'Reifengröße',
        groesse: reifenInfo.groesse,
        hinweis: reifenInfo.hinweis
      });
    }
  }
  
  // Ölwechsel Check
  if (arbeitLower.includes('öl') || arbeitLower.includes('service') || arbeitLower.includes('wartung')) {
    ergebnis.empfehlungen.push({
      teil: 'Motoröl',
      spezifikation: vinData.teile.oelSpezifikation,
      hinweis: `Für Motor ${vinData.motor.code} (${vinData.motor.typ})`
    });
    ergebnis.empfehlungen.push({
      teil: 'Ölfilter',
      oe_nummer: vinData.teile.oelfilter,
      hinweis: `Für Motor ${vinData.motor.code}`
    });
  }
  
  // Motor-spezifische Warnungen
  if (vinData.motor.hinweise && vinData.motor.hinweise.length > 0) {
    vinData.motor.hinweise.forEach(hinweis => {
      ergebnis.warnungen.push({
        typ: 'motor',
        text: hinweis,
        detail: `Motor: ${vinData.motor.code} (${vinData.motor.typ})`
      });
    });
  }
  
  return ergebnis;
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
  getWartungsplan,
  
  // VIN-Decoder
  decodeVIN,
  checkTeileKompatibilitaet,
  
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
  CITROEN_ARBEITSZEITEN,
  PSA_MOTOREN,
  PSA_MODELLE
};
