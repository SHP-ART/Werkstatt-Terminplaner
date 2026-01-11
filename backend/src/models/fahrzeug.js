const { db } = require('../config/database');

/**
 * Fahrzeug Model
 * Verwaltet Fahrzeugdaten basierend auf VIN-Dekodierung
 */
class Fahrzeug {
  
  /**
   * Erstellt oder aktualisiert ein Fahrzeug basierend auf VIN
   * @param {Object} daten - Fahrzeugdaten (aus VIN-Decoder oder manuell)
   * @returns {Promise<Object>} Das erstellte/aktualisierte Fahrzeug
   */
  static createOrUpdate(daten) {
    return new Promise((resolve, reject) => {
      const {
        kunde_id,
        kennzeichen,
        vin,
        hersteller,
        modell,
        generation,
        baujahr,
        motor_code,
        motor_typ,
        motor_ps,
        getriebe,
        werk,
        produktionsland,
        karosserie,
        oel_spezifikation,
        oelfilter_oe,
        besonderheiten,
        hinweise,
        vin_roh
      } = daten;

      // Prüfe ob Fahrzeug mit dieser VIN schon existiert
      if (vin) {
        db.get('SELECT * FROM fahrzeuge WHERE vin = ?', [vin], (err, existing) => {
          if (err) {
            reject(err);
            return;
          }

          if (existing) {
            // Update bestehend
            const sql = `
              UPDATE fahrzeuge SET
                kunde_id = COALESCE(?, kunde_id),
                kennzeichen = COALESCE(?, kennzeichen),
                hersteller = COALESCE(?, hersteller),
                modell = COALESCE(?, modell),
                generation = COALESCE(?, generation),
                baujahr = COALESCE(?, baujahr),
                motor_code = COALESCE(?, motor_code),
                motor_typ = COALESCE(?, motor_typ),
                motor_ps = COALESCE(?, motor_ps),
                getriebe = COALESCE(?, getriebe),
                werk = COALESCE(?, werk),
                produktionsland = COALESCE(?, produktionsland),
                karosserie = COALESCE(?, karosserie),
                oel_spezifikation = COALESCE(?, oel_spezifikation),
                oelfilter_oe = COALESCE(?, oelfilter_oe),
                besonderheiten = COALESCE(?, besonderheiten),
                hinweise = COALESCE(?, hinweise),
                vin_roh = COALESCE(?, vin_roh),
                aktualisiert_am = CURRENT_TIMESTAMP
              WHERE vin = ?
            `;
            
            db.run(sql, [
              kunde_id, kennzeichen, hersteller, modell, generation, baujahr,
              motor_code, motor_typ, motor_ps, getriebe, werk, produktionsland,
              karosserie, oel_spezifikation, oelfilter_oe, besonderheiten,
              hinweise, vin_roh, vin
            ], function(err) {
              if (err) reject(err);
              else resolve({ id: existing.id, ...daten, updated: true });
            });
          } else {
            // Neues Fahrzeug erstellen
            Fahrzeug.create(daten).then(resolve).catch(reject);
          }
        });
      } else {
        // Ohne VIN: Prüfe nach Kennzeichen
        Fahrzeug.create(daten).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Erstellt ein neues Fahrzeug
   */
  static create(daten) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO fahrzeuge (
          kunde_id, kennzeichen, vin, hersteller, modell, generation, baujahr,
          motor_code, motor_typ, motor_ps, getriebe, werk, produktionsland,
          karosserie, oel_spezifikation, oelfilter_oe, besonderheiten, hinweise, vin_roh
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [
        daten.kunde_id || null,
        daten.kennzeichen,
        daten.vin || null,
        daten.hersteller || null,
        daten.modell || null,
        daten.generation || null,
        daten.baujahr || null,
        daten.motor_code || null,
        daten.motor_typ || null,
        daten.motor_ps || null,
        daten.getriebe || null,
        daten.werk || null,
        daten.produktionsland || null,
        daten.karosserie || null,
        daten.oel_spezifikation || null,
        daten.oelfilter_oe || null,
        daten.besonderheiten || null,
        daten.hinweise || null,
        daten.vin_roh || null
      ], function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, ...daten, created: true });
      });
    });
  }

  /**
   * Findet Fahrzeug nach VIN
   */
  static findByVin(vin) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM fahrzeuge WHERE vin = ?', [vin], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Findet Fahrzeug nach Kennzeichen
   */
  static findByKennzeichen(kennzeichen) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM fahrzeuge WHERE kennzeichen = ?', [kennzeichen], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Findet alle Fahrzeuge eines Kunden
   */
  static findByKundeId(kundeId) {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM fahrzeuge WHERE kunde_id = ? ORDER BY aktualisiert_am DESC', [kundeId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Findet Fahrzeug nach ID
   */
  static findById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM fahrzeuge WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Aktualisiert ein Fahrzeug
   */
  static update(id, daten) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];
      
      const updateableFields = [
        'kunde_id', 'kennzeichen', 'vin', 'hersteller', 'modell', 'generation',
        'baujahr', 'motor_code', 'motor_typ', 'motor_ps', 'getriebe', 'werk',
        'produktionsland', 'karosserie', 'oel_spezifikation', 'oelfilter_oe',
        'besonderheiten', 'hinweise', 'vin_roh'
      ];
      
      updateableFields.forEach(field => {
        if (daten[field] !== undefined) {
          fields.push(`${field} = ?`);
          values.push(daten[field]);
        }
      });
      
      if (fields.length === 0) {
        resolve({ id, message: 'Keine Änderungen' });
        return;
      }
      
      fields.push('aktualisiert_am = CURRENT_TIMESTAMP');
      values.push(id);
      
      const sql = `UPDATE fahrzeuge SET ${fields.join(', ')} WHERE id = ?`;
      
      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ id, changes: this.changes });
      });
    });
  }

  /**
   * Löscht ein Fahrzeug
   */
  static delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM fahrzeuge WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ deleted: this.changes > 0 });
      });
    });
  }

  /**
   * Sucht Fahrzeuge nach verschiedenen Kriterien
   */
  static search(suchbegriff) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT f.*, k.name as kunde_name
        FROM fahrzeuge f
        LEFT JOIN kunden k ON f.kunde_id = k.id
        WHERE f.kennzeichen LIKE ?
           OR f.vin LIKE ?
           OR f.hersteller LIKE ?
           OR f.modell LIKE ?
           OR k.name LIKE ?
        ORDER BY f.aktualisiert_am DESC
        LIMIT 50
      `;
      const like = `%${suchbegriff}%`;
      
      db.all(sql, [like, like, like, like, like], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Holt alle Fahrzeuge mit Kundendaten
   */
  static getAll(limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT f.*, k.name as kunde_name, k.telefon as kunde_telefon
        FROM fahrzeuge f
        LEFT JOIN kunden k ON f.kunde_id = k.id
        ORDER BY f.aktualisiert_am DESC
        LIMIT ?
      `;
      
      db.all(sql, [limit], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Speichert VIN-Dekodierung als Fahrzeug
   * @param {Object} vinData - Daten aus dem VIN-Decoder
   * @param {string} kennzeichen - Kennzeichen des Fahrzeugs
   * @param {number|null} kundeId - Optional: Kunden-ID
   */
  static saveFromVinDecode(vinData, kennzeichen, kundeId = null) {
    if (!vinData.success) {
      return Promise.reject(new Error('VIN-Dekodierung fehlgeschlagen'));
    }

    const daten = {
      kunde_id: kundeId,
      kennzeichen: kennzeichen,
      vin: vinData.vin,
      hersteller: vinData.hersteller,
      modell: vinData.modell,
      generation: vinData.generation || null,
      baujahr: vinData.baujahr,
      motor_code: vinData.motor?.code || null,
      motor_typ: vinData.motor?.typ || null,
      motor_ps: vinData.motor?.ps || null,
      getriebe: vinData.getriebe,
      werk: vinData.werk,
      produktionsland: vinData.produktionsland,
      karosserie: vinData.karosserie || null,
      oel_spezifikation: vinData.teile?.oelSpezifikation || null,
      oelfilter_oe: vinData.teile?.oelfilter || null,
      besonderheiten: vinData.motor?.hinweise?.join('; ') || null,
      hinweise: JSON.stringify(vinData.teile?.warnungen || []),
      vin_roh: JSON.stringify(vinData._raw || {})
    };

    return Fahrzeug.createOrUpdate(daten);
  }
}

module.exports = Fahrzeug;
