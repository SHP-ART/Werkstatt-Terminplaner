const { db } = require('../config/database');

class ErsatzautosModel {
  static getAll(callback) {
    db.all('SELECT * FROM ersatzautos ORDER BY name ASC', callback);
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

  // Verfügbarkeit für ein bestimmtes Datum prüfen
  // Berücksichtigt jetzt auch mehrtägige Buchungen
  static getVerfuegbarkeit(datum, callback) {
    // Erst die Anzahl aktiver Autos holen
    ErsatzautosModel.getAnzahlAktiv((err, gesamt) => {
      if (err) return callback(err);
      
      // Zähle wie viele Ersatzautos an diesem Tag vergeben sind
      // Ein Ersatzauto ist vergeben wenn:
      // 1. Das Datum = Termindatum UND (kein End-Datum ODER End-Datum >= Datum)
      // 2. ODER Termindatum < Datum UND End-Datum >= Datum
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
      
      db.get(query, [datum, datum, datum, datum, datum], (err, row) => {
        if (err) return callback(err);
        
        const vergeben = row?.vergeben || 0;
        callback(null, {
          gesamt,
          vergeben,
          verfuegbar: Math.max(0, gesamt - vergeben)
        });
      });
    });
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