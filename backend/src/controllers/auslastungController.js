const TermineController = require('./termineController');

class AuslastungController {
  static getAuslastung(req, res) {
    return TermineController.getAuslastung(req, res);
  }
}

module.exports = AuslastungController;
