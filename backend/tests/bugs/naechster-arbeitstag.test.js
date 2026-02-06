/**
 * Bug-Test: naechsterArbeitstag() - Inkonsistenz zwischen Backend und Frontend
 * 
 * BUG: Backend überspringt Samstag UND Sonntag (getDay() === 0 || === 6),
 *      Frontend überspringt NUR Sonntag (getDay() === 0).
 *      Beide ignorieren die samstag_start/samstag_ende Einstellungen der Mitarbeiter.
 * 
 * AUSWIRKUNG:
 *   - Backend: Erweiterung "morgen" am Freitag → Montag (Sa übersprungen)
 *   - Frontend: Erweiterung "morgen" am Freitag → Samstag (Sa erlaubt)
 *   - Gleiche Aktion, unterschiedliches Ergebnis je nach Aufrufpunkt
 *   - Mitarbeiter mit Samstagsarbeit werden nicht berücksichtigt
 * 
 * FIX: Beide Implementierungen vereinheitlichen und optional
 *      samstag_start/samstag_ende des Mitarbeiters berücksichtigen
 */

const { createTestDb, closeTestDb, dbRun, dbGet, seedMitarbeiter } = require('../helpers/testSetup');

describe('BUG: naechsterArbeitstag() Inkonsistenz Backend/Frontend', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMitarbeiter(db);
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  // Backend-Implementierung (aus termineModel.js)
  function naechsterArbeitstagBackend(datum) {
    const d = new Date(datum + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    // Wochenende (Samstag und Sonntag) überspringen
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }

  // Frontend-Implementierung (aus app.js)
  function naechsterArbeitstagFrontend(datum) {
    const d = new Date(datum + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    // Sonntag überspringen
    if (d.getDay() === 0) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }

  test('Freitag → Backend: Montag, Frontend: Samstag (Bug)', () => {
    const freitag = '2026-02-06'; // 6. Feb 2026 ist ein Freitag
    
    const backendResult = naechsterArbeitstagBackend(freitag);
    const frontendResult = naechsterArbeitstagFrontend(freitag);

    console.log(`  → Freitag ${freitag}:`);
    console.log(`    Backend  → ${backendResult} (überspringt Sa+So)`);
    console.log(`    Frontend → ${frontendResult} (überspringt nur So)`);

    // Bug: Unterschiedliche Ergebnisse!
    expect(backendResult).toBe('2026-02-09');  // Montag
    expect(frontendResult).toBe('2026-02-07'); // Samstag

    // Die Inkonsistenz ist der Bug
    expect(backendResult).not.toBe(frontendResult);
  });

  test('Samstag → Backend: Montag, Frontend: Sonntag→Montag? (Bug)', () => {
    const samstag = '2026-02-07'; // Samstag
    
    const backendResult = naechsterArbeitstagBackend(samstag);
    const frontendResult = naechsterArbeitstagFrontend(samstag);

    console.log(`  → Samstag ${samstag}:`);
    console.log(`    Backend  → ${backendResult}`);
    console.log(`    Frontend → ${frontendResult}`);

    // Backend: Sa+1=So → So+1=Mo → Montag
    expect(backendResult).toBe('2026-02-09');
    // Frontend: Sa+1=So → So=0 → +1 → Mo  
    expect(frontendResult).toBe('2026-02-09');

    // Bei Samstag sind sie zufällig gleich (beide landen auf Montag)
    expect(backendResult).toBe(frontendResult);
  });

  test('Montag-Donnerstag → Beide gleich (kein Bug an Werktagen)', () => {
    // Montag 2026-02-09
    expect(naechsterArbeitstagBackend('2026-02-09')).toBe('2026-02-10');
    expect(naechsterArbeitstagFrontend('2026-02-09')).toBe('2026-02-10');

    // Dienstag
    expect(naechsterArbeitstagBackend('2026-02-10')).toBe('2026-02-11');
    expect(naechsterArbeitstagFrontend('2026-02-10')).toBe('2026-02-11');

    // Mittwoch
    expect(naechsterArbeitstagBackend('2026-02-11')).toBe('2026-02-12');
    expect(naechsterArbeitstagFrontend('2026-02-11')).toBe('2026-02-12');

    // Donnerstag
    expect(naechsterArbeitstagBackend('2026-02-12')).toBe('2026-02-13');
    expect(naechsterArbeitstagFrontend('2026-02-12')).toBe('2026-02-13');
  });

  test('Mitarbeiter mit Samstags-Arbeitszeiten werden ignoriert', async () => {
    // Max Mustermann hat samstag_start = '08:00', samstag_ende = '13:00'
    const ma = await dbGet(db, `SELECT name, samstag_aktiv, samstag_start, samstag_ende FROM mitarbeiter WHERE id = 1`);
    
    expect(ma.samstag_aktiv).toBe(1);
    expect(ma.samstag_start).toBe('08:00');
    expect(ma.samstag_ende).toBe('13:00');

    console.log(`  → ${ma.name} arbeitet Samstags: ${ma.samstag_start} - ${ma.samstag_ende} (aktiv=${ma.samstag_aktiv})`);

    // Freitag → Für Max sollte Samstag ein gültiger Arbeitstag sein!
    const freitag = '2026-02-06';
    const backendResult = naechsterArbeitstagBackend(freitag);

    // Bug: Backend überspringt Samstag, obwohl Max dort arbeitet
    expect(backendResult).toBe('2026-02-09'); // Montag statt Samstag
    
    console.log(`  → Nächster Arbeitstag nach Freitag: ${backendResult}`);
    console.log(`  → Sollte für Max sein: 2026-02-07 (Samstag, er arbeitet!)`);
  });

  test('Mitarbeiter ohne Samstags-Arbeitszeiten → Samstag korrekt übersprungen', async () => {
    // Anna Schmidt hat KEIN samstag_start/samstag_ende
    const ma = await dbGet(db, `SELECT name, samstag_aktiv, samstag_start, samstag_ende FROM mitarbeiter WHERE id = 2`);
    
    expect(ma.samstag_aktiv).toBe(0);

    console.log(`  → ${ma.name} arbeitet NICHT Samstags (samstag_aktiv=${ma.samstag_aktiv})`);

    // Für Anna wäre Montag korrekt
    const freitag = '2026-02-06';
    const korrektesErgebnis = '2026-02-09'; // Montag
    
    // Backend ist hier korrekt (überspringt Sa für Nicht-Samstags-Arbeiter)
    expect(naechsterArbeitstagBackend(freitag)).toBe(korrektesErgebnis);
    
    // Aber Frontend ist FALSCH (gibt Samstag zurück, obwohl Anna nicht arbeitet)
    expect(naechsterArbeitstagFrontend(freitag)).toBe('2026-02-07'); // Bug: Samstag
  });

  test('Sonntag → beide korrekt auf Montag', () => {
    const sonntag = '2026-02-08';
    
    expect(naechsterArbeitstagBackend(sonntag)).toBe('2026-02-09');
    expect(naechsterArbeitstagFrontend(sonntag)).toBe('2026-02-09');
  });
});
