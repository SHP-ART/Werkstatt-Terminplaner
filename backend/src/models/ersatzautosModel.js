const { db } = require('../config/database');

class ErsatzautosModel {
  static getAll(callback) {
    db.all('SELECT * FROM ersatzautos ORDER BY name ASC', callback);
  }

  // Manuelle Sperrung umschalten (mit optionalem Bis-Datum)
  static toggleManuellGesperrt(id, callback) {
    // Behandle NULL als 0 (nicht gesperrt)
    db.run(
      'UPDATE ersatzautos SET manuell_gesperrt = CASE WHEN COALESCE(manuell_gesperrt, 0) = 1 THEN 0 ELSE 1 END, gesperrt_bis = NULL WHERE id = ?',
      [id],
      function(err) {
        if (err) return callback(err);
        // Hole das aktualisierte Auto zurück
        ErsatzautosModel.getById(id, callback);
      }
    );
  }

  // Manuelle Sperrung direkt setzen
  static setManuellGesperrt(id, gesperrt, callback) {
    db.run(
      'UPDATE ersatzautos SET manuell_gesperrt = ?, gesperrt_bis = NULL WHERE id = ?',
      [gesperrt ? 1 : 0, id],
      function(err) {
        if (err) return callback(err);
        ErsatzautosModel.getById(id, callback);
      }
    );
  }

  // Zeitbasierte Sperrung setzen (sperren bis zu einem bestimmten Datum)
  static sperrenBis(id, bisDatum, callback) {
    db.run(
      'UPDATE ersatzautos SET manuell_gesperrt = 1, gesperrt_bis = ? WHERE id = ?',
      [bisDatum, id],
      function(err) {
        if (err) return callback(err);
        ErsatzautosModel.getById(id, callback);
      }
    );
  }

  // Sperrung aufheben
  static entsperren(id, callback) {
    db.run(
      'UPDATE ersatzautos SET manuell_gesperrt = 0, gesperrt_bis = NULL WHERE id = ?',
      [id],
      function(err) {
        if (err) return callback(err);
        ErsatzautosModel.getById(id, callback);
      }
    );
  }

  static getActive(callback) {
    db.all('SELECT * FROM ersatzautos WHERE aktiv = 1 ORDER BY name ASC', callback);
  }

  static getById(id, callback) {
    db.get('SELECT * FROM ersatzautos WHERE id = ?', [id], callback);
  }

  static create(data, callback) {
    const { kennzeichen, name, typ, aktiv } = data;
    db.run(
      'INSERT INTO ersatzautos (kennzeichen, name, typ, aktiv) VALUES (?, ?, ?, ?)',
      [kennzeichen, name, typ || null, aktiv !== undefined ? aktiv : 1],
      function(err) {
        if (err) return callback(err);
        callback(null, { id: this.lastID, ...data });
      }
    );
  }

  static update(id, data, callback) {
    const { kennzeichen, name, typ, aktiv } = data;
    db.run(
      'UPDATE ersatzautos SET kennzeichen = ?, name = ?, typ = ?, aktiv = ? WHERE id = ?',
      [kennzeichen, name, typ || null, aktiv !== undefined ? aktiv : 1, id],
      function(err) {
        if (err) return callback(err);
        ErsatzautosModel.getById(id, callback);
      }
    );
  }

  static delete(id, callback) {
    db.run('DELETE FROM ersatzautos WHERE id = ?', [id], function(err) {
      if (err) return callback(err);
      callback(null, { changes: this.changes });
    });
  }

  static getAnzahlAktiv(callback) {
    db.get('SELECT COUNT(*) as anzahl FROM ersatzautos WHERE aktiv = 1', (err, row) => {
      if (err) return callback(err);
      callback(null, row.anzahl);
    });
  }

  // Anzahl aktiver UND nicht gesperrter Autos (berücksichtigt gesperrt_bis Datum)
  static getAnzahlVerfuegbar(callback, datum = null) {
    const heute = datum || new Date().toISOString().split('T')[0];
    // Ein Auto ist verfügbar wenn:
    // - manuell_gesperrt = 0 ODER
    // - manuell_gesperrt = 1 aber gesperrt_bis < heute (Sperrung abgelaufen)
    db.get(
      `SELECT COUNT(*) as anzahl FROM ersatzautos 
       WHERE aktiv = 1 
       AND (
         manuell_gesperrt = 0 
         OR manuell_gesperrt IS NULL 
         OR (manuell_gesperrt = 1 AND gesperrt_bis IS NOT NULL AND gesperrt_bis < ?)
       )`,
      [heute],
      (err, row) => {
        if (err) return callback(err);
        callback(null, row.anzahl);
      }
    );
  }

  // Anzahl manuell gesperrter Autos (nur aktive Sperren)
  static getAnzahlGesperrt(callback, datum = null) {
    const heute = datum || new Date().toISOString().split('T')[0];
    // Ein Auto ist gesperrt wenn:
    // - manuell_gesperrt = 1 UND (gesperrt_bis ist NULL ODER gesperrt_bis >= heute)
    db.get(
      `SELECT COUNT(*) as anzahl FROM ersatzautos 
       WHERE aktiv = 1 
       AND manuell_gesperrt = 1
       AND (gesperrt_bis IS NULL OR gesperrt_bis >= ?)`,
      [heute],
      (err, row) => {
        if (err) return callback(err);
        callback(null, row.anzahl);
      }
    );
  }

