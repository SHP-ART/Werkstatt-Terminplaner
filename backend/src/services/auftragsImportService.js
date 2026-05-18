const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { dataDir } = require('../config/database');
const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
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

function deleteImportFile(dateipfad) {
  if (!dateipfad) return;
  try {
    if (fs.existsSync(dateipfad)) fs.unlinkSync(dateipfad);
  } catch (_) { /* non-fatal */ }
}

function deleteImportFileSafely(dateipfad) {
  deleteImportFile(dateipfad);
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

function todayIsoDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');
}

function cleanKennzeichen(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function normalizeKennzeichen(value) {
  return cleanKennzeichen(value).replace(/[\s-]/g, '');
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeLike(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function buildTerminData(importItem, overrides = {}) {
  const daten = {
    ...(importItem.erkannte_daten || {}),
    ...(overrides.erkannte_daten || {})
  };
  const arbeit = daten.arbeit?.summary || 'Auftrag aus PDF';
  const arbeitszeitenDetails = buildArbeitszeitenDetails(daten);

  return {
    kunde_name: daten.kunde?.name || null,
    kennzeichen: daten.fahrzeug?.kennzeichen || null,
    arbeit,
    umfang: daten.arbeit?.items?.map(item => item.originalText || item.text).join('\n') || null,
    geschaetzte_zeit: daten.geschaetzte_zeit || 60,
    datum: overrides.datum || toIsoDate(daten.datum) || null,
    abholung_zeit: daten.abholung?.zeit || null,
    abholung_datum: toIsoDate(daten.abholung?.datum) || null,
    interne_auftragsnummer: daten.auftragsnummer || null,
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

async function findKundeForImport(daten) {
  const kundennummer = String(daten.kundennummer || '').trim();
  const kennzeichenNorm = normalizeKennzeichen(daten.fahrzeug?.kennzeichen);
  const kundeName = normalizeName(daten.kunde?.name);

  if (kundennummer) {
    const kunde = await getAsync('SELECT * FROM kunden WHERE locosoft_id = ? LIMIT 1', [kundennummer]);
    if (kunde) return kunde;
  }

  if (kennzeichenNorm) {
    const kundeByKennzeichen = await getAsync(
      `SELECT *
         FROM kunden
        WHERE kennzeichen IS NOT NULL
          AND UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', '')) = ?
        LIMIT 1`,
      [kennzeichenNorm]
    );
    if (kundeByKennzeichen) return kundeByKennzeichen;

    const kundeByTerminKennzeichen = await getAsync(
      `SELECT k.*
         FROM termine t
         JOIN kunden k ON k.id = t.kunde_id
        WHERE t.kunde_id IS NOT NULL
          AND t.kennzeichen IS NOT NULL
          AND UPPER(REPLACE(REPLACE(t.kennzeichen, ' ', ''), '-', '')) = ?
        ORDER BY t.datum DESC, t.id DESC
        LIMIT 1`,
      [kennzeichenNorm]
    );
    if (kundeByTerminKennzeichen) return kundeByTerminKennzeichen;
  }

  if (kundeName) {
    return await getAsync(
      `SELECT *
         FROM kunden
        WHERE LOWER(TRIM(name)) = ?
        LIMIT 1`,
      [kundeName]
    );
  }

  return null;
}

async function updateKundeFahrzeugIfMissing(kunde, daten) {
  const kennzeichen = cleanKennzeichen(daten.fahrzeug?.kennzeichen);
  const fahrzeugtyp = daten.fahrzeug?.raw || null;
  const vin = daten.fahrzeug?.vin || null;
  const updates = {};

  if (kennzeichen && !kunde.kennzeichen) updates.kennzeichen = kennzeichen;
  if (fahrzeugtyp && !kunde.fahrzeugtyp) updates.fahrzeugtyp = fahrzeugtyp;
  if (vin && !kunde.vin) updates.vin = vin;
  if (daten.kundennummer && !kunde.locosoft_id) updates.locosoft_id = String(daten.kundennummer).trim();

  const fields = Object.keys(updates);
  if (fields.length === 0) return kunde;

  await runAsync(
    `UPDATE kunden
        SET ${fields.map(field => `${field} = ?`).join(', ')}
      WHERE id = ?`,
    [...fields.map(field => updates[field]), kunde.id]
  );

  return await getAsync('SELECT * FROM kunden WHERE id = ?', [kunde.id]);
}

async function ensureKundeForImport(daten) {
  const name = String(daten.kunde?.name || '').replace(/\s+/g, ' ').trim();
  const kennzeichen = cleanKennzeichen(daten.fahrzeug?.kennzeichen);
  const kundennummer = String(daten.kundennummer || '').trim() || null;

  if (!name && !kennzeichen && !kundennummer) {
    return { kunde: null, created: false };
  }

  const existingKunde = await findKundeForImport(daten);
  if (existingKunde) {
    const kunde = await updateKundeFahrzeugIfMissing(existingKunde, daten);
    return { kunde, created: false };
  }

  if (!name) {
    return { kunde: null, created: false };
  }

  const result = await runAsync(
    `INSERT INTO kunden (name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      null,
      null,
      null,
      kundennummer,
      kennzeichen || null,
      daten.fahrzeug?.vin || null,
      daten.fahrzeug?.raw || null
    ]
  );

  return {
    kunde: await getAsync('SELECT * FROM kunden WHERE id = ?', [result.lastID]),
    created: true
  };
}

async function prepareTerminDataWithStammdaten(item, overrides = {}) {
  const terminData = buildTerminData(item, overrides);
  const stammdaten = await ensureKundeForImport(item.erkannte_daten || {});
  if (stammdaten.kunde) {
    terminData.kunde_id = stammdaten.kunde.id;
    terminData.kunde_name = stammdaten.kunde.name || terminData.kunde_name;
    terminData.kunde_telefon = stammdaten.kunde.telefon || null;
  }
  return { terminData, stammdaten };
}

function makeUniqueArbeitsKey(details, baseName) {
  const cleanName = String(baseName || 'Arbeit').trim() || 'Arbeit';
  if (!Object.prototype.hasOwnProperty.call(details, cleanName)) return cleanName;

  let counter = 2;
  let key = `${cleanName} ${counter}`;
  while (Object.prototype.hasOwnProperty.call(details, key)) {
    counter += 1;
    key = `${cleanName} ${counter}`;
  }
  return key;
}

function buildArbeitszeitenDetails(daten) {
  const items = daten.arbeit?.items || [];
  if (items.length === 0) return null;

  const details = {
    _dauer_override: daten.geschaetzte_zeit || null,
    _quelle: 'auftragsimport',
    _auftragsimport_arbeiten: items.map((item, index) => ({
      name: item.text,
      dauer_minuten: item.dauer_minuten || 0,
      reihenfolge: index + 1,
      zeit_quelle: item.zeit_quelle || null,
      originalText: item.originalText || item.text
    }))
  };

  items.forEach((item, index) => {
    const key = makeUniqueArbeitsKey(details, item.text);
    details[key] = {
      zeit: Math.max(0, parseInt(item.dauer_minuten, 10) || 0),
      reihenfolge: index + 1,
      quelle: 'auftragsimport',
      originalText: item.originalText || item.text,
      zeit_quelle: item.zeit_quelle || null
    };
  });

  return details;
}

async function createTerminArbeitenFromImport(terminId, importItem, overrides = {}) {
  const daten = importItem.erkannte_daten || {};
  const items = daten.arbeit?.items || [];
  if (!terminId || items.length === 0) return;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    await runAsync(
      `INSERT INTO termine_arbeiten
        (termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id, reihenfolge)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        terminId,
        item.text || item.originalText || 'Arbeit',
        Math.max(0, parseInt(item.dauer_minuten, 10) || 0),
        overrides.mitarbeiter_id || null,
        overrides.lehrling_id || null,
        index + 1
      ]
    );
  }
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
          OR (? IS NOT NULL AND LOWER(kunde_name) LIKE ? ESCAPE '\\')
        )
      ORDER BY datum DESC, id DESC
      LIMIT 20`,
    [
      datum, datum,
      kennzeichen, kennzeichen,
      kundeName, kundeName ? `%${escapeLike(kundeName)}%` : null
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
  if (existing && existing.status !== 'fehler') {
    return { skipped: true, reason: 'duplicate', import: existing };
  }

  const parsed = await parseAuftragsPdf(filePath);
  const datenMitZeit = await applySystemArbeitszeitenFromDb(parsed.daten);
  const matches = await findTerminMatches(datenMitZeit);

  const importData = {
    original_dateiname: path.basename(filePath),
    dateipfad: filePath,
    status: 'erkannt',
    text_extract: parsed.text,
    erkannte_daten: datenMitZeit,
    zuordnungs_treffer: matches,
    dateigroesse: stat.size,
    datei_hash: hash
  };

  if (existing) {
    await AuftragsimportModel.update(existing.id, { ...importData, fehler: null });
    return { skipped: false, import: await AuftragsimportModel.getById(existing.id) };
  }

  const item = await AuftragsimportModel.create(importData);
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
      try {
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
      } catch (innerError) {
        results.push({ skipped: false, error: error.message, logError: innerError.message, import: null });
      }
    }
  }

  return {
    importDir: IMPORT_DIR,
    count: results.length,
    results
  };
}

async function createSchnelltermin(importId, overrides = {}) {
  const result = await withTransaction(async () => {
    const item = await AuftragsimportModel.getById(importId);
    if (!item) throw new Error('Auftragsimport nicht gefunden');

    const { terminData } = await prepareTerminDataWithStammdaten(item, {
      datum: overrides.datum || todayIsoDate(),
      ...overrides,
      ist_schwebend: overrides.ist_schwebend ?? 0,
      status: 'geplant'
    });
    const termin = await TermineModel.create(terminData);
    await createTerminArbeitenFromImport(termin.id, item, overrides);

    await AuftragsimportModel.update(importId, {
      termin_id: termin.id,
      status: 'verarbeitet',
      dateipfad: null,
      verarbeitet_am: new Date().toISOString()
    });

    return { termin, import: await AuftragsimportModel.getById(importId) };
  });
  deleteImportFileSafely(result.import?.dateipfad);
  return result;
}

async function createSoftstart(importId, data = {}) {
  const result = await withTransaction(async () => {
    const item = await AuftragsimportModel.getById(importId);
    if (!item) throw new Error('Auftragsimport nicht gefunden');
    if (!data.mitarbeiter_id) throw new Error('mitarbeiter_id ist erforderlich');

    const now = new Date();
    const datum = now.toISOString().slice(0, 10);
    const startzeit = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const { terminData } = await prepareTerminDataWithStammdaten(item, {
      datum,
      mitarbeiter_id: data.mitarbeiter_id,
      bring_zeit: startzeit,
      status: 'in_arbeit',
      ist_schwebend: 0
    });
    const termin = await TermineModel.create(terminData);
    await createTerminArbeitenFromImport(termin.id, item, {
      mitarbeiter_id: data.mitarbeiter_id
    });

    await AuftragsimportModel.update(importId, {
      termin_id: termin.id,
      status: 'verarbeitet',
      dateipfad: null,
      verarbeitet_am: new Date().toISOString()
    });

    return { termin, import: await AuftragsimportModel.getById(importId) };
  });
  deleteImportFileSafely(result.import?.dateipfad);
  return result;
}

async function assignToTermin(importId, terminId) {
  const result = await withTransaction(async () => {
    const item = await AuftragsimportModel.getById(importId);
    if (!item) throw new Error('Auftragsimport nicht gefunden');

    await AuftragsimportModel.update(importId, {
      termin_id: terminId,
      status: 'verarbeitet',
      dateipfad: null,
      verarbeitet_am: new Date().toISOString()
    });

    return await AuftragsimportModel.getById(importId);
  });
  deleteImportFileSafely(result?.dateipfad);
  return result;
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
    dateipfad: null,
    verarbeitet_am: new Date().toISOString()
  });

  deleteImportFileSafely(item.dateipfad);
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
  buildTerminData,
  ensureKundeForImport
};
