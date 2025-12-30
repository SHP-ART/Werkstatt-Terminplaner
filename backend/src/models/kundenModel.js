const { db } = require('../config/database');

class KundenModel {
  static getAll(callback) {
    db.all('SELECT * FROM kunden ORDER BY name', callback);
  }

  static create(kunde, callback) {
    const { name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp } = kunde;
    db.run(
      'INSERT INTO kunden (name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, telefon, email, adresse, locosoft_id, kennzeichen || null, vin || null, fahrzeugtyp || null],
      callback
    );
  }

  static importMultiple(kunden, callback) {
    const stmt = db.prepare('INSERT INTO kunden (name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

    let imported = 0;
    let skipped = 0;
    const errors = [];

    // Prüfe auf existierende Namen und Kennzeichen
    db.all('SELECT name, kennzeichen FROM kunden', [], (err, existingKunden) => {
      if (err) {
        return callback(err);
      }

      const existingNames = new Set(existingKunden.map(k => k.name?.toLowerCase()).filter(n => n));
      const existingKennzeichen = new Set(existingKunden.map(k => k.kennzeichen?.toUpperCase()).filter(k => k));

      kunden.forEach((kunde, index) => {
        const nameLower = kunde.name?.toLowerCase();
        const kennzeichenUpper = kunde.kennzeichen?.toUpperCase();

        // Prüfe Duplikate
        if (nameLower && existingNames.has(nameLower)) {
          skipped++;
          errors.push(`Zeile ${index + 1}: Name "${kunde.name}" existiert bereits`);
          return;
        }

        if (kennzeichenUpper && existingKennzeichen.has(kennzeichenUpper)) {
          skipped++;
          errors.push(`Zeile ${index + 1}: Kennzeichen "${kunde.kennzeichen}" existiert bereits`);
          return;
        }

        stmt.run([
          kunde.name, 
          kunde.telefon, 
          kunde.email, 
          kunde.adresse, 
          kunde.locosoft_id, 
          kunde.kennzeichen || null, 
          kunde.vin || null, 
          kunde.fahrzeugtyp || null
        ], (err) => {
          if (!err) {
            imported++;
            // Füge zum Set hinzu um Duplikate innerhalb des Imports zu verhindern
            if (nameLower) existingNames.add(nameLower);
            if (kennzeichenUpper) existingKennzeichen.add(kennzeichenUpper);
          } else {
            skipped++;
            errors.push(`Zeile ${index + 1}: ${err.message}`);
          }
        });
      });

      stmt.finalize(() => callback(null, { imported, skipped, errors }));
    });
  }

  static getById(id, callback) {
    db.get('SELECT * FROM kunden WHERE id = ?', [id], callback);
  }

  static update(id, kunde, callback) {
    const { name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp } = kunde;
    db.run(
      'UPDATE kunden SET name = ?, telefon = ?, email = ?, adresse = ?, locosoft_id = ?, kennzeichen = ?, vin = ?, fahrzeugtyp = ? WHERE id = ?',
      [name, telefon, email, adresse, locosoft_id, kennzeichen || null, vin || null, fahrzeugtyp || null, id],
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { changes: this.changes });
      }
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM kunden WHERE id = ?', [id], function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }

  static searchWithTermine(searchTerm, callback) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return callback(null, []);
    }

    const searchPattern = `%${searchTerm.trim()}%`;
    
    // Suche Kunden nach Name oder Kennzeichen (über Termine)
    // Verwende DISTINCT um Duplikate zu vermeiden
    const query = `
      SELECT DISTINCT
        k.id,
        k.name,
        k.telefon,
        k.email,
        k.adresse,
        k.locosoft_id,
        k.erstellt_am
      FROM kunden k
      LEFT JOIN termine t ON k.id = t.kunde_id
      WHERE k.name LIKE ? OR t.kennzeichen LIKE ?
      ORDER BY k.name
    `;

    db.all(query, [searchPattern, searchPattern], (err, kunden) => {
      if (err) {
        return callback(err);
      }

      if (kunden.length === 0) {
        return callback(null, []);
      }

      // Hole für jeden Kunden alle Termine
      const kundenIds = kunden.map(k => k.id);
      const placeholders = kundenIds.map(() => '?').join(',');
      
      const termineQuery = `
        SELECT 
          t.id,
          t.termin_nr,
          t.kunde_id,
          t.kennzeichen,
          t.arbeit,
          t.umfang,
          t.geschaetzte_zeit,
          t.tatsaechliche_zeit,
          t.datum,
          t.status
        FROM termine t
        WHERE t.kunde_id IN (${placeholders})
        ORDER BY t.datum DESC, t.erstellt_am DESC
      `;

      db.all(termineQuery, kundenIds, (err, termine) => {
        if (err) {
          return callback(err);
        }

        // Gruppiere Termine nach kunde_id
        const termineByKunde = {};
        termine.forEach(termin => {
          if (!termineByKunde[termin.kunde_id]) {
            termineByKunde[termin.kunde_id] = [];
          }
          termineByKunde[termin.kunde_id].push(termin);
        });

        // Füge Termine zu Kunden hinzu
        const result = kunden.map(kunde => ({
          ...kunde,
          termine: termineByKunde[kunde.id] || []
        }));

        callback(null, result);
      });
    });
  }
}

module.exports = KundenModel;
