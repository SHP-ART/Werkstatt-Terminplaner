/**
 * TeileBestellung Model
 * Verwaltet Teile-Bestellungen für Termine
 */

const { db } = require('../config/database');

class TeileBestellung {
  
  /**
   * Alle Bestellungen abrufen mit optionalem Filter
   */
  static getAll(filter = {}) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT 
          tb.*,
          t.datum as termin_datum,
          t.arbeit as termin_arbeiten,
          t.fahrzeugtyp as termin_fahrzeug,
          k.name as kunde_name,
          k.kennzeichen as kunde_kennzeichen
        FROM teile_bestellungen tb
        LEFT JOIN termine t ON tb.termin_id = t.id
        LEFT JOIN kunden k ON t.kunde_id = k.id
        WHERE 1=1
      `;
      const params = [];
      
      // Filter nach Status
      if (filter.status) {
        sql += ` AND tb.status = ?`;
        params.push(filter.status);
      }
      
      // Filter nach Termin-ID
      if (filter.termin_id) {
        sql += ` AND tb.termin_id = ?`;
        params.push(filter.termin_id);
      }
      
      // Filter nach Datum-Bereich (von Termin)
      if (filter.von) {
        sql += ` AND t.datum >= ?`;
        params.push(filter.von);
      }
      
      if (filter.bis) {
        sql += ` AND t.datum <= ?`;
        params.push(filter.bis);
      }
      
      // Nur aktive Termine (nicht gelöscht)
      sql += ` AND (t.geloescht_am IS NULL OR t.geloescht_am = '')`;
      
      // Sortierung: Dringend zuerst (nächste Termine), dann nach Erstelldatum
      sql += ` ORDER BY t.datum ASC, tb.erstellt_am DESC`;
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Fällige Bestellungen abrufen (Termine in den nächsten X Tagen)
   */
  static getFaellige(tage = 7) {
    return new Promise((resolve, reject) => {
      const heute = new Date().toISOString().split('T')[0];
      const bis = new Date();
      bis.setDate(bis.getDate() + tage);
      const bisStr = bis.toISOString().split('T')[0];
      
      const sql = `
        SELECT 
          tb.*,
          t.datum as termin_datum,
          t.arbeit as termin_arbeiten,
          t.fahrzeugtyp as termin_fahrzeug,
          t.ist_schwebend as ist_schwebend,
          t.schwebend_prioritaet as schwebend_prioritaet,
          k.name as kunde_name,
          k.kennzeichen as kunde_kennzeichen,
          julianday(t.datum) - julianday('now') as tage_bis_termin
        FROM teile_bestellungen tb
        LEFT JOIN termine t ON tb.termin_id = t.id
        LEFT JOIN kunden k ON t.kunde_id = k.id
        WHERE tb.status IN ('offen', 'bestellt')
          AND t.datum >= ?
          AND t.datum <= ?
          AND (t.geloescht_am IS NULL OR t.geloescht_am = '')
          AND t.status != 'abgeschlossen'
          AND (t.ist_schwebend IS NULL OR t.ist_schwebend = 0)
        ORDER BY t.datum ASC, tb.status DESC
      `;
      
      db.all(sql, [heute, bisStr], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Bestellungen für schwebende Termine abrufen
   */
  static getSchwebende() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          tb.*,
          t.datum as termin_datum,
          t.arbeit as termin_arbeiten,
          t.fahrzeugtyp as termin_fahrzeug,
          t.ist_schwebend as ist_schwebend,
          t.schwebend_prioritaet as schwebend_prioritaet,
          t.kennzeichen as termin_kennzeichen,
          k.name as kunde_name,
          k.kennzeichen as kunde_kennzeichen
        FROM teile_bestellungen tb
        LEFT JOIN termine t ON tb.termin_id = t.id
        LEFT JOIN kunden k ON t.kunde_id = k.id
        WHERE tb.status IN ('offen', 'bestellt')
          AND t.ist_schwebend = 1
          AND (t.geloescht_am IS NULL OR t.geloescht_am = '')
          AND t.status != 'abgeschlossen'
        ORDER BY 
          CASE t.schwebend_prioritaet 
            WHEN 'hoch' THEN 1 
            WHEN 'mittel' THEN 2 
            WHEN 'niedrig' THEN 3 
            ELSE 2 
          END,
          tb.erstellt_am DESC
      `;
      
