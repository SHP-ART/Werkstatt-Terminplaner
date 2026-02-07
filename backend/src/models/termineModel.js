const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');

class TermineModel {
  static async generateTerminNr(retryOffset = 0) {
    const year = new Date().getFullYear();
    const prefix = `T-${year}-`;

    // Hole die höchste Nummer für dieses Jahr
    const row = await getAsync(
      `SELECT termin_nr FROM termine
       WHERE termin_nr LIKE ?
       ORDER BY CAST(SUBSTR(termin_nr, 8) AS INTEGER) DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNumber = 1;
    if (row && row.termin_nr) {
      // Extrahiere die Nummer aus T-2024-001 -> 001
      const lastNumber = parseInt(row.termin_nr.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    // Bei Retry: erhöhe die Nummer
    nextNumber += retryOffset;

    // Format: T-2024-001, T-2024-002, etc.
    const terminNr = `${prefix}${String(nextNumber).padStart(3, '0')}`;
    return terminNr;
  }
  
  static async getAll() {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.geloescht_am IS NULL
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
      ORDER BY t.datum DESC
    `;
    return await allAsync(query, []);
  }

  static async getAllPaginated(limit, offset) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.geloescht_am IS NULL
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
      ORDER BY t.datum DESC
      LIMIT ? OFFSET ?
    `;
    return await allAsync(query, [limit, offset]);
  }

  static async countAll() {
    const query = `
      SELECT COUNT(*) as total
      FROM termine t
      WHERE t.geloescht_am IS NULL
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
    `;
    return await getAsync(query, []);
  }

  static async getByDatum(datum) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.datum = ? AND t.geloescht_am IS NULL
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
      ORDER BY t.erstellt_am
    `;
    return await allAsync(query, [datum]);
  }

  static async getByDatumPaginated(datum, limit, offset) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.datum = ? AND t.geloescht_am IS NULL
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
      ORDER BY t.erstellt_am
      LIMIT ? OFFSET ?
    `;
    return await allAsync(query, [datum, limit, offset]);
  }

  static async countByDatum(datum) {
    const query = `
      SELECT COUNT(*) as total
      FROM termine t
      WHERE t.datum = ? AND t.geloescht_am IS NULL
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
    `;
    return await getAsync(query, [datum]);
  }

  /**
   * Prüft ob es bereits Termine für einen Kunden an einem bestimmten Datum gibt
   * @param {string} datum - Das Datum im Format YYYY-MM-DD
   * @param {number|null} kundeId - Die Kunden-ID (optional)
   * @param {string|null} kundeName - Der Kundenname (falls keine ID)
   * @param {number|null} excludeId - Optional: Termin-ID die ausgeschlossen werden soll (für Updates)
   * @returns {Promise<Array>} - Array von Duplikat-Terminen
   */
  static async checkDuplikate(datum, kundeId, kundeName, excludeId = null) {
    let query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.datum = ? 
        AND t.geloescht_am IS NULL
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
    `;
    const params = [datum];

    // Prüfung nach Kunde (entweder per ID oder Name)
    if (kundeId) {
      query += ' AND t.kunde_id = ?';
      params.push(kundeId);
    } else if (kundeName) {
      // Fallback auf Namensvergleich (case-insensitive)
      query += ' AND (LOWER(COALESCE(k.name, t.kunde_name)) = LOWER(?))';
      params.push(kundeName);
    } else {
      // Kein Kunde angegeben - keine Duplikate möglich
      return [];
    }

    // Optional: Bestimmten Termin ausschließen (z.B. bei Bearbeitung)
    if (excludeId) {
      query += ' AND t.id != ?';
      params.push(excludeId);
    }

