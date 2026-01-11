/**
 * Teile-Bestellungen Controller
 * API-Endpunkte für Teile-Bestellungen
 */

const TeileBestellung = require('../models/teileBestellung');

/**
 * Alle Bestellungen abrufen
 * GET /api/teile-bestellungen
 * Query-Parameter: status, termin_id, von, bis
 */
const getAll = async (req, res) => {
  try {
    const filter = {
      status: req.query.status,
      termin_id: req.query.termin_id,
      von: req.query.von,
      bis: req.query.bis
    };
    
    const bestellungen = await TeileBestellung.getAll(filter);
    res.json(bestellungen);
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellungen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellungen' });
  }
};

/**
 * Fällige Bestellungen abrufen
 * GET /api/teile-bestellungen/faellig
 * Query-Parameter: tage (default: 7)
 */
const getFaellige = async (req, res) => {
  try {
    const tage = parseInt(req.query.tage) || 7;
    const bestellungen = await TeileBestellung.getFaellige(tage);
    const schwebende = await TeileBestellung.getSchwebende();
    
    // Gruppiere nach Dringlichkeit
    const heute = new Date();
    heute.setHours(0, 0, 0, 0);
    
    const gruppiert = {
      schwebend: [], // Schwebende Termine (ohne festes Datum)
      dringend: [], // Termin heute oder morgen
      dieseWoche: [], // 2-5 Tage
      naechsteWoche: [] // 6+ Tage
    };
    
    // Schwebende Bestellungen hinzufügen (nach Priorität sortiert)
    schwebende.forEach(b => {
      b.dringlichkeit = 'schwebend';
      b.schwebend_prioritaet = b.schwebend_prioritaet || 'mittel';
      gruppiert.schwebend.push(b);
    });
    
    // Normale Termine gruppieren
    bestellungen.forEach(b => {
      const terminDatum = new Date(b.termin_datum);
      terminDatum.setHours(0, 0, 0, 0);
      const diffTage = Math.ceil((terminDatum - heute) / (1000 * 60 * 60 * 24));
      
      if (diffTage <= 1) {
        b.dringlichkeit = 'dringend';
        gruppiert.dringend.push(b);
      } else if (diffTage <= 5) {
        b.dringlichkeit = 'dieseWoche';
        gruppiert.dieseWoche.push(b);
      } else {
        b.dringlichkeit = 'naechsteWoche';
        gruppiert.naechsteWoche.push(b);
      }
    });
    
    const alleBestellungen = [...schwebende, ...bestellungen];
    
    res.json({
      gruppiert,
      alle: alleBestellungen,
      statistik: {
        schwebend: gruppiert.schwebend.length,
        dringend: gruppiert.dringend.length,
        dieseWoche: gruppiert.dieseWoche.length,
        naechsteWoche: gruppiert.naechsteWoche.length,
        gesamt: alleBestellungen.length
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der fälligen Bestellungen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der fälligen Bestellungen' });
  }
};

/**
 * Bestellungen für einen Termin
 * GET /api/teile-bestellungen/termin/:id
 */
const getByTermin = async (req, res) => {
  try {
    const terminId = req.params.id;
    const bestellungen = await TeileBestellung.getByTermin(terminId);
    res.json(bestellungen);
  } catch (error) {
    console.error('Fehler beim Abrufen der Termin-Bestellungen:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellungen' });
  }
};

/**
 * Einzelne Bestellung abrufen
 * GET /api/teile-bestellungen/:id
 */
const getById = async (req, res) => {
  try {
    const id = req.params.id;
    const bestellung = await TeileBestellung.getById(id);
    
    if (!bestellung) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    res.json(bestellung);
  } catch (error) {
    console.error('Fehler beim Abrufen der Bestellung:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bestellung' });
  }
};

/**
 * Neue Bestellung anlegen
 * POST /api/teile-bestellungen
 */
const create = async (req, res) => {
  try {
    const { termin_id, teil_name, teil_oe_nummer, menge, fuer_arbeit, notiz } = req.body;
    
    if (!termin_id || !teil_name) {
      return res.status(400).json({ error: 'termin_id und teil_name sind erforderlich' });
    }
    
    const result = await TeileBestellung.create({
      termin_id,
      teil_name,
      teil_oe_nummer,
      menge,
      fuer_arbeit,
      notiz
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Fehler beim Anlegen der Bestellung:', error);
    res.status(500).json({ error: 'Fehler beim Anlegen der Bestellung' });
  }
};

/**
 * Mehrere Bestellungen anlegen
 * POST /api/teile-bestellungen/bulk
 */
const createBulk = async (req, res) => {
  try {
    const { bestellungen } = req.body;
    
    if (!bestellungen || !Array.isArray(bestellungen) || bestellungen.length === 0) {
      return res.status(400).json({ error: 'bestellungen Array ist erforderlich' });
    }
    
    // Validierung
    for (const b of bestellungen) {
      if (!b.termin_id || !b.teil_name) {
        return res.status(400).json({ error: 'Alle Bestellungen benötigen termin_id und teil_name' });
      }
    }
    
    const results = await TeileBestellung.createBulk(bestellungen);
    
    res.status(201).json({
      success: true,
      angelegt: results.length,
      bestellungen: results
    });
  } catch (error) {
    console.error('Fehler beim Bulk-Anlegen:', error);
    res.status(500).json({ error: 'Fehler beim Anlegen der Bestellungen' });
  }
};

/**
 * Bestellung aktualisieren
 * PUT /api/teile-bestellungen/:id
 */
const update = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    
    const result = await TeileBestellung.update(id, data);
    res.json(result);
  } catch (error) {
    console.error('Fehler beim Aktualisieren der Bestellung:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
};

/**
 * Status einer Bestellung ändern
 * PUT /api/teile-bestellungen/:id/status
 */
const updateStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;
    
    const erlaubteStatus = ['offen', 'bestellt', 'geliefert', 'storniert'];
    if (!status || !erlaubteStatus.includes(status)) {
      return res.status(400).json({ 
        error: `Ungültiger Status. Erlaubt: ${erlaubteStatus.join(', ')}` 
      });
    }
    
    const result = await TeileBestellung.updateStatus(id, status);
    res.json(result);
  } catch (error) {
    console.error('Fehler beim Status-Update:', error);
    res.status(500).json({ error: 'Fehler beim Status-Update' });
  }
};

/**
 * Mehrere als bestellt markieren
 * PUT /api/teile-bestellungen/mark-bestellt
 */
const markAlsBestellt = async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids Array ist erforderlich' });
    }
    
    const result = await TeileBestellung.markAlsBestellt(ids);
    res.json({
      success: true,
      aktualisiert: result.changes
    });
  } catch (error) {
    console.error('Fehler beim Markieren als bestellt:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren' });
  }
};

/**
 * Bestellung löschen
 * DELETE /api/teile-bestellungen/:id
 */
const remove = async (req, res) => {
  try {
    const id = req.params.id;
    const result = await TeileBestellung.delete(id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bestellung nicht gefunden' });
    }
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    res.status(500).json({ error: 'Fehler beim Löschen' });
  }
};

/**
 * Statistiken abrufen
 * GET /api/teile-bestellungen/statistik
 */
const getStatistik = async (req, res) => {
  try {
    const statistik = await TeileBestellung.getStatistik();
    const dringende = await TeileBestellung.getDringendeAnzahl();
    
    res.json({
      ...statistik,
      dringend: dringende
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Statistik:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Statistik' });
  }
};

module.exports = {
  getAll,
  getFaellige,
  getByTermin,
  getById,
  create,
  createBulk,
  update,
  updateStatus,
  markAlsBestellt,
  remove,
  getStatistik
};
