const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
const { withTransaction } = require('../utils/transaction');

class KundenModel {
  static async getAll() {
    return await allAsync('SELECT * FROM kunden ORDER BY name', []);
  }

  static async create(kunde) {
    const { name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp } = kunde;
    return await runAsync(
      'INSERT INTO kunden (name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, telefon, email, adresse, locosoft_id, kennzeichen || null, vin || null, fahrzeugtyp || null]
    );
  }

  static async importMultiple(kunden) {
    // Verwende withTransaction für atomare Operationen
    return await withTransaction(async () => {
      let imported = 0;
      let skipped = 0;
      let fahrzeugeHinzugefuegt = 0;
      const errors = [];

      // Prüfe auf existierende Kunden (mit ID für Fahrzeug-Zuordnung)
      const existingKunden = await allAsync('SELECT id, name, kennzeichen FROM kunden', []);

      // Map für schnellen Zugriff: name (lowercase) -> kunde
      const kundenByName = new Map();
      existingKunden.forEach(k => {
        if (k.name) {
          kundenByName.set(k.name.toLowerCase(), k);
        }
      });

      // Set für bereits verwendete Kennzeichen (aus Kunden und Terminen)
      const existingKz = await allAsync(
        'SELECT DISTINCT UPPER(REPLACE(REPLACE(kennzeichen, \' \', \'\'), \'-\', \'\')) as kz_norm FROM kunden WHERE kennzeichen IS NOT NULL UNION SELECT DISTINCT UPPER(REPLACE(REPLACE(kennzeichen, \' \', \'\'), \'-\', \'\')) as kz_norm FROM termine WHERE kennzeichen IS NOT NULL',
        []
      );

      const existingKennzeichen = new Set(existingKz.map(k => k.kz_norm).filter(k => k));
      
      // Map für neue Kunden während des Imports (um mehrere Fahrzeuge zu sammeln)
      const neueKundenMap = new Map(); // name (lowercase) -> {kunde, fahrzeuge: []}

      // Erster Durchlauf: Kunden gruppieren
      for (let index = 0; index < kunden.length; index++) {
        const kunde = kunden[index];
        
        if (!kunde.name) {
          errors.push(`Zeile ${index + 1}: Kein Name angegeben`);
          continue;
        }

        const nameLower = kunde.name.toLowerCase().trim();
        const kennzeichenNorm = kunde.kennzeichen ? kunde.kennzeichen.toUpperCase().replace(/[\s\-]/g, '') : null;

        // Prüfe ob Kennzeichen bereits existiert
        if (kennzeichenNorm && existingKennzeichen.has(kennzeichenNorm)) {
          skipped++;
          errors.push(`Zeile ${index + 1}: Kennzeichen "${kunde.kennzeichen}" existiert bereits`);
          continue;
        }

        // Kunde existiert bereits in der Datenbank?
        const existingKunde = kundenByName.get(nameLower);
        if (existingKunde) {
          // Zusätzliches Fahrzeug für bestehenden Kunden
          if (kunde.kennzeichen && kennzeichenNorm) {
            // Erstelle einen Dummy-Termin um das Fahrzeug zu speichern
            const heute = new Date().toISOString().split('T')[0];
            try {
              await runAsync(
                'INSERT INTO termine (kunde_id, kennzeichen, fahrzeugtyp, vin, arbeit, geschaetzte_zeit, datum, status, umfang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                  existingKunde.id,
                  kunde.kennzeichen,
                  kunde.fahrzeugtyp || null,
                  kunde.vin || null,
                  'Fahrzeug aus Import',
                  0,
                  heute,
                  'abgeschlossen',
                  'klein'
                ]
              );
              fahrzeugeHinzugefuegt++;
              existingKennzeichen.add(kennzeichenNorm);
            } catch (err) {
              errors.push(`Zeile ${index + 1}: Fahrzeug konnte nicht hinzugefügt werden: ${err.message}`);
            }
          } else {
            skipped++;
            errors.push(`Zeile ${index + 1}: Kunde "${kunde.name}" existiert bereits (ohne neues Kennzeichen)`);
          }
          continue;
        }

        // Neuer Kunde - prüfe ob im aktuellen Import bereits vorhanden
        if (neueKundenMap.has(nameLower)) {
          // Zusätzliches Fahrzeug für neuen Kunden im gleichen Import
          if (kunde.kennzeichen && kennzeichenNorm) {
            neueKundenMap.get(nameLower).fahrzeuge.push({
              kennzeichen: kunde.kennzeichen,
              fahrzeugtyp: kunde.fahrzeugtyp,
              vin: kunde.vin
            });
            existingKennzeichen.add(kennzeichenNorm);
          }
        } else {
          // Komplett neuer Kunde
          neueKundenMap.set(nameLower, {
            kunde: kunde,
            fahrzeuge: kunde.kennzeichen ? [{
              kennzeichen: kunde.kennzeichen,
              fahrzeugtyp: kunde.fahrzeugtyp,
              vin: kunde.vin
            }] : []
          });
          if (kennzeichenNorm) {
            existingKennzeichen.add(kennzeichenNorm);
          }
        }
      }

      // Zweiter Durchlauf: Neue Kunden einfügen
      const neueKundenArray = Array.from(neueKundenMap.values());

      for (const entry of neueKundenArray) {
        const kunde = entry.kunde;
        const fahrzeuge = entry.fahrzeuge;
        
        // Erstes Kennzeichen wird im Kundenstamm gespeichert
        const erstesKennzeichen = fahrzeuge.length > 0 ? fahrzeuge[0].kennzeichen : null;
        const ersterFahrzeugtyp = fahrzeuge.length > 0 ? fahrzeuge[0].fahrzeugtyp : null;
        const ersteVin = fahrzeuge.length > 0 ? fahrzeuge[0].vin : null;

        try {
          const result = await runAsync(
            'INSERT INTO kunden (name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              kunde.name, 
              kunde.telefon, 
              kunde.email, 
              kunde.adresse, 
              kunde.locosoft_id, 
              erstesKennzeichen,
              ersteVin,
              ersterFahrzeugtyp
            ]
          );
          
          imported++;
          const neueKundeId = result.lastID;
          
          // Zusätzliche Fahrzeuge als Termine einfügen (ab dem 2. Fahrzeug)
          if (fahrzeuge.length > 1) {
            const heute = new Date().toISOString().split('T')[0];
            for (const fz of fahrzeuge.slice(1)) {
              try {
                await runAsync(
                  'INSERT INTO termine (kunde_id, kennzeichen, fahrzeugtyp, vin, arbeit, geschaetzte_zeit, datum, status, umfang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [
                    neueKundeId,
                    fz.kennzeichen,
                    fz.fahrzeugtyp || null,
                    fz.vin || null,
                    'Fahrzeug aus Import',
                    0,
                    heute,
                    'abgeschlossen',
                    'klein'
                  ]
                );
                fahrzeugeHinzugefuegt++;
              } catch (err) {
                // Fehler bei Zusatzfahrzeug - wirft Fehler und löst Rollback aus
                throw new Error(`Zusatzfahrzeug für "${kunde.name}": ${err.message}`);
              }
            }
          }
        } catch (err) {
          // Bei Fehler: Transaction wird automatisch zurückgerollt
          throw new Error(`Kunde "${kunde.name}": ${err.message}`);
        }
      }

