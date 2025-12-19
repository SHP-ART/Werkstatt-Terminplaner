const TermineModel = require('../models/termineModel');
const EinstellungenModel = require('../models/einstellungenModel');
const AbwesenheitenModel = require('../models/abwesenheitenModel');

class TermineController {
  static getAll(req, res) {
    const { datum } = req.query;

    if (datum) {
      TermineModel.getByDatum(datum, (err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json(rows);
        }
      });
    } else {
      TermineModel.getAll((err, rows) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json(rows);
        }
      });
    }
  }

  static create(req, res) {
    const kilometerstand = req.body.kilometerstand !== undefined && req.body.kilometerstand !== null
      ? parseInt(req.body.kilometerstand, 10)
      : null;
    const kilometerstandWert = Number.isFinite(kilometerstand) ? kilometerstand : null;

    const payload = {
      ...req.body,
      kilometerstand: kilometerstandWert,
      ersatzauto: req.body.ersatzauto ? 1 : 0,
      abholung_zeit: req.body.abholung_zeit || null,
      bring_zeit: req.body.bring_zeit || null,
      kontakt_option: req.body.kontakt_option || null
    };

    TermineModel.create(payload, function(err, result) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({
          id: result.id,
          termin_nr: result.terminNr,
          message: 'Termin erfolgreich erstellt'
        });
      }
    });
  }

  static update(req, res) {
    TermineModel.update(req.params.id, req.body, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ changes: this.changes, message: 'Termin aktualisiert' });
      }
    });
  }

  static delete(req, res) {
    TermineModel.delete(req.params.id, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ changes: this.changes, message: 'Termin gelöscht' });
      }
    });
  }

  static getAuslastung(req, res) {
    const { datum } = req.params;
    const fallbackSettings = { mitarbeiter_anzahl: 1, arbeitsstunden_pro_tag: 8 };

    EinstellungenModel.getWerkstatt((settingsErr, einstellungen) => {
      if (settingsErr) {
        res.status(500).json({ error: settingsErr.message });
        return;
      }

      const mitarbeiter = einstellungen?.mitarbeiter_anzahl || fallbackSettings.mitarbeiter_anzahl;
      const arbeitsstunden = einstellungen?.arbeitsstunden_pro_tag || fallbackSettings.arbeitsstunden_pro_tag;
      const arbeitszeit_pro_mitarbeiter = arbeitsstunden * 60;

      AbwesenheitenModel.getByDatum(datum, (absErr, abwesenheit) => {
        if (absErr) {
          res.status(500).json({ error: absErr.message });
          return;
        }

        const urlaub = abwesenheit?.urlaub || 0;
        const krank = abwesenheit?.krank || 0;
        const verfuegbareMitarbeiter = Math.max(mitarbeiter - urlaub - krank, 0);
        const arbeitszeit_pro_tag = Math.max(verfuegbareMitarbeiter * arbeitszeit_pro_mitarbeiter, 1);

        TermineModel.getAuslastung(datum, (err, row) => {
          if (err) {
            res.status(500).json({ error: err.message });
          } else {
            const belegt = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
            const geplant = (row && row.geplant_minuten) ? row.geplant_minuten : 0;
            const inArbeit = (row && row.in_arbeit_minuten) ? row.in_arbeit_minuten : 0;
            const abgeschlossen = (row && row.abgeschlossen_minuten) ? row.abgeschlossen_minuten : 0;
            const verfuegbar = Math.max(arbeitszeit_pro_tag - belegt, 0);
            const prozent = (belegt / arbeitszeit_pro_tag) * 100;

            res.json({
              belegt_minuten: belegt,
              verfuegbar_minuten: verfuegbar,
              gesamt_minuten: arbeitszeit_pro_tag,
              auslastung_prozent: Math.round(prozent),
              geplant_minuten: geplant,
              in_arbeit_minuten: inArbeit,
              abgeschlossen_minuten: abgeschlossen,
              einstellungen: {
                mitarbeiter_anzahl: mitarbeiter,
                arbeitsstunden_pro_tag: arbeitsstunden
              },
              abwesenheit: {
                urlaub,
                krank,
                verfuegbare_mitarbeiter: verfuegbareMitarbeiter
              }
            });
          }
        });
      });
    });
  }
}

module.exports = TermineController;
