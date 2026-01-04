const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
const { withTransaction } = require('../utils/transaction');

class PhasenModel {
  // Alle Phasen eines Termins abrufen
  static async getByTerminId(terminId) {
    return await allAsync(
      `SELECT p.*, 
              m.name as mitarbeiter_name,
              l.name as lehrling_name
       FROM termin_phasen p
       LEFT JOIN mitarbeiter m ON p.mitarbeiter_id = m.id
       LEFT JOIN lehrlinge l ON p.lehrling_id = l.id
       WHERE p.termin_id = ?
       ORDER BY p.phase_nr ASC`,
      [terminId]
    );
  }

  // Alle Phasen für ein bestimmtes Datum abrufen (für Auslastungsberechnung)
  static async getByDatum(datum) {
    return await allAsync(
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
      [datum]
    );
  }

  // Einzelne Phase abrufen
  static async getById(id) {
    return await getAsync(
      `SELECT p.*, 
              m.name as mitarbeiter_name,
              l.name as lehrling_name
       FROM termin_phasen p
       LEFT JOIN mitarbeiter m ON p.mitarbeiter_id = m.id
       LEFT JOIN lehrlinge l ON p.lehrling_id = l.id
       WHERE p.id = ?`,
      [id]
    );
  }

  // Neue Phase erstellen
  static async create(phase) {
    const { termin_id, phase_nr, bezeichnung, datum, geschaetzte_zeit, mitarbeiter_id, lehrling_id, notizen } = phase;
    
    const result = await runAsync(
      `INSERT INTO termin_phasen (termin_id, phase_nr, bezeichnung, datum, geschaetzte_zeit, mitarbeiter_id, lehrling_id, notizen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [termin_id, phase_nr, bezeichnung, datum, geschaetzte_zeit, mitarbeiter_id || null, lehrling_id || null, notizen || null]
    );
    return { id: result.lastID, ...phase };
  }

  // Phase aktualisieren
  static async update(id, data) {
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
      return { changes: 0 };
    }
    
    values.push(id);
    
    const result = await runAsync(
      `UPDATE termin_phasen SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    return { changes: result.changes };
  }

  // Phase löschen
  static async delete(id) {
    const result = await runAsync(
      'DELETE FROM termin_phasen WHERE id = ?',
      [id]
    );
    return { changes: result.changes };
  }

  // Alle Phasen eines Termins löschen
  static async deleteByTerminId(terminId) {
    const result = await runAsync(
      'DELETE FROM termin_phasen WHERE termin_id = ?',
      [terminId]
    );
    return { changes: result.changes };
  }

  // Mehrere Phasen auf einmal erstellen/aktualisieren (mit Transaction)
  static async syncPhasen(terminId, phasen) {
    return await withTransaction(async () => {
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
    });
  }

  // Gesamtzeit aller Phasen eines Termins
  static async getGesamtzeitByTerminId(terminId) {
    const row = await getAsync(
      `SELECT 
         SUM(geschaetzte_zeit) as geschaetzte_gesamt,
         SUM(tatsaechliche_zeit) as tatsaechliche_gesamt
       FROM termin_phasen 
       WHERE termin_id = ?`,
      [terminId]
    );
    return row || { geschaetzte_gesamt: 0, tatsaechliche_gesamt: 0 };
  }
}

module.exports = PhasenModel;
