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
      arbeitszeiten_details,
      dringlichkeit,
      vin,
      fahrzeugtyp
    } = termin;

    // Generiere zuerst die Termin-Nummer
    this.generateTerminNr((err, terminNr) => {
      if (err) {
        return callback(err);
      }

      db.run(
        `INSERT INTO termine
         (termin_nr, kunde_id, kunde_name, kunde_telefon, kennzeichen, arbeit, umfang, geschaetzte_zeit, datum, abholung_typ, abholung_details, abholung_zeit, bring_zeit, kontakt_option, kilometerstand, ersatzauto, ersatzauto_tage, ersatzauto_bis_datum, ersatzauto_bis_zeit, abholung_datum, mitarbeiter_id, arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          arbeitszeiten_details || null,
          dringlichkeit || null,
          vin || null,
          fahrzeugtyp || null
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
    const { 
      tatsaechliche_zeit, status, geschaetzte_zeit, arbeit, arbeitszeiten_details, 
      mitarbeiter_id, dringlichkeit, kennzeichen, umfang, datum, abholung_typ,
      abholung_details, abholung_zeit, abholung_datum, bring_zeit, kontakt_option,
      kilometerstand, ersatzauto, ersatzauto_tage, ersatzauto_bis_datum, ersatzauto_bis_zeit,
      vin, fahrzeugtyp, muss_bearbeitet_werden
    } = data;
    
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
    if (dringlichkeit !== undefined) {
      updates.push('dringlichkeit = ?');
      values.push(dringlichkeit || null);
    }
    if (kennzeichen !== undefined) {
      updates.push('kennzeichen = ?');
      values.push(kennzeichen);
    }
    if (umfang !== undefined) {
      updates.push('umfang = ?');
      values.push(umfang);
    }
    if (datum !== undefined) {
      updates.push('datum = ?');
      values.push(datum);
    }
    if (abholung_typ !== undefined) {
      updates.push('abholung_typ = ?');
      values.push(abholung_typ);
    }
    if (abholung_details !== undefined) {
      updates.push('abholung_details = ?');
      values.push(abholung_details);
    }
    if (abholung_zeit !== undefined) {
      updates.push('abholung_zeit = ?');
      values.push(abholung_zeit);
    }
    if (abholung_datum !== undefined) {
      updates.push('abholung_datum = ?');
      values.push(abholung_datum);
    }
    if (bring_zeit !== undefined) {
      updates.push('bring_zeit = ?');
      values.push(bring_zeit);
    }
    if (kontakt_option !== undefined) {
      updates.push('kontakt_option = ?');
      values.push(kontakt_option);
    }
    if (kilometerstand !== undefined) {
      updates.push('kilometerstand = ?');
      values.push(kilometerstand);
    }
    if (ersatzauto !== undefined) {
      updates.push('ersatzauto = ?');
      values.push(ersatzauto ? 1 : 0);
    }
    if (ersatzauto_tage !== undefined) {
      updates.push('ersatzauto_tage = ?');
      values.push(ersatzauto_tage);
    }
    if (ersatzauto_bis_datum !== undefined) {
      updates.push('ersatzauto_bis_datum = ?');
      values.push(ersatzauto_bis_datum);
    }
    if (ersatzauto_bis_zeit !== undefined) {
      updates.push('ersatzauto_bis_zeit = ?');
      values.push(ersatzauto_bis_zeit);
    }
    if (vin !== undefined) {
      updates.push('vin = ?');
      values.push(vin);
    }
    if (fahrzeugtyp !== undefined) {
      updates.push('fahrzeugtyp = ?');
      values.push(fahrzeugtyp);
    }
    if (muss_bearbeitet_werden !== undefined) {
      updates.push('muss_bearbeitet_werden = ?');
      values.push(muss_bearbeitet_werden ? 1 : 0);
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
    // Schwebende Termine (ist_schwebend = 1) werden NICHT in der Auslastung gezählt
    const query = `
      SELECT
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as gesamt_minuten,
        SUM(CASE WHEN COALESCE(status, 'geplant') = 'geplant' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as geplant_minuten,
        SUM(CASE WHEN status = 'in_arbeit' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as in_arbeit_minuten,
        SUM(CASE WHEN status = 'abgeschlossen' THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as abgeschlossen_minuten,
        COUNT(*) as termin_anzahl,
        SUM(CASE WHEN COALESCE(ist_schwebend, 0) = 1 THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as schwebend_minuten,
        SUM(CASE WHEN COALESCE(ist_schwebend, 0) = 1 THEN 1 ELSE 0 END) as schwebend_anzahl
      FROM termine
      WHERE datum = ? AND geloescht_am IS NULL AND COALESCE(ist_schwebend, 0) = 0
    `;
    db.get(query, [datum], callback);
  }

  // Schwebende Termine separat abrufen (nur für die Anzeige)
  static getSchwebendeTermine(datum, callback) {
    const query = `
      SELECT
        COUNT(*) as schwebend_anzahl,
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as schwebend_minuten
      FROM termine
      WHERE datum = ? AND geloescht_am IS NULL AND COALESCE(ist_schwebend, 0) = 1
    `;
    db.get(query, [datum], callback);
  }

  // ALLE schwebenden Termine global abrufen (unabhängig vom Datum)
  static getAlleSchwebendenTermine(callback) {
    const query = `
      SELECT
        COUNT(*) as schwebend_anzahl,
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as schwebend_minuten
      FROM termine
      WHERE geloescht_am IS NULL AND COALESCE(ist_schwebend, 0) = 1
    `;
    db.get(query, [], callback);
  }

  // Auslastung inklusive schwebender Termine (für Übersicht)
  static getAuslastungMitSchwebend(datum, callback) {
    const query = `
      SELECT
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as gesamt_minuten,
        SUM(CASE WHEN COALESCE(ist_schwebend, 0) = 0 THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as fest_minuten,
        SUM(CASE WHEN COALESCE(ist_schwebend, 0) = 1 THEN COALESCE(tatsaechliche_zeit, geschaetzte_zeit) ELSE 0 END) as schwebend_minuten,
        SUM(CASE WHEN COALESCE(ist_schwebend, 0) = 0 THEN 1 ELSE 0 END) as fest_anzahl,
        SUM(CASE WHEN COALESCE(ist_schwebend, 0) = 1 THEN 1 ELSE 0 END) as schwebend_anzahl,
        COUNT(*) as termin_anzahl
      FROM termine
      WHERE datum = ? AND geloescht_am IS NULL
    `;
    db.get(query, [datum], callback);
  }

  static getAuslastungProMitarbeiter(datum, callback) {
    // Berechnet Auslastung pro Mitarbeiter (ohne schwebende Termine)
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
      LEFT JOIN termine t ON m.id = t.mitarbeiter_id AND t.datum = ? AND t.geloescht_am IS NULL AND COALESCE(t.ist_schwebend, 0) = 0
      WHERE m.aktiv = 1
      GROUP BY m.id, m.name, m.arbeitsstunden_pro_tag, m.nebenzeit_prozent, m.nur_service
      ORDER BY m.name
    `;
    db.all(query, [datum], callback);
  }

  static getAuslastungMitPuffer(datum, pufferzeitMinuten, callback) {
    // Berechnet Auslastung mit Pufferzeiten zwischen Terminen (ohne schwebende Termine)
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
      WHERE datum = ? AND geloescht_am IS NULL AND COALESCE(ist_schwebend, 0) = 0
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
        // NEU: Nebenzeit erhöht die belegte Zeit statt die Kapazität zu reduzieren
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
          // Nebenzeit wird auf die belegte Zeit aufgeschlagen, nicht von der Kapazität abgezogen
          const nebenzeitFaktor = 1 + ((la.nebenzeit_prozent || 0) / 100);
          const belegtMitNebenzeit = la.belegt_minuten * nebenzeitFaktor;
          const verfuegbar = arbeitszeitMinuten; // Volle Arbeitszeit als Kapazität
          const prozent = verfuegbar > 0 ? (belegtMitNebenzeit / verfuegbar) * 100 : 0;

          return {
            lehrling_id: la.lehrling_id,
            lehrling_name: la.lehrling_name,
            arbeitsstunden_pro_tag: la.arbeitsstunden_pro_tag,
            nebenzeit_prozent: la.nebenzeit_prozent,
            aufgabenbewaeltigung_prozent: la.aufgabenbewaeltigung_prozent,
            verfuegbar_minuten: verfuegbar,
            belegt_minuten: Math.round(belegtMitNebenzeit), // Belegte Zeit inkl. Nebenzeit-Aufschlag
            belegt_minuten_roh: la.belegt_minuten, // Originale belegte Zeit ohne Aufschlag
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

  // Termin schwebend setzen/aufheben
  static setSchwebend(id, istSchwebend, callback) {
    db.run(
      'UPDATE termine SET ist_schwebend = ? WHERE id = ?',
      [istSchwebend ? 1 : 0, id],
      function(err) {
        if (err) return callback(err);
        callback(null, { changes: this.changes });
      }
    );
  }

  // Termin aufteilen (Split)
  static splitTermin(id, splitDaten, callback) {
    // splitDaten: { 
    //   teil1_zeit: 60 (Minuten für ersten Tag), 
    //   teil2_datum: '2025-01-02' (Datum für Rest),
    //   teil2_zeit: 120 (Restzeit in Minuten)
    // }
    const { teil1_zeit, teil2_datum, teil2_zeit } = splitDaten;
    
    // Erst den Original-Termin laden
    this.getById(id, (err, termin) => {
      if (err) return callback(err);
      if (!termin) return callback(new Error('Termin nicht gefunden'));

      // Original-Termin auf Teil 1 aktualisieren
      db.run(
        `UPDATE termine SET geschaetzte_zeit = ?, split_teil = 1 WHERE id = ?`,
        [teil1_zeit, id],
        function(updateErr) {
          if (updateErr) return callback(updateErr);

          // Generiere neue Termin-Nummer für Teil 2
          TermineModel.generateTerminNr((genErr, terminNr) => {
            if (genErr) return callback(genErr);

            // Neuen Termin für Teil 2 erstellen
            const teil2Termin = {
              termin_nr: terminNr,
              kunde_id: termin.kunde_id,
              kunde_name: termin.kunde_name,
              kunde_telefon: termin.kunde_telefon,
              kennzeichen: termin.kennzeichen,
              arbeit: termin.arbeit + ' (Fortsetzung)',
              umfang: termin.umfang,
              geschaetzte_zeit: teil2_zeit,
              datum: teil2_datum,
              status: 'geplant',
              abholung_typ: termin.abholung_typ,
              abholung_details: termin.abholung_details,
              abholung_zeit: termin.abholung_zeit,
              bring_zeit: termin.bring_zeit,
              kontakt_option: termin.kontakt_option,
              kilometerstand: termin.kilometerstand,
              ersatzauto: termin.ersatzauto,
              mitarbeiter_id: termin.mitarbeiter_id,
              arbeitszeiten_details: termin.arbeitszeiten_details,
              dringlichkeit: termin.dringlichkeit,
              vin: termin.vin,
              fahrzeugtyp: termin.fahrzeugtyp,
              parent_termin_id: id,
              split_teil: 2
            };

            db.run(
              `INSERT INTO termine 
               (termin_nr, kunde_id, kunde_name, kunde_telefon, kennzeichen, arbeit, umfang, 
                geschaetzte_zeit, datum, status, abholung_typ, abholung_details, abholung_zeit,
                bring_zeit, kontakt_option, kilometerstand, ersatzauto, mitarbeiter_id,
                arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp, parent_termin_id, split_teil)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                teil2Termin.termin_nr, teil2Termin.kunde_id, teil2Termin.kunde_name,
                teil2Termin.kunde_telefon, teil2Termin.kennzeichen, teil2Termin.arbeit,
                teil2Termin.umfang, teil2Termin.geschaetzte_zeit, teil2Termin.datum,
                teil2Termin.status, teil2Termin.abholung_typ, teil2Termin.abholung_details,
                teil2Termin.abholung_zeit, teil2Termin.bring_zeit, teil2Termin.kontakt_option,
                teil2Termin.kilometerstand, teil2Termin.ersatzauto, teil2Termin.mitarbeiter_id,
                teil2Termin.arbeitszeiten_details, teil2Termin.dringlichkeit, teil2Termin.vin,
                teil2Termin.fahrzeugtyp, teil2Termin.parent_termin_id, teil2Termin.split_teil
              ],
              function(insertErr) {
                if (insertErr) return callback(insertErr);
                callback(null, {
                  teil1: { id: id, zeit: teil1_zeit },
                  teil2: { id: this.lastID, termin_nr: terminNr, datum: teil2_datum, zeit: teil2_zeit }
                });
              }
            );
          });
        }
      );
    });
  }

  // Alle Folge-Termine eines gesplitteten Termins laden
  static getSplitTermine(parentId, callback) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE (t.id = ? OR t.parent_termin_id = ?) AND t.geloescht_am IS NULL
      ORDER BY t.split_teil ASC, t.datum ASC
    `;
    db.all(query, [parentId, parentId], callback);
  }
}

module.exports = TermineModel;
