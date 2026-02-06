/**
 * Integrations-Tests: Termine CRUD
 * 
 * Testet das korrekte Lesen und Schreiben von Terminen in der Datenbank:
 * - Termin erstellen mit Pflichtfeldern
 * - Termin aktualisieren
 * - Soft-Delete (Papierkorb) und Wiederherstellen
 * - Termin mit Ersatzauto
 * - Termin-Status-Wechsel (geplant → in_arbeit → abgeschlossen)
 * - arbeitszeiten_details JSON-Handling
 */

const { createTestDb, closeTestDb, dbRun, dbGet, dbAll, seedMitarbeiter, seedKunden } = require('../helpers/testSetup');

describe('Termine - Datenbank CRUD-Operationen', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMitarbeiter(db);
    await seedKunden(db);
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  // =========================================================================
  // CREATE
  // =========================================================================
  describe('Erstellen', () => {
    test('Termin mit allen Pflichtfeldern erstellen', async () => {
      const result = await dbRun(db,
        `INSERT INTO termine (termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id)
         VALUES ('T-2026-001', 1, 'Test Kunde', 'AB-CD-1234', '2026-02-06', '08:00', 60, 'Ölwechsel', 'geplant', 1)`
      );
      
      expect(result.lastID).toBeGreaterThan(0);

      const termin = await dbGet(db, 'SELECT * FROM termine WHERE id = ?', [result.lastID]);
      expect(termin.termin_nr).toBe('T-2026-001');
      expect(termin.kennzeichen).toBe('AB-CD-1234');
      expect(termin.geschaetzte_zeit).toBe(60);
      expect(termin.status).toBe('geplant');
      expect(termin.geloescht_am).toBeNull();
    });

    test('Termin ohne Pflichtfeld kennzeichen schlägt fehl', async () => {
      await expect(
        dbRun(db, `INSERT INTO termine (termin_nr, datum, geschaetzte_zeit, arbeit) 
                   VALUES ('T-2026-099', '2026-02-06', 60, 'Test')`)
      ).rejects.toThrow(/NOT NULL/);
    });

    test('Doppelte termin_nr wird durch UNIQUE-Constraint abgelehnt', async () => {
      await dbRun(db, `INSERT INTO termine (termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit) 
                       VALUES ('T-2026-001', 'AB-001', '2026-02-06', 60, 'Test')`);
      
      await expect(
        dbRun(db, `INSERT INTO termine (termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit) 
                   VALUES ('T-2026-001', 'AB-002', '2026-02-06', 30, 'Test2')`)
      ).rejects.toThrow(/UNIQUE/);
    });

    test('Termin mit Ersatzauto erstellen', async () => {
      const result = await dbRun(db,
        `INSERT INTO termine (termin_nr, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, ersatzauto)
         VALUES ('T-2026-010', 'AB-001', '2026-02-06', '08:00', 120, 'Große Reparatur', 'geplant', 1)`
      );

      const termin = await dbGet(db, 'SELECT * FROM termine WHERE id = ?', [result.lastID]);
      expect(termin.ersatzauto).toBe(1);
    });

    test('Termin mit arbeitszeiten_details JSON', async () => {
      const details = {
        '_gesamt_mitarbeiter_id': { type: 'mitarbeiter', id: 1 },
        'Ölwechsel': { zeit: 30, mitarbeiter_id: 1, type: 'mitarbeiter' },
        'Filter': { zeit: 15, mitarbeiter_id: 1, type: 'mitarbeiter' }
      };

      const result = await dbRun(db,
        `INSERT INTO termine (termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, arbeitszeiten_details)
         VALUES ('T-2026-020', 'AB-001', '2026-02-06', 45, 'Ölwechsel + Filter', ?)`,
        [JSON.stringify(details)]
      );

      const termin = await dbGet(db, 'SELECT * FROM termine WHERE id = ?', [result.lastID]);
      const parsed = JSON.parse(termin.arbeitszeiten_details);
      
      expect(parsed._gesamt_mitarbeiter_id.type).toBe('mitarbeiter');
      expect(parsed._gesamt_mitarbeiter_id.id).toBe(1);
      expect(parsed['Ölwechsel'].zeit).toBe(30);
    });
  });

  // =========================================================================
  // READ
  // =========================================================================
  describe('Lesen', () => {
    beforeEach(async () => {
      await dbRun(db, `INSERT INTO termine (termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id)
        VALUES ('T-2026-001', 1, 'Test Kunde', 'AB-CD-1234', '2026-02-06', '08:00', 60, 'Ölwechsel', 'geplant', 1)`);
      await dbRun(db, `INSERT INTO termine (termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id)
        VALUES ('T-2026-002', 1, 'Test Kunde', 'AB-CD-1234', '2026-02-07', '09:00', 120, 'Bremsen', 'in_arbeit', 2)`);
      await dbRun(db, `INSERT INTO termine (termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status, geloescht_am)
        VALUES ('T-2026-003', 'DEL-001', '2026-02-06', 30, 'Gelöscht', 'geplant', '2026-02-05T10:00:00')`);
    });

    test('Alle aktiven Termine lesen (ohne gelöschte)', async () => {
      const termine = await dbAll(db,
        `SELECT * FROM termine WHERE geloescht_am IS NULL ORDER BY datum, bring_zeit`
      );

      expect(termine.length).toBe(2);
      expect(termine[0].termin_nr).toBe('T-2026-001');
      expect(termine[1].termin_nr).toBe('T-2026-002');
    });

    test('Termine nach Datum filtern', async () => {
      const termine = await dbAll(db,
        `SELECT * FROM termine WHERE datum = ? AND geloescht_am IS NULL`,
        ['2026-02-06']
      );

      expect(termine.length).toBe(1);
      expect(termine[0].arbeit).toBe('Ölwechsel');
    });

    test('Gelöschte Termine (Papierkorb) lesen', async () => {
      const papierkorb = await dbAll(db,
        `SELECT * FROM termine WHERE geloescht_am IS NOT NULL`
      );

      expect(papierkorb.length).toBe(1);
      expect(papierkorb[0].termin_nr).toBe('T-2026-003');
      expect(papierkorb[0].geloescht_am).toBeTruthy();
    });

    test('Termin mit JOIN auf Kunden und Mitarbeiter', async () => {
      const termin = await dbGet(db,
        `SELECT t.*, 
                COALESCE(k.name, t.kunde_name) as kunde_display_name,
                m.name as mitarbeiter_name
         FROM termine t
         LEFT JOIN kunden k ON t.kunde_id = k.id
         LEFT JOIN mitarbeiter m ON t.mitarbeiter_id = m.id
         WHERE t.id = 1`
      );

      expect(termin.kunde_display_name).toBe('Test Kunde');
      expect(termin.mitarbeiter_name).toBe('Max Mustermann');
    });
  });

  // =========================================================================
  // UPDATE
  // =========================================================================
  describe('Aktualisieren', () => {
    beforeEach(async () => {
      await dbRun(db, `INSERT INTO termine (id, termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status, mitarbeiter_id)
        VALUES (1, 'T-2026-001', 'AB-001', '2026-02-06', 60, 'Ölwechsel', 'geplant', 1)`);
    });

    test('Status von geplant → in_arbeit', async () => {
      await dbRun(db, `UPDATE termine SET status = 'in_arbeit' WHERE id = 1`);
      
      const termin = await dbGet(db, 'SELECT status FROM termine WHERE id = 1');
      expect(termin.status).toBe('in_arbeit');
    });

    test('Status von in_arbeit → abgeschlossen', async () => {
      await dbRun(db, `UPDATE termine SET status = 'in_arbeit' WHERE id = 1`);
      await dbRun(db, `UPDATE termine SET status = 'abgeschlossen' WHERE id = 1`);
      
      const termin = await dbGet(db, 'SELECT status FROM termine WHERE id = 1');
      expect(termin.status).toBe('abgeschlossen');
    });

    test('Arbeit und geschaetzte_zeit aktualisieren', async () => {
      await dbRun(db,
        `UPDATE termine SET arbeit = 'Ölwechsel + Bremsen', geschaetzte_zeit = 120 WHERE id = 1`
      );

      const termin = await dbGet(db, 'SELECT arbeit, geschaetzte_zeit FROM termine WHERE id = 1');
      expect(termin.arbeit).toBe('Ölwechsel + Bremsen');
      expect(termin.geschaetzte_zeit).toBe(120);
    });

    test('Mitarbeiter-Zuweisung ändern', async () => {
      await dbRun(db, `UPDATE termine SET mitarbeiter_id = 2 WHERE id = 1`);
      
      const termin = await dbGet(db, 'SELECT mitarbeiter_id FROM termine WHERE id = 1');
      expect(termin.mitarbeiter_id).toBe(2);
    });
  });

  // =========================================================================
  // SOFT-DELETE & RESTORE
  // =========================================================================
  describe('Soft-Delete & Wiederherstellen', () => {
    beforeEach(async () => {
      await dbRun(db, `INSERT INTO termine (id, termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status)
        VALUES (1, 'T-2026-001', 'AB-001', '2026-02-06', 60, 'Test', 'geplant')`);
    });

    test('Soft-Delete setzt geloescht_am Timestamp', async () => {
      const jetzt = new Date().toISOString();
      await dbRun(db, `UPDATE termine SET geloescht_am = ? WHERE id = 1`, [jetzt]);

      const termin = await dbGet(db, 'SELECT * FROM termine WHERE id = 1');
      expect(termin.geloescht_am).toBeTruthy();
      
      // Sollte nicht in aktiven Terminen erscheinen
      const aktive = await dbAll(db, `SELECT * FROM termine WHERE geloescht_am IS NULL`);
      expect(aktive.length).toBe(0);
    });

    test('Wiederherstellen setzt geloescht_am auf NULL', async () => {
      await dbRun(db, `UPDATE termine SET geloescht_am = '2026-02-05T10:00:00' WHERE id = 1`);
      await dbRun(db, `UPDATE termine SET geloescht_am = NULL WHERE id = 1`);

      const termin = await dbGet(db, 'SELECT * FROM termine WHERE id = 1');
      expect(termin.geloescht_am).toBeNull();

      const aktive = await dbAll(db, `SELECT * FROM termine WHERE geloescht_am IS NULL`);
      expect(aktive.length).toBe(1);
    });
  });

  // =========================================================================
  // ERWEITERUNGEN
  // =========================================================================
  describe('Termin-Erweiterungen', () => {
    beforeEach(async () => {
      await dbRun(db, `INSERT INTO termine (id, termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id)
        VALUES (1, 'T-2026-001', 1, 'Test Kunde', 'AB-001', '2026-02-06', '08:00', 60, 'Ölwechsel', 'in_arbeit', 1)`);
    });

    test('Erweiterung erstellen mit Referenz zum Original', async () => {
      const result = await dbRun(db,
        `INSERT INTO termine (termin_nr, kunde_id, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id, erweiterung_von_id, ist_erweiterung, erweiterung_typ)
         VALUES ('T-2026-002', 1, 'Test Kunde', 'AB-001', '2026-02-06', '09:00', 30, 'Filter tauschen', 'geplant', 1, 1, 1, 'anschluss')`
      );

      const erw = await dbGet(db, 'SELECT * FROM termine WHERE id = ?', [result.lastID]);
      expect(erw.erweiterung_von_id).toBe(1);
      expect(erw.ist_erweiterung).toBe(1);
      expect(erw.erweiterung_typ).toBe('anschluss');
    });

    test('Erweiterungen eines Termins abfragen', async () => {
      await dbRun(db, `INSERT INTO termine (termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, erweiterung_von_id, ist_erweiterung, erweiterung_typ)
        VALUES ('T-2026-002', 'AB-001', '2026-02-06', 30, 'Erweiterung 1', 1, 1, 'anschluss')`);
      await dbRun(db, `INSERT INTO termine (termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, erweiterung_von_id, ist_erweiterung, erweiterung_typ)
        VALUES ('T-2026-003', 'AB-001', '2026-02-07', 45, 'Erweiterung 2', 1, 1, 'morgen')`);

      const erweiterungen = await dbAll(db,
        `SELECT * FROM termine WHERE erweiterung_von_id = ? AND geloescht_am IS NULL`,
        [1]
      );

      expect(erweiterungen.length).toBe(2);
      expect(erweiterungen[0].erweiterung_typ).toBe('anschluss');
      expect(erweiterungen[1].erweiterung_typ).toBe('morgen');
    });
  });

  // =========================================================================
  // KUNDEN-LÖSCHUNG & VERWAISTE TERMINE
  // =========================================================================
  describe('Kunden-Löschung und Termine', () => {
    test('Nach Kunden-Löschung bleiben Termine mit toter kunde_id', async () => {
      await dbRun(db, `INSERT INTO termine (termin_nr, kunde_id, kunde_name, kennzeichen, datum, geschaetzte_zeit, arbeit, status)
        VALUES ('T-2026-050', 1, 'Test Kunde', 'AB-001', '2026-02-06', 60, 'Test', 'geplant')`);

      // Lösche Kunden
      await dbRun(db, `DELETE FROM kunden WHERE id = 1`);

      // Termin existiert noch mit kunde_id = 1
      const termin = await dbGet(db, 'SELECT * FROM termine WHERE termin_nr = ?', ['T-2026-050']);
      expect(termin.kunde_id).toBe(1);

      // Aber JOIN liefert NULL für Kundenname
      const mitJoin = await dbGet(db,
        `SELECT t.*, k.name as kunde_db_name 
         FROM termine t LEFT JOIN kunden k ON t.kunde_id = k.id 
         WHERE t.termin_nr = 'T-2026-050'`
      );
      expect(mitJoin.kunde_db_name).toBeNull();
      
      // Fallback: kunde_name aus Termin selbst (COALESCE)
      expect(mitJoin.kunde_name).toBe('Test Kunde');
      
      console.log('  → WARNUNG: Kein ON DELETE CASCADE - verwaiste Termine möglich');
    });
  });
});
