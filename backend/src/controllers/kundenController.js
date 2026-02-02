const KundenModel = require('../models/kundenModel');
const { parsePagination } = require('../utils/pagination');
const { SimpleCache } = require('../utils/cache');
const { broadcastEvent } = require('../utils/websocket');

const kundenListCache = new SimpleCache({ ttlMs: 60000, maxEntries: 200 });

function getKundenCacheKey(pagination) {
  return `kunden:${pagination ? JSON.stringify(pagination) : 'all'}`;
}

function invalidateKundenCache() {
  kundenListCache.clear();
}

function normalizeForSearch(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  let prevRow = Array(bLen + 1).fill(0);
  let currRow = Array(bLen + 1).fill(0);

  for (let j = 0; j <= bLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    const aChar = a[i - 1];
    for (let j = 1; j <= bLen; j++) {
      const cost = aChar === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,
        currRow[j - 1] + 1,
        prevRow[j - 1] + cost
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[bLen];
}

function calculateFuzzyScoreNormalized(normalizedSearch, normalizedTarget) {
  if (!normalizedSearch || !normalizedTarget) return 0;
  if (normalizedSearch === normalizedTarget) return 100;

  if (normalizedTarget.includes(normalizedSearch)) {
    if (normalizedTarget.startsWith(normalizedSearch)) return 95;
    return 85;
  }

  const words = normalizedTarget.split(' ');
  for (const word of words) {
    if (word.startsWith(normalizedSearch)) return 90;
  }

  const distance = levenshteinDistance(normalizedSearch, normalizedTarget);
  const maxLen = Math.max(normalizedSearch.length, normalizedTarget.length);
  const similarity = 1 - (distance / maxLen);
  const score = Math.round(similarity * 70);
  return score > 20 ? score : 0;
}

function scoreKunde(normalizedSearch, kunde) {
  const fields = [
    { name: 'name', value: normalizeForSearch(kunde.name), weight: 1.0 },
    { name: 'telefon', value: normalizeForSearch(kunde.telefon), weight: 0.9 },
    { name: 'kennzeichen', value: normalizeForSearch(kunde.kennzeichen), weight: 0.9 },
    { name: 'email', value: normalizeForSearch(kunde.email), weight: 0.7 },
    { name: 'fahrzeug', value: normalizeForSearch(kunde.fahrzeugtyp), weight: 0.6 }
  ];

  let bestScore = 0;
  let matchedField = null;

  for (const field of fields) {
    if (!field.value) continue;
    const score = calculateFuzzyScoreNormalized(normalizedSearch, field.value) * field.weight;
    if (score > bestScore) {
      bestScore = score;
      matchedField = field.name;
    }
  }

  return {
    match: bestScore >= 30,
    score: Math.round(bestScore),
    matchedField
  };
}

function parseFuzzyLimit(rawLimit) {
  const parsed = parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(parsed, 200);
}

class KundenController {
  static async getAll(req, res) {
    try {
      const pagination = parsePagination(req.query);
      if (!pagination) {
        const cacheKey = getKundenCacheKey(null);
        const cached = kundenListCache.get(cacheKey);
        if (cached) {
          return res.json(cached);
        }
        const rows = await KundenModel.getAll();
        kundenListCache.set(cacheKey, rows);
        return res.json(rows);
      }

      const legacyLimitOnly = req.query.limit !== undefined
        && req.query.page === undefined
        && req.query.pageSize === undefined
        && req.query.offset === undefined;

      if (legacyLimitOnly) {
        const { limit } = pagination;
        const cacheKey = getKundenCacheKey({ limit, offset: 0, legacy: true });
        const cached = kundenListCache.get(cacheKey);
        if (cached) {
          return res.json(cached);
        }
        const rows = await KundenModel.getAllPaginated(limit, 0);
        kundenListCache.set(cacheKey, rows);
        return res.json(rows);
      }

      const { limit, offset, page, pageSize } = pagination;
      const cacheKey = getKundenCacheKey(pagination);
      const cached = kundenListCache.get(cacheKey);
      if (cached) {
        return res.json(cached);
      }
      const [rows, countRow] = await Promise.all([
        KundenModel.getAllPaginated(limit, offset),
        KundenModel.countAll()
      ]);
      const total = countRow ? Number(countRow.total) || 0 : 0;
      const response = {
        data: rows,
        page,
        pageSize,
        total,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0
      };
      kundenListCache.set(cacheKey, response);
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async create(req, res) {
    try {
      const name = req.body.name ? String(req.body.name).trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'Name ist erforderlich' });
      }
      const payload = { ...req.body, name };
      const result = await KundenModel.create(payload);
      invalidateKundenCache();
      broadcastEvent('kunde.created', { id: result.lastID });
      res.status(201).json({ id: result.lastID, message: 'Kunde erfolgreich angelegt' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async import(req, res) {
    const kunden = req.body;

    if (!Array.isArray(kunden)) {
      return res.status(400).json({ error: 'Erwarte ein Array von Kunden' });
    }

    try {
      const result = await KundenModel.importMultiple(kunden);
      invalidateKundenCache();
      broadcastEvent('kunde.imported', {
        imported: result.imported,
        fahrzeugeHinzugefuegt: result.fahrzeugeHinzugefuegt || 0,
        skipped: result.skipped || 0
      });
      let message = `${result.imported} Kunden importiert`;
      if (result.fahrzeugeHinzugefuegt > 0) {
        message += `, ${result.fahrzeugeHinzugefuegt} zusätzliche Fahrzeuge hinzugefügt`;
      }
      if (result.skipped > 0) {
        message += `, ${result.skipped} übersprungen`;
      }
      res.json({ 
        message, 
        imported: result.imported, 
        fahrzeugeHinzugefuegt: result.fahrzeugeHinzugefuegt || 0,
        skipped: result.skipped,
        errors: result.errors 
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getById(req, res) {
    // Verhindere, dass "search" als ID interpretiert wird
    if (req.params.id === 'search') {
      return res.status(404).json({ error: 'Route nicht gefunden' });
    }
    
    try {
      const row = await KundenModel.getById(req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Kunde nicht gefunden' });
      }
      res.json(row);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async update(req, res) {
    try {
      // Prüfe zuerst, ob der Kunde existiert
      const kunde = await KundenModel.getById(req.params.id);
      if (!kunde) {
        return res.status(404).json({ error: 'Kunde nicht gefunden' });
      }

      // Führe Update durch
      if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
        const incomingName = String(req.body.name || '').trim();
        if (!incomingName) {
          return res.status(400).json({ error: 'Name darf nicht leer sein' });
        }
      }

      const updateData = {
        name: kunde.name,
        telefon: kunde.telefon,
        email: kunde.email,
        adresse: kunde.adresse,
        locosoft_id: kunde.locosoft_id,
        kennzeichen: kunde.kennzeichen,
        vin: kunde.vin,
        fahrzeugtyp: kunde.fahrzeugtyp
      };

      const fields = ['name', 'telefon', 'email', 'adresse', 'locosoft_id', 'kennzeichen', 'vin', 'fahrzeugtyp'];
      fields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
          updateData[field] = req.body[field];
        }
      });

      const result = await KundenModel.update(req.params.id, updateData);
      const changes = (result && result.changes) || 0;
      if (changes > 0) {
        invalidateKundenCache();
        broadcastEvent('kunde.updated', { id: req.params.id });
      }
      if (changes === 0) {
        return res.status(200).json({ 
          changes: 0, 
          message: 'Keine Änderungen vorgenommen (Daten identisch)' 
        });
      }
      
      res.json({ changes, message: 'Kunde aktualisiert' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async delete(req, res) {
    try {
      const result = await KundenModel.delete(req.params.id);
      if (result && result.changes > 0) {
        invalidateKundenCache();
        broadcastEvent('kunde.deleted', { id: req.params.id });
      }
      res.json({ changes: (result && result.changes) || 0, message: 'Kunde gelöscht' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async performFuzzySearch(searchTerm, limit) {
    const normalizedSearch = normalizeForSearch(searchTerm);
    if (!normalizedSearch) {
      return [];
    }

    const kunden = await KundenModel.getAllForFuzzySearch();
    const results = [];

    for (const kunde of kunden) {
      const score = scoreKunde(normalizedSearch, kunde);
      if (score.match) {
        results.push({
          kunde,
          score: score.score,
          matchedField: score.matchedField
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const capped = results.slice(0, parseFuzzyLimit(limit));
    if (capped.length === 0) {
      return [];
    }

    const kundenIds = capped.map(entry => entry.kunde.id);
    const termine = await KundenModel.getTermineForKundenIds(kundenIds);
    const termineByKunde = {};
    termine.forEach(termin => {
      if (!termineByKunde[termin.kunde_id]) {
        termineByKunde[termin.kunde_id] = [];
      }
      termineByKunde[termin.kunde_id].push(termin);
    });

    return capped.map(entry => ({
      ...entry.kunde,
      termine: termineByKunde[entry.kunde.id] || [],
      fuzzy_score: entry.score,
      fuzzy_matched_field: entry.matchedField
    }));
  }

  static async search(req, res) {
    const searchTerm = req.query.search || req.query.term || req.query.q;
    const useFuzzy = req.query.fuzzy === 'true' || req.query.fuzzy === '1';

    console.log('Search endpoint called with searchTerm:', searchTerm);

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({ error: 'Suchbegriff darf nicht leer sein' });
    }

    try {
      if (useFuzzy) {
        const results = await KundenController.performFuzzySearch(searchTerm, req.query.limit);
        console.log('Fuzzy search results:', results.length, 'customers found');
        return res.json(results);
      }
      const results = await KundenModel.searchWithTermine(searchTerm);
      console.log('Search results:', results.length, 'customers found');
      res.json(results);
    } catch (err) {
      console.error('Search error:', err);
      res.status(500).json({ error: err.message });
    }
  }

  static async fuzzySearch(req, res) {
    const searchTerm = req.query.search || req.query.term || req.query.q;

    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({ error: 'Suchbegriff darf nicht leer sein' });
    }

    try {
      const results = await KundenController.performFuzzySearch(searchTerm, req.query.limit);
      res.json(results);
    } catch (err) {
      console.error('Fuzzy search error:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Anzahl aller Fahrzeuge in der Datenbank
  static async countFahrzeuge(req, res) {
    try {
      const anzahl = await KundenModel.countAlleFahrzeuge();
      res.json({ anzahl });
    } catch (err) {
      console.error('Fehler beim Zählen der Fahrzeuge:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Alle Fahrzeuge (Kennzeichen) eines Kunden abrufen
  static async getFahrzeuge(req, res) {
    const kundeId = req.params.id;
    
    try {
      const fahrzeuge = await KundenModel.getFahrzeuge(kundeId);
      res.json(fahrzeuge);
    } catch (err) {
      console.error('Fehler beim Abrufen der Fahrzeuge:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Fahrzeug zu einem Kunden hinzufügen
  static async addFahrzeug(req, res) {
    const kundeId = req.params.id;
    const fahrzeug = req.body;
    
    try {
      const result = await KundenModel.addFahrzeug(kundeId, fahrzeug);
      invalidateKundenCache();
      res.json(result);
    } catch (err) {
      console.error('Fehler beim Hinzufügen des Fahrzeugs:', err);
      res.status(400).json({ error: err.message });
    }
  }

  // Fahrzeug eines Kunden löschen
  static async deleteFahrzeug(req, res) {
    const kundeId = req.params.id;
    const kennzeichen = decodeURIComponent(req.params.kennzeichen);
    
    try {
      const result = await KundenModel.deleteFahrzeug(kundeId, kennzeichen);
      invalidateKundenCache();
      res.json(result);
    } catch (err) {
      console.error('Fehler beim Löschen des Fahrzeugs:', err);
      res.status(500).json({ error: err.message });
    }
  }

  // Fahrzeugdaten aktualisieren
  static async updateFahrzeug(req, res) {
    const kundeId = req.params.id;
    const altesKennzeichen = decodeURIComponent(req.params.kennzeichen);
    const neuesDaten = req.body;
    
    try {
      const result = await KundenModel.updateFahrzeug(kundeId, altesKennzeichen, neuesDaten);
      invalidateKundenCache();
      res.json(result);
    } catch (err) {
      console.error('Fehler beim Aktualisieren des Fahrzeugs:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Kompakte Dropdown-Daten für Kundenauswahl
   * GET /kunden/dropdown
   * Gibt nur ID, Name, Kennzeichen zurück (minimal für Dropdown)
   */
  static async getDropdownData(req, res) {
    try {
      const { allAsync } = require('../utils/dbHelper');
      
      const kunden = await allAsync(`
        SELECT id, name, kennzeichen
        FROM kunden
        ORDER BY name ASC
        LIMIT 200
      `, []);
      
      res.json(kunden);
    } catch (err) {
      console.error('Fehler bei getDropdownData:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = KundenController;
