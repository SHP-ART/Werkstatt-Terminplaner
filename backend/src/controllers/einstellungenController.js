const EinstellungenModel = require('../models/einstellungenModel');

class EinstellungenController {
  static getWerkstatt(req, res) {
    EinstellungenModel.getWerkstatt((err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(row || { pufferzeit_minuten: 15, servicezeit_minuten: 10 });
      }
    });
  }

  static updateWerkstatt(req, res) {
    const payload = {
      pufferzeit_minuten: parseInt(req.body.pufferzeit_minuten, 10) || 15,
      servicezeit_minuten: parseInt(req.body.servicezeit_minuten, 10) || 10
    };

    EinstellungenModel.updateWerkstatt(payload, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: 'Einstellungen aktualisiert', ...result });
      }
    });
  }
}

module.exports = EinstellungenController;
