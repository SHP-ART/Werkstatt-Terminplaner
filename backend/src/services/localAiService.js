const ArbeitszeitenModel = require('../models/arbeitszeitenModel');
const EinstellungenModel = require('../models/einstellungenModel');
const { allAsync } = require('../utils/dbHelper');
const openaiService = require('./openaiService');

const DEFAULT_DAUER_MINUTEN = 60;
const SUGGESTION_LIMIT = 5;
const TRAINING_INTERVAL_MS = 24 * 60 * 60 * 1000;

let zeitModelCache = {
  trainedAt: 0,
  samples: 0,
  fallbackMinutes: DEFAULT_DAUER_MINUTEN,
  byArbeit: {}
};
let trainingPromise = null;

const KATEGORIEN = [
  { name: 'Inspektion', keys: ['inspektion', 'service', 'wartung', 'durchsicht'] },
  { name: 'Bremsen', keys: ['bremse', 'brems'] },
  { name: 'Motor', keys: ['motor', 'zahnriemen', 'kupplung', 'getriebe'] },
  { name: 'Elektrik', keys: ['licht', 'elektrik', 'batterie', 'sensor'] },
  { name: 'Klima', keys: ['klima', 'kuehl', 'kalt', 'heizung'] },
  { name: 'Reifen', keys: ['reifen', 'rad', 'felge'] },
  { name: 'Karosserie', keys: ['karosserie', 'tuer', 'stoß', 'stoss', 'lack'] }
];

const TEILE_HINTS = [
  { keys: ['brems', 'bremse'], teile: ['Bremsbelaege', 'Bremsscheiben'] },
  { keys: ['oel', 'ol', 'oil'], teile: ['Motoroel', 'Oelfilter'] },
  { keys: ['klima', 'kuehl', 'klimaanlage'], teile: ['Kaeltemittel', 'Innenraumfilter'] },
  { keys: ['batterie'], teile: ['Batterie'] },
  { keys: ['reifen'], teile: ['Reifen', 'Ventile'] },
  { keys: ['zahnriemen'], teile: ['Zahnriemen-Kit', 'Wasserpumpe'] },
  { keys: ['kerze', 'zuendkerze'], teile: ['Zuendkerzen'] },
  { keys: ['luftfilter'], teile: ['Luftfilter'] }
];

const VIN_WMI = {
  VF7: { hersteller: 'Citroen', istCitroen: true },
  VR7: { hersteller: 'Citroen', istCitroen: true },
  VF3: { hersteller: 'Peugeot', istCitroen: false },
  VF1: { hersteller: 'Renault', istCitroen: false },
  VSS: { hersteller: 'Seat', istCitroen: false },
  WVW: { hersteller: 'VW', istCitroen: false },
  WBA: { hersteller: 'BMW', istCitroen: false },
  WDB: { hersteller: 'Mercedes', istCitroen: false },
  WAU: { hersteller: 'Audi', istCitroen: false },
  ZFA: { hersteller: 'Fiat', istCitroen: false }
};

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter(t => t.length > 1);
}

function splitArbeiten(text) {
  return String(text || '')
    .split(/[\r\n,;]+/)
    .map(a => a.trim())
    .filter(a => a.length > 0);
}

function minutesToHours(minuten) {
  return Math.round((minuten / 60) * 100) / 100;
}

function kategorisiereArbeit(name) {
  const text = normalizeText(name);
  for (const kat of KATEGORIEN) {
    if (kat.keys.some(key => text.includes(key))) {
      return kat.name;
    }
  }
  return 'Sonstiges';
}

function prioritaetAusText(text) {
  const norm = normalizeText(text);
  if (!norm) return 'mittel';
  if (norm.includes('dringend') || norm.includes('sofort') || norm.includes('notfall')) {
    return 'hoch';
  }
  if (norm.includes('brem') || norm.includes('lenk') || norm.includes('unfall')) {
    return 'hoch';
  }
  if (norm.includes('bald') || norm.includes('zeitnah') || norm.includes('demnaechst')) {
    return 'mittel';
  }
  return 'niedrig';
}

function matchArbeitszeit(line, arbeitszeiten) {
  const textNorm = normalizeText(line);
  if (!textNorm) return null;
  const tokens = new Set(tokenize(line));
  let best = null;
  let bestScore = 0;
  arbeitszeiten.forEach(arbeit => {
    const score = scoreArbeitszeit(textNorm, tokens, arbeit);
    if (score > bestScore) {
      bestScore = score;
      best = arbeit;
    }
  });
  return bestScore > 0 ? best : null;
}