      return { imported, skipped, fahrzeugeHinzugefuegt, errors };
    });
  }

  static async getById(id) {
    return await getAsync('SELECT * FROM kunden WHERE id = ?', [id]);
  }

  static async update(id, kunde) {
    const { name, telefon, email, adresse, locosoft_id, kennzeichen, vin, fahrzeugtyp } = kunde;
    const result = await runAsync(
      'UPDATE kunden SET name = ?, telefon = ?, email = ?, adresse = ?, locosoft_id = ?, kennzeichen = ?, vin = ?, fahrzeugtyp = ? WHERE id = ?',
      [name, telefon, email, adresse, locosoft_id, kennzeichen || null, vin || null, fahrzeugtyp || null, id]
    );
    return { changes: result.changes };
  }

  static async delete(id) {
    const result = await runAsync('DELETE FROM kunden WHERE id = ?', [id]);
    return { changes: result.changes };
  }

  static async searchWithTermine(searchTerm) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }

    // Normalisiere Suchbegriff: Entferne Leerzeichen und Bindestriche
    const normalizedSearch = searchTerm.trim().replace(/[\s\-]/g, '');
    const searchPattern = `%${searchTerm.trim()}%`;
    const normalizedPattern = `%${normalizedSearch}%`;
    
    // Suche Kunden nach Name oder Kennzeichen (über Termine)
    // Verwende DISTINCT um Duplikate zu vermeiden
    // Für Kennzeichen: normalisiere auch die DB-Werte (entferne Leerzeichen und Bindestriche)
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
      WHERE k.name LIKE ? 
         OR REPLACE(REPLACE(UPPER(t.kennzeichen), ' ', ''), '-', '') LIKE UPPER(?)
         OR REPLACE(REPLACE(UPPER(k.kennzeichen), ' ', ''), '-', '') LIKE UPPER(?)
      ORDER BY k.name
    `;

    const kunden = await allAsync(query, [searchPattern, normalizedPattern, normalizedPattern]);

    if (kunden.length === 0) {
      return [];
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

    const termine = await allAsync(termineQuery, kundenIds);

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

    return result;
  }

  // Alle Fahrzeuge (Kennzeichen) eines Kunden aus Terminen holen
  static async getFahrzeuge(kundeId) {
    const query = `
      SELECT DISTINCT 
        t.kennzeichen,
        t.fahrzeugtyp,
        t.vin,
        MAX(t.datum) as letzter_termin,
        MAX(t.kilometerstand) as letzter_km_stand
      FROM termine t
      WHERE t.kunde_id = ? AND t.kennzeichen IS NOT NULL AND t.kennzeichen != ''
      GROUP BY UPPER(REPLACE(REPLACE(t.kennzeichen, ' ', ''), '-', ''))
      ORDER BY MAX(t.datum) DESC
    `;
    
    const fahrzeuge = await allAsync(query, [kundeId]);
    
    // Hole auch das Kennzeichen aus dem Kundenstamm
    const kunde = await getAsync('SELECT kennzeichen, fahrzeugtyp, vin FROM kunden WHERE id = ?', [kundeId]);
    
    // Kombiniere beide Quellen
    const alleKennzeichen = new Map();
    
    // Aus Terminen
    fahrzeuge.forEach(fz => {
      const kzNorm = (fz.kennzeichen || '').toUpperCase().replace(/[\s\-]/g, '');
      if (kzNorm && !alleKennzeichen.has(kzNorm)) {
        alleKennzeichen.set(kzNorm, {
          kennzeichen: fz.kennzeichen,
          fahrzeugtyp: fz.fahrzeugtyp || '',
          vin: fz.vin || '',
          letzter_termin: fz.letzter_termin,
          letzter_km_stand: fz.letzter_km_stand,
          quelle: 'termin'
        });
      }
    });
    
    // Aus Kundenstamm (falls nicht schon vorhanden)
    if (kunde && kunde.kennzeichen) {
      const kzNorm = kunde.kennzeichen.toUpperCase().replace(/[\s\-]/g, '');
      if (!alleKennzeichen.has(kzNorm)) {
        alleKennzeichen.set(kzNorm, {
          kennzeichen: kunde.kennzeichen,
          fahrzeugtyp: kunde.fahrzeugtyp || '',
          vin: kunde.vin || '',
          letzter_termin: null,
          letzter_km_stand: null,
          quelle: 'kundenstamm'
        });
      }
    }
    
    return Array.from(alleKennzeichen.values());
  }

  // Fahrzeug zu einem Kunden hinzufügen (als Dummy-Termin)
  static async addFahrzeug(kundeId, fahrzeug) {
    const { kennzeichen, fahrzeugtyp, vin } = fahrzeug;
    
    if (!kennzeichen) {
      throw new Error('Kennzeichen ist erforderlich');
    }
    
    // Prüfe ob Kennzeichen bereits existiert
    const kzNorm = kennzeichen.toUpperCase().replace(/[\s\-]/g, '');
    
    const existing = await getAsync(
      `SELECT id FROM termine WHERE kunde_id = ? AND UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', '')) = ?`,
      [kundeId, kzNorm]
    );
    
    if (existing) {
      throw new Error('Dieses Kennzeichen existiert bereits für diesen Kunden');
    }
    
    // Prüfe auch im Kundenstamm
    const kundeWithKz = await getAsync(
      `SELECT id FROM kunden WHERE id = ? AND UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', '')) = ?`,
      [kundeId, kzNorm]
    );
    
    if (kundeWithKz) {
      throw new Error('Dieses Kennzeichen ist bereits als Hauptkennzeichen gespeichert');
    }
    
    // Füge als Dummy-Termin ein
    const heute = new Date().toISOString().split('T')[0];
    const result = await runAsync(
      `INSERT INTO termine (kunde_id, kennzeichen, fahrzeugtyp, vin, arbeit, geschaetzte_zeit, datum, status, umfang) 
       VALUES (?, ?, ?, ?, 'Fahrzeug hinzugefügt', 0, ?, 'abgeschlossen', 'klein')`,
      [kundeId, kennzeichen, fahrzeugtyp || null, vin || null, heute]
    );
    return { id: result.lastID, message: 'Fahrzeug erfolgreich hinzugefügt' };
  }

  // Fahrzeug eines Kunden löschen
  static async deleteFahrzeug(kundeId, kennzeichen) {
    const kzNorm = kennzeichen.toUpperCase().replace(/[\s\-]/g, '');
    
    // Prüfe ob es das Hauptkennzeichen im Kundenstamm ist
    const kundeKz = await getAsync(
      `SELECT kennzeichen FROM kunden WHERE id = ? AND UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', '')) = ?`,
      [kundeId, kzNorm]
    );
    
    if (kundeKz) {
      // Lösche aus Kundenstamm
      const result = await runAsync(
        `UPDATE kunden SET kennzeichen = NULL, fahrzeugtyp = NULL, vin = NULL WHERE id = ?`,
        [kundeId]
      );
      return { changes: result.changes, message: 'Hauptfahrzeug aus Kundenstamm entfernt' };
    } else {
      // Lösche alle Termine mit diesem Kennzeichen für diesen Kunden
      const result = await runAsync(
        `DELETE FROM termine WHERE kunde_id = ? AND UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', '')) = ?`,
        [kundeId, kzNorm]
      );
      return { changes: result.changes, message: 'Fahrzeug und zugehörige Termine gelöscht' };
    }
  }

  // Fahrzeugdaten aktualisieren
  static async updateFahrzeug(kundeId, altesKennzeichen, neuesDaten) {
    const altKzNorm = altesKennzeichen.toUpperCase().replace(/[\s\-]/g, '');
    const { kennzeichen, fahrzeugtyp, vin } = neuesDaten;
    
    // Prüfe ob es im Kundenstamm ist
    const kundeKz = await getAsync(
      `SELECT id FROM kunden WHERE id = ? AND UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', '')) = ?`,
      [kundeId, altKzNorm]
    );
    
    if (kundeKz) {
      // Update im Kundenstamm
      const result = await runAsync(
        `UPDATE kunden SET kennzeichen = ?, fahrzeugtyp = ?, vin = ? WHERE id = ?`,
        [kennzeichen, fahrzeugtyp || null, vin || null, kundeId]
      );
      return { changes: result.changes, message: 'Hauptfahrzeug aktualisiert' };
    } else {
      // Update in allen Terminen mit diesem Kennzeichen
      const result = await runAsync(
        `UPDATE termine SET kennzeichen = ?, fahrzeugtyp = ?, vin = ? 
         WHERE kunde_id = ? AND UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', '')) = ?`,
        [kennzeichen, fahrzeugtyp || null, vin || null, kundeId, altKzNorm]
      );
      return { changes: result.changes, message: 'Fahrzeug in Terminen aktualisiert' };
    }
  }

  // Zähle alle eindeutigen Fahrzeuge (Kennzeichen) in der Datenbank
  static async countAlleFahrzeuge() {
    const query = `
      SELECT COUNT(DISTINCT UPPER(REPLACE(REPLACE(kennzeichen, ' ', ''), '-', ''))) as anzahl
      FROM (
        SELECT kennzeichen FROM termine 
        WHERE kennzeichen IS NOT NULL AND kennzeichen != '' AND geloescht_am IS NULL
        UNION
        SELECT kennzeichen FROM kunden 
        WHERE kennzeichen IS NOT NULL AND kennzeichen != ''
      )
    `;
    const row = await getAsync(query, []);
    return row ? row.anzahl : 0;
  }
}

module.exports = KundenModel;