      db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Bestellungen für einen bestimmten Termin
   */
  static getByTermin(terminId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM teile_bestellungen 
        WHERE termin_id = ?
        ORDER BY erstellt_am DESC
      `;
      
      db.all(sql, [terminId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Einzelne Bestellung abrufen
   */
  static getById(id) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          tb.*,
          t.datum as termin_datum,
          t.arbeit as termin_arbeiten,
          k.name as kunde_name
        FROM teile_bestellungen tb
        LEFT JOIN termine t ON tb.termin_id = t.id
        LEFT JOIN kunden k ON t.kunde_id = k.id
        WHERE tb.id = ?
      `;
      
      db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Neue Bestellung anlegen
   */
  static create(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO teile_bestellungen 
        (termin_id, teil_name, teil_oe_nummer, menge, fuer_arbeit, status, notiz)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        data.termin_id,
        data.teil_name,
        data.teil_oe_nummer || null,
        data.menge || 1,
        data.fuer_arbeit || null,
        data.status || 'offen',
        data.notiz || null
      ];
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...data });
        }
      });
    });
  }

  /**
   * Mehrere Bestellungen auf einmal anlegen
   */
  static createBulk(bestellungen) {
    return new Promise((resolve, reject) => {
      const results = [];
      let completed = 0;
      let hasError = false;
      
      if (!bestellungen || bestellungen.length === 0) {
        resolve([]);
        return;
      }
      
      bestellungen.forEach(async (data) => {
        try {
          const result = await this.create(data);
          results.push(result);
        } catch (err) {
          if (!hasError) {
            hasError = true;
            reject(err);
          }
        } finally {
          completed++;
          if (completed === bestellungen.length && !hasError) {
            resolve(results);
          }
        }
      });
    });
  }

  /**
   * Bestellung aktualisieren
   */
  static update(id, data) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const params = [];
      
      if (data.teil_name !== undefined) {
        fields.push('teil_name = ?');
        params.push(data.teil_name);
      }
      
      if (data.teil_oe_nummer !== undefined) {
        fields.push('teil_oe_nummer = ?');
        params.push(data.teil_oe_nummer);
      }
      
      if (data.menge !== undefined) {
        fields.push('menge = ?');
        params.push(data.menge);
      }
      
      if (data.fuer_arbeit !== undefined) {
        fields.push('fuer_arbeit = ?');
        params.push(data.fuer_arbeit);
      }
      
      if (data.notiz !== undefined) {
        fields.push('notiz = ?');
        params.push(data.notiz);
      }
      
      fields.push('aktualisiert_am = CURRENT_TIMESTAMP');
      
      if (fields.length === 1) {
        resolve({ id, message: 'Keine Änderungen' });
        return;
      }
      
      const sql = `UPDATE teile_bestellungen SET ${fields.join(', ')} WHERE id = ?`;
      params.push(id);
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  }

  /**
   * Status einer Bestellung ändern
   */
  static updateStatus(id, status) {
    return new Promise((resolve, reject) => {
      let sql = `
        UPDATE teile_bestellungen 
        SET status = ?, aktualisiert_am = CURRENT_TIMESTAMP
      `;
      const params = [status];
      
      // Zeitstempel setzen bei Status-Änderung
      if (status === 'bestellt') {
        sql += `, bestellt_am = CURRENT_TIMESTAMP`;
      } else if (status === 'geliefert') {
        sql += `, geliefert_am = CURRENT_TIMESTAMP`;
      }
      
      sql += ` WHERE id = ?`;
      params.push(id);
      
      db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, status, changes: this.changes });
        }
      });
    });
  }

  /**
   * Mehrere Bestellungen auf einmal als bestellt markieren
   */
  static markAlsBestellt(ids) {
    return new Promise((resolve, reject) => {
      if (!ids || ids.length === 0) {
        resolve({ changes: 0 });
        return;
      }
      
      const placeholders = ids.map(() => '?').join(',');
      const sql = `
        UPDATE teile_bestellungen 
        SET status = 'bestellt', 
            bestellt_am = CURRENT_TIMESTAMP,
            aktualisiert_am = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders}) AND status = 'offen'
      `;
      
      db.run(sql, ids, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  /**
   * Bestellung löschen
   */
  static delete(id) {
    return new Promise((resolve, reject) => {
      const sql = `DELETE FROM teile_bestellungen WHERE id = ?`;
      
      db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, changes: this.changes });
        }
      });
    });
  }

  /**
   * Statistiken für Dashboard
   */
  static getStatistik() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as gesamt,
          SUM(CASE WHEN tb.status = 'offen' THEN 1 ELSE 0 END) as offen,
          SUM(CASE WHEN tb.status = 'bestellt' THEN 1 ELSE 0 END) as bestellt,
          SUM(CASE WHEN tb.status = 'geliefert' THEN 1 ELSE 0 END) as geliefert,
          SUM(CASE WHEN tb.status = 'storniert' THEN 1 ELSE 0 END) as storniert
        FROM teile_bestellungen tb
        LEFT JOIN termine t ON tb.termin_id = t.id
        WHERE (t.geloescht_am IS NULL OR t.geloescht_am = '')
      `;
      
      db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || { gesamt: 0, offen: 0, bestellt: 0, geliefert: 0, storniert: 0 });
        }
      });
    });
  }

  /**
   * Dringende Bestellungen zählen (Termin in den nächsten 2 Tagen, Status offen)
   */
  static getDringendeAnzahl() {
    return new Promise((resolve, reject) => {
      const heute = new Date().toISOString().split('T')[0];
      const uebermorgen = new Date();
      uebermorgen.setDate(uebermorgen.getDate() + 2);
      const bisStr = uebermorgen.toISOString().split('T')[0];
      
      const sql = `
        SELECT COUNT(*) as anzahl
        FROM teile_bestellungen tb
        LEFT JOIN termine t ON tb.termin_id = t.id
        WHERE tb.status = 'offen'
          AND t.datum >= ?
          AND t.datum <= ?
          AND (t.geloescht_am IS NULL OR t.geloescht_am = '')
      `;
      
      db.get(sql, [heute, bisStr], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.anzahl || 0);
        }
      });
    });
  }
}

module.exports = TeileBestellung;
