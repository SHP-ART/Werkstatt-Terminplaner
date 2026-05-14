const AuftragsimportModel = require('../models/auftragsimportModel');
const AuftragsImportService = require('../services/auftragsImportService');
const { broadcastEvent } = require('../utils/websocket');

class AuftragsimportController {
  static async getAll(req, res) {
    const items = await AuftragsimportModel.getAll({
      status: req.query.status || null,
      offen: req.query.offen === '1' || req.query.offen === 'true',
      eingang: req.query.eingang === '1' || req.query.eingang === 'true'
    });

    res.json({
      imports: items,
      importDir: AuftragsImportService.IMPORT_DIR,
      locosoftPruefenDir: AuftragsImportService.LOCOSOFT_PRUEFEN_DIR
    });
  }

  static async getById(req, res) {
    const item = await AuftragsimportModel.getById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Auftragsimport nicht gefunden' });
    res.json(item);
  }

  static async scan(req, res) {
    const result = await AuftragsImportService.scanImportDir();
    broadcastEvent('auftragsimport.scanned', {
      count: result.count
    });
    res.json(result);
  }

  static async createSchnelltermin(req, res) {
    const result = await AuftragsImportService.createSchnelltermin(req.params.id, req.body || {});
    broadcastEvent('auftragsimport.processed', {
      id: parseInt(req.params.id, 10),
      termin_id: result.termin.id,
      action: 'schnelltermin'
    });
    broadcastEvent('termin.created', {
      id: result.termin.id,
      datum: result.termin.datum
    });
    res.status(201).json(result);
  }

  static async softstart(req, res) {
    const result = await AuftragsImportService.createSoftstart(req.params.id, req.body || {});
    broadcastEvent('auftragsimport.processed', {
      id: parseInt(req.params.id, 10),
      termin_id: result.termin.id,
      action: 'softstart'
    });
    broadcastEvent('termin.created', {
      id: result.termin.id,
      datum: result.termin.datum
    });
    res.status(201).json(result);
  }

  static async assignToTermin(req, res) {
    const terminId = parseInt(req.body.termin_id, 10);
    if (!terminId) return res.status(400).json({ error: 'termin_id ist erforderlich' });

    const item = await AuftragsImportService.assignToTermin(req.params.id, terminId);
    broadcastEvent('auftragsimport.processed', {
      id: parseInt(req.params.id, 10),
      termin_id: terminId,
      action: 'zuordnen'
    });
    res.json(item);
  }

  static async moveToLocosoftPruefen(req, res) {
    const item = await AuftragsImportService.moveToLocosoftPruefen(req.params.id);
    broadcastEvent('auftragsimport.updated', {
      id: parseInt(req.params.id, 10),
      status: 'locosoft_pruefen'
    });
    res.json(item);
  }

  static async discard(req, res) {
    const item = await AuftragsImportService.discard(req.params.id);
    broadcastEvent('auftragsimport.updated', {
      id: parseInt(req.params.id, 10),
      status: 'verworfen'
    });
    res.json(item);
  }
}

module.exports = AuftragsimportController;
