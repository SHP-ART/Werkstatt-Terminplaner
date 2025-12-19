const EinstellungenModel = require('../models/einstellungenModel');

class EinstellungenController {
  static getWerkstatt(req, res) {
    EinstellungenModel.getWerkstatt((err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(row || { mitarbeiter_anzahl: 1, arbeitsstunden_pro_tag: 8 });
      }
    });
  }

  static updateWerkstatt(req, res) {
    const payload = {
      mitarbeiter_anzahl: parseInt(req.body.mitarbeiter_anzahl, 10) || 1,
      arbeitsstunden_pro_tag: parseInt(req.body.arbeitsstunden_pro_tag, 10) || 8
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
