/**
 * Bug-Test: TermineModel.erweiterungErstellen - Termin-Nr-Format-Konflikt
 * 
 * BUG: Reguläre Termine nutzen Format 'T-2026-001' (T-YYYY-NNN),
 *      aber Erweiterungen generieren 'T-00001' (T-NNNNN).
 *      Die Erweiterungs-Query parst SUBSTR(termin_nr, 3) → bei 'T-2026-001'
 *      ergibt das '2026-001', CAST als INTEGER → 2026.
 *      Die nächste Erweiterungs-Nr wäre dann 'T-02027', was inkompatibel ist.
 * 
 * AUSWIRKUNG: Format-Inkonsistenz, potenzielle UNIQUE-Constraint-Konflikte,
 *             und die MAX()-Logik berechnet falsche Nummern.
 * 
 * FIX: erweiterungErstellen sollte generateTerminNr() wiederverwenden
 *      statt ein eigenes Format zu generieren.
 */

const { createTestDb, closeTestDb, dbRun, dbGet, dbAll } = require('../helpers/testSetup');

describe('BUG: Termin-Nr Format-Konflikt bei Erweiterungen', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('Reguläre Termin-Nr hat Format T-YYYY-NNN', async () => {
    const year = new Date().getFullYear();
    const prefix = `T-${year}-`;

    // Simuliere generateTerminNr Logik
    const row = await dbGet(db,
      `SELECT termin_nr FROM termine
       WHERE termin_nr LIKE ?
       ORDER BY CAST(SUBSTR(termin_nr, 8) AS INTEGER) DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNumber = 1;
    if (row && row.termin_nr) {
      const lastNumber = parseInt(row.termin_nr.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    const terminNr = `${prefix}${String(nextNumber).padStart(3, '0')}`;
    
    expect(terminNr).toMatch(/^T-\d{4}-\d{3}$/);
    expect(terminNr).toBe(`T-${year}-001`);
  });

  test('Erweiterungs-Nr hat inkompatibles Format T-NNNNN (Bug)', async () => {
    // Füge reguläre Termine ein
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status)
      VALUES ('T-2026-001', 'Kunde A', 'AB-001', '2026-02-06', '08:00', 60, 'Arbeit A', 'geplant')`);
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status)
      VALUES ('T-2026-002', 'Kunde B', 'AB-002', '2026-02-06', '09:00', 90, 'Arbeit B', 'geplant')`);

    // Simuliere Erweiterungs-Logik (aktueller Bug-Code)
    const terminNrResult = await dbGet(db,
      `SELECT MAX(CAST(SUBSTR(termin_nr, 3) AS INTEGER)) as max_nr FROM termine WHERE termin_nr LIKE 'T-%'`
    );
    const neueNr = (terminNrResult && terminNrResult.max_nr) ? terminNrResult.max_nr + 1 : 1;
    const erweiterungsNr = `T-${String(neueNr).padStart(5, '0')}`;

    console.log(`  → MAX(CAST(SUBSTR(termin_nr, 3))): ${terminNrResult.max_nr}`);
    console.log(`  → Generierte Erweiterungs-Nr: ${erweiterungsNr}`);

    // BUG: SUBSTR('T-2026-001', 3) → '2026-001'
    // CAST('2026-001' AS INTEGER) → 2026 (SQLite ignoriert '-001')
    // neueNr = 2027
    // erweiterungsNr = 'T-02027'
    expect(terminNrResult.max_nr).toBe(2026); // Bug: sollte nicht 2026 sein!
    expect(erweiterungsNr).toBe('T-02027');    // Bug: inkompatibles Format

    // Das gewünschte Verhalten wäre:
    // Nächste Nr im Format T-2026-003 (konsistent mit regulären Terminen)
  });

  test('Erweiterung sollte reguläres Format T-YYYY-NNN verwenden', async () => {
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status)
      VALUES ('T-2026-001', 'Kunde A', 'AB-001', '2026-02-06', '08:00', 60, 'Arbeit A', 'geplant')`);
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status)
      VALUES ('T-2026-005', 'Kunde B', 'AB-002', '2026-02-06', '09:00', 90, 'Arbeit B', 'geplant')`);

    // KORREKTE Logik (wie generateTerminNr)
    const year = new Date().getFullYear();
    const prefix = `T-${year}-`;

    const row = await dbGet(db,
      `SELECT termin_nr FROM termine
       WHERE termin_nr LIKE ?
       ORDER BY CAST(SUBSTR(termin_nr, 8) AS INTEGER) DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextNumber = 1;
    if (row && row.termin_nr) {
      const lastNumber = parseInt(row.termin_nr.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    const korrekteNr = `${prefix}${String(nextNumber).padStart(3, '0')}`;

    expect(korrekteNr).toBe('T-2026-006'); // Korrekt: nächste nach 005
    expect(korrekteNr).toMatch(/^T-\d{4}-\d{3}$/); // Konsistentes Format
  });

  test('UNIQUE-Constraint wird durch Format-Mix nicht verletzt', async () => {
    // Füge Termin mit regulärem Format ein
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status)
      VALUES ('T-2026-001', 'Kunde A', 'AB-001', '2026-02-06', '08:00', 60, 'Test', 'geplant')`);

    // Versuche Erweiterung mit gleichem Nr-Format (sollte nicht kollidieren)
    // Aber mit Bug-Format könnte es irgendwann kollidieren
    const bugNr = 'T-02027';
    
    // Dies fügt aktuell keinen Konflikt ein, aber das Format ist trotzdem falsch
    const result = await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status)
      VALUES (?, 'Erweiterung', 'AB-001', '2026-02-06', '09:00', 30, 'Erweiterung', 'geplant')`, [bugNr]);
    
    expect(result.lastID).toBeGreaterThan(0);

    // Prüfe Format-Konsistenz aller Termin-Nummern
    const alleTermine = await dbAll(db, `SELECT termin_nr FROM termine ORDER BY termin_nr`);
    const formate = alleTermine.map(t => {
      if (t.termin_nr.match(/^T-\d{4}-\d{3}$/)) return 'T-YYYY-NNN';
      if (t.termin_nr.match(/^T-\d{5}$/)) return 'T-NNNNN';
      return 'UNBEKANNT';
    });

    console.log('  → Termin-Nummern:', alleTermine.map(t => t.termin_nr));
    console.log('  → Formate:', formate);

    // Bug: Es gibt gemischte Formate
    const uniqueFormats = [...new Set(formate)];
    expect(uniqueFormats.length).toBeGreaterThan(1); // Bug bestätigt: 2 verschiedene Formate
  });
});
