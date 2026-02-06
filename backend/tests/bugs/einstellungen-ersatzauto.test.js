/**
 * Bug-Test: EinstellungenModel.getErsatzautoVerfuegbarkeit
 * 
 * BUG: Spaltenname 'geloescht = 0' in der Query ist falsch.
 *      Die Termine-Tabelle verwendet 'geloescht_am' (Timestamp/NULL),
 *      nicht 'geloescht' (Boolean 0/1).
 * 
 * AUSWIRKUNG: Die Query gibt falsche Ergebnisse zurück oder wirft einen
 *             stillen SQL-Fehler, weil SQLite unbekannte Spalten als NULL behandelt.
 * 
 * FIX: 'geloescht = 0' → 'geloescht_am IS NULL'
 */

const { createTestDb, closeTestDb, dbRun, dbGet } = require('../helpers/testSetup');

describe('BUG: EinstellungenModel - Ersatzauto-Verfügbarkeit', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('Query mit geloescht_am IS NULL findet aktive Termine korrekt', async () => {
    // Seed: Werkstatt-Einstellungen mit 3 Ersatzautos
    await dbRun(db, `UPDATE werkstatt_einstellungen SET ersatzauto_anzahl = 3 WHERE id = 1`);

    // Seed: 2 aktive Termine mit Ersatzauto am gleichen Tag
    const datum = '2026-02-06';
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, ersatzauto, geloescht_am)
      VALUES ('T-2026-001', 'Kunde A', 'AB-CD-1234', ?, '08:00', 60, 'Ölwechsel', 'geplant', 1, NULL)`, [datum]);
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, ersatzauto, geloescht_am)
      VALUES ('T-2026-002', 'Kunde B', 'EF-GH-5678', ?, '09:00', 90, 'Bremsen', 'geplant', 1, NULL)`, [datum]);

    // Seed: 1 gelöschter Termin mit Ersatzauto (sollte NICHT gezählt werden)
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, ersatzauto, geloescht_am)
      VALUES ('T-2026-003', 'Kunde C', 'IJ-KL-9012', ?, '10:00', 45, 'TÜV', 'geplant', 1, '2026-02-05T10:00:00')`, [datum]);

    // Seed: 1 stornierter Termin mit Ersatzauto (sollte NICHT gezählt werden)
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, ersatzauto, geloescht_am)
      VALUES ('T-2026-004', 'Kunde D', 'MN-OP-3456', ?, '11:00', 30, 'Service', 'storniert', 1, NULL)`, [datum]);

    // KORREKTE Query (so wie sie sein SOLLTE):
    const korrektResult = await dbGet(db,
      `SELECT COUNT(*) as vergeben FROM termine 
       WHERE datum = ? AND ersatzauto = 1 AND status != 'storniert' AND geloescht_am IS NULL`,
      [datum]
    );
    expect(korrektResult.vergeben).toBe(2); // Nur Kunde A und B

    // FEHLERHAFTE Query (aktueller Zustand im Code):
    // Die Spalte 'geloescht' existiert nicht in der termine-Tabelle.
    // SQLite wirft SQLITE_ERROR: no such column: geloescht
    let fehlerhaftError = null;
    try {
      await dbGet(db,
        `SELECT COUNT(*) as vergeben FROM termine 
         WHERE datum = ? AND ersatzauto = 1 AND status != 'storniert' AND geloescht = 0`,
        [datum]
      );
    } catch (err) {
      fehlerhaftError = err;
    }

    console.log(`  → Korrekte Query: ${korrektResult.vergeben} Ersatzautos vergeben`);
    console.log(`  → Fehlerhafte Query (Bug): wirft ${fehlerhaftError ? fehlerhaftError.message : 'keinen Fehler'}`);
    
    // Bug bestätigt: Die Query im Code verwendet eine nicht existierende Spalte
    expect(fehlerhaftError).not.toBeNull();
    expect(fehlerhaftError.message).toContain('no such column: geloescht');
  });

  test('Verfügbarkeitsberechnung gibt korrekte Werte zurück', async () => {
    // Setze 3 Ersatzautos verfügbar
    await dbRun(db, `INSERT OR REPLACE INTO werkstatt_einstellungen (id, ersatzauto_anzahl) VALUES (1, 3)`);

    const datum = '2026-02-06';
    await dbRun(db, `INSERT INTO termine (termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status, ersatzauto, geloescht_am)
      VALUES ('T-2026-010', 'XX-XX-0001', ?, 60, 'Test', 'geplant', 1, NULL)`, [datum]);

    // Hole Einstellungen
    const settings = await dbGet(db, 'SELECT * FROM werkstatt_einstellungen WHERE id = 1');
    const gesamtAnzahl = settings?.ersatzauto_anzahl || 2;

    // Korrekte Query
    const row = await dbGet(db,
      `SELECT COUNT(*) as vergeben FROM termine 
       WHERE datum = ? AND ersatzauto = 1 AND status != 'storniert' AND geloescht_am IS NULL`,
      [datum]
    );

    const vergeben = row?.vergeben || 0;
    const verfuegbar = Math.max(gesamtAnzahl - vergeben, 0);

    expect(gesamtAnzahl).toBe(3);
    expect(vergeben).toBe(1);
    expect(verfuegbar).toBe(2); // 3 gesamt - 1 vergeben = 2 verfügbar
    expect(verfuegbar > 0).toBe(true);
  });

  test('Gelöschte Termine (geloescht_am != NULL) werden nicht gezählt', async () => {
    const datum = '2026-02-06';
    
    // NUR gelöschte Termine mit Ersatzauto
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, ersatzauto, geloescht_am)
      VALUES ('T-2026-020', 'Gelöscht A', 'DEL-001', ?, '08:00', 60, 'Test', 'geplant', 1, '2026-02-01T00:00:00')`, [datum]);
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, ersatzauto, geloescht_am)
      VALUES ('T-2026-021', 'Gelöscht B', 'DEL-002', ?, '09:00', 60, 'Test2', 'geplant', 1, '2026-02-02T00:00:00')`, [datum]);

    const row = await dbGet(db,
      `SELECT COUNT(*) as vergeben FROM termine 
       WHERE datum = ? AND ersatzauto = 1 AND status != 'storniert' AND geloescht_am IS NULL`,
      [datum]
    );

    expect(row.vergeben).toBe(0); // Alle gelöscht → 0
  });
});
