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
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.geloescht_am IS NULL
      ORDER BY t.datum DESC
    `;
    db.all(query, callback);
  }

  static getByDatum(datum, callback) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.datum = ? AND t.geloescht_am IS NULL
      ORDER BY t.erstellt_am
    `;
    db.all(query, [datum], callback);
  }

  static getById(id, callback) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
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
      ersatzauto,
      ersatzauto_tage,
      ersatzauto_bis_datum,
      ersatzauto_bis_zeit,
      abholung_datum,
      mitarbeiter_id,
      arbeitszeiten_details
    } = termin;

    // Generiere zuerst die Termin-Nummer
    this.generateTerminNr((err, terminNr) => {
      if (err) {
        return callback(err);
      }

      db.run(
        `INSERT INTO termine
         (termin_nr, kunde_id, kunde_name, kunde_telefon, kennzeichen, arbeit, umfang, geschaetzte_zeit, datum, abholung_typ, abholung_details, abholung_zeit, bring_zeit, kontakt_option, kilometerstand, ersatzauto, ersatzauto_tage, ersatzauto_bis_datum, ersatzauto_bis_zeit, abholung_datum, mitarbeiter_id, arbeitszeiten_details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          ersatzauto,
          ersatzauto_tage || null,
          ersatzauto_bis_datum || null,
          ersatzauto_bis_zeit || null,
          abholung_datum || null,
          mitarbeiter_id || null,
          arbeitszeiten_details || null
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
    const { tatsaechliche_zeit, status, geschaetzte_zeit, arbeit, arbeitszeiten_details, mitarbeiter_id } = data;
    
    // Baue die SQL-Query dynamisch auf
    const updates = [];
    const values = [];

    if (tatsaechliche_zeit !== undefined) {
      updates.push('tatsaechliche_zeit = ?');
      values.push(tatsaechliche_zeit);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      values.push(status);
    }
    if (geschaetzte_zeit !== undefined) {
      updates.push('geschaetzte_zeit = ?');
      values.push(geschaetzte_zeit);
    }
    if (arbeit !== undefined) {
      updates.push('arbeit = ?');
      values.push(arbeit);
    }
    if (arbeitszeiten_details !== undefined) {
      updates.push('arbeitszeiten_details = ?');
      values.push(arbeitszeiten_details);
    }
    if (mitarbeiter_id !== undefined) {
      updates.push('mitarbeiter_id = ?');
      values.push(mitarbeiter_id || null);
    }

    if (updates.length === 0) {
      return callback(new Error('Keine Felder zum Aktualisieren'));
    }

    values.push(id);

    db.run(
      `UPDATE termine SET ${updates.join(', ')} WHERE id = ?`,
      values,
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { changes: this.changes });
      }
    );
  }

  // Soft-Delete: Termin in Papierkorb verschieben
  static softDelete(id, callback) {
    db.run(
      'UPDATE termine SET geloescht_am = CURRENT_TIMESTAMP WHERE id = ?',
      [id],
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { changes: this.changes });
      }
    );
  }

  // Termin aus Papierkorb wiederherstellen
  static restore(id, callback) {
    db.run(
      'UPDATE termine SET geloescht_am = NULL WHERE id = ?',
      [id],
      function(err) {
        if (err) {
          return callback(err);
        }
        callback(null, { changes: this.changes });
      }
    );
  }

  // Permanentes Löschen (wirklich aus Datenbank entfernen)
  static permanentDelete(id, callback) {
    db.run('DELETE FROM termine WHERE id = ?', [id], function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, { changes: this.changes });
    });
  }

  // Gelöschte Termine abrufen (Papierkorb)
  static getDeleted(callback) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.geloescht_am IS NOT NULL
      ORDER BY t.geloescht_am DESC
    `;
    db.all(query, callback);
  }

  // Legacy: Alte delete-Methode umbenennen für Rückwärtskompatibilität
  static delete(id, callback) {
    // Standardmäßig Soft-Delete verwenden
    this.softDelete(id, callback);
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
      WHERE datum = ? AND geloescht_am IS NULL
    `;
    db.get(query, [datum], callback);
  }

  static getAuslastungProMitarbeiter(datum, callback) {
    // Berechnet Auslastung pro Mitarbeiter
    const query = `
      SELECT
        m.id as mitarbeiter_id,
        m.name as mitarbeiter_name,
        m.arbeitsstunden_pro_tag,
        m.nebenzeit_prozent,
        m.nur_service,
        COALESCE(SUM(COALESCE(t.tatsaechliche_zeit, t.geschaetzte_zeit)), 0) as belegt_minuten,
        COALESCE(SUM(CASE WHEN COALESCE(t.status, 'geplant') = 'geplant' THEN COALESCE(t.tatsaechliche_zeit, t.geschaetzte_zeit) ELSE 0 END), 0) as geplant_minuten,
        COALESCE(SUM(CASE WHEN t.status = 'in_arbeit' THEN COALESCE(t.tatsaechliche_zeit, t.geschaetzte_zeit) ELSE 0 END), 0) as in_arbeit_minuten,
        COALESCE(SUM(CASE WHEN t.status = 'abgeschlossen' THEN COALESCE(t.tatsaechliche_zeit, t.geschaetzte_zeit) ELSE 0 END), 0) as abgeschlossen_minuten,
        COUNT(t.id) as termin_anzahl
      FROM mitarbeiter m
      LEFT JOIN termine t ON m.id = t.mitarbeiter_id AND t.datum = ? AND t.geloescht_am IS NULL
      WHERE m.aktiv = 1
      GROUP BY m.id, m.name, m.arbeitsstunden_pro_tag, m.nebenzeit_prozent, m.nur_service
      ORDER BY m.name
    `;
    db.all(query, [datum], callback);
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
      WHERE datum = ? AND geloescht_am IS NULL
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
      SELECT id, geschaetzte_zeit, tatsaechliche_zeit, status, datum, arbeitszeiten_details
      FROM termine
      WHERE datum = ? AND geloescht_am IS NULL
      ORDER BY erstellt_am
    `;
    db.all(query, [datum], callback);
  }

  static getAuslastungProLehrling(datum, callback) {
    // Berechnet Auslastung pro Lehrling basierend auf arbeitszeiten_details
    // Da Lehrlinge über JSON in arbeitszeiten_details zugeordnet werden, müssen wir
    // alle Termine laden und die Details analysieren
    const query = `
      SELECT id, geschaetzte_zeit, tatsaechliche_zeit, status, arbeitszeiten_details
      FROM termine
      WHERE datum = ? AND arbeitszeiten_details IS NOT NULL AND geloescht_am IS NULL
    `;
    db.all(query, [datum], (err, termine) => {
      if (err) {
        return callback(err);
      }

      // Lade alle aktiven Lehrlinge
      const lehrlingeQuery = `
        SELECT id, name, arbeitsstunden_pro_tag, nebenzeit_prozent, aufgabenbewaeltigung_prozent
        FROM lehrlinge
        WHERE aktiv = 1
      `;
      db.all(lehrlingeQuery, [], (lehrErr, lehrlinge) => {
        if (lehrErr) {
          return callback(lehrErr);
        }

        // Initialisiere Auslastung für alle Lehrlinge
        const auslastungMap = {};
        (lehrlinge || []).forEach(l => {
          auslastungMap[l.id] = {
            lehrling_id: l.id,
            lehrling_name: l.name,
            arbeitsstunden_pro_tag: l.arbeitsstunden_pro_tag || 8,
            nebenzeit_prozent: l.nebenzeit_prozent || 0,
            aufgabenbewaeltigung_prozent: l.aufgabenbewaeltigung_prozent || 100,
            belegt_minuten: 0,
            geplant_minuten: 0,
            in_arbeit_minuten: 0,
            abgeschlossen_minuten: 0,
            termin_anzahl: 0
          };
        });

        // Analysiere Termine und sammle Auslastung pro Lehrling
        (termine || []).forEach(termin => {
          if (!termin.arbeitszeiten_details) return;

          try {
            const details = JSON.parse(termin.arbeitszeiten_details);
            const status = termin.status || 'geplant';
            const zeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;

            // Prüfe Gesamt-Zuordnung
            if (details._gesamt_mitarbeiter_id) {
              const gesamt = details._gesamt_mitarbeiter_id;
              if (typeof gesamt === 'object' && gesamt.type === 'lehrling' && gesamt.id) {
                const lehrlingId = gesamt.id;
                if (auslastungMap[lehrlingId]) {
                  auslastungMap[lehrlingId].belegt_minuten += zeit;
                  auslastungMap[lehrlingId].termin_anzahl += 1;
                  if (status === 'geplant') {
                    auslastungMap[lehrlingId].geplant_minuten += zeit;
                  } else if (status === 'in_arbeit') {
                    auslastungMap[lehrlingId].in_arbeit_minuten += zeit;
                  } else if (status === 'abgeschlossen') {
                    auslastungMap[lehrlingId].abgeschlossen_minuten += zeit;
                  }
                }
              }
            }

            // Prüfe individuelle Zuordnungen pro Arbeit
            Object.keys(details).forEach(arbeit => {
              if (arbeit === '_gesamt_mitarbeiter_id') return;

              const arbeitDetail = details[arbeit];
              let zeitMinuten = 0;
              let zugeordnetId = null;
              let zugeordnetTyp = null;

              if (typeof arbeitDetail === 'object') {
                zeitMinuten = arbeitDetail.zeit || 0;
                if (arbeitDetail.type === 'lehrling' && arbeitDetail.lehrling_id) {
                  zugeordnetId = arbeitDetail.lehrling_id;
                  zugeordnetTyp = 'lehrling';
                }
              }

              if (zugeordnetTyp === 'lehrling' && zugeordnetId && auslastungMap[zugeordnetId]) {
                auslastungMap[zugeordnetId].belegt_minuten += zeitMinuten;
                if (status === 'geplant') {
                  auslastungMap[zugeordnetId].geplant_minuten += zeitMinuten;
                } else if (status === 'in_arbeit') {
                  auslastungMap[zugeordnetId].in_arbeit_minuten += zeitMinuten;
                } else if (status === 'abgeschlossen') {
                  auslastungMap[zugeordnetId].abgeschlossen_minuten += zeitMinuten;
                }
              }
            });
          } catch (e) {
            // Ignoriere Parsing-Fehler
          }
        });

        // Konvertiere Map zu Array und berechne verfügbare Zeit und Auslastung
        // WICHTIG: Gib ALLE aktiven Lehrlinge zurück, auch wenn sie keine Termine haben
        const result = (lehrlinge || []).map(l => {
          const la = auslastungMap[l.id] || {
            lehrling_id: l.id,
            lehrling_name: l.name,
            arbeitsstunden_pro_tag: l.arbeitsstunden_pro_tag || 8,
            nebenzeit_prozent: l.nebenzeit_prozent || 0,
            aufgabenbewaeltigung_prozent: l.aufgabenbewaeltigung_prozent || 100,
            belegt_minuten: 0,
            geplant_minuten: 0,
            in_arbeit_minuten: 0,
            abgeschlossen_minuten: 0,
            termin_anzahl: 0
          };
          
          const arbeitszeitMinuten = (la.arbeitsstunden_pro_tag || 8) * 60;
          const nebenzeitMinuten = arbeitszeitMinuten * ((la.nebenzeit_prozent || 0) / 100);
          const verfuegbar = arbeitszeitMinuten - nebenzeitMinuten;
          const prozent = verfuegbar > 0 ? (la.belegt_minuten / verfuegbar) * 100 : 0;

          return {
            lehrling_id: la.lehrling_id,
            lehrling_name: la.lehrling_name,
            arbeitsstunden_pro_tag: la.arbeitsstunden_pro_tag,
            nebenzeit_prozent: la.nebenzeit_prozent,
            aufgabenbewaeltigung_prozent: la.aufgabenbewaeltigung_prozent,
            verfuegbar_minuten: verfuegbar,
            belegt_minuten: la.belegt_minuten,
            servicezeit_minuten: 0, // Lehrlinge haben keine Servicezeit
            auslastung_prozent: Math.round(prozent),
            geplant_minuten: la.geplant_minuten,
            in_arbeit_minuten: la.in_arbeit_minuten,
            abgeschlossen_minuten: la.abgeschlossen_minuten,
            termin_anzahl: la.termin_anzahl
          };
        });

        callback(null, result);
      });
    });
  }
}

module.exports = TermineModel;
