const { db } = require('../config/database');

class ArbeitszeitenModel {
  static getAll(callback) {
    db.all('SELECT * FROM arbeitszeiten ORDER BY bezeichnung', callback);
  }

  static update(id, data, callback) {
    const { standard_minuten, bezeichnung, aliase } = data;

    // Baue die SQL-Query dynamisch auf, je nachdem welche Felder vorhanden sind
    const updates = [];
    const values = [];

    if (standard_minuten !== undefined) {
      updates.push('standard_minuten = ?');
      values.push(standard_minuten);
    }

    if (bezeichnung !== undefined) {
      updates.push('bezeichnung = ?');
      values.push(bezeichnung);
    }

    if (aliase !== undefined) {
      updates.push('aliase = ?');
      values.push(aliase);
    }

    if (updates.length === 0) {
      return callback(new Error('Keine Felder zum Aktualisieren'));
    }

    values.push(id);

    db.run(
      `UPDATE arbeitszeiten SET ${updates.join(', ')} WHERE id = ?`,
      values,
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { changes: this.changes });
      }
    );
  }

  static create(arbeit, callback) {
    const { bezeichnung, standard_minuten, aliase } = arbeit;
    db.run(
      'INSERT INTO arbeitszeiten (bezeichnung, standard_minuten, aliase) VALUES (?, ?, ?)',
      [bezeichnung, standard_minuten, aliase || ''],
      callback
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM arbeitszeiten WHERE id = ?', [id], function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }

  static findByBezeichnung(bezeichnung, callback) {
    // Suche zuerst nach exakter Bezeichnung
    db.get(
      'SELECT * FROM arbeitszeiten WHERE LOWER(bezeichnung) = LOWER(?)',
      [bezeichnung],
      (err, row) => {
        if (err) return callback(err);
        if (row) return callback(null, row);
        
        // Falls nicht gefunden, suche in Aliasen
        db.all('SELECT * FROM arbeitszeiten WHERE aliase IS NOT NULL AND aliase != ""', (err, rows) => {
          if (err) return callback(err);
          
          const suchBegriff = bezeichnung.toLowerCase();
          for (const arbeit of rows) {
            if (arbeit.aliase) {
              const aliasListe = arbeit.aliase.split(',').map(a => a.trim().toLowerCase());
              if (aliasListe.includes(suchBegriff)) {
                return callback(null, arbeit);
              }
            }
          }
          callback(null, null);
        });
      }
    );
  }

  static updateByBezeichnung(bezeichnung, neueStandardzeit, callback) {
    // Gewichteter Durchschnitt: 70% alte Zeit, 30% neue Zeit
    db.get(
      'SELECT * FROM arbeitszeiten WHERE LOWER(bezeichnung) = LOWER(?)',
      [bezeichnung],
      (err, row) => {
        if (err) {
          return callback(err);
        }

        if (!row) {
          return callback(null, { changes: 0, message: 'Arbeit nicht gefunden' });
        }

        const alteZeit = row.standard_minuten || 30;
        const gewichteteZeit = Math.round((alteZeit * 0.7) + (neueStandardzeit * 0.3));

        db.run(
          'UPDATE arbeitszeiten SET standard_minuten = ? WHERE LOWER(bezeichnung) = LOWER(?)',
          [gewichteteZeit, bezeichnung],
          function(updateErr) {
            if (updateErr) {
              return callback(updateErr);
            }
            callback(null, {
              changes: this.changes,
              alte_zeit: alteZeit,
              neue_zeit: gewichteteZeit,
              tatsaechliche_zeit: neueStandardzeit
            });
          }
        );
      }
    );
  }
}

module.exports = ArbeitszeitenModel;
