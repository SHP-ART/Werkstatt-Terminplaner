const AbwesenheitenModel = require('../models/abwesenheitenModel');

class AbwesenheitenController {
  static getByDatum(req, res) {
    const { datum } = req.params;

    AbwesenheitenModel.getByDatum(datum, (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(row || { datum, urlaub: 0, krank: 0 });
      }
    });
  }

  static upsert(req, res) {
    const { datum } = req.params;
    const urlaub = parseInt(req.body.urlaub, 10) || 0;
    const krank = parseInt(req.body.krank, 10) || 0;

    AbwesenheitenModel.upsert(datum, urlaub, krank, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ message: 'Abwesenheit gespeichert', datum, urlaub, krank });
      }
    });
  }
}

module.exports = AbwesenheitenController;
