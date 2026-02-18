/**
 * Ollama Service für Citroën-Werkstatt Terminplaner
 *
 * Lokaler LLM-Provider via Ollama-REST-API.
 * Implementiert dasselbe Interface wie openaiService.js und localAiService.js,
 * damit getKIService(mode) transparent zwischen Providern wechseln kann.
 *
 * Kein OpenAI-Fallback — bei Fehler wird eine klare Fehlermeldung zurückgegeben.
 *
 * @version 1.0.0
 */

// =============================================================================
// KONFIGURATION
// =============================================================================

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS) || 15000;
const OLLAMA_TEMPERATURE = parseFloat(process.env.OLLAMA_TEMPERATURE) || 0.3;

// =============================================================================
// CITROËN-SPEZIFISCHE KONFIGURATION (identisch zu openaiService)
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

Antworte IMMER im angeforderten JSON-Format. Antworte NUR mit dem JSON-Objekt, ohne Markdown-Formatierung.`;

const FREMDMARKEN = [
  'VW', 'Volkswagen', 'Golf', 'Passat', 'Polo', 'Tiguan',
  'BMW', 'Mercedes', 'Benz', 'Audi', 'Opel', 'Ford',
  'Renault', 'Peugeot', 'Fiat', 'Skoda', 'Seat', 'Toyota',
  'Honda', 'Mazda', 'Nissan', 'Hyundai', 'Kia', 'Suzuki',
  'Dacia', 'Volvo', 'Mini', 'Smart', 'Porsche', 'Alfa Romeo'
];

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
  'TÜV Vorbereitung': 1.0,
  'Reifenwechsel': 0.5,
  'Einlagerung': 0.3
};

// =============================================================================
// HTTP-HELPER
// =============================================================================

/**
 * Sendet einen Prompt an Ollama und gibt den Antwort-String zurück.
 * Kein Fallback — wirft bei Fehler.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
async function ollamaChat(systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        options: {
          temperature: OLLAMA_TEMPERATURE,
          num_predict: 1500
        },
        format: 'json'
      })
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Ollama Timeout nach ${OLLAMA_TIMEOUT_MS}ms — Modell zu langsam oder nicht erreichbar`);
    }
    throw new Error(`Ollama nicht erreichbar (${OLLAMA_BASE_URL}): ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.message?.content || data?.response || '';
  if (!content) {
    throw new Error('Ollama lieferte leere Antwort');
  }
  return content;
}

/**
 * Extrahiert JSON aus Ollama-Antwort (bereinigt Markdown-Blöcke falls vorhanden)
 *
 * @param {string} content
 * @returns {Object}
 */
function parseOllamaJSON(content) {
  let text = content.trim();
  // Markdown-Codeblöcke entfernen
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (match) text = match[1].trim();
  return JSON.parse(text);
}

// =============================================================================
// HILFSFUNKTIONEN
// =============================================================================

function erkenneFremdmarke(text) {
  if (!text) return { istFremdmarke: false, erkannteMarke: null };
  const upper = text.toUpperCase();
  for (const marke of FREMDMARKEN) {
    if (upper.includes(marke.toUpperCase())) {
      return { istFremdmarke: true, erkannteMarke: marke };
    }
  }
  return { istFremdmarke: false, erkannteMarke: null };
}

function isConfigured() {
  // Ollama braucht keinen API-Key, aber die URL muss erreichbar sein.
  // Für synchronen Check gilt: konfiguriert sobald URL gesetzt ist.
  return Boolean(OLLAMA_BASE_URL);
}

// =============================================================================
// ÖFFENTLICHE SERVICE-FUNKTIONEN
// =============================================================================

/**
 * Testet die Verbindung zu Ollama und prüft ob das Zielmodell verfügbar ist.
 */
async function testConnection() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { success: false, configured: true, error: `Ollama HTTP ${response.status}` };
    }

    const data = await response.json();
    const models = (data.models || []).map(m => m.name || m.model || '');
    const modelVerfuegbar = models.some(m => m.startsWith(OLLAMA_MODEL));

    return {
      success: true,
      configured: true,
      model: OLLAMA_MODEL,
      modelVerfuegbar,
      verfuegbareModelle: models,
      baseUrl: OLLAMA_BASE_URL
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { success: false, configured: true, error: 'Ollama Timeout (5s) — nicht erreichbar' };
    }
    return { success: false, configured: true, error: err.message };
  }
}

/**
 * Parst Freitext in strukturierte Termin-Daten.
 */
async function parseTerminFromText(text) {
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
    "dauer_stunden": 1.0
  },
  "arbeiten": ["Liste der erkannten Arbeiten"],
  "beschreibung": "Zusammenfassung der Arbeiten",
  "fremdmarke": ${fremdmarkenCheck.istFremdmarke},
  "fremdmarke_warnung": "${fremdmarkenCheck.istFremdmarke ? `Achtung: ${fremdmarkenCheck.erkannteMarke} ist keine Citroën. Nur für Bestandskunden!` : ''}",
  "confidence": 0.8
}`;

  try {
    const content = await ollamaChat(CITROEN_SYSTEM_PROMPT, prompt);
    return parseOllamaJSON(content);
  } catch (error) {
    console.error('Ollama parseTerminFromText Fehler:', error.message);
    throw new Error(`Ollama KI-Analyse fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Schlägt passende Arbeiten basierend auf einer Problembeschreibung vor.
 */
async function suggestArbeiten(beschreibung, fahrzeug = '') {
  const prompt = `Basierend auf dieser Problembeschreibung für ein ${fahrzeug || 'Citroën-Fahrzeug'}:

PROBLEM: "${beschreibung}"

Schlage passende Werkstatt-Arbeiten vor. Antworte NUR mit JSON:
{
  "arbeiten": [
    {
      "name": "Name der Arbeit",
      "beschreibung": "Kurze Beschreibung",
      "dauer_stunden": 1.0,
      "prioritaet": "hoch/mittel/niedrig",
      "kategorie": "Inspektion/Bremsen/Motor/Elektrik/Klima/Karosserie/Reifen/Sonstiges"
    }
  ],
  "gesamtdauer_stunden": 1.0,
  "empfehlung": "Zusammenfassende Empfehlung",
  "hinweise": ["Wichtige Hinweise für den Kunden"],
  "teile_vermutung": ["Vermutlich benötigte Teile"]
}`;

  try {
    const content = await ollamaChat(CITROEN_SYSTEM_PROMPT, prompt);
    return parseOllamaJSON(content);
  } catch (error) {
    console.error('Ollama suggestArbeiten Fehler:', error.message);
    throw new Error(`Ollama Arbeitsvorschlag fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Schätzt die Zeit für gegebene Arbeiten.
 * Nutzt erst lokale Lookup-Tabelle, dann Ollama.
 */
async function estimateZeit(arbeiten, fahrzeug = '') {
  // Erst lokale Datenbank prüfen
  const lokaleZeiten = arbeiten.map(arbeit => {
    const key = Object.keys(CITROEN_ARBEITSZEITEN).find(k =>
      arbeit.toLowerCase().includes(k.toLowerCase())
    );
    return key ? { arbeit, dauer: CITROEN_ARBEITSZEITEN[key], quelle: 'lokal' } : null;
  }).filter(Boolean);

  if (lokaleZeiten.length === arbeiten.length) {
    return {
      zeiten: lokaleZeiten,
      gesamtdauer: lokaleZeiten.reduce((sum, z) => sum + z.dauer, 0),
      quelle: 'lokale Datenbank'
    };
  }

  const prompt = `Schätze die Arbeitszeit für folgende Arbeiten an einem ${fahrzeug || 'Citroën'}:

ARBEITEN:
${arbeiten.map((a, i) => `${i + 1}. ${a}`).join('\n')}

Antworte NUR mit JSON:
{
  "zeiten": [
    {
      "arbeit": "Name der Arbeit",
      "dauer_stunden": 1.0,
      "begruendung": "Kurze Begründung"
    }
  ],
  "gesamtdauer": 1.0,
  "hinweise": ["Zusätzliche Zeithinweise"],
  "parallelisierbar": ["Arbeiten die parallel gemacht werden können"]
}`;

  try {
    const content = await ollamaChat(CITROEN_SYSTEM_PROMPT, prompt);
    const result = parseOllamaJSON(content);
    result.quelle = 'Ollama KI-Schätzung';
    return result;
  } catch (error) {
    console.error('Ollama estimateZeit Fehler:', error.message);
    throw new Error(`Ollama Zeitschätzung fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Erkennt benötigte Teile aus einer Arbeitsbeschreibung.
 */
async function erkenneTeilebedarf(beschreibung, fahrzeug = '') {
  const prompt = `Identifiziere benötigte Teile für diese Arbeit an einem ${fahrzeug || 'Citroën'}:

ARBEIT: "${beschreibung}"

Antworte NUR mit JSON:
{
  "teile": [
    {
      "name": "Teile-Name",
      "kategorie": "Motor/Bremsen/Elektrik/Filter/Verschleiß/Sonstiges",
      "psa_prefix": "Vermuteter PSA-Nummern-Prefix (16xxx, 45xxx, 96xxx, etc.)",
      "menge": 1,
      "hinweis": "Wichtiger Hinweis zum Teil"
    }
  ],
  "verbrauchsmaterial": ["Öl", "Bremsflüssigkeit"],
  "werkzeug_spezial": ["Spezialwerkzeuge falls nötig"],
  "bestellempfehlung": "Vorlaufzeit-Empfehlung"
}`;

  try {
    const content = await ollamaChat(CITROEN_SYSTEM_PROMPT, prompt);
    return parseOllamaJSON(content);
  } catch (error) {
    console.error('Ollama erkenneTeilebedarf Fehler:', error.message);
    throw new Error(`Ollama Teile-Erkennung fehlgeschlagen: ${error.message}`);
  }
}

/**
 * Erstellt einen Citroën-spezifischen Wartungsplan.
 */
async function getWartungsplan(fahrzeugtyp, kmStand, fahrzeugalter = null) {
  const alterInfo = fahrzeugalter ? `, Alter: ${fahrzeugalter} Jahre` : '';
  const prompt = `Erstelle einen Wartungsplan für: ${fahrzeugtyp}, Kilometerstand: ${kmStand}${alterInfo}.

Antworte NUR mit JSON:
{
  "jetzt_faellig": [
    {
      "arbeit": "Name",
      "begruendung": "Warum jetzt",
      "dringlichkeit": "hoch/mittel/niedrig"
    }
  ],
  "bald_faellig": [
    {
      "arbeit": "Name",
      "bei_km": 0,
      "in_monaten": 0
    }
  ],
  "service_empfehlung": "Zusammenfassende Empfehlung",
  "naechster_service_km": 0
}`;

  try {
    const content = await ollamaChat(CITROEN_SYSTEM_PROMPT, prompt);
    return parseOllamaJSON(content);
  } catch (error) {
    console.error('Ollama getWartungsplan Fehler:', error.message);
    throw new Error(`Ollama Wartungsplan fehlgeschlagen: ${error.message}`);
  }
}

/**
 * VIN-Decoder — nutzt statische Lookup-Tabellen, kein LLM-Call nötig.
 * Delegiert zur localAiService-Implementierung.
 */
function decodeVIN(vin) {
  // Basis-Implementierung ohne Ollama-Call (statisch reicht für VIN)
  if (!vin || vin.length !== 17) {
    return { error: 'Ungültige VIN — muss 17 Zeichen lang sein' };
  }
  const hersteller = vin.substring(0, 3);
  const citroenWMI = ['VF7', 'VF9', 'VF3', 'VJ1'];
  const istCitroen = citroenWMI.some(w => hersteller.startsWith(w));
  return {
    vin,
    hersteller: istCitroen ? 'Citroën (PSA Gruppe)' : 'Unbekannt / Fremdmarke',
    istCitroen,
    hinweis: 'Für vollständige VIN-Analyse bitte direkt beim Hersteller anfragen'
  };
}

/**
 * Teile-Kompatibilitätsprüfung via VIN — delegiert an erkenneTeilebedarf.
 */
async function checkTeileKompatibilitaet(vin, arbeit) {
  const vinInfo = decodeVIN(vin);
  const fahrzeug = vinInfo.istCitroen ? `Citroën (VIN: ${vin})` : `Fahrzeug (VIN: ${vin})`;
  return erkenneTeilebedarf(arbeit, fahrzeug);
}

/**
 * Fremdmarken-Erkennung (kein LLM-Call, lokal).
 */
function checkFremdmarke(text) {
  return erkenneFremdmarke(text);
}

// =============================================================================
// PLANUNGS-HELPER FÜR kiPlanungController
// =============================================================================

/**
 * Führt einen Planungs-Request gegen Ollama durch.
 * Wird von kiPlanungController als Ersatz für chatGPTRequest genutzt.
 *
 * @param {string} prompt - Planungs-Prompt
 * @returns {Promise<string>} - Rohtext der Ollama-Antwort
 */
async function planungRequest(prompt) {
  const systemPrompt = 'Du bist ein Experte für Werkstatt-Planung und Ressourcenoptimierung. Antworte immer auf Deutsch und im angeforderten JSON-Format. Antworte NUR mit dem JSON-Objekt.';
  return ollamaChat(systemPrompt, prompt);
}

// =============================================================================
// EXPORT
// =============================================================================

module.exports = {
  // Haupt-Funktionen (identisches Interface zu openaiService)
  parseTerminFromText,
  suggestArbeiten,
  estimateZeit,
  erkenneTeilebedarf,
  getWartungsplan,
  decodeVIN,
  checkTeileKompatibilitaet,

  // Hilfsfunktionen
  isConfigured,
  testConnection,
  erkenneFremdmarke,
  checkFremdmarke,

  // Planungs-Helper
  planungRequest,

  // Keine Kosten-Tracking-Funktionen (kein API-Key nötig)
  getMonthlyEstimatedCost: () => ({ tokens: 0, cost: 0, currency: 'lokal (kostenlos)' }),
  checkCostLimit: () => ({ withinLimit: true }),

  // Konfiguration
  OLLAMA_BASE_URL,
  OLLAMA_MODEL
};
