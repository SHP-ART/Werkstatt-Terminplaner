const EinstellungenModel = require('../models/einstellungenModel');
const TermineController = require('./termineController');
const path = require('path');

class EinstellungenController {
  static async getDatenbankPfad(req, res) {
    try {
      // Ermittle den aktuellen Datenbank-Pfad
      const dataPath = process.env.DATA_PATH || path.join(__dirname, '..', '..');
      const dbPath = path.join(dataPath, 'database', 'werkstatt.db');
      
      res.json({ 
        success: true,
        pfad: dbPath,
        verzeichnis: path.dirname(dbPath)
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
  static async getWerkstatt(req, res) {
    try {
      const row = await EinstellungenModel.getWerkstatt();
      res.json(row || { pufferzeit_minuten: 15, servicezeit_minuten: 10, ersatzauto_anzahl: 2 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async updateWerkstatt(req, res) {
    const payload = {
      pufferzeit_minuten: req.body.pufferzeit_minuten !== undefined 
        ? parseInt(req.body.pufferzeit_minuten, 10) 
        : undefined,
      servicezeit_minuten: req.body.servicezeit_minuten !== undefined 
        ? parseInt(req.body.servicezeit_minuten, 10) 
        : undefined,
      ersatzauto_anzahl: req.body.ersatzauto_anzahl !== undefined 
        ? parseInt(req.body.ersatzauto_anzahl, 10) 
        : undefined,
      nebenzeit_prozent: req.body.nebenzeit_prozent !== undefined 
        ? parseFloat(req.body.nebenzeit_prozent) 
        : undefined,
      mittagspause_minuten: req.body.mittagspause_minuten !== undefined 
        ? parseInt(req.body.mittagspause_minuten, 10) 
        : undefined
    };

    try {
      const result = await EinstellungenModel.updateWerkstatt(payload);
      
      // Cache invalidieren, da Einstellungen (Nebenzeit, Pufferzeit, Servicezeit) die Auslastung beeinflussen
      TermineController.invalidateAuslastungCache(null);
      
      res.json({ message: 'Einstellungen aktualisiert', ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  static async getErsatzautoVerfuegbarkeit(req, res) {
    const { datum } = req.params;
    if (!datum) {
      return res.status(400).json({ error: 'Datum erforderlich' });
    }
    
    try {
      const result = await EinstellungenModel.getErsatzautoVerfuegbarkeit(datum);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = EinstellungenController;