    query += ' ORDER BY t.erstellt_am';
    return await allAsync(query, params);
  }

  static async getById(id) {
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
    return await getAsync(query, [id]);
  }

  static async create(termin) {
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
      fahrzeugtyp,
      ist_schwebend,
      schwebend_prioritaet,
      status
    } = termin;

    // Retry-Logik für UNIQUE constraint Fehler
    const maxRetries = 5;
    let lastError = null;

    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        // Generiere Termin-Nummer mit Retry-Offset
        const terminNr = await this.generateTerminNr(retry);

        const result = await runAsync(
          `INSERT INTO termine
           (termin_nr, kunde_id, kunde_name, kunde_telefon, kennzeichen, arbeit, umfang, geschaetzte_zeit, datum, abholung_typ, abholung_details, abholung_zeit, bring_zeit, kontakt_option, kilometerstand, ersatzauto, ersatzauto_tage, ersatzauto_bis_datum, ersatzauto_bis_zeit, abholung_datum, mitarbeiter_id, arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp, ist_schwebend, schwebend_prioritaet, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            fahrzeugtyp || null,
            ist_schwebend ? 1 : 0,
            schwebend_prioritaet || 'mittel',
            status || 'geplant'
          ]
        );
        // Erfolgreich - gib die Termin-Nummer zurück
        return { id: result.lastID, terminNr };
      } catch (error) {
        lastError = error;
        // Bei UNIQUE constraint Fehler: retry mit höherer Nummer
        if (error.message && error.message.includes('UNIQUE constraint failed: termine.termin_nr')) {
          console.log(`Termin-Nummer Konflikt, Versuch ${retry + 2}/${maxRetries}...`);
          continue;
        }
        // Bei anderen Fehlern: sofort werfen
        throw error;
      }
    }

    // Alle Retries fehlgeschlagen
    throw lastError || new Error('Konnte keine eindeutige Termin-Nummer generieren');
  }

  /**
   * Schließt eine einzelne Arbeit innerhalb von arbeitszeiten_details ab
   * @param {number} terminId - ID des Termins
   * @param {string} arbeitName - Name der abzuschließenden Arbeit
   * @param {number} tatsaechlicheZeit - Tatsächliche Dauer in Minuten
   * @returns {Promise<object>} - Aktualisierter Termin
   */
  static async completeEinzelarbeit(terminId, arbeitName, tatsaechlicheZeit) {
    return new Promise((resolve, reject) => {
      // 1. Termin laden
      db.get('SELECT * FROM termine WHERE id = ?', [terminId], (err, termin) => {
        if (err) return reject(err);
        if (!termin) return reject(new Error('Termin nicht gefunden'));

        let details = {};
        try {
          details = termin.arbeitszeiten_details ? JSON.parse(termin.arbeitszeiten_details) : {};
        } catch (e) {
          return reject(new Error('Fehler beim Parsen von arbeitszeiten_details'));
        }

        // 2. Prüfen ob Arbeit existiert
        if (!details[arbeitName]) {
          return reject(new Error(`Arbeit "${arbeitName}" nicht gefunden`));
        }

        // 3. Arbeit als abgeschlossen markieren
        if (typeof details[arbeitName] === 'object') {
          details[arbeitName].abgeschlossen = true;
          details[arbeitName].tatsaechliche_zeit = tatsaechlicheZeit;
          details[arbeitName].fertigstellung_zeit = new Date().toISOString();
        } else {
          // Wenn nur Zahl gespeichert war, in Objekt umwandeln
          details[arbeitName] = {
            zeit: details[arbeitName],
            abgeschlossen: true,
            tatsaechliche_zeit: tatsaechlicheZeit,
            fertigstellung_zeit: new Date().toISOString()
          };
        }

        // 4. Prüfen ob ALLE Arbeiten abgeschlossen sind
        let alleAbgeschlossen = true;
        let gesamtTatsaechlicheZeit = 0;
        
        for (const [key, value] of Object.entries(details)) {
          if (key.startsWith('_')) continue; // Metadaten überspringen
          
          if (typeof value === 'object') {
            if (!value.abgeschlossen) {
              alleAbgeschlossen = false;
            } else {
              gesamtTatsaechlicheZeit += value.tatsaechliche_zeit || value.zeit || 0;
            }
          } else {
            // Nicht-Objekt = noch nicht abgeschlossen
            alleAbgeschlossen = false;
          }
        }

        // 5. Update durchführen
        const neuerStatus = alleAbgeschlossen ? 'abgeschlossen' : 'in_bearbeitung';
        const neueTatsaechlicheZeit = alleAbgeschlossen ? gesamtTatsaechlicheZeit : null;
        const neueFertigstellung = alleAbgeschlossen ? new Date().toISOString() : null;

        const sql = `
          UPDATE termine 
          SET arbeitszeiten_details = ?,
              status = ?,
              tatsaechliche_zeit = ?,
              fertigstellung_zeit = ?
          WHERE id = ?
        `;

        db.run(sql, [
          JSON.stringify(details),
          neuerStatus,
          neueTatsaechlicheZeit,
          neueFertigstellung,
          terminId
        ], function(err) {
          if (err) return reject(err);
          
          // Aktualiserten Termin zurückgeben
          db.get('SELECT * FROM termine WHERE id = ?', [terminId], (err, updated) => {
            if (err) return reject(err);
            resolve(updated);
          });
        });
      });
    });
  }

  static async update(id, data) {
    const { 
      tatsaechliche_zeit, status, geschaetzte_zeit, arbeit, arbeitszeiten_details, 
      mitarbeiter_id, dringlichkeit, kennzeichen, umfang, datum, abholung_typ,
      abholung_details, abholung_zeit, abholung_datum, bring_zeit, kontakt_option,
      kilometerstand, ersatzauto, ersatzauto_tage, ersatzauto_bis_datum, ersatzauto_bis_zeit,
      vin, fahrzeugtyp, muss_bearbeitet_werden, ist_schwebend, schwebend_prioritaet, interne_auftragsnummer,
      startzeit, endzeit_berechnet, fertigstellung_zeit, notizen
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
      console.log('[DEBUG] TermineModel.update - arbeitszeiten_details wird aktualisiert');
      console.log('[DEBUG] arbeitszeiten_details Inhalt:', arbeitszeiten_details);
      updates.push('arbeitszeiten_details = ?');
      values.push(arbeitszeiten_details);
    }
    if (startzeit !== undefined) {
      updates.push('startzeit = ?');
      values.push(startzeit);
    }
    if (endzeit_berechnet !== undefined) {
      updates.push('endzeit_berechnet = ?');
      values.push(endzeit_berechnet);
    }
    if (mitarbeiter_id !== undefined) {
      console.log('[DEBUG] TermineModel.update - mitarbeiter_id wird aktualisiert:', mitarbeiter_id);
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
    if (ist_schwebend !== undefined) {
      updates.push('ist_schwebend = ?');
      // Explizit auf 0 prüfen (für Zahl 0, String "0", false)
      const schwebendWert = (ist_schwebend === 0 || ist_schwebend === '0' || ist_schwebend === false) ? 0 : (ist_schwebend ? 1 : 0);
      values.push(schwebendWert);
    }
    if (schwebend_prioritaet !== undefined) {
      updates.push('schwebend_prioritaet = ?');
      values.push(schwebend_prioritaet);
    }
    if (interne_auftragsnummer !== undefined) {
      updates.push('interne_auftragsnummer = ?');
      values.push(interne_auftragsnummer || null);
    }
    if (fertigstellung_zeit !== undefined) {
      updates.push('fertigstellung_zeit = ?');
      values.push(fertigstellung_zeit || null);
    }
    if (notizen !== undefined) {
      updates.push('notizen = ?');
      values.push(notizen || null);
    }

    if (updates.length === 0) {
      console.log('[DEBUG] TermineModel.update - Keine Felder zum Aktualisieren');
      throw new Error('Keine Felder zum Aktualisieren');
    }

    values.push(id);

    const sqlQuery = `UPDATE termine SET ${updates.join(', ')} WHERE id = ?`;
    console.log('[DEBUG] TermineModel.update - SQL:', sqlQuery);
    console.log('[DEBUG] TermineModel.update - Values:', values);

    const result = await runAsync(sqlQuery, values);
    
    console.log('[DEBUG] TermineModel.update - Result:', result);
    console.log('[DEBUG] TermineModel.update - Changes:', result.changes);
    
    return { changes: result.changes };
  }

  // Soft-Delete: Termin in Papierkorb verschieben
  static async softDelete(id) {
    const result = await runAsync(
      'UPDATE termine SET geloescht_am = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
    return { changes: result.changes };
  }

  // Termin aus Papierkorb wiederherstellen
  static async restore(id) {
    const result = await runAsync(
      'UPDATE termine SET geloescht_am = NULL WHERE id = ?',
      [id]
    );
    return { changes: result.changes };
  }

  // Permanentes Löschen (wirklich aus Datenbank entfernen)
  static async permanentDelete(id) {
    const result = await runAsync('DELETE FROM termine WHERE id = ?', [id]);
    return { changes: result.changes };
  }

  // Gelöschte Termine abrufen (Papierkorb)
  static async getDeleted() {
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
    return await allAsync(query, []);
  }

  // Legacy: Alte delete-Methode umbenennen für Rückwärtskompatibilität
  static async delete(id) {
    // Standardmäßig Soft-Delete verwenden
    return await this.softDelete(id);
  }

  static async getAuslastung(datum) {
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
    return await getAsync(query, [datum]);
  }

  // Schwebende Termine separat abrufen (nur für die Anzeige)
  static async getSchwebendeTermine(datum) {
    const query = `
      SELECT
        COUNT(*) as schwebend_anzahl,
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as schwebend_minuten
      FROM termine
      WHERE datum = ? AND geloescht_am IS NULL AND COALESCE(ist_schwebend, 0) = 1
    `;
    return await getAsync(query, [datum]);
  }

  // ALLE schwebenden Termine global abrufen (unabhängig vom Datum)
  static async getAlleSchwebendenTermine() {
    const query = `
      SELECT
        COUNT(*) as schwebend_anzahl,
        SUM(COALESCE(tatsaechliche_zeit, geschaetzte_zeit)) as schwebend_minuten
      FROM termine
      WHERE geloescht_am IS NULL AND COALESCE(ist_schwebend, 0) = 1
    `;
    return await getAsync(query, []);
  }

  // Schwebende Termine als vollständige Liste abrufen
  static async getSchwebendeTermine() {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.geloescht_am IS NULL 
        AND COALESCE(t.ist_schwebend, 0) = 1
        AND t.arbeit != 'Fahrzeug aus Import'
        AND t.arbeit != 'Fahrzeug hinzugefügt'
      ORDER BY 
        CASE t.schwebend_prioritaet 
          WHEN 'hoch' THEN 1 
          WHEN 'mittel' THEN 2 
          WHEN 'niedrig' THEN 3 
          ELSE 2 
        END,
        t.erstellt_am DESC
    `;
    return await allAsync(query, []);
  }

  // Auslastung inklusive schwebender Termine (für Übersicht)
  static async getAuslastungMitSchwebend(datum) {
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
    return await getAsync(query, [datum]);
  }

  static async getAuslastungProMitarbeiter(datum) {
    // Berechnet Auslastung pro Mitarbeiter (ohne schwebende Termine)
    // Berücksichtigt sowohl mitarbeiter_id als auch arbeitszeiten_details
    
    // Erst alle aktiven Mitarbeiter laden
    const mitarbeiterQuery = `
      SELECT id, name, arbeitsstunden_pro_tag, nebenzeit_prozent, nur_service
      FROM mitarbeiter
      WHERE aktiv = 1
    `;
    
    const mitarbeiter = await allAsync(mitarbeiterQuery, []);
    
    // Initialisiere Auslastung für alle Mitarbeiter
    const auslastungMap = {};
    (mitarbeiter || []).forEach(m => {
      auslastungMap[m.id] = {
        mitarbeiter_id: m.id,
        mitarbeiter_name: m.name,
        arbeitsstunden_pro_tag: m.arbeitsstunden_pro_tag || 8,
        nebenzeit_prozent: m.nebenzeit_prozent || 0,
        nur_service: m.nur_service,
        belegt_minuten: 0,
        geplant_minuten: 0,
        in_arbeit_minuten: 0,
        abgeschlossen_minuten: 0,
        termin_anzahl: 0
      };
    });
    
    // Lade alle Termine für dieses Datum
    const termineQuery = `
      SELECT id, mitarbeiter_id, geschaetzte_zeit, tatsaechliche_zeit, status, arbeitszeiten_details
      FROM termine
      WHERE datum = ? AND geloescht_am IS NULL AND COALESCE(ist_schwebend, 0) = 0
    `;
    
    const termine = await allAsync(termineQuery, [datum]);
    
    // Analysiere Termine und sammle Auslastung pro Mitarbeiter
    // BUG 8 FIX: Neue Logik - erst einzelne Arbeiten auswerten, dann Fallback für nicht zugeordnete
    (termine || []).forEach(termin => {
      const status = termin.status || 'geplant';
      const gesamtZeit = termin.tatsaechliche_zeit || termin.geschaetzte_zeit || 0;
      
      // Track welche Mitarbeiter Zeit von diesem Termin bekommen haben (für termin_anzahl)
      const mitarbeiterMitZeit = new Set();
      // Track wie viel Zeit bereits zugeordnet wurde
      let zugeordneteZeit = 0;
      
      // Prüfe arbeitszeiten_details für Detail-Zuordnungen
      if (termin.arbeitszeiten_details) {
        try {
          const details = JSON.parse(termin.arbeitszeiten_details);
          
          // Ermittle Fallback-Mitarbeiter (für Arbeiten ohne eigene Zuordnung)
          let fallbackMitarbeiterId = null;
          if (details._gesamt_mitarbeiter_id) {
            const gesamt = details._gesamt_mitarbeiter_id;
            if (typeof gesamt === 'object' && gesamt.type === 'mitarbeiter' && gesamt.id) {
              fallbackMitarbeiterId = gesamt.id;
            }
          }
          if (!fallbackMitarbeiterId && termin.mitarbeiter_id) {
            fallbackMitarbeiterId = termin.mitarbeiter_id;
          }
          
          // SCHRITT 1: Alle Arbeiten durchgehen und Zeit zuordnen
          for (const [arbeitName, arbeitDetails] of Object.entries(details)) {
            if (arbeitName.startsWith('_')) continue; // Überspringe Meta-Felder
            
            // Zeit dieser Arbeit ermitteln
            let arbeitZeit = 0;
            let mitarbeiterId = null;
            
            if (typeof arbeitDetails === 'object') {
              arbeitZeit = arbeitDetails.zeit || 0;
              
              // Hat diese Arbeit eine eigene Mitarbeiter-Zuordnung?
              if (arbeitDetails.type === 'mitarbeiter' && arbeitDetails.mitarbeiter_id) {
                mitarbeiterId = arbeitDetails.mitarbeiter_id;
              } else {
                // Keine eigene Zuordnung → Fallback verwenden
                mitarbeiterId = fallbackMitarbeiterId;
              }
            } else if (typeof arbeitDetails === 'number') {
              // Alte Format: nur Zeit als Zahl
              arbeitZeit = arbeitDetails;
              mitarbeiterId = fallbackMitarbeiterId;
            }
            
            // Zeit dem Mitarbeiter zuweisen
            if (mitarbeiterId && arbeitZeit > 0 && auslastungMap[mitarbeiterId]) {
              auslastungMap[mitarbeiterId].belegt_minuten += arbeitZeit;
              mitarbeiterMitZeit.add(mitarbeiterId);
              zugeordneteZeit += arbeitZeit;
              
              // Status-basierte Zeiten
              if (status === 'geplant') {
                auslastungMap[mitarbeiterId].geplant_minuten += arbeitZeit;
              } else if (status === 'in_arbeit') {
                auslastungMap[mitarbeiterId].in_arbeit_minuten += arbeitZeit;
              } else if (status === 'abgeschlossen') {
                auslastungMap[mitarbeiterId].abgeschlossen_minuten += arbeitZeit;
              }
            }
          }
          
          // SCHRITT 2: Falls keine Zeit zugeordnet wurde, verwende gesamtZeit mit Fallback
          if (zugeordneteZeit === 0 && fallbackMitarbeiterId && auslastungMap[fallbackMitarbeiterId]) {
            auslastungMap[fallbackMitarbeiterId].belegt_minuten += gesamtZeit;
            mitarbeiterMitZeit.add(fallbackMitarbeiterId);
            
            if (status === 'geplant') {
              auslastungMap[fallbackMitarbeiterId].geplant_minuten += gesamtZeit;
            } else if (status === 'in_arbeit') {
              auslastungMap[fallbackMitarbeiterId].in_arbeit_minuten += gesamtZeit;
            } else if (status === 'abgeschlossen') {
              auslastungMap[fallbackMitarbeiterId].abgeschlossen_minuten += gesamtZeit;
            }
          }
          
        } catch (e) {
          console.error('Fehler beim Parsen von arbeitszeiten_details:', e);
        }
      }
      
      // Falls keine arbeitszeiten_details vorhanden, nutze mitarbeiter_id aus Termin-Hauptfeld
      if (mitarbeiterMitZeit.size === 0 && termin.mitarbeiter_id) {
        const mitarbeiterId = termin.mitarbeiter_id;
        if (auslastungMap[mitarbeiterId]) {
          auslastungMap[mitarbeiterId].belegt_minuten += gesamtZeit;
          mitarbeiterMitZeit.add(mitarbeiterId);
          if (status === 'geplant') {
            auslastungMap[mitarbeiterId].geplant_minuten += gesamtZeit;
          } else if (status === 'in_arbeit') {
            auslastungMap[mitarbeiterId].in_arbeit_minuten += gesamtZeit;
          } else if (status === 'abgeschlossen') {
            auslastungMap[mitarbeiterId].abgeschlossen_minuten += gesamtZeit;
          }
        }
      }
      
      // Termin-Anzahl für alle beteiligten Mitarbeiter erhöhen (max 1 pro Termin)
      mitarbeiterMitZeit.forEach(mid => {
        if (auslastungMap[mid]) {
          auslastungMap[mid].termin_anzahl += 1;
        }
      });
    });
    
    // Konvertiere Map zu Array
    const result = Object.values(auslastungMap);
    return result;
  }

  static async getAuslastungMitPuffer(datum, pufferzeitMinuten) {
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
    const row = await getAsync(query, [datum]);

    const pufferzeit = pufferzeitMinuten || 15;
    const aktiveTermine = (row && row.aktive_termine) ? row.aktive_termine : 0;
    // Pufferzeit wird zwischen Terminen hinzugefügt (n-1 Pufferzeiten für n Termine)
    const pufferZeitGesamt = Math.max((aktiveTermine - 1) * pufferzeit, 0);

    const gesamtMinuten = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
    const gesamtMitPuffer = gesamtMinuten + pufferZeitGesamt;

    return {
      ...row,
      gesamt_minuten: gesamtMinuten,
      gesamt_minuten_mit_puffer: gesamtMitPuffer,
      puffer_minuten: pufferZeitGesamt,
      aktive_termine: aktiveTermine
    };
  }

  static async checkAvailability(datum, geschaetzteZeit) {
    // Diese Methode prüft die Verfügbarkeit für einen neuen Termin
    // Sie verwendet die gleiche Logik wie getAuslastung, aber berechnet
    // die Auslastung mit dem neuen Termin
    const row = await this.getAuslastung(datum);
    
    const aktuellBelegt = (row && row.gesamt_minuten) ? row.gesamt_minuten : 0;
    const neueBelegung = aktuellBelegt + (geschaetzteZeit || 0);
    
    return {
      aktuell_belegt: aktuellBelegt,
      neue_belegung: neueBelegung,
      geschaetzte_zeit: geschaetzteZeit
    };
  }

  static async getTermineByDatum(datum) {
    const query = `
      SELECT id, geschaetzte_zeit, tatsaechliche_zeit, status, datum, arbeitszeiten_details
      FROM termine
      WHERE datum = ? AND geloescht_am IS NULL
      ORDER BY erstellt_am
    `;
    return await allAsync(query, [datum]);
  }

  /**
   * Findet Termine mit Bringzeit in einem bestimmten Zeitfenster
   * Wird für die Bringzeit-Überschneidungs-Prüfung verwendet
   */
  static async getBringzeitUeberschneidungen(datum, vonZeit, bisZeit, excludeTerminId = null) {
    let query = `
      SELECT 
        t.id,
        t.termin_nr,
        t.bring_zeit,
        t.kennzeichen,
        k.name as kunde_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      WHERE t.datum = ? 
        AND t.bring_zeit IS NOT NULL 
        AND t.bring_zeit != ''
        AND t.bring_zeit >= ?
        AND t.bring_zeit <= ?
        AND t.geloescht_am IS NULL
        AND t.status != 'abgeschlossen'
    `;
    
    const params = [datum, vonZeit, bisZeit];
    
    if (excludeTerminId) {
      query += ' AND t.id != ?';
      params.push(excludeTerminId);
    }
    
    query += ' ORDER BY t.bring_zeit';
    
    return await allAsync(query, params);
  }

  /**
   * Lädt alle Bringzeiten eines Tages für die Vorschlags-Berechnung
   */
  static async getAlleBringzeitenDesTages(datum, excludeTerminId = null) {
    let query = `
      SELECT bring_zeit
      FROM termine
      WHERE datum = ? 
        AND bring_zeit IS NOT NULL 
        AND bring_zeit != ''
        AND geloescht_am IS NULL
        AND status != 'abgeschlossen'
    `;
    
    const params = [datum];
    
    if (excludeTerminId) {
      query += ' AND id != ?';
      params.push(excludeTerminId);
    }
    
    return await allAsync(query, params);
  }

  static async getAuslastungProLehrling(datum) {
    // Berechnet Auslastung pro Lehrling basierend auf arbeitszeiten_details
    // Da Lehrlinge über JSON in arbeitszeiten_details zugeordnet werden, müssen wir
    // alle Termine laden und die Details analysieren
    const query = `
      SELECT id, geschaetzte_zeit, tatsaechliche_zeit, status, arbeitszeiten_details
      FROM termine
      WHERE datum = ? AND arbeitszeiten_details IS NOT NULL AND geloescht_am IS NULL
    `;
    const termine = await allAsync(query, [datum]);

    // Lade alle aktiven Lehrlinge
    const lehrlingeQuery = `
      SELECT id, name, arbeitsstunden_pro_tag, nebenzeit_prozent, aufgabenbewaeltigung_prozent
      FROM lehrlinge
      WHERE aktiv = 1
    `;
    const lehrlinge = await allAsync(lehrlingeQuery, []);

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

    return result;
  }

  // Termin schwebend setzen/aufheben
  static async setSchwebend(id, istSchwebend) {
    const result = await runAsync(
      'UPDATE termine SET ist_schwebend = ? WHERE id = ?',
      [istSchwebend ? 1 : 0, id]
    );
    return { changes: result.changes };
  }

  // Termin aufteilen (Split)
  static async splitTermin(id, splitDaten) {
    // splitDaten: { 
    //   teil1_zeit: 60 (Minuten für ersten Tag), 
    //   teil2_datum: '2025-01-02' (Datum für Rest),
    //   teil2_zeit: 120 (Restzeit in Minuten)
    // }
    const { teil1_zeit, teil2_datum, teil2_zeit } = splitDaten;
    
    // Erst den Original-Termin laden
    const termin = await this.getById(id);
    if (!termin) throw new Error('Termin nicht gefunden');

    // Original-Termin auf Teil 1 aktualisieren
    await runAsync(
      `UPDATE termine SET geschaetzte_zeit = ?, split_teil = 1 WHERE id = ?`,
      [teil1_zeit, id]
    );

    // Generiere neue Termin-Nummer für Teil 2
    const terminNr = await this.generateTerminNr();

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

    const result = await runAsync(
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
      ]
    );
    
    return {
      teil1: { id: id, zeit: teil1_zeit },
      teil2: { id: result.lastID, termin_nr: terminNr, datum: teil2_datum, zeit: teil2_zeit }
    };
  }

  // Alle Folge-Termine eines gesplitteten Termins laden
  static async getSplitTermine(parentId) {
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
    return await allAsync(query, [parentId, parentId]);
  }

  // =====================================================
  // AUFTRAGSERWEITERUNG FUNKTIONEN
  // =====================================================

  /**
   * Erstellt einen Erweiterungs-Termin basierend auf einem bestehenden Termin
   * @param {number} originalTerminId - ID des Original-Termins
   * @param {Object} erweiterungsDaten - Daten für die Erweiterung
   * @returns {Object} Ergebnis mit Erweiterungs-Termin-ID und ggf. verschobenen Terminen
   */
  static async erweiterungErstellen(originalTerminId, erweiterungsDaten) {
    const {
      neue_arbeit,
      arbeitszeit_minuten,
      teile_status,
      erweiterung_typ,      // 'anschluss', 'morgen', 'datum'
      datum,                // Zieldatum für 'datum' und 'morgen'
      uhrzeit,              // Optionale Uhrzeit für 'datum'
      mitarbeiter_id,       // Optionaler anderer Mitarbeiter
      ist_gleicher_mitarbeiter  // true = gleicher MA, false = anderer MA
    } = erweiterungsDaten;

    // Original-Termin laden
    const originalTermin = await this.getById(originalTerminId);
    if (!originalTermin) {
      throw new Error('Original-Termin nicht gefunden');
    }

    // Neue Termin-Nummer generieren (gleiches Format wie reguläre Termine: T-YYYY-NNN)
    const terminNr = await this.generateTerminNr();

    let result;
    let verschobeneTermine = [];

    // IMMER einen separaten Erweiterungs-Termin erstellen
    const zielMitarbeiterId = mitarbeiter_id || originalTermin.mitarbeiter_id;
    
    // Berechne Startzeit und Datum für den neuen Termin
    let startZeit = uhrzeit;
    let zielDatum = datum || originalTermin.datum;
    
    if (erweiterung_typ === 'anschluss') {
      // Bei "Im Anschluss": Startzeit = Endzeit des Original-Termins, gleiches Datum
      startZeit = this.berechneEndzeit(originalTermin.bring_zeit, originalTermin.geschaetzte_zeit);
      zielDatum = originalTermin.datum;
    } else if (erweiterung_typ === 'morgen' && !uhrzeit) {
      // Bei "Morgen" ohne Uhrzeit: Standardzeit 08:00
      startZeit = '08:00';
    }

    const insertResult = await runAsync(
      `INSERT INTO termine (
        kunde_id, kunde_name, kunde_telefon, kennzeichen,
        datum, bring_zeit, geschaetzte_zeit, arbeit, umfang,
        status, mitarbeiter_id, ersatzauto,
        abholung_typ, abholung_zeit, abholung_details,
        kontakt_option, teile_status, kilometerstand,
        arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp,
        erweiterung_von_id, ist_erweiterung, erweiterung_typ, termin_nr
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        originalTermin.kunde_id,
        originalTermin.kunde_name,
        originalTermin.kunde_telefon,
        originalTermin.kennzeichen,
        zielDatum,
        startZeit || '08:00',
        arbeitszeit_minuten,
        neue_arbeit,  // Nur die neue Arbeit, ohne Prefix
        `Erweiterung zu ${originalTermin.termin_nr || '#' + originalTerminId}: ${neue_arbeit}`,
        'geplant',
        zielMitarbeiterId,
        0, // Kein Ersatzauto für Erweiterung
        originalTermin.abholung_typ,
        originalTermin.abholung_zeit,
        null,
        originalTermin.kontakt_option,
        teile_status || 'vorraetig',
        originalTermin.kilometerstand,
        null,
        originalTermin.dringlichkeit,
        originalTermin.vin,
        originalTermin.fahrzeugtyp,
        originalTerminId,  // erweiterung_von_id
        1,                 // ist_erweiterung
        erweiterung_typ,   // erweiterung_typ
        terminNr
      ]
    );

    result = {
      typ: 'neuer_termin',
      erweiterungs_termin_id: insertResult.lastID,
      termin_nr: terminNr,
      original_termin_id: originalTerminId,
      datum: zielDatum,
      arbeitszeit: arbeitszeit_minuten,
      mitarbeiter_id: zielMitarbeiterId
    };

    return {
      success: true,
      ergebnis: result,
      verschobene_termine: verschobeneTermine
    };
  }

  /**
   * Verschiebt alle Folgetermine eines Mitarbeiters nach hinten
   * @param {string} datum - Das Datum
   * @param {number} mitarbeiterId - Der Mitarbeiter
   * @param {string} abStartzeit - Ab welcher Uhrzeit verschoben werden soll
   * @param {number} verschiebungMinuten - Um wie viele Minuten verschoben werden soll
   * @returns {Array} Liste der verschobenen Termine
   */
  static async verschiebeFollgetermine(datum, mitarbeiterId, abStartzeit, verschiebungMinuten) {
    // Alle Termine des Mitarbeiters an dem Tag ab der Startzeit laden
    const folgetermine = await allAsync(
      `SELECT id, bring_zeit, geschaetzte_zeit, termin_nr, kunde_name
       FROM termine 
       WHERE datum = ? 
         AND mitarbeiter_id = ? 
         AND bring_zeit >= ?
         AND status != 'abgeschlossen'
         AND geloescht_am IS NULL
       ORDER BY bring_zeit ASC`,
      [datum, mitarbeiterId, abStartzeit]
    );

    const verschoben = [];

    for (const termin of folgetermine) {
      const alteBringzeit = termin.bring_zeit;
      const neueBringzeit = this.addMinutesToTime(alteBringzeit, verschiebungMinuten);

      await runAsync(
        `UPDATE termine SET bring_zeit = ? WHERE id = ?`,
        [neueBringzeit, termin.id]
      );

      verschoben.push({
        id: termin.id,
        termin_nr: termin.termin_nr,
        kunde_name: termin.kunde_name,
        alte_zeit: alteBringzeit,
        neue_zeit: neueBringzeit
      });
    }

    return verschoben;
  }

  /**
   * Rückt alle Folgetermine eines Mitarbeiters nach vorne (wenn ein Termin früher fertig ist)
   * @param {string} datum - Das Datum
   * @param {number} mitarbeiterId - Der Mitarbeiter
   * @param {string} abStartzeit - Ab welcher Uhrzeit nachgerückt werden soll (Endzeit des fertigen Termins)
   * @param {number} zeitersparnisMinuten - Um wie viele Minuten nach vorne gerückt werden soll
   * @returns {Array} Liste der nachgerückten Termine
   */
  static async rueckeNachfolgendeTermineVor(datum, mitarbeiterId, abStartzeit, zeitersparnisMinuten) {
    // Alle nicht-abgeschlossenen Termine des Mitarbeiters an dem Tag ab der Startzeit laden
    const folgetermine = await allAsync(
      `SELECT id, bring_zeit, geschaetzte_zeit, termin_nr, kunde_name
       FROM termine 
       WHERE datum = ? 
         AND mitarbeiter_id = ? 
         AND bring_zeit >= ?
         AND status != 'abgeschlossen'
         AND geloescht_am IS NULL
       ORDER BY bring_zeit ASC`,
      [datum, mitarbeiterId, abStartzeit]
    );

    if (folgetermine.length === 0) {
      return [];
    }

    const nachgerueckt = [];

    for (const termin of folgetermine) {
      const alteBringzeit = termin.bring_zeit;
      // Negative Minuten = nach vorne verschieben
      const neueBringzeit = this.addMinutesToTime(alteBringzeit, -zeitersparnisMinuten);

      await runAsync(
        `UPDATE termine SET bring_zeit = ? WHERE id = ?`,
        [neueBringzeit, termin.id]
      );

      nachgerueckt.push({
        id: termin.id,
        termin_nr: termin.termin_nr,
        kunde_name: termin.kunde_name,
        alte_zeit: alteBringzeit,
        neue_zeit: neueBringzeit,
        ersparnis_minuten: zeitersparnisMinuten
      });
    }

    return nachgerueckt;
  }

  /**
   * Prüft auf Konflikte wenn ein Termin verlängert wird
   * @param {number} terminId - Der zu verlängernde Termin
   * @param {number} zusaetzlicheMinuten - Zusätzliche Zeit
   * @returns {Object} Konflikt-Informationen
   */
  static async pruefeErweiterungsKonflikte(terminId, zusaetzlicheMinuten) {
    const termin = await this.getById(terminId);
    if (!termin) {
      throw new Error('Termin nicht gefunden');
    }

    const endzeitAktuell = this.berechneEndzeit(termin.bring_zeit, termin.geschaetzte_zeit);
    const endzeitNeu = this.berechneEndzeit(termin.bring_zeit, (termin.geschaetzte_zeit || 0) + zusaetzlicheMinuten);

    // Suche nach Terminen die kollidieren würden
    const konflikte = await allAsync(
      `SELECT t.id, t.termin_nr, t.bring_zeit, t.geschaetzte_zeit, 
              t.kunde_name, t.kennzeichen, m.name as mitarbeiter_name
       FROM termine t
       LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
       WHERE t.datum = ?
         AND t.mitarbeiter_id = ?
         AND t.id != ?
         AND t.bring_zeit >= ?
         AND t.bring_zeit < ?
         AND t.status != 'abgeschlossen'
         AND t.geloescht_am IS NULL
       ORDER BY t.bring_zeit ASC`,
      [termin.datum, termin.mitarbeiter_id, terminId, endzeitAktuell, endzeitNeu]
    );

    // Alle Folgetermine die verschoben werden müssten
    const folgetermine = await allAsync(
      `SELECT t.id, t.termin_nr, t.bring_zeit, t.geschaetzte_zeit,
              t.kunde_name, t.kennzeichen
       FROM termine t
       WHERE t.datum = ?
         AND t.mitarbeiter_id = ?
         AND t.id != ?
         AND t.bring_zeit >= ?
         AND t.status != 'abgeschlossen'
         AND t.geloescht_am IS NULL
       ORDER BY t.bring_zeit ASC`,
      [termin.datum, termin.mitarbeiter_id, terminId, endzeitAktuell]
    );

    return {
      hat_konflikte: konflikte.length > 0,
      direkte_konflikte: konflikte,
      folgetermine_zum_verschieben: folgetermine,
      aktuelle_endzeit: endzeitAktuell,
      neue_endzeit: endzeitNeu,
      original_termin: {
        id: termin.id,
        termin_nr: termin.termin_nr,
        bring_zeit: termin.bring_zeit,
        geschaetzte_zeit: termin.geschaetzte_zeit,
        mitarbeiter_id: termin.mitarbeiter_id,
        datum: termin.datum
      }
    };
  }

  /**
   * Findet verfügbare Mitarbeiter für einen bestimmten Zeitraum
   * @param {string} datum - Das Datum
   * @param {string} startzeit - Startzeit (HH:MM)
   * @param {number} dauerMinuten - Dauer in Minuten
   * @returns {Array} Liste verfügbarer Mitarbeiter mit freien Slots
   */
  static async findeVerfuegbareMitarbeiter(datum, startzeit, dauerMinuten) {
    const MitarbeiterModel = require('./mitarbeiterModel');
    const AbwesenheitenModel = require('./abwesenheitenModel');
    
    // Alle aktiven Mitarbeiter laden
    const alleMitarbeiter = await MitarbeiterModel.getAktive();
    
    // Abwesenheiten für das Datum laden
    const abwesenheiten = await AbwesenheitenModel.getByDateRange(datum, datum);
    const abwesendeIds = new Set(abwesenheiten.filter(a => a.mitarbeiter_id).map(a => a.mitarbeiter_id));
    
    const verfuegbare = [];
    
    for (const ma of alleMitarbeiter) {
      if (abwesendeIds.has(ma.id)) continue;
      
      // Termine des Mitarbeiters an dem Tag laden
      const termine = await allAsync(
        `SELECT bring_zeit, geschaetzte_zeit 
         FROM termine 
         WHERE datum = ? AND mitarbeiter_id = ? AND status != 'abgeschlossen' AND geloescht_am IS NULL
         ORDER BY bring_zeit ASC`,
        [datum, ma.id]
      );
      
      // Berechne belegte Zeitslots
      const belegteSlots = termine.map(t => ({
        start: t.bring_zeit,
        ende: this.berechneEndzeit(t.bring_zeit, t.geschaetzte_zeit)
      }));
      
      // Prüfe ob der gewünschte Zeitraum frei ist
      const gewuenschteEndzeit = this.berechneEndzeit(startzeit, dauerMinuten);
      const istFrei = !belegteSlots.some(slot => 
        (startzeit < slot.ende && gewuenschteEndzeit > slot.start)
      );
      
      // Finde nächsten freien Slot
      let naechsterFreierSlot = startzeit;
      const arbeitsbeginn = '08:00';
      const arbeitsende = this.berechneEndzeit(arbeitsbeginn, (ma.arbeitsstunden_pro_tag || 8) * 60);
      
      if (!istFrei) {
        // Sortiere Slots und finde Lücke
        const sortierteSlots = [...belegteSlots].sort((a, b) => a.start.localeCompare(b.start));
        
        for (let i = 0; i < sortierteSlots.length; i++) {
          const slotEnde = sortierteSlots[i].ende;
          const naechsterStart = sortierteSlots[i + 1]?.start || arbeitsende;
          
          if (slotEnde >= startzeit) {
            const luecke = this.zeitDifferenzMinuten(slotEnde, naechsterStart);
            if (luecke >= dauerMinuten) {
              naechsterFreierSlot = slotEnde;
              break;
            }
          }
        }
      }
      
      // Berechne Restkapazität
      const gesamtBelegt = termine.reduce((sum, t) => sum + (t.geschaetzte_zeit || 0), 0);
      const kapazitaet = (ma.arbeitsstunden_pro_tag || 8) * 60;
      const restkapazitaet = kapazitaet - gesamtBelegt;
      
      verfuegbare.push({
        id: ma.id,
        name: ma.name,
        ist_sofort_verfuegbar: istFrei,
        naechster_freier_slot: naechsterFreierSlot,
        restkapazitaet_minuten: restkapazitaet,
        arbeitsstunden_pro_tag: ma.arbeitsstunden_pro_tag || 8
      });
    }
    
    // Sortiere: Sofort verfügbare zuerst, dann nach Restkapazität
    return verfuegbare.sort((a, b) => {
      if (a.ist_sofort_verfuegbar !== b.ist_sofort_verfuegbar) {
        return a.ist_sofort_verfuegbar ? -1 : 1;
      }
      return b.restkapazitaet_minuten - a.restkapazitaet_minuten;
    });
  }

  /**
   * Lädt alle Erweiterungen eines Termins
   * @param {number} terminId - Original-Termin-ID
   * @returns {Array} Liste der Erweiterungs-Termine
   */
  static async getErweiterungen(terminId) {
    const query = `
      SELECT t.*,
             COALESCE(k.name, t.kunde_name) as kunde_name,
             COALESCE(k.telefon, t.kunde_telefon) as kunde_telefon,
             m.name as mitarbeiter_name
      FROM termine t
      LEFT JOIN kunden k ON t.kunde_id = k.id
      LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
      WHERE t.erweiterung_von_id = ? AND t.geloescht_am IS NULL
      ORDER BY t.datum ASC, t.bring_zeit ASC
    `;
    return await allAsync(query, [terminId]);
  }

  /**
   * Zählt Erweiterungen eines Termins
   * @param {number} terminId - Original-Termin-ID
   * @returns {number} Anzahl der Erweiterungen
   */
  static async countErweiterungen(terminId) {
    const result = await getAsync(
      `SELECT COUNT(*) as count FROM termine WHERE erweiterung_von_id = ? AND geloescht_am IS NULL`,
      [terminId]
    );
    return result ? result.count : 0;
  }

  // Hilfsfunktion: Berechnet Endzeit aus Startzeit und Dauer
  static berechneEndzeit(startzeit, dauerMinuten, pausenInfo = null) {
    if (!startzeit) return '08:00';
    const [h, m] = startzeit.split(':').map(Number);
    let gesamtMinuten = h * 60 + m + (dauerMinuten || 0);
    
    // Pausenberücksichtigung (optional)
    if (pausenInfo && pausenInfo.start && pausenInfo.dauer > 0) {
      const [pauseH, pauseM] = pausenInfo.start.split(':').map(Number);
      const pausenStart = pauseH * 60 + pauseM;
      const pausenEnde = pausenStart + pausenInfo.dauer;
      const startMinuten = h * 60 + m;
      const endMinutenOhnePause = startMinuten + (dauerMinuten || 0);
      
      // Fall 1: Arbeit beginnt vor Pause und endet nach Pause-Start
      if (startMinuten < pausenStart && endMinutenOhnePause > pausenStart) {
        gesamtMinuten += pausenInfo.dauer;
      }
      // Fall 2: Arbeit beginnt während der Pause
      else if (startMinuten >= pausenStart && startMinuten < pausenEnde) {
        const verschiebung = pausenEnde - startMinuten;
        gesamtMinuten += verschiebung;
      }
    }
    
    const endH = Math.floor(gesamtMinuten / 60);
    const endM = gesamtMinuten % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  // Hilfsfunktion: Addiert Minuten zu einer Uhrzeit
  static addMinutesToTime(zeit, minuten) {
    if (!zeit) return '08:00';
    const [h, m] = zeit.split(':').map(Number);
    const gesamtMinuten = h * 60 + m + minuten;
    const neueH = Math.floor(gesamtMinuten / 60);
    const neueM = gesamtMinuten % 60;
    return `${String(neueH).padStart(2, '0')}:${String(neueM).padStart(2, '0')}`;
  }

  // Hilfsfunktion: Differenz zwischen zwei Uhrzeiten in Minuten
  static zeitDifferenzMinuten(zeit1, zeit2) {
    const [h1, m1] = zeit1.split(':').map(Number);
    const [h2, m2] = zeit2.split(':').map(Number);
    return (h2 * 60 + m2) - (h1 * 60 + m1);
  }

  /**
   * Findet den nächsten freien Arbeitstag (überspringt Sonntage)
   * @param {string} datum - Ausgangsdatum
   * @returns {string} Nächster Arbeitstag im Format YYYY-MM-DD
   */
  static naechsterArbeitstag(datum) {
    const d = new Date(datum + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    // Wochenende (Samstag und Sonntag) überspringen
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }
}

module.exports = TermineModel;
