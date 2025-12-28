const EinstellungenModel = require('../models/einstellungenModel');

class EinstellungenController {
  static getWerkstatt(req, res) {
    EinstellungenModel.getWerkstatt((err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(row || { pufferzeit_minuten: 15, servicezeit_minuten: 10, ersatzauto_anzahl: 2 });
      }
    });
  }

  static updateWerkstatt(req, res) {
    const payload = {
      pufferzeit_minuten: parseInt(req.body.pufferzeit_minuten, 10) || 15,
      servicezeit_minuten: parseInt(req.body.servicezeit_minuten, 10) || 10,
      ersatzauto_anzahl: req.body.ersatzauto_anzahl !== undefined 
        ? parseInt(req.body.ersatzauto_anzahl, 10) 
        : undefined
    };

    EinstellungenModel.updateWerkstatt(payload, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: 'Einstellungen aktualisiert', ...result });
      }
    });
  }

  static getErsatzautoVerfuegbarkeit(req, res) {
    const { datum } = req.params;
    if (!datum) {
      return res.status(400).json({ error: 'Datum erforderlich' });
    }
    
    EinstellungenModel.getErsatzautoVerfuegbarkeit(datum, (err, result) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(result);
      }
    });
  }
}

module.exports = EinstellungenController;
