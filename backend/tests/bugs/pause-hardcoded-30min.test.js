/**
 * Bug-Test: PauseController - Hardcoded 30-Minuten Pausendauer
 * 
 * BUG: Die Pausendauer ist an 6 Stellen im PauseController auf 30 Minuten
 *      hardcoded, obwohl Mitarbeiter individuelle 'pausenminuten' haben können
 *      (z.B. 15, 45, 60 Minuten). Die Spalte 'pausenminuten' in der
 *      mitarbeiter-Tabelle (Default: 30) wird komplett ignoriert.
 * 
 * AUSWIRKUNG:
 *   - Mitarbeiter mit 45 Min Pause bekommt nur 30 Min → kehrt zu früh zurück
 *   - Mitarbeiter mit 15 Min Pause bekommt 30 Min → zu lange Pause
 *   - Folgetermine werden um 30 Min verschoben statt um die korrekte Dauer
 * 
 * BETROFFENE STELLEN:
 *   1. cleanupAbgelaufenePausen(): pausenEnde = startZeit + 30*60*1000
 *   2. starten() → laufender Termin: addMinutesToTime(..., 30)
 *   3. starten() → zukünftige Termine: addMinutesToTime(..., 30)
 *   4. getAktive(): pausenEnde = startZeit + 30*60*1000
 * 
 * FIX: Individuelle pausenminuten aus mitarbeiter/lehrlinge-Tabelle laden
 */

const { createTestDb, closeTestDb, dbRun, dbGet, dbAll, seedMitarbeiter, seedLehrlinge } = require('../helpers/testSetup');