async function shouldTrainModel() {
  const settings = await EinstellungenModel.getWerkstatt();
  if (settings?.ki_enabled === false || settings?.ki_enabled === 0) {
    return false;
  }
  if (settings?.ki_mode && !['local', 'external'].includes(settings.ki_mode)) {
    return false;
  }
  return true;
}

async function trainZeitModel(force = false) {
  if (trainingPromise) {
    return trainingPromise;
  }

  const now = Date.now();
  if (!force && zeitModelCache.trainedAt && (now - zeitModelCache.trainedAt) < TRAINING_INTERVAL_MS) {
    return zeitModelCache;
  }

  trainingPromise = (async () => {
    const shouldTrain = await shouldTrainModel();
    if (!shouldTrain) {
      return zeitModelCache;
    }

    const arbeitszeiten = await ArbeitszeitenModel.getAll();
    // Nur abgeschlossene Termine, nicht ausgeschlossene, mit tatsächlicher Zeit
    const rows = await allAsync(
      `SELECT arbeit, geschaetzte_zeit, tatsaechliche_zeit, status
       FROM termine
       WHERE geloescht_am IS NULL
         AND arbeit IS NOT NULL
         AND status = 'abgeschlossen'
         AND tatsaechliche_zeit IS NOT NULL
         AND tatsaechliche_zeit > 0
         AND (ki_training_exclude IS NULL OR ki_training_exclude = 0)`
    );

    // Erste Phase: Sammle alle Zeiten pro Arbeit für Ausreißer-Erkennung
    const rawStats = new Map();
    rows.forEach(row => {
      const totalMinuten = row.tatsaechliche_zeit;
      const arbeiten = splitArbeiten(row.arbeit);
      if (arbeiten.length === 0) return;

      const matches = arbeiten
        .map(item => matchArbeitszeit(item, arbeitszeiten))
        .filter(Boolean);

      if (matches.length === 0) return;

      const weights = matches.map(m => m.standard_minuten || DEFAULT_DAUER_MINUTEN);
      const sumWeights = weights.reduce((sum, w) => sum + w, 0) || matches.length;

      matches.forEach((match, idx) => {
        const weight = weights[idx] || DEFAULT_DAUER_MINUTEN;
        const assigned = (totalMinuten * weight) / sumWeights;
        const key = normalizeText(match.bezeichnung);

        if (!rawStats.has(key)) {
          rawStats.set(key, { name: match.bezeichnung, values: [] });
        }
        rawStats.get(key).values.push(assigned);
      });
    });

    // Zweite Phase: Ausreißer filtern (IQR-Methode)
    const stats = new Map();
    let globalSum = 0;
    let globalCount = 0;
    let outlierCount = 0;

    rawStats.forEach((entry, key) => {
      const values = entry.values.sort((a, b) => a - b);
      if (values.length < 3) {
        // Zu wenig Daten für Ausreißer-Erkennung, alle nutzen
        const sum = values.reduce((s, v) => s + v, 0);
        stats.set(key, { name: entry.name, sum, count: values.length });
        globalSum += sum;
        globalCount += values.length;
        return;
      }

      // IQR-basierte Ausreißer-Erkennung
      const q1 = values[Math.floor(values.length * 0.25)];
      const q3 = values[Math.floor(values.length * 0.75)];
      const iqr = q3 - q1;
      const lowerBound = Math.max(5, q1 - 1.5 * iqr); // Minimum 5 Minuten
      const upperBound = q3 + 1.5 * iqr;

      // Filtere Ausreißer
      const filtered = values.filter(v => v >= lowerBound && v <= upperBound);
      const outliers = values.length - filtered.length;
      outlierCount += outliers;

      if (filtered.length > 0) {
        const sum = filtered.reduce((s, v) => s + v, 0);
        stats.set(key, { name: entry.name, sum, count: filtered.length });
        globalSum += sum;
        globalCount += filtered.length;
      }
    });

    if (outlierCount > 0) {
      console.log(`[KI-Training] ${outlierCount} Ausreißer automatisch gefiltert`);
    }

    const byArbeit = {};
    stats.forEach((entry, key) => {
      byArbeit[key] = {
        name: entry.name,
        avgMinutes: Math.round(entry.sum / entry.count),
        samples: entry.count
      };
    });

    const fallbackMinutes = globalCount ? Math.round(globalSum / globalCount) : DEFAULT_DAUER_MINUTEN;

    zeitModelCache = {
      trainedAt: now,
      samples: globalCount,
      fallbackMinutes,
      byArbeit
    };

    return zeitModelCache;
  })();

  try {
    return await trainingPromise;
  } finally {
    trainingPromise = null;
  }
}

