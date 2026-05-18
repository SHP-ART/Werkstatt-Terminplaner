const fs = require('fs');

function normalizeLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function getLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
}

function firstMatch(text, regex) {
  const match = String(text || '').match(regex);
  return match && match[1] ? normalizeLine(match[1]) : null;
}

function parseCustomer(lines) {
  const datumIndex = lines.findIndex((line) => line.startsWith('Datum:'));
  const block = datumIndex > 0 ? lines.slice(0, datumIndex) : [];
  const type = block[0] || null;

  if (type === 'Firma') {
    return {
      type,
      name: block[1] || null,
      contact: block[2] || null,
      address: block.slice(3)
    };
  }

  return {
    type,
    name: block[1] || null,
    contact: null,
    address: block.slice(2)
  };
}

function parseVehicle(lines) {
  const vehicleLine = lines.find((line) => line.includes('km-Stand:')) || null;
  const vinLine = lines.find((line) => line.includes('Fg-Nr:')) || '';
  const kennzeichen = vinLine ? normalizeLine(vinLine.split(/\s*Fg-Nr:/)[0]) : null;

  return {
    raw: vehicleLine,
    kennzeichen: kennzeichen || null,
    vin: firstMatch(vinLine, /Fg-Nr:\s*([A-Z0-9]{17})/),
    kmStand: firstMatch(vehicleLine, /km-Stand:\s*([0-9_]+)/),
    erstzulassung: firstMatch(vinLine, /Erstzul\.:\s*([0-9.]+)/)
  };
}

function removeWorkCode(line) {
  return line
    .replace(/^\d+\.\s*/, '')
    .replace(/^MONT(?=REIFEN)/i, '')
    .replace(/^ALTRE(?=ALTREIFEN)/i, '')
    .replace(/^CHECK(?=FAHRZEUGCHECK)/i, '')
    .replace(/^WISO(?=WINTERR)/i, '')
    .replace(/^EINL(?=EINLAGERUNG)/i, '')
    .replace(/^FAB(?=REINIGUNG)/i, '')
    .replace(/^[0-9]{3}[A-Z][0-9]{4}\s*/, '')
    .replace(/^[0-9]{6,10}\s*/, '')
    .replace(/^[0-9]{3}\s*/, '')
    .trim();
}

function extractAwMinutes(line) {
  const s = String(line || '');

  // Locosoft no-space format: [Anzahl:1digit][AW:2digits][price:digits,xx]
  // e.g. "001AUSTAUSCH BATTERIE10327,72" = Anzahl=1, AW=03, EUR=27,72
  const noSpace = s.match(/\d(\d{2})\d+,\d{2}$/);
  if (noSpace) {
    const aw = parseInt(noSpace[1], 10);
    if (aw >= 1 && aw <= 99) return aw * 6;
  }

  // Space-separated format: "ARBEIT N price,xx"
  const spaced = s.match(/\s(\d{1,3})\s+\d+,\d{2}(?:\s+\d+,\d{2})*$/);
  if (spaced) {
    const aw = parseInt(spaced[1], 10);
    if (aw >= 1 && aw <= 100) return aw * 6;
  }

  return null;
}

function removeAccountingTail(line) {
  return line
    .replace(/\s*\d{1,3}\s*\d+,\d{2}(?:\s+\d+,\d{2})*$/, '')
    .replace(/\s*\d+,\d{2}(?:\s+\d+,\d{2})*$/, '')
    .replace(/\d{2,}$/, '')
    .trim();
}

function isWorkSectionMarker(line) {
  return /^\d+\.$/.test(line);
}

function isPartsSection(line) {
  return /^Teile-Nummer\b/i.test(line);
}

function isLikelyMaterialLine(line) {
  return (
    /\*/.test(line)
    || /^(?:F10|F12|SILIKONSPRAY)/i.test(line)
    || /(?:Quartz|OELFILTER|INNENRAUM|ABSCHEIDEFILTER|BREMSFLUESSIGKEIT|SCHEIBENWASCHFLUESSIGKEIT|DICHTUNG|SOMMERREIFEN|SCHMIERMITTEL|REINIGUNGSMITTEL)/i.test(line)
  );
}