  // Verfügbarkeit für ein bestimmtes Datum prüfen
  // Berücksichtigt jetzt auch mehrtägige Buchungen UND manuell gesperrte Autos
  static getVerfuegbarkeit(datum, callback) {
    // Erst die Anzahl aktiver UND nicht gesperrter Autos holen (für das spezifische Datum)
    ErsatzautosModel.getAnzahlVerfuegbar((err, verfuegbareAutos) => {
      if (err) return callback(err);
      
      // Auch Gesamtzahl aktiver Autos für Anzeige
      ErsatzautosModel.getAnzahlAktiv((err2, gesamt) => {
        if (err2) return callback(err2);
        
        // Anzahl gesperrter Autos (für das spezifische Datum)
        ErsatzautosModel.getAnzahlGesperrt((err3, gesperrt) => {
          if (err3) return callback(err3);
      
          // Zähle wie viele Ersatzautos an diesem Tag vergeben sind
          const query = `
            SELECT COUNT(*) as vergeben FROM termine 
            WHERE ersatzauto = 1 
            AND status != 'storniert'
            AND geloescht_am IS NULL
            AND (
              -- Eintägige Termine am gewählten Datum
              (datum = ? AND ersatzauto_bis_datum IS NULL AND abholung_datum IS NULL)
              -- Oder mehrtägige Termine, die das Datum einschließen
              OR (datum <= ? AND (
                ersatzauto_bis_datum >= ?
                OR abholung_datum >= ?
                OR (ersatzauto_tage IS NOT NULL AND date(datum, '+' || (ersatzauto_tage - 1) || ' days') >= ?)
              ))
            )
          `;
          
          db.get(query, [datum, datum, datum, datum, datum], (err4, row) => {
            if (err4) return callback(err4);
            
            const vergeben = row?.vergeben || 0;
            // Verfügbar = nicht gesperrte Autos - vergebene Autos
            callback(null, {
              gesamt,
              gesperrt,
              vergeben,
              verfuegbar: Math.max(0, verfuegbareAutos - vergeben)
            });
          });
        }, datum);
      });
    }, datum);
  }

  // Detaillierte Verfügbarkeit mit Fahrzeug-Info
  static getVerfuegbarkeitDetails(datum, callback) {
    ErsatzautosModel.getActive((err, alleAutos) => {
      if (err) return callback(err);
      
      // Hole alle Termine mit Ersatzauto an diesem Tag (inkl. mehrtägige)
      const query = `
        SELECT t.*, 
               COALESCE(k.name, t.kunde_name) as kunde_name,
               k.telefon as kunde_telefon
        FROM termine t
        LEFT JOIN kunden k ON t.kunde_id = k.id
        WHERE t.ersatzauto = 1 
        AND t.status != 'storniert'
        AND t.geloescht_am IS NULL
        AND (
          -- Eintägige Termine am gewählten Datum
          (t.datum = ? AND t.ersatzauto_bis_datum IS NULL AND t.abholung_datum IS NULL)
          -- Oder mehrtägige Termine, die das Datum einschließen
          OR (t.datum <= ? AND (
            t.ersatzauto_bis_datum >= ?
            OR t.abholung_datum >= ?
            OR (t.ersatzauto_tage IS NOT NULL AND date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days') >= ?)
          ))
        )
        ORDER BY t.datum ASC
      `;
      
      db.all(query, [datum, datum, datum, datum, datum], (err, termineAmTag) => {
        if (err) return callback(err);
        
        callback(null, {
          autos: alleAutos,
          vergeben: termineAmTag.length,
          verfuegbar: Math.max(0, alleAutos.length - termineAmTag.length),
          termine: termineAmTag
        });
      });
    });
  }

  // Alle aktuellen Buchungen (heute und laufende) holen
  static getAktuelleBuchungen(callback) {
    const heute = new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT t.id, t.termin_nr, t.kennzeichen, t.datum, 
             t.ersatzauto_tage, t.ersatzauto_bis_datum, t.ersatzauto_bis_zeit,
             t.abholung_datum, t.abholung_zeit, t.status,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             -- Berechne End-Datum
             CASE 
               WHEN t.ersatzauto_bis_datum IS NOT NULL THEN t.ersatzauto_bis_datum
               WHEN t.abholung_datum IS NOT NULL THEN t.abholung_datum
               WHEN t.ersatzauto_tage IS NOT NULL THEN date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days')
               ELSE t.datum
             END as bis_datum
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.ersatzauto = 1 
      AND t.status NOT IN ('storniert', 'erledigt')
      AND t.geloescht_am IS NULL
      AND (
        -- Start-Datum ist heute oder früher
        t.datum <= ?
        -- UND End-Datum ist heute oder später
        AND (
          t.ersatzauto_bis_datum >= ?
          OR t.abholung_datum >= ?
          OR (t.ersatzauto_tage IS NOT NULL AND date(t.datum, '+' || (t.ersatzauto_tage - 1) || ' days') >= ?)
          OR (t.ersatzauto_bis_datum IS NULL AND t.abholung_datum IS NULL AND t.ersatzauto_tage IS NULL AND t.datum >= ?)
        )
      )
      ORDER BY t.datum ASC
    `;
    
    db.all(query, [heute, heute, heute, heute, heute], callback);
  }
}
module.exports = ErsatzautosModel;