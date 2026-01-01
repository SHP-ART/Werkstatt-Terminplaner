const { db } = require('../config/database');

class PhasenModel {
  // Alle Phasen eines Termins abrufen
  static getByTerminId(terminId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT p.*, 
                m.name as mitarbeiter_name,
                l.name as lehrling_name
         FROM termin_phasen p
         LEFT JOIN mitarbeiter m ON p.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON p.lehrling_id = l.id
         WHERE p.termin_id = ?
         ORDER BY p.phase_nr ASC`,
        [terminId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Alle Phasen für ein bestimmtes Datum abrufen (für Auslastungsberechnung)
  static getByDatum(datum) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT p.*, 
                t.kennzeichen, 
                t.kunde_name,
                t.termin_nr,
                m.name as mitarbeiter_name,
                l.name as lehrling_name
         FROM termin_phasen p
         JOIN termine t ON p.termin_id = t.id
         LEFT JOIN mitarbeiter m ON p.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON p.lehrling_id = l.id
         WHERE p.datum = ? AND t.geloescht_am IS NULL
         ORDER BY p.phase_nr ASC`,
        [datum],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Einzelne Phase abrufen
  static getById(id) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT p.*, 
                m.name as mitarbeiter_name,
                l.name as lehrling_name
         FROM termin_phasen p
         LEFT JOIN mitarbeiter m ON p.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON p.lehrling_id = l.id
         WHERE p.id = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Neue Phase erstellen
  static create(phase) {
    return new Promise((resolve, reject) => {
      const { termin_id, phase_nr, bezeichnung, datum, geschaetzte_zeit, mitarbeiter_id, lehrling_id, notizen } = phase;
      
      db.run(
        `INSERT INTO termin_phasen (termin_id, phase_nr, bezeichnung, datum, geschaetzte_zeit, mitarbeiter_id, lehrling_id, notizen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [termin_id, phase_nr, bezeichnung, datum, geschaetzte_zeit, mitarbeiter_id || null, lehrling_id || null, notizen || null],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...phase });
        }
      );
    });
  }

  // Phase aktualisieren
  static update(id, data) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      const allowedFields = ['bezeichnung', 'datum', 'geschaetzte_zeit', 'tatsaechliche_zeit', 'mitarbeiter_id', 'lehrling_id', 'status', 'notizen'];
      
      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(value);
        }
      }
      
      if (fields.length === 0) {
        return resolve({ changes: 0 });
      }
      
      values.push(id);
      
      db.run(
        `UPDATE termin_phasen SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  // Phase löschen
  static delete(id) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM termin_phasen WHERE id = ?',
        [id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  // Alle Phasen eines Termins löschen
  static deleteByTerminId(terminId) {
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM termin_phasen WHERE termin_id = ?',
        [terminId],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  // Mehrere Phasen auf einmal erstellen/aktualisieren
  static async syncPhasen(terminId, phasen) {
    // Erst alle bestehenden Phasen löschen
    await this.deleteByTerminId(terminId);
    
    // Dann neue Phasen erstellen
    const results = [];
    for (let i = 0; i < phasen.length; i++) {
      const phase = phasen[i];
      const result = await this.create({
        termin_id: terminId,
        phase_nr: i + 1,
        bezeichnung: phase.bezeichnung,
        datum: phase.datum,
        geschaetzte_zeit: phase.geschaetzte_zeit,
        mitarbeiter_id: phase.mitarbeiter_id,
        lehrling_id: phase.lehrling_id,
        notizen: phase.notizen
      });
      results.push(result);
    }
    
    return results;
  }

  // Gesamtzeit aller Phasen eines Termins
  static getGesamtzeitByTerminId(terminId) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT 
           SUM(geschaetzte_zeit) as geschaetzte_gesamt,
           SUM(tatsaechliche_zeit) as tatsaechliche_gesamt
         FROM termin_phasen 
         WHERE termin_id = ?`,
        [terminId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { geschaetzte_gesamt: 0, tatsaechliche_gesamt: 0 });
        }
      );
    });
  }
}

module.exports = PhasenModel;