async function getZeitModel() {
  return trainZeitModel(false);
}

function scoreArbeitszeit(textNorm, tokens, arbeit) {
  if (!arbeit || !arbeit.bezeichnung) return 0;
  const names = [arbeit.bezeichnung];
  if (arbeit.aliase) {
    arbeit.aliase.split(',').map(a => a.trim()).filter(Boolean).forEach(alias => names.push(alias));
  }

  let bestScore = 0;
  names.forEach(name => {
    const nameNorm = normalizeText(name);
    if (!nameNorm) return;
    if (textNorm.includes(nameNorm)) {
      bestScore = Math.max(bestScore, 5 + Math.min(3, Math.floor(nameNorm.length / 6)));
    }
    const nameTokens = tokenize(nameNorm);
    let tokenScore = 0;
    nameTokens.forEach(token => {
      if (tokens.has(token)) {
        tokenScore += 1;
      }
    });
    bestScore = Math.max(bestScore, tokenScore);
  });

  return bestScore;
}

async function suggestArbeiten(beschreibung, fahrzeug = '') {
  const arbeitszeiten = await ArbeitszeitenModel.getAll();
  const model = await getZeitModel();
  const textNorm = normalizeText(beschreibung);
  const tokens = new Set(tokenize(beschreibung));

  const matches = arbeitszeiten.map(arbeit => ({
    arbeit,
    score: scoreArbeitszeit(textNorm, tokens, arbeit)
  }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SUGGESTION_LIMIT);

  const arbeiten = matches.map(item => {
    const key = normalizeText(item.arbeit.bezeichnung);
    const modelMinutes = model.byArbeit[key]?.avgMinutes;
    const minuten = modelMinutes || item.arbeit.standard_minuten || model.fallbackMinutes || DEFAULT_DAUER_MINUTEN;
    return {
      name: item.arbeit.bezeichnung,
      beschreibung: item.arbeit.bezeichnung,
      dauer_stunden: minutesToHours(minuten),
      prioritaet: prioritaetAusText(beschreibung),
      kategorie: kategorisiereArbeit(item.arbeit.bezeichnung)
    };
  });

  const teileVermutung = erkenneTeilebedarfSync(beschreibung).teile.map(t => t.name);
  const gesamt = arbeiten.reduce((sum, a) => sum + (a.dauer_stunden || 0), 0);

  return {
    arbeiten,
    gesamtdauer_stunden: Math.round(gesamt * 100) / 100,
    empfehlung: arbeiten.length ? 'Lokale Heuristik: Vorschlaege basierend auf Standardzeiten.' : null,
    hinweise: fahrzeug ? [`Fahrzeug: ${fahrzeug}`] : [],
    teile_vermutung: teileVermutung
  };
}

async function estimateZeit(arbeiten, fahrzeug = '') {
  const arbeitszeiten = await ArbeitszeitenModel.getAll();
  const model = await getZeitModel();

  const zeiten = arbeiten.map(arbeit => {
    const match = matchArbeitszeit(arbeit, arbeitszeiten);
    const modelKey = match ? normalizeText(match.bezeichnung) : normalizeText(arbeit);
    const modelMinutes = model.byArbeit[modelKey]?.avgMinutes;
    const minuten = modelMinutes || match?.standard_minuten || model.fallbackMinutes || DEFAULT_DAUER_MINUTEN;
    return {
      arbeit,
      dauer_stunden: minutesToHours(minuten),
      quelle: modelMinutes ? 'modell' : (match ? 'lokal' : 'default')
    };
  });

  const gesamtdauer = zeiten.reduce((sum, z) => sum + (z.dauer_stunden || 0), 0);
  return {
    zeiten,
    gesamtdauer: Math.round(gesamtdauer * 100) / 100,
    quelle: model.samples > 0 ? 'lokales Modell' : 'lokale Heuristik',
    modell_samples: model.samples
  };
}

async function parseTerminFromText(text) {
  const arbeitszeiten = await ArbeitszeitenModel.getAll();
  const textNorm = normalizeText(text);
  const tokens = new Set(tokenize(text));

  const arbeitsMatches = arbeitszeiten.map(arbeit => ({
    arbeit,
    score: scoreArbeitszeit(textNorm, tokens, arbeit)
  }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const arbeiten = arbeitsMatches.map(item => item.arbeit.bezeichnung);
  const zeitData = arbeiten.length ? await estimateZeit(arbeiten) : null;

  const dateInfo = extractDate(text);
  const timeInfo = extractTime(text);
  const kennzeichen = extractKennzeichen(text);
  const kundeName = extractKundenName(text);
  const telefon = extractTelefon(text);
  const fremdmarke = openaiService.erkenneFremdmarke(text);

  const modell = detectCitroenModell(textNorm);
  const marke = fremdmarke.istFremdmarke ? fremdmarke.erkannteMarke : (modell ? 'Citroen' : null);

  let confidence = 0.25;
  if (dateInfo) confidence += 0.2;
  if (timeInfo) confidence += 0.15;
  if (arbeiten.length) confidence += 0.2;
  if (kennzeichen) confidence += 0.1;
  if (kundeName) confidence += 0.1;
  confidence = Math.min(0.9, confidence);

  return {
    kunde: {
      name: kundeName || null,
      telefon: telefon || null
    },
    fahrzeug: {
      marke,
      modell: modell || null,
      kennzeichen: kennzeichen || null
    },
    termin: {
      datum: dateInfo || null,
      uhrzeit: timeInfo || null,
      dauer_stunden: zeitData?.gesamtdauer || null
    },
    arbeiten,
    beschreibung: arbeiten.length ? arbeiten.join(', ') : text.slice(0, 120),
    fremdmarke: fremdmarke.istFremdmarke,
    fremdmarke_warnung: fremdmarke.istFremdmarke
      ? `Achtung: ${fremdmarke.erkannteMarke} ist keine Citroen-Marke.`
      : null,
    confidence
  };
}

function erkenneTeilebedarfSync(beschreibung) {
  const textNorm = normalizeText(beschreibung);
  const teile = [];
  const seen = new Set();

  TEILE_HINTS.forEach(rule => {
    if (rule.keys.some(key => textNorm.includes(key))) {
      rule.teile.forEach(teil => {
        if (seen.has(teil)) return;
        seen.add(teil);
        teile.push({ name: teil, grund: 'Schluesselwort erkannt', sicherheit: 'mittel' });
      });
    }
  });

  return { teile };
}

async function erkenneTeilebedarf(beschreibung, fahrzeug = '') {
  const result = erkenneTeilebedarfSync(beschreibung);
  return {
    teile: result.teile,
    hinweise: fahrzeug ? [`Fahrzeug: ${fahrzeug}`] : []
  };
}

async function getWartungsplan(fahrzeugtyp, kmStand, fahrzeugalter = null) {
  const km = Number(kmStand) || 0;
  const intervalle = [
    { arbeit: 'Oelwechsel', interval: 15000, dauer: 0.5, empfehlung: 'Essential' },
    { arbeit: 'Inspektion klein', interval: 15000, dauer: 1.0, empfehlung: 'Essential' },
    { arbeit: 'Inspektion gross', interval: 30000, dauer: 2.5, empfehlung: 'Reference' },
    { arbeit: 'Bremsen pruefen', interval: 30000, dauer: 1.0, empfehlung: 'Reference' },
    { arbeit: 'Klimaservice', interval: 20000, dauer: 1.0, empfehlung: 'Reference' },
    { arbeit: 'Zahnriemenwechsel', interval: 100000, dauer: 3.5, empfehlung: 'Serenity' }
  ];

  const jetzt = [];
  const bald = [];

  intervalle.forEach(item => {
    const nextDue = Math.ceil(km / item.interval) * item.interval;
    const diff = nextDue - km;
    if (diff <= 2000) {
      jetzt.push({
        arbeit: item.arbeit,
        grund: `Intervall ${item.interval} km`,
        dauer_stunden: item.dauer,
        prioritaet: diff <= 500 ? 'hoch' : 'mittel',
        empfehlung: item.empfehlung
      });
    } else if (diff <= 10000) {
      bald.push({
        arbeit: item.arbeit,
        faellig_bei_km: nextDue,
        noch_km: diff
      });
    }
  });

  const gesamt = jetzt.reduce((sum, item) => sum + item.dauer_stunden, 0);
  const serviceEmpfehlung = jetzt.find(item => item.empfehlung)?.empfehlung || null;

  return {
    success: true,
    data: {
      fahrzeug: fahrzeugtyp,
      kmStand: km,
      motortyp: null,
      jetzt_faellig: jetzt,
      bald_faellig: bald,
      service_empfehlung: serviceEmpfehlung,
      geschaetzte_gesamtzeit: Math.round(gesamt * 100) / 100,
      citroen_hinweise: fahrzeugalter ? [`Fahrzeugalter: ${fahrzeugalter} Jahre`] : [],
      naechste_inspektion_km: km + 15000
    }
  };
}

function decodeVIN(vin) {
  const cleanVin = (vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  if (cleanVin.length !== 17) {
    return {
      success: false,
      error: `VIN muss 17 Zeichen haben (eingegeben: ${cleanVin.length})`,
      vin: cleanVin
    };
  }

  const wmi = cleanVin.slice(0, 3);
  const modellCode = cleanVin.slice(3, 5);
  const motorCode = cleanVin.charAt(7);
  const herstellerInfo = VIN_WMI[wmi] || { hersteller: 'Unbekannt', istCitroen: false };
  const modellInfo = openaiService.PSA_MODELLE?.[modellCode] || { modell: 'Unbekannt', generation: '' };
  const motorInfo = openaiService.PSA_MOTOREN?.[motorCode] || { code: motorCode, typ: 'Unbekannt', hinweise: [] };

  return {
    success: true,
    vin: cleanVin,
    istCitroen: herstellerInfo.istCitroen,
    hersteller: herstellerInfo.hersteller,
    modell: modellInfo.modell,
    generation: modellInfo.generation,
    baujahr: null,
    werk: null,
    getriebe: null,
    motor: {
      code: motorInfo.code || motorCode,
      typ: motorInfo.typ || 'Unbekannt',
      ps: motorInfo.ps || 'n/a',
      hinweise: motorInfo.hinweise || []
    },
    teile: {
      hinweise: [],
      warnungen: []
    }
  };
}

function checkTeileKompatibilitaet(vin, arbeit) {
  const vinData = decodeVIN(vin);
  if (!vinData.success) {
    return vinData;
  }
  return {
    success: true,
    vin,
    fahrzeug: `${vinData.hersteller} ${vinData.modell}`,
    arbeit,
    warnungen: [],
    empfehlungen: []
  };
}

function extractDate(text) {
  const match = text.match(/(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/);
  if (!match) return null;

  const day = String(match[1]).padStart(2, '0');
  const month = String(match[2]).padStart(2, '0');
  let year = match[3];
  if (!year) {
    year = new Date().getFullYear();
  } else if (year.length === 2) {
    year = Number(year) < 50 ? `20${year}` : `19${year}`;
  }

  return `${year}-${month}-${day}`;
}

function extractTime(text) {
  const match = text.match(/(?:um|ab|gegen)?\s*(\d{1,2})[:.](\d{2})/i);
  if (!match) return null;
  const hh = String(match[1]).padStart(2, '0');
  const mm = String(match[2]).padStart(2, '0');
  return `${hh}:${mm}`;
}

function extractKennzeichen(text) {
  const match = text.toUpperCase().match(/\b[A-Z]{1,3}[-\s]?[A-Z]{1,2}[-\s]?\d{1,4}\b/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

function extractKundenName(text) {
  const match = text.match(/(?:herr|frau)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  return match ? match[1].trim() : null;
}

function extractTelefon(text) {
  const match = text.match(/(\+?\d[\d\s\-\/]{6,}\d)/);
  return match ? match[1].trim() : null;
}

function detectCitroenModell(textNorm) {
  const modelle = openaiService.CITROEN_MODELLE || [];
  const found = modelle.find(modell => textNorm.includes(normalizeText(modell)));
  return found || null;
}

function erkenneFremdmarke(text) {
  return openaiService.erkenneFremdmarke(text);
}

function scheduleDailyTraining() {
  const run = async () => {
    try {
      await trainZeitModel(true);
    } catch (err) {
      console.warn('Lokales KI-Training fehlgeschlagen:', err.message);
    }
  };

  setTimeout(run, 5000);
  setInterval(run, TRAINING_INTERVAL_MS);
}

module.exports = {
  kategorisiereArbeit,
  prioritaetAusText,
  parseTerminFromText,
  suggestArbeiten,
  estimateZeit,
  erkenneTeilebedarf,
  getWartungsplan,
  decodeVIN,
  checkTeileKompatibilitaet,
  erkenneFremdmarke,
  trainZeitModel,
  scheduleDailyTraining
};
