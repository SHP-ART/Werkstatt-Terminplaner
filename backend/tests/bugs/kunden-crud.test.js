/**
 * Integrations-Tests: Kunden CRUD & Fahrzeuge
 * 
 * Testet das korrekte Lesen und Schreiben von Kunden/Fahrzeugen:
 * - Kunde erstellen/lesen/aktualisieren/löschen
 * - Fahrzeug einem Kunden zuordnen
 * - Duplikat-Erkennung
 */

const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('../helpers/testSetup');

describe('Kunden - Datenbank CRUD-Operationen', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  // =========================================================================
  // CREATE
  // =========================================================================
  describe('Erstellen', () => {
    test('Kunde mit vollständigen Daten anlegen', async () => {
      const result = await dbRun(db,
        `INSERT INTO kunden (name, telefon, email, adresse)
         VALUES ('Max Mustermann', '0123456789', 'max@test.de', 'Teststraße 1')`
      );
      
      expect(result.lastID).toBeGreaterThan(0);

      const kunde = await dbGet(db, 'SELECT * FROM kunden WHERE id = ?', [result.lastID]);
      expect(kunde.name).toBe('Max Mustermann');
      expect(kunde.telefon).toBe('0123456789');
      expect(kunde.email).toBe('max@test.de');
      expect(kunde.erstellt_am).toBeTruthy();
    });

    test('Kunde nur mit Name (Minimum)', async () => {
      const result = await dbRun(db, `INSERT INTO kunden (name) VALUES ('Minimal Kunde')`);
      
      const kunde = await dbGet(db, 'SELECT * FROM kunden WHERE id = ?', [result.lastID]);
      expect(kunde.name).toBe('Minimal Kunde');
      expect(kunde.telefon).toBeNull();
      expect(kunde.email).toBeNull();
    });

    test('Kunde ohne Name schlägt fehl (NOT NULL)', async () => {
      await expect(
        dbRun(db, `INSERT INTO kunden (telefon) VALUES ('0123456789')`)
      ).rejects.toThrow(/NOT NULL/);
    });
  });

  // =========================================================================
  // READ
  // =========================================================================
  describe('Lesen', () => {
    beforeEach(async () => {
      await dbRun(db, `INSERT INTO kunden (name, telefon) VALUES ('Kunde A', '111')`);
      await dbRun(db, `INSERT INTO kunden (name, telefon) VALUES ('Kunde B', '222')`);
      await dbRun(db, `INSERT INTO kunden (name, telefon, locosoft_id) VALUES ('Firma Kunde', '333', 'LS-001')`);
    });

    test('Alle Kunden lesen', async () => {
      const kunden = await dbAll(db, 'SELECT * FROM kunden ORDER BY name');
      expect(kunden.length).toBe(3);
    });

    test('Kunde nach ID suchen', async () => {
      const kunde = await dbGet(db, 'SELECT * FROM kunden WHERE id = 1');
      expect(kunde.name).toBe('Kunde A');
    });

    test('Kunden durchsuchen (LIKE)', async () => {
      const results = await dbAll(db,
        `SELECT * FROM kunden WHERE name LIKE ? OR locosoft_id LIKE ?`,
        ['%Firma%', '%LS%']
      );
      expect(results.length).toBe(1);
      expect(results[0].locosoft_id).toBe('LS-001');
    });
  });

  // =========================================================================
  // UPDATE
  // =========================================================================
  describe('Aktualisieren', () => {
    beforeEach(async () => {
      await dbRun(db, `INSERT INTO kunden (id, name, telefon) VALUES (1, 'Alt Name', '000')`);
    });

    test('Name und Telefon ändern', async () => {
      await dbRun(db, `UPDATE kunden SET name = 'Neuer Name', telefon = '999' WHERE id = 1`);
      
      const kunde = await dbGet(db, 'SELECT * FROM kunden WHERE id = 1');
      expect(kunde.name).toBe('Neuer Name');
      expect(kunde.telefon).toBe('999');
    });

    test('Aktualisierung ändert erstellt_am NICHT', async () => {
      const vorher = await dbGet(db, 'SELECT erstellt_am FROM kunden WHERE id = 1');
      
      // Kurz warten
      await new Promise(r => setTimeout(r, 100));
      
      await dbRun(db, `UPDATE kunden SET name = 'Update' WHERE id = 1`);
      const nachher = await dbGet(db, 'SELECT erstellt_am FROM kunden WHERE id = 1');
      
      // erstellt_am ändert sich nicht bei Updates
      expect(vorher.erstellt_am).toBe(nachher.erstellt_am);
    });
  });

  // =========================================================================
  // DELETE
  // =========================================================================
  describe('Löschen', () => {
    test('Kunde wird HARD-gelöscht (kein Soft-Delete)', async () => {
      await dbRun(db, `INSERT INTO kunden (id, name) VALUES (1, 'Lösch Mich')`);
      await dbRun(db, `DELETE FROM kunden WHERE id = 1`);

      const kunde = await dbGet(db, 'SELECT * FROM kunden WHERE id = 1');
      expect(kunde).toBeUndefined();
    });

    test('Löschung von nicht-existierendem Kunden gibt changes=0', async () => {
      const result = await dbRun(db, `DELETE FROM kunden WHERE id = 99999`);
      expect(result.changes).toBe(0);
    });
  });

  // =========================================================================
  // FAHRZEUGE
  // =========================================================================
  describe('Fahrzeuge', () => {
    beforeEach(async () => {
      await dbRun(db, `INSERT INTO kunden (id, name) VALUES (1, 'Auto Besitzer')`);
    });

    test('Fahrzeug einem Kunden zuordnen', async () => {
      const result = await dbRun(db,
        `INSERT INTO fahrzeuge (kunde_id, kennzeichen, hersteller, modell, baujahr)
         VALUES (1, 'AB-CD-1234', 'VW', 'Golf', 2020)`
      );

      const fz = await dbGet(db, 'SELECT * FROM fahrzeuge WHERE id = ?', [result.lastID]);
      expect(fz.kunde_id).toBe(1);
      expect(fz.kennzeichen).toBe('AB-CD-1234');
      expect(fz.hersteller).toBe('VW');
    });

    test('Mehrere Fahrzeuge pro Kunde', async () => {
      await dbRun(db, `INSERT INTO fahrzeuge (kunde_id, kennzeichen, hersteller) VALUES (1, 'AB-001', 'VW')`);
      await dbRun(db, `INSERT INTO fahrzeuge (kunde_id, kennzeichen, hersteller) VALUES (1, 'AB-002', 'BMW')`);

      const fahrzeuge = await dbAll(db, 'SELECT * FROM fahrzeuge WHERE kunde_id = 1');
      expect(fahrzeuge.length).toBe(2);
    });

    test('Fahrzeuge nach Kunden-Löschung verwaist', async () => {
      await dbRun(db, `INSERT INTO fahrzeuge (kunde_id, kennzeichen) VALUES (1, 'AB-001')`);
      await dbRun(db, `DELETE FROM kunden WHERE id = 1`);

      // Fahrzeug existiert noch (kein CASCADE)
      const fz = await dbAll(db, 'SELECT * FROM fahrzeuge WHERE kunde_id = 1');
      expect(fz.length).toBe(1);
      
      // Aber Kunde existiert nicht mehr
      const kunde = await dbGet(db, 'SELECT * FROM kunden WHERE id = 1');
      expect(kunde).toBeUndefined();
      
      console.log('  → WARNUNG: Fahrzeuge werden nicht mit Kunde gelöscht (kein ON DELETE CASCADE)');
    });
  });
});