function startsNewWorkItem(line) {
  return (
    /^\d+\.\s*\S+/.test(line)
    || /^MONT(?=REIFEN)/i.test(line)
    || /^ALTRE(?=ALTREIFEN)/i.test(line)
    || /^CHECK(?=FAHRZEUGCHECK)/i.test(line)
    || /^WISO(?=WINTERR)/i.test(line)
    || /^EINL(?=EINLAGERUNG)/i.test(line)
    || /^FAB(?=REINIGUNG)/i.test(line)
    || /^[0-9]{3,10}[A-ZÄÖÜa-zäöü.]/.test(line)
    || /^[A-ZÄÖÜ][A-ZÄÖÜ -]+:/.test(line)
  );
}

function normalizeWorkText(line) {
  return removeAccountingTail(removeWorkCode(line))
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenWorkText(text) {
  const value = String(text || '').trim();
  const upper = value.toUpperCase();

  if (/PARTIKELFILTER.*AUS\/EINBAU/.test(upper)) return 'Partikelfilter aus/einbauen';
  if (/PARTIKELFILTER.*CLEANTECH|GEGENDRUCKMESSUNG/.test(upper)) return 'Partikelfilter reinigen';
  if (/ABGASUNTERSUCHUNG|^A\.U\./.test(upper)) return 'AU';
  if (/HAUPTUNTERSUCHUNG|DEKRA|STVZO/.test(upper)) return 'HU';
  if (/WARTUNG NACH HERSTELLERVORGABEN/.test(upper)) return 'Wartung';
  if (/SYSTEMATISCHE.*WARTUNG|WARTUNG.*SYSTEMATISCHE|WARTUNGEN: SYSTEMATISCHE/.test(upper)) return 'Wartung';
  if (/POLLENFILTER/.test(upper)) return 'Pollenfilter';
  if (/KRAFTSTOFFILTER|KRAFTSTOFFFILTER/.test(upper)) return 'Kraftstofffilter';
  if (/BREMSKREISLAUF|BREMSFLUESSIGKEIT/.test(upper)) return 'Bremsfluessigkeit';
  if (/LUFT.*VERLUST/.test(upper)) return value.replace(/REIFEN HR/i, 'Reifen HR');
  if (/REIFEN ERNEUERT|AUSWUCHTEN/.test(upper)) return 'Reifen erneuern';
  if (/ALTREIFENENTSORGUNG/.test(upper)) return 'Altreifenentsorgung';
  if (/FAHRZEUGCHECK/.test(upper)) return 'Fahrzeugcheck';
  if (/WINTERR.*DER.*SOMMERR.*DER|RADMUTTERN/.test(upper)) return 'Raeder wechseln';
  if (/EINLAGERUNG.*R.*DER/.test(upper)) return 'Raeder einlagern';

  return value;
}

function uniqueItems(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = item.text.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isWartungItem(item) {
  return normalizeForMatch(item?.text) === 'wartung';
}

function isWartungSubItem(item) {
  const text = normalizeForMatch(item?.text);
  const original = normalizeForMatch(item?.originalText);
  const combined = `${text} ${original}`;

  return (
    /pollenfilter|kraftstofffilter|kraftstoffilter|bremsfluessigkeit|bremskreis|innenraumfilter|oelfilter|luftfilter|zuendkerzen|zahnriemen|filter wartung|austausch .* wartung/.test(combined)
  );
}

function isInspectionItem(item) {
  const text = normalizeForMatch(item?.text);
  return text === 'au' || text === 'hu' || text === 'ha';
}

function combineAuHuItems(items) {
  const auIndex = items.findIndex((item) => normalizeForMatch(item?.text) === 'au');
  const huIndex = items.findIndex((item) => normalizeForMatch(item?.text) === 'hu');

  if (auIndex < 0 || huIndex < 0) return items;

  const firstIndex = Math.min(auIndex, huIndex);
  const au = items[auIndex];
  const hu = items[huIndex];
  const combined = {
    ...au,
    text: 'AU/HU',
    originalText: 'AU/HU',
    sourceLines: [
      ...(au.sourceLines || []),
      ...(hu.sourceLines || [])
    ],
    dauer_minuten: 30,
    zeit_quelle: au.zeit_quelle === hu.zeit_quelle ? au.zeit_quelle : 'kombiniert',
    zeit_match: null
  };

  return items.reduce((result, item, index) => {
    if (index === firstIndex) {
      result.push(combined);
      return result;
    }
    if (index === auIndex || index === huIndex) return result;
    result.push(item);
    return result;
  }, []);
}

function normalizeWorkItemsForTermin(items) {
  const normalized = items.map((item) => ({
    ...item,
    text: shortenWorkText(item.text)
  }));
  const unique = uniqueItems(normalized);
  const hasWartung = unique.some(isWartungItem);

  if (!hasWartung) return unique;

  return unique.filter((item) => !isWartungSubItem(item));
}

function normalizeForMatch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\/\-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreArbeitszeitMatch(text, arbeitszeit) {
  if (!text || !arbeitszeit) return 0;

  const suche = normalizeForMatch(text);
  const candidates = [arbeitszeit.bezeichnung];
  if (arbeitszeit.aliase) {
    arbeitszeit.aliase
      .split(',')
      .map((alias) => alias.trim())
      .filter(Boolean)
      .forEach((alias) => candidates.push(alias));
  }

  let bestScore = 0;
  candidates.forEach((candidate) => {
    const normCandidate = normalizeForMatch(candidate);
    if (!normCandidate) return;
    if (suche === normCandidate) bestScore = Math.max(bestScore, 100);
    if (suche.includes(normCandidate) || normCandidate.includes(suche)) {
      bestScore = Math.max(bestScore, 80 + Math.min(normCandidate.length, 20));
    }

    const suchWorte = suche.split(' ').filter((word) => word.length >= 3);
    const candidateWorte = normCandidate.split(' ').filter((word) => word.length >= 3);
    const hits = suchWorte.filter((suchWort) => (
      candidateWorte.some((candidateWort) => (
        candidateWort.includes(suchWort) || suchWort.includes(candidateWort)
      ))
    ));

    if (hits.length > 0) {
      bestScore = Math.max(bestScore, hits.length * 10);
    }
  });

  return bestScore;
}

function findBestArbeitszeit(text, arbeitszeiten) {
  return (arbeitszeiten || [])
    .map((arbeitszeit) => ({
      arbeitszeit,
      score: scoreArbeitszeitMatch(text, arbeitszeit)
    }))
    .filter((match) => match.score >= 30)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function applySystemArbeitszeiten(daten, arbeitszeiten, options = {}) {
  const fallbackMinuten = options.fallbackMinuten || 60;
  const sourceItems = normalizeWorkItemsForTermin(daten.arbeit?.items || []);
  const matchedItems = sourceItems.map((item) => ({
    item,
    match: findBestArbeitszeit(item.text, arbeitszeiten)
      || findBestArbeitszeit(item.originalText, arbeitszeiten)
  }));
  const hasSystemMatch = matchedItems.some(({ match }) => match?.arbeitszeit?.standard_minuten);
  const result = {
    ...daten,
    arbeit: {
      ...daten.arbeit,
      items: combineAuHuItems(matchedItems.map(({ item, match }) => {
        if (isInspectionItem(item)) {
          return {
            ...item,
            dauer_minuten: 30,
            zeit_quelle: 'pruefung_max_30',
            zeit_match: match?.arbeitszeit ? {
              id: match.arbeitszeit.id,
              bezeichnung: match.arbeitszeit.bezeichnung,
              score: match.score
            } : null
          };
        }

        if (match?.arbeitszeit?.standard_minuten) {
          const minuten = parseInt(match.arbeitszeit.standard_minuten, 10);
          return {
            ...item,
            dauer_minuten: minuten,
            zeit_quelle: 'arbeitszeiten',
            zeit_match: {
              id: match.arbeitszeit.id,
              bezeichnung: match.arbeitszeit.bezeichnung,
              score: match.score
            }
          };
        }

        if (item.dauer_minuten_pdf) {
          return {
            ...item,
            dauer_minuten: item.dauer_minuten_pdf,
            zeit_quelle: 'pdf_aw',
            zeit_match: null
          };
        }

        return {
          ...item,
          dauer_minuten: hasSystemMatch ? 0 : fallbackMinuten,
          zeit_quelle: hasSystemMatch ? 'ohne_systemzeit' : 'fallback',
          zeit_match: null
        };
      }))
    }
  };

  result.arbeit.summary = result.arbeit.items.map((item) => item.text).join('\n') || null;

  const geschaetzteZeit = result.arbeit.items
    .reduce((sum, item) => sum + (parseInt(item.dauer_minuten, 10) || 0), 0);

  result.geschaetzte_zeit = geschaetzteZeit || fallbackMinuten;
  result.zeit_quelle = result.arbeit.items.some((item) => item.zeit_quelle === 'arbeitszeiten')
    ? 'arbeitszeiten'
    : 'fallback';

  return result;
}

async function applySystemArbeitszeitenFromDb(daten, options = {}) {
  const ArbeitszeitenModel = require('../models/arbeitszeitenModel');
  const arbeitszeiten = await ArbeitszeitenModel.getAll();
  return applySystemArbeitszeiten(daten, arbeitszeiten, options);
}

function addWorkItem(items, text, sourceLines) {
  if (!text) return;
  let dauerMinutenPdf = null;
  for (const sl of sourceLines) {
    const aw = extractAwMinutes(sl);
    if (aw !== null) { dauerMinutenPdf = aw; break; }
  }
  const entry = {
    text: shortenWorkText(text),
    originalText: text,
    sourceLines: [...sourceLines]
  };
  if (dauerMinutenPdf !== null) entry.dauer_minuten_pdf = dauerMinutenPdf;
  items.push(entry);
}

function parseWorkItems(rawLines) {
  const items = [];
  let currentText = '';
  let currentSourceLines = [];
  let inPartsSection = false;

  rawLines.forEach((line) => {
    if (isPartsSection(line)) {
      inPartsSection = true;
      return;
    }

    if (inPartsSection || isWorkSectionMarker(line) || isLikelyMaterialLine(line)) {
      return;
    }

    const text = normalizeWorkText(line);
    if (!text) return;

    if (startsNewWorkItem(line) || !currentText) {
      addWorkItem(items, currentText, currentSourceLines);
      currentText = text;
      currentSourceLines = [line];
      return;
    }

    currentText = `${currentText} ${text}`;
    currentSourceLines.push(line);
  });

  addWorkItem(items, currentText, currentSourceLines);

  return normalizeWorkItemsForTermin(items);
}

function parseWork(lines) {
  const startIndex = lines.findIndex((line) => (
    line.includes('Dienstleistung/Benennung')
    || /durchzuf\S+hrende Arbeiten/.test(line)
  ));

  if (startIndex < 0) {
    return {
      rawLines: [],
      summary: null
    };
  }

  const endIndex = lines.findIndex((line, index) => (
    index > startIndex && line.startsWith('Auftragssumme netto')
  ));

  const rawLines = lines
    .slice(startIndex + 1, endIndex > startIndex ? endIndex : undefined)
    .filter((line) => !line.startsWith('Zwischensumme'));
  const items = parseWorkItems(rawLines);

  return {
    rawLines,
    items,
    summary: items.map((item) => item.text).join('\n') || null
  };
}

function parseAuftragsText(text) {
  const lines = getLines(text);
  const joined = lines.join('\n');
  const abholung = joined.match(/Abholtermin:\s*([0-9.]{8})\s*um\s*([0-9:]{5})\s*Uhr/);

  return {
    kunde: parseCustomer(lines),
    datum: firstMatch(joined, /Datum:\s*([0-9]{2}\.[0-9]{2}\.[0-9]{4})/),
    berater: firstMatch(joined, /Berater:\s*([^\n]+)/),
    auftragsnummer: firstMatch(joined, /Auftragsbest\S+tigung Nr\.\s*([0-9]+)/),
    kundennummer: firstMatch(joined, /Kd\.Nr\.:\s*([0-9]+)/),
    abholung: abholung ? {
      datum: abholung[1],
      zeit: abholung[2]
    } : null,
    fahrzeug: parseVehicle(lines),
    arbeit: parseWork(lines),
    warnings: []
  };
}

async function extractTextFromPdf(filePath) {
  const parsePdf = require('pdf-parse');
  const result = await parsePdf(fs.readFileSync(filePath));
  return result.text;
}

async function parseAuftragsPdf(filePath) {
  const text = await extractTextFromPdf(filePath);
  return {
    text,
    daten: parseAuftragsText(text)
  };
}

module.exports = {
  parseAuftragsText,
  applySystemArbeitszeiten,
  applySystemArbeitszeitenFromDb,
  extractTextFromPdf,
  parseAuftragsPdf
};
