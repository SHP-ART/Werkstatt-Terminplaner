const { db } = require('../config/database');

class TermineModel {
  static generateTerminNr(callback) {
    const year = new Date().getFullYear();
    const prefix = `T-${year}-`;

    // Hole die höchste Nummer für dieses Jahr
    db.get(
      `SELECT termin_nr FROM termine
       WHERE termin_nr LIKE ?
       ORDER BY termin_nr DESC LIMIT 1`,
      [`${prefix}%`],
      (err, row) => {
        if (err) {
          return callback(err);
        }

        let nextNumber = 1;
        if (row && row.termin_nr) {
          // Extrahiere die Nummer aus T-2024-001 -> 001
          const lastNumber = parseInt(row.termin_nr.split('-')[2]);
          nextNumber = lastNumber + 1;
        }

        // Format: T-2024-001, T-2024-002, etc.
        const terminNr = `${prefix}${String(nextNumber).padStart(3, '0')}`;
        callback(null, terminNr);
      }
    );
  }
  static getAll(callback) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      ORDER BY t.datum DESC
    `;
    db.all(query, callback);
  }

  static getByDatum(datum, callback) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.datum = ?
      ORDER BY t.erstellt_am
    `;
    db.all(query, [datum], callback);
  }

  static getById(id, callback) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.id = ?
    `;
    db.get(query, [id], callback);
  }

  static create(termin, callback) {
    const {
      kunde_id,
      kunde_name,
      kunde_telefon,
      kennzeichen,
      arbeit,
      umfang,
      geschaetzte_zeit,
      datum,
      abholung_typ,
      abholung_details,
      abholung_zeit,
      bring_zeit,
      kontakt_option,
      kilometerstand,
      ersatzauto
    } = termin;

    // Generiere zuerst die Termin-Nummer
    this.generateTerminNr((err, terminNr) => {
      if (err) {
        return callback(err);
      }

      db.run(
        `INSERT INTO termine
         (termin_nr, kunde_id, kunde_name, kunde_telefon, kennzeichen, arbeit, umfang, geschaetzte_zeit, datum, abholung_typ, abholung_details, abholung_zeit, bring_zeit, kontakt_option, kilometerstand, ersatzauto)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          terminNr,
          kunde_id,
          kunde_name,
          kunde_telefon,
          kennzeichen,
          arbeit,
          umfang,
          geschaetzte_zeit,
          datum,
          abholung_typ,
          abholung_details,
          abholung_zeit,
          bring_zeit,
          kontakt_option,
          kilometerstand,
          ersatzauto
        ],
        function(err) {
          if (err) {
            return callback(err);
          }
          // Gib die Termin-Nummer zurück
          callback(null, { id: this.lastID, terminNr });
        }
      );
    });
  }

  static update(id, data, callback) {
    const { tatsaechliche_zeit, status, geschaetzte_zeit, arbeit } = data;
    db.run(
      `UPDATE termine
       SET tatsaechliche_zeit = COALESCE(?, tatsaechliche_zeit),
           status = COALESCE(?, status),
           geschaetzte_zeit = COALESCE(?, geschaetzte_zeit),
           arbeit = COALESCE(?, arbeit)
       WHERE id = ?`,
      [tatsaechliche_zeit, status, geschaetzte_zeit, arbeit, id],
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { changes: this.changes });
      }
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM termine WHERE id = ?', [id], function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }

  static getAuslastung(datum, callback) {
    const query = `
      SELECT
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as gesamt_minuten,
        SUM(CASE WHEN COALESCE(status, 'geplant') = 'geplant' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as geplant_minuten,
        SUM(CASE WHEN status = 'in_arbeit' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as in_arbeit_minuten,
        SUM(CASE WHEN status = 'abgeschlossen' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as abgeschlossen_minuten,
        COUNT(*) as termin_anzahl
      FROM termine
      WHERE datum = ?
    `;
    db.get(query, [datum], callback);
  }

  static getAuslastungMitPuffer(datum, pufferzeitMinuten, callback) {
    // Berechnet Auslastung mit Pufferzeiten zwischen Terminen
    // Pufferzeit wird nur für aktive Termine (nicht abgeschlossen) berücksichtigt
    const query = `
      SELECT
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as gesamt_minuten,
        SUM(CASE WHEN COALESCE(status, 'geplant') = 'geplant' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as geplant_minuten,
        SUM(CASE WHEN status = 'in_arbeit' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as in_arbeit_minuten,
        SUM(CASE WHEN status = 'abgeschlossen' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as abgeschlossen_minuten,
        COUNT(*) as termin_anzahl,
        SUM(CASE WHEN COALESCE(status, 'geplant') != 'abgeschlossen' THEN 1 ELSE 0 END) as aktive_termine
      FROM termine
      WHERE datum = ?
    `;
    db.get(query, [datum], (err, row) => {
      if (err) {
        return callback(err);
      }

      const pufferzeit = pufferzeitMinuten || 15;
      const aktiveTermine = (row && row.aktive_termine) ? row.aktive_termine : 0;
      // Pufferzeit wird zwischen Terminen hinzugefügt (n-1 Pufferzeiten für n Termine)
      const pufferZeitGesamt = Math.max((aktiveTermine - 1) * pufferzeit, 0);

      const gesamtMinuten = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
      const gesamtMitPuffer = gesamtMinuten + pufferZeitGesamt;

      callback(null, {
        ...row,
        gesamt_minuten: gesamtMinuten,
        gesamt_minuten_mit_puffer: gesamtMitPuffer,
        puffer_minuten: pufferZeitGesamt,
        aktive_termine: aktiveTermine
      });
    });
  }

  static checkAvailability(datum, geschaetzteZeit, callback) {
    // Diese Methode prüft die Verfügbarkeit für einen neuen Termin
    // Sie verwendet die gleiche Logik wie getAuslastung, aber berechnet
    // die Auslastung mit dem neuen Termin
    this.getAuslastung(datum, (err, row) => {
      if (err) {
        return callback(err);
      }
      
      const aktuellBelegt = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
      const neueBelegung = aktuellBelegt + (geschaetzteZeit || 0);
      
      callback(null, {
        aktuell_belegt: aktuellBelegt,
        neue_belegung: neueBelegung,
        geschaetzte_zeit: geschaetzteZeit
      });
    });
  }

  static getTermineByDatum(datum, callback) {
    const query = `
      SELECT id, geschaetzte_zeit, tatsaechliche_zeit, status, datum
      FROM termine
      WHERE datum = ?
      ORDER BY erstellt_am
    `;
    db.all(query, [datum], callback);
  }
}

module.exports = TermineModel;