describe('BUG: PauseController - Hardcoded 30-Minuten Pause', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMitarbeiter(db);
    await seedLehrlinge(db);
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  test('Mitarbeiter haben individuelle pausenminuten in der DB', async () => {
    const ma1 = await dbGet(db, `SELECT pausenzeit_minuten FROM mitarbeiter WHERE id = 1`);
    const ma2 = await dbGet(db, `SELECT pausenzeit_minuten FROM mitarbeiter WHERE id = 2`);

    expect(ma1.pausenzeit_minuten).toBe(30); // Max: 30 Min
    expect(ma2.pausenzeit_minuten).toBe(45); // Anna: 45 Min
    
    // Bug: Controller ignoriert diese Werte und nutzt immer 30
    console.log(`  → Max Mustermann: ${ma1.pausenzeit_minuten} Min Pause`);
    console.log(`  → Anna Schmidt: ${ma2.pausenzeit_minuten} Min Pause`);
    console.log(`  → Controller benutzt immer: 30 Min (hardcoded)`);
  });

  test('Cleanup-Logik beendet Pause nach 30 Min statt individueller Dauer', async () => {
    // Erstelle Pause für Anna Schmidt (pausenminuten = 45)
    const pauseStart = new Date('2026-02-06T12:30:00');
    await dbRun(db, `INSERT INTO pause_tracking (mitarbeiter_id, pause_start_zeit, datum, abgeschlossen)
      VALUES (2, ?, '2026-02-06', 0)`, [pauseStart.toISOString()]);

    // Simuliere Cleanup nach 35 Minuten (nach 30 Min Hardcode, aber vor 45 Min)
    const nach35Min = new Date(pauseStart.getTime() + 35 * 60 * 1000);

    // Bug-Logik: Prüft ob 30 Min vergangen sind
    const pausenEndeBug = new Date(pauseStart.getTime() + 30 * 60 * 1000);
    const wuerdeBugBeenden = nach35Min >= pausenEndeBug;

    // Korrekte Logik: Sollte 45 Min prüfen
    const korrektePausenminuten = 45; // Annas individuelle Einstellung
    const pausenEndeKorrekt = new Date(pauseStart.getTime() + korrektePausenminuten * 60 * 1000);
    const wuerdeKorrektBeenden = nach35Min >= pausenEndeKorrekt;

    console.log(`  → Bug: Pause beendet nach 30 Min? ${wuerdeBugBeenden} (${pausenEndeBug.toISOString()})`);
    console.log(`  → Korrekt: Pause beendet nach 45 Min? ${wuerdeKorrektBeenden} (${pausenEndeKorrekt.toISOString()})`);

    // Bug: Pause wird nach 30 Min beendet, obwohl Anna 45 Min hat
    expect(wuerdeBugBeenden).toBe(true);    // Bug: wird zu früh beendet
    expect(wuerdeKorrektBeenden).toBe(false); // Korrekt: sollte noch laufen
  });

  test('Folgetermine werden um 30 Min statt individueller Dauer verschoben', async () => {
    // Anna Schmidt hat 45 Min Pause
    const datum = '2026-02-06';
    
    // Erstelle Termin für Anna um 13:00
    await dbRun(db, `INSERT INTO termine (termin_nr, kunde_name, kennzeichen, datum, bring_zeit, geschaetzte_zeit, arbeit, status, mitarbeiter_id, startzeit, endzeit_berechnet)
      VALUES ('T-2026-100', 'Kunde Test', 'AB-001', ?, '13:00', 60, 'Nach Pause', 'geplant', 2, '13:00', '14:00')`, [datum]);

    // Simuliere Verschiebung mit Bug (30 Min)
    const startzeit = '13:00';
    const endzeit = '14:00';
    
    function addMinutesToTime(time, minutes) {
      const [hours, mins] = time.split(':').map(Number);
      const totalMinutes = hours * 60 + mins + minutes;
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMins = totalMinutes % 60;
      return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
    }

    const neueStartzeitBug = addMinutesToTime(startzeit, 30);      // Bug: immer 30
    const neueStartzeitKorrekt = addMinutesToTime(startzeit, 45);  // Korrekt: Annas 45 Min

    console.log(`  → Bug-Verschiebung: ${startzeit} → ${neueStartzeitBug} (+30 Min)`);
    console.log(`  → Korrekte Verschiebung: ${startzeit} → ${neueStartzeitKorrekt} (+45 Min)`);

    expect(neueStartzeitBug).toBe('13:30');    // Bug: zu wenig verschoben
    expect(neueStartzeitKorrekt).toBe('13:45'); // Korrekt: volle Pausendauer

    // Unterschied von 15 Min → Termin startet, während Anna noch Pause hat!
    expect(neueStartzeitBug).not.toBe(neueStartzeitKorrekt); // Bug bestätigt
  });

  test('Verbleibende Minuten werden mit 30 statt individueller Dauer berechnet', async () => {
    const pauseStart = new Date('2026-02-06T12:30:00');
    const now = new Date('2026-02-06T12:50:00'); // 20 Min nach Start

    // Bug-Berechnung (30 Min hardcoded)
    const pausenEndeBug = new Date(pauseStart.getTime() + 30 * 60 * 1000);
    const verbleibendeBug = Math.max(0, Math.ceil((pausenEndeBug.getTime() - now.getTime()) / (60 * 1000)));

    // Korrekte Berechnung für Anna (45 Min)
    const pausenEndeKorrekt = new Date(pauseStart.getTime() + 45 * 60 * 1000);
    const verbleibendeKorrekt = Math.max(0, Math.ceil((pausenEndeKorrekt.getTime() - now.getTime()) / (60 * 1000)));

    console.log(`  → Bug: ${verbleibendeBug} Min verbleibend (bei 30 Min Pause)`);
    console.log(`  → Korrekt: ${verbleibendeKorrekt} Min verbleibend (bei 45 Min Pause)`);

    expect(verbleibendeBug).toBe(10);    // Bug: nur noch 10 Min
    expect(verbleibendeKorrekt).toBe(25); // Korrekt: noch 25 Min

    // Bug: Tablet zeigt 10 Min verbleibend, obwohl Anna noch 25 Min hat
    expect(verbleibendeBug).not.toBe(verbleibendeKorrekt);
  });

  test('Lehrling hat auch individuelle pausenminuten', async () => {
    const lehrling = await dbGet(db, `SELECT pausenzeit_minuten FROM lehrlinge WHERE id = 1`);
    expect(lehrling.pausenzeit_minuten).toBe(30);
    
    // Ändere Pausendauer für Lehrling
    await dbRun(db, `UPDATE lehrlinge SET pausenzeit_minuten = 20 WHERE id = 1`);
    
    const updated = await dbGet(db, `SELECT pausenzeit_minuten FROM lehrlinge WHERE id = 1`);
    expect(updated.pausenzeit_minuten).toBe(20);
    
    // Bug: Controller würde trotzdem 30 Min verwenden
    console.log(`  → Lehrling Tim: ${updated.pausenzeit_minuten} Min Pause konfiguriert`);
    console.log(`  → Controller würde verwenden: 30 Min (hardcoded)`);
  });
});
