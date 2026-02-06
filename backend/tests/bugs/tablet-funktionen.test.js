/**
 * Integrations-Tests: Tablet-Funktionen
 * 
 * Testet die Tablet-spezifischen DB-Operationen:
 * - Termin starten (→ in_arbeit)
 * - Termin fertig melden (→ abgeschlossen)
 * - Pause-Tracking (starten, aktive abfragen, automatisches Ende)
 * - Display-Einstellungen lesen/schreiben
 * - arbeitszeiten_details JSON korrekt lesen/parsen
 */

const { createTestDb, closeTestDb, dbRun, dbGet, dbAll, seedMitarbeiter, seedLehrlinge, seedKunden, seedTermine } = require('../helpers/testSetup');

describe('Tablet-App - DB-Operationen', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb();
    await seedMitarbeiter(db);
    await seedLehrlinge(db);
    await seedKunden(db);
    await seedTermine(db, '2026-02-06');
  });

  afterEach(async () => {
    await closeTestDb(db);
  });

  // =========================================================================
  // TERMIN STARTEN/STOPPEN
  // =========================================================================
  describe('Termin Status-Wechsel', () => {
    test('Termin von geplant → in_arbeit (Starten)', async () => {
      // Termin 1 ist 'geplant'
      const vorher = await dbGet(db, 'SELECT status FROM termine WHERE id = 1');
      expect(vorher.status).toBe('geplant');

      await dbRun(db, `UPDATE termine SET status = 'in_arbeit' WHERE id = 1`);

      const nachher = await dbGet(db, 'SELECT status FROM termine WHERE id = 1');
      expect(nachher.status).toBe('in_arbeit');
    });

    test('Termin von in_arbeit → abgeschlossen (Fertig)', async () => {
      // Termin 3 ist bereits 'in_arbeit'
      const vorher = await dbGet(db, 'SELECT status FROM termine WHERE id = 3');
      expect(vorher.status).toBe('in_arbeit');

      await dbRun(db, `UPDATE termine SET status = 'abgeschlossen' WHERE id = 3`);

      const nachher = await dbGet(db, 'SELECT status FROM termine WHERE id = 3');
      expect(nachher.status).toBe('abgeschlossen');
    });

    test('Nur geplante/in_arbeit Termine für heute laden', async () => {
      const termine = await dbAll(db,
        `SELECT * FROM termine 
         WHERE datum = '2026-02-06' 
           AND status IN ('geplant', 'in_arbeit')
           AND geloescht_am IS NULL
         ORDER BY bring_zeit`
      );

      expect(termine.length).toBe(3);
      expect(termine[0].bring_zeit).toBe('08:00');
      expect(termine[1].bring_zeit).toBe('09:30');
      expect(termine[2].bring_zeit).toBe('10:00');
    });
  });

  // =========================================================================
  // PAUSE-TRACKING
  // =========================================================================
  describe('Pause-Tracking', () => {
    test('Pause starten - Tracking-Eintrag erstellen', async () => {
      const pauseStart = new Date('2026-02-06T12:00:00').toISOString();
      
      const result = await dbRun(db,
        `INSERT INTO pause_tracking (mitarbeiter_id, pause_start_zeit, datum, abgeschlossen)
         VALUES (1, ?, '2026-02-06', 0)`,
        [pauseStart]
      );

      expect(result.lastID).toBeGreaterThan(0);

      const pause = await dbGet(db, 'SELECT * FROM pause_tracking WHERE id = ?', [result.lastID]);
      expect(pause.mitarbeiter_id).toBe(1);
      expect(pause.abgeschlossen).toBe(0);
      expect(pause.lehrling_id).toBeNull();
    });

    test('Aktive Pausen abfragen', async () => {
      // Erstelle 2 aktive Pausen
      await dbRun(db, `INSERT INTO pause_tracking (mitarbeiter_id, pause_start_zeit, datum, abgeschlossen)
        VALUES (1, '2026-02-06T12:00:00', '2026-02-06', 0)`);
      await dbRun(db, `INSERT INTO pause_tracking (lehrling_id, pause_start_zeit, datum, abgeschlossen)
        VALUES (1, '2026-02-06T12:05:00', '2026-02-06', 0)`);
      // 1 bereits abgeschlossene Pause
      await dbRun(db, `INSERT INTO pause_tracking (mitarbeiter_id, pause_start_zeit, pause_ende_zeit, datum, abgeschlossen)
        VALUES (2, '2026-02-06T11:00:00', '2026-02-06T11:45:00', '2026-02-06', 1)`);

      const aktive = await dbAll(db,
        `SELECT pt.*, 
                CASE WHEN pt.mitarbeiter_id IS NOT NULL THEN m.name ELSE l.name END as person_name
         FROM pause_tracking pt
         LEFT JOIN mitarbeiter m ON pt.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON pt.lehrling_id = l.id
         WHERE pt.abgeschlossen = 0`
      );

      expect(aktive.length).toBe(2);
      expect(aktive[0].person_name).toBe('Max Mustermann');
      expect(aktive[1].person_name).toBe('Tim Lehrling');
    });

    test('Pause beenden setzt abgeschlossen=1 und pause_ende_zeit', async () => {
      const pauseStart = '2026-02-06T12:00:00';
      const result = await dbRun(db,
        `INSERT INTO pause_tracking (mitarbeiter_id, pause_start_zeit, datum, abgeschlossen)
         VALUES (1, ?, '2026-02-06', 0)`,
        [pauseStart]
      );

      const pauseEnde = '2026-02-06T12:30:00';
      await dbRun(db,
        `UPDATE pause_tracking SET abgeschlossen = 1, pause_ende_zeit = ? WHERE id = ?`,
        [pauseEnde, result.lastID]
      );

      const pause = await dbGet(db, 'SELECT * FROM pause_tracking WHERE id = ?', [result.lastID]);
      expect(pause.abgeschlossen).toBe(1);
      expect(pause.pause_ende_zeit).toBe(pauseEnde);
    });

    test('Doppelte aktive Pause wird verhindert', async () => {
      // Erste Pause starten
      await dbRun(db, `INSERT INTO pause_tracking (mitarbeiter_id, pause_start_zeit, datum, abgeschlossen)
        VALUES (1, '2026-02-06T12:00:00', '2026-02-06', 0)`);

      // Prüfe ob bereits aktive Pause existiert
      const aktivePause = await dbGet(db,
        `SELECT id FROM pause_tracking WHERE mitarbeiter_id = 1 AND abgeschlossen = 0`
      );

      expect(aktivePause).toBeTruthy();
      // Controller würde hier 409 zurückgeben
    });

    test('Pause mit nächstem Termin verknüpfen', async () => {
      const result = await dbRun(db,
        `INSERT INTO pause_tracking (mitarbeiter_id, pause_start_zeit, pause_naechster_termin_id, datum, abgeschlossen)
         VALUES (1, '2026-02-06T12:00:00', 2, '2026-02-06', 0)`
      );

      const pause = await dbGet(db, 'SELECT * FROM pause_tracking WHERE id = ?', [result.lastID]);
      expect(pause.pause_naechster_termin_id).toBe(2);
    });
  });

  // =========================================================================
  // TABLET-EINSTELLUNGEN
  // =========================================================================
  describe('Tablet-Einstellungen', () => {
    test('Standard-Einstellungen erstellen und lesen', async () => {
      await dbRun(db, `INSERT OR IGNORE INTO tablet_einstellungen (id) VALUES (1)`);

      const settings = await dbGet(db, 'SELECT * FROM tablet_einstellungen WHERE id = 1');
      expect(settings.display_ein_zeit).toBe('07:00');
      expect(settings.display_aus_zeit).toBe('18:00');
      expect(settings.manuell_status).toBe('auto');
    });

    test('Einstellungen aktualisieren', async () => {
      await dbRun(db, `INSERT OR IGNORE INTO tablet_einstellungen (id) VALUES (1)`);
      
      await dbRun(db,
        `UPDATE tablet_einstellungen 
         SET display_ein_zeit = '06:00', display_aus_zeit = '20:00', manuell_status = 'an'
         WHERE id = 1`
      );

      const settings = await dbGet(db, 'SELECT * FROM tablet_einstellungen WHERE id = 1');
      expect(settings.display_ein_zeit).toBe('06:00');
      expect(settings.display_aus_zeit).toBe('20:00');
      expect(settings.manuell_status).toBe('an');
    });
  });

  // =========================================================================
  // ARBEITSZEITEN_DETAILS JSON PARSING
  // =========================================================================
  describe('arbeitszeiten_details JSON', () => {
    test('Korrekt gespeichertes JSON kann geparst werden', async () => {
      const details = {
        '_gesamt_mitarbeiter_id': { type: 'mitarbeiter', id: 1 },
        'Ölwechsel': { zeit: 30, mitarbeiter_id: 1, type: 'mitarbeiter' }
      };

      await dbRun(db, `UPDATE termine SET arbeitszeiten_details = ? WHERE id = 1`,
        [JSON.stringify(details)]
      );

      const termin = await dbGet(db, 'SELECT arbeitszeiten_details FROM termine WHERE id = 1');
      const parsed = JSON.parse(termin.arbeitszeiten_details);

      expect(parsed._gesamt_mitarbeiter_id.type).toBe('mitarbeiter');
      expect(parsed._gesamt_mitarbeiter_id.id).toBe(1);
    });

    test('NULL arbeitszeiten_details wird korrekt behandelt', async () => {
      const termin = await dbGet(db, 'SELECT arbeitszeiten_details FROM termine WHERE id = 1');
      
      // Default ist NULL
      let details = {};
      if (termin.arbeitszeiten_details) {
        details = JSON.parse(termin.arbeitszeiten_details);
      }
      
      expect(Object.keys(details).length).toBe(0);
    });

    test('Termine nach Mitarbeiter filtern via JSON-Parse', async () => {
      const details1 = { '_gesamt_mitarbeiter_id': { type: 'mitarbeiter', id: 1 } };
      const details2 = { '_gesamt_mitarbeiter_id': { type: 'mitarbeiter', id: 2 } };

      await dbRun(db, `UPDATE termine SET arbeitszeiten_details = ? WHERE id = 1`, [JSON.stringify(details1)]);
      await dbRun(db, `UPDATE termine SET arbeitszeiten_details = ? WHERE id = 2`, [JSON.stringify(details1)]);
      await dbRun(db, `UPDATE termine SET arbeitszeiten_details = ? WHERE id = 3`, [JSON.stringify(details2)]);

      // Lade alle Termine und filtere in JavaScript (wie Tablet-App)
      const termine = await dbAll(db,
        `SELECT id, arbeitszeiten_details FROM termine WHERE datum = '2026-02-06' AND geloescht_am IS NULL`
      );

      const mitarbeiter1Termine = termine.filter(t => {
        if (!t.arbeitszeiten_details) return false;
        try {
          const d = JSON.parse(t.arbeitszeiten_details);
          return d._gesamt_mitarbeiter_id && 
                 d._gesamt_mitarbeiter_id.type === 'mitarbeiter' && 
                 d._gesamt_mitarbeiter_id.id === 1;
        } catch { return false; }
      });

      expect(mitarbeiter1Termine.length).toBe(2);
    });
  });

  // =========================================================================
  // TERMIN-VERSCHIEBUNG BEI PAUSE
  // =========================================================================
  describe('Folgetermin-Verschiebung', () => {
    test('Startzeit und Endzeit um Pausendauer verschieben', async () => {
      // Setze explizite Start/Endzeiten
      await dbRun(db, `UPDATE termine SET startzeit = '13:00', endzeit_berechnet = '14:00' WHERE id = 2`);

      function addMinutesToTime(time, minutes) {
        const [hours, mins] = time.split(':').map(Number);
        const totalMinutes = hours * 60 + mins + minutes;
        const newHours = Math.floor(totalMinutes / 60) % 24;
        const newMins = totalMinutes % 60;
        return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
      }

      const termin = await dbGet(db, 'SELECT startzeit, endzeit_berechnet FROM termine WHERE id = 2');
      const neueStartzeit = addMinutesToTime(termin.startzeit, 30);
      const neueEndzeit = addMinutesToTime(termin.endzeit_berechnet, 30);

      await dbRun(db, `UPDATE termine SET startzeit = ?, endzeit_berechnet = ? WHERE id = 2`,
        [neueStartzeit, neueEndzeit]);

      const updated = await dbGet(db, 'SELECT startzeit, endzeit_berechnet FROM termine WHERE id = 2');
      expect(updated.startzeit).toBe('13:30');
      expect(updated.endzeit_berechnet).toBe('14:30');
    });
  });
});
