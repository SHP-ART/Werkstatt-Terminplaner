const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { dataDir } = require('../config/database');
const { allAsync } = require('../utils/dbHelper');
const { withTransaction } = require('../utils/transaction');
const TermineModel = require('../models/termineModel');
const AuftragsimportModel = require('../models/auftragsimportModel');
const {
  parseAuftragsPdf,
  applySystemArbeitszeitenFromDb
} = require('./auftragsParserService');

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const IMPORT_DIR = process.env.AUFTRAGSIMPORT_DIR || path.join(dataDir, 'uploads', 'auftraege');
const LOCOSOFT_PRUEFEN_DIR = path.join(IMPORT_DIR, 'locosoft-pruefen');

function ensureImportDirs() {
  fs.mkdirSync(IMPORT_DIR, { recursive: true });
  fs.mkdirSync(LOCOSOFT_PRUEFEN_DIR, { recursive: true });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function toIsoDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
}

function cleanKennzeichen(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildTerminData(importItem, overrides = {}) {
  const daten = {
    ...(importItem.erkannte_daten || {}),
    ...(overrides.erkannte_daten || {})
  };
  const arbeit = daten.arbeit?.summary || 'Auftrag aus PDF';
  const arbeitszeitenDetails = daten.arbeit?.items?.length
    ? {
        arbeiten: daten.arbeit.items.map((item, index) => ({
          name: item.text,
          dauer_minuten: item.dauer_minuten || null,
          reihenfolge: index + 1,
          quelle: 'auftragsimport',
          originalText: item.originalText || item.text
        })),
        _dauer_override: daten.geschaetzte_zeit || null,
        _quelle: 'auftragsimport'
      }
    : null;

  return {
    kunde_name: daten.kunde?.name || null,
    kennzeichen: daten.fahrzeug?.kennzeichen || null,
    arbeit,
    umfang: daten.arbeit?.items?.map(item => item.originalText || item.text).join('\n') || null,
    geschaetzte_zeit: daten.geschaetzte_zeit || 60,
    datum: overrides.datum || toIsoDate(daten.datum) || null,
    abholung_zeit: daten.abholung?.zeit || null,
    abholung_datum: toIsoDate(daten.abholung?.datum) || null,
    vin: daten.fahrzeug?.vin || null,
    fahrzeugtyp: daten.fahrzeug?.raw || null,
    kilometerstand: daten.fahrzeug?.kmStand || null,
    arbeitszeiten_details: arbeitszeitenDetails ? JSON.stringify(arbeitszeitenDetails) : null,
    dringlichkeit: 'normal',
    status: overrides.status || 'geplant',
    ist_schwebend: overrides.ist_schwebend || 0,
    schwebend_prioritaet: overrides.schwebend_prioritaet || 'mittel',
    mitarbeiter_id: overrides.mitarbeiter_id || null,
    bring_zeit: overrides.bring_zeit || null
  };
}

async function findTerminMatches(daten) {
  const datum = toIsoDate(daten.datum);
  const kennzeichen = cleanKennzeichen(daten.fahrzeug?.kennzeichen);
  const kundeName = normalizeName(daten.kunde?.name);

  if (!datum && !kennzeichen && !kundeName) return [];

  const rows = await allAsync(
    `SELECT id, termin_nr, datum, kunde_name, kennzeichen, arbeit, status
       FROM termine
      WHERE geloescht_am IS NULL
        AND COALESCE(ist_schwebend, 0) = 0
        AND (
          (? IS NOT NULL AND datum = ?)
          OR (? IS NOT NULL AND UPPER(REPLACE(kennzeichen, ' ', '')) = UPPER(REPLACE(?, ' ', '')))
          OR (? IS NOT NULL AND LOWER(kunde_name) LIKE ?)
        )
      ORDER BY datum DESC, id DESC
      LIMIT 20`,
    [
      datum, datum,
      kennzeichen, kennzeichen,
      kundeName, kundeName ? `%${kundeName}%` : null
    ]
  );

  return rows.map((row) => {
    let score = 0;
    const reasons = [];
    if (datum && row.datum === datum) {
      score += 40;
      reasons.push('Datum');
    }
    if (kennzeichen && cleanKennzeichen(row.kennzeichen).replace(/\s/g, '') === kennzeichen.replace(/\s/g, '')) {
      score += 45;
      reasons.push('Kennzeichen');
    }
    if (kundeName && normalizeName(row.kunde_name).includes(kundeName)) {
      score += 20;
      reasons.push('Kunde');
    }

    return {
      ...row,
      score,
      sicherheit: score >= 85 ? 'hoch' : (score >= 60 ? 'mittel' : 'niedrig'),
      gruende: reasons
    };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
}

async function parseAndCreateImport(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_PDF_BYTES) {
    throw new Error('PDF ist groesser als 20 MB');
  }

  const hash = sha256File(filePath);
  const existing = await AuftragsimportModel.findByHash(hash);
  if (existing) {
    return { skipped: true, reason: 'duplicate', import: existing };
  }

  const parsed = await parseAuftragsPdf(filePath);
  const datenMitZeit = await applySystemArbeitszeitenFromDb(parsed.daten);
  const matches = await findTerminMatches(datenMitZeit);

  const item = await AuftragsimportModel.create({
    original_dateiname: path.basename(filePath),
    dateipfad: filePath,
    status: 'erkannt',
    text_extract: parsed.text,
    erkannte_daten: datenMitZeit,
    zuordnungs_treffer: matches,
    dateigroesse: stat.size,
    datei_hash: hash
  });

  return { skipped: false, import: item };
}

async function scanImportDir() {
  ensureImportDirs();
  const entries = fs.readdirSync(IMPORT_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'));

  const results = [];
  for (const entry of entries) {
    const filePath = path.join(IMPORT_DIR, entry.name);
    try {
      results.push(await parseAndCreateImport(filePath));
    } catch (error) {
      const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : { size: null };
      const hash = fs.existsSync(filePath) ? sha256File(filePath) : null;
      const existing = hash ? await AuftragsimportModel.findByHash(hash) : null;
      if (existing) {
        results.push({ skipped: true, reason: 'duplicate-error', import: existing });
        continue;
      }
      const item = await AuftragsimportModel.create({
        original_dateiname: path.basename(filePath),
        dateipfad: filePath,
        status: 'fehler',
        fehler: error.message,
        dateigroesse: stat.size,
        datei_hash: hash
      });
      results.push({ skipped: false, error: error.message, import: item });
    }
  }

  return {
    importDir: IMPORT_DIR,
    count: results.length,
    results
  };
}

async function createSchnelltermin(importId, overrides = {}) {
  return await withTransaction(async () => {
    const item = await AuftragsimportModel.getById(importId);
    if (!item) throw new Error('Auftragsimport nicht gefunden');

    const terminData = buildTerminData(item, {
      ...overrides,
      datum: '9999-12-31',
      ist_schwebend: 1,
      status: 'geplant'
    });
    const termin = await TermineModel.create(terminData);

    await AuftragsimportModel.update(importId, {
      termin_id: termin.id,
      status: 'verarbeitet',
      verarbeitet_am: new Date().toISOString()
    });

    return { termin, import: await AuftragsimportModel.getById(importId) };
  });
}

async function createSoftstart(importId, data = {}) {
  return await withTransaction(async () => {
    const item = await AuftragsimportModel.getById(importId);
    if (!item) throw new Error('Auftragsimport nicht gefunden');
    if (!data.mitarbeiter_id) throw new Error('mitarbeiter_id ist erforderlich');

    const now = new Date();
    const datum = now.toISOString().slice(0, 10);
    const startzeit = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const terminData = buildTerminData(item, {
      datum,
      mitarbeiter_id: data.mitarbeiter_id,
      bring_zeit: startzeit,
      status: 'in_arbeit',
      ist_schwebend: 0
    });
    const termin = await TermineModel.create(terminData);

    await AuftragsimportModel.update(importId, {
      termin_id: termin.id,
      status: 'verarbeitet',
      verarbeitet_am: new Date().toISOString()
    });

    return { termin, import: await AuftragsimportModel.getById(importId) };
  });
}

async function assignToTermin(importId, terminId) {
  return await withTransaction(async () => {
    const item = await AuftragsimportModel.getById(importId);
    if (!item) throw new Error('Auftragsimport nicht gefunden');

    await AuftragsimportModel.update(importId, {
      termin_id: terminId,
      status: 'verarbeitet',
      verarbeitet_am: new Date().toISOString()
    });

    return await AuftragsimportModel.getById(importId);
  });
}

async function moveToLocosoftPruefen(importId) {
  ensureImportDirs();
  const item = await AuftragsimportModel.getById(importId);
  if (!item) throw new Error('Auftragsimport nicht gefunden');

  let newPath = item.dateipfad;
  if (item.dateipfad && fs.existsSync(item.dateipfad)) {
    newPath = path.join(LOCOSOFT_PRUEFEN_DIR, path.basename(item.dateipfad));
    if (path.resolve(item.dateipfad) !== path.resolve(newPath)) {
      fs.renameSync(item.dateipfad, newPath);
    }
  }

  await AuftragsimportModel.update(importId, {
    dateipfad: newPath,
    status: 'locosoft_pruefen',
    verarbeitet_am: new Date().toISOString()
  });

  return await AuftragsimportModel.getById(importId);
}

async function discard(importId) {
  const item = await AuftragsimportModel.getById(importId);
  if (!item) throw new Error('Auftragsimport nicht gefunden');

  await AuftragsimportModel.update(importId, {
    status: 'verworfen',
    verarbeitet_am: new Date().toISOString()
  });

  return await AuftragsimportModel.getById(importId);
}

module.exports = {
  IMPORT_DIR,
  LOCOSOFT_PRUEFEN_DIR,
  ensureImportDirs,
  scanImportDir,
  parseAndCreateImport,
  createSchnelltermin,
  createSoftstart,
  assignToTermin,
  moveToLocosoftPruefen,
  discard,
  findTerminMatches,
  buildTerminData
};
