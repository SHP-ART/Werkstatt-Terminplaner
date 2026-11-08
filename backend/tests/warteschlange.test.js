const {
  TEST_DB,
  createTestDb,
  closeTestDb,
  dbRun,
  dbGet,
  dbAll
} = require('./helpers/testSetup');

process.env.DB_PATH = TEST_DB;
process.env.NODE_ENV = 'test';

jest.mock('../src/utils/websocket', () => ({
  broadcastEvent: jest.fn(),
  setWebSocketServer: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const migration052 = require('../migrations/052_warteschlange_pos');
const { errorHandler } = require('../src/middleware/errorHandler');
const { broadcastEvent } = require('../src/utils/websocket');

const DATUM = '2026-11-06';
let db;
let app;
let dbWrapper;
let warteschlangeRoutes;

async function addMitarbeiter(id, arbeitsstunden = 8) {
  await dbRun(db, `
    INSERT INTO mitarbeiter (id, name, aktiv, arbeitsstunden_pro_tag, nur_service)
    VALUES (?, ?, 1, ?, 0)
  `, [id, `Mechaniker ${id}`, arbeitsstunden]);
}

async function addTermin({
  id,
  mitarbeiter_id = 1,
  lehrling_id = null,
  warteschlange_pos = null,
  datum = DATUM,
  geschaetzte_zeit = 60,
  status = 'geplant',
  ist_schwebend = 0,
  geloescht_am = null,
  arbeitszeiten_details = null
}) {
  await dbRun(db, `
    INSERT INTO termine (
      id, termin_nr, kunde_name, kennzeichen, datum, geschaetzte_zeit,
      arbeit, status, mitarbeiter_id, lehrling_id, warteschlange_pos,
      ist_schwebend, geloescht_am, arbeitszeiten_details
    ) VALUES (?, ?, 'Kunde', 'AB-123', ?, ?, 'Inspektion', ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    `T-2026-${String(id).padStart(3, '0')}`,
    datum,
    geschaetzte_zeit,
    status,
    mitarbeiter_id,
    lehrling_id,
    warteschlange_pos,
    ist_schwebend,
    geloescht_am,
    arbeitszeiten_details
  ]);
}

async function addLehrling(id, aufgabenbewaeltigung = 100) {
  await dbRun(db, `
    INSERT INTO lehrlinge (
      id, name, aktiv, arbeitsstunden_pro_tag, aufgabenbewaeltigung_prozent
    ) VALUES (?, ?, 1, 8, ?)
  `, [id, `Lehrling ${id}`, aufgabenbewaeltigung]);
}

async function addImport(id, status) {
  await dbRun(db, `
    INSERT INTO auftragsimporte (id, original_dateiname, status, text_extract, dateipfad)
    VALUES (?, ?, ?, 'interner Text', '/tmp/intern.pdf')
  `, [id, `auftrag-${id}.pdf`, status]);
}

beforeAll(async () => {
  db = await createTestDb();
  const termineColumns = await dbAll(db, 'PRAGMA table_info(termine)');
  if (!termineColumns.some(column => column.name === 'warteschlange_pos')) {
    await migration052.up(db);
  }
  warteschlangeRoutes = require('../src/routes/warteschlangeRoutes');
  dbWrapper = require('../src/config/database').dbWrapper;
  await dbWrapper.readyPromise;

  app = express();
  app.use(express.json());
  app.use('/api/warteschlange', warteschlangeRoutes);
  app.use(errorHandler);
});

beforeEach(async () => {
  await dbRun(db, 'DELETE FROM auftragsimporte');
  await dbRun(db, 'DELETE FROM abwesenheiten');
  await dbRun(db, 'DELETE FROM termine');
  await dbRun(db, 'DELETE FROM mitarbeiter');
  await dbRun(db, 'DELETE FROM lehrlinge');
  await dbRun(db, `
    INSERT OR REPLACE INTO werkstatt_einstellungen (id, nebenzeit_prozent) VALUES (1, 0)
  `);
  await addMitarbeiter(1);
  await addMitarbeiter(2);
  broadcastEvent.mockClear();
});

afterAll(async () => {
  if (dbWrapper.connection) {
    await new Promise((resolve, reject) => {
      dbWrapper.connection.close(error => error ? reject(error) : resolve());
    });
    dbWrapper.connection = null;
  }
  await closeTestDb(db);
  delete process.env.DB_PATH;
});

describe('Warteschlange — Zuweisen und Reihenfolge', () => {
  test('Zuweisen ohne Position hängt ans Ende und sendet das Queue-Event', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2 });
    await addTermin({ id: 3, ist_schwebend: 1 });

    const response = await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 3, mitarbeiter_id: 1 })
      .expect(200);

    expect(response.body.warteschlange_pos).toBe(3);
    const termin = await dbGet(db, 'SELECT * FROM termine WHERE id = 3');
    expect(termin.warteschlange_pos).toBe(3);
    expect(termin.mitarbeiter_id).toBe(1);
    expect(termin.ist_schwebend).toBe(0);
    expect(broadcastEvent).toHaveBeenCalledWith('termin.queue_updated', { mitarbeiter_id: 1 });
  });

  test('Zuweisen mit Position schiebt Folgezettel lückenlos nach hinten', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2 });
    await addTermin({ id: 3, warteschlange_pos: 3 });
    await addTermin({ id: 4 });

    await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 4, mitarbeiter_id: 1, position: 2 })
      .expect(200);

    const rows = await dbAll(db, `
      SELECT id, warteschlange_pos FROM termine ORDER BY warteschlange_pos
    `);
    expect(rows.map(row => [row.id, row.warteschlange_pos])).toEqual([
      [1, 1],
      [4, 2],
      [2, 3],
      [3, 4]
    ]);
  });

  test('Neu-Sortieren lässt fremde Mechaniker unberührt', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2 });
    await addTermin({ id: 3, warteschlange_pos: 3 });
    await addTermin({ id: 4, mitarbeiter_id: 2, warteschlange_pos: 1 });

    await request(app)
      .put('/api/warteschlange/reihenfolge')
      .send({ mitarbeiter_id: 1, termin_ids: [3, 1, 2] })
      .expect(200);

    const rows = await dbAll(db, `
      SELECT id, mitarbeiter_id, warteschlange_pos FROM termine ORDER BY id
    `);
    expect(rows.map(row => [row.id, row.mitarbeiter_id, row.warteschlange_pos])).toEqual([
      [1, 1, 2],
      [2, 1, 3],
      [3, 1, 1],
      [4, 2, 1]
    ]);
    expect(broadcastEvent).toHaveBeenCalledWith('termin.queue_updated', { mitarbeiter_id: 1 });
  });

  test.each([
    [{ termin_id: 999, mitarbeiter_id: 1 }, 'Termin nicht gefunden'],
    [{ termin_id: 1, mitarbeiter_id: 999 }, 'Mitarbeiter nicht gefunden']
  ])('unbekannte IDs liefern 404: %o', async (payload, message) => {
    await addTermin({ id: 1 });

    const response = await request(app)
      .put('/api/warteschlange/zuweisen')
      .send(payload)
      .expect(404);

    expect(response.body).toMatchObject({ success: false, error: message });
  });
});

describe('Warteschlange — Tagesansicht', () => {
  test('markiert den ersten nicht passenden Zettel und alle danach als morgen', async () => {
    await dbRun(db, 'UPDATE mitarbeiter SET arbeitsstunden_pro_tag = 2 WHERE id = 1');
    await addTermin({ id: 1, warteschlange_pos: 1, geschaetzte_zeit: 60 });
    await addTermin({ id: 2, warteschlange_pos: 2, geschaetzte_zeit: 60 });
    await addTermin({ id: 3, warteschlange_pos: 3, geschaetzte_zeit: 30 });
    await addTermin({ id: 4, warteschlange_pos: 4, geschaetzte_zeit: 10 });

    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: DATUM })
      .expect(200);

    const spalte = response.body.mitarbeiter.find(item => item.mitarbeiter_id === 1);
    expect(spalte.kapazitaet_minuten).toBe(120);
    expect(spalte.last_minuten).toBe(160);
    expect(spalte.zettel.map(item => [item.id, item.morgen])).toEqual([
      [1, false],
      [2, false],
      [3, true],
      [4, true]
    ]);
  });

  test('verwendet den produktiven Nebenzeitfaktor für Last und morgen-Markierung', async () => {
    await dbRun(db, `
      INSERT OR REPLACE INTO werkstatt_einstellungen (id, nebenzeit_prozent) VALUES (1, 10)
    `);
    await addTermin({ id: 1, warteschlange_pos: 1, geschaetzte_zeit: 300 });
    await addTermin({ id: 2, warteschlange_pos: 2, geschaetzte_zeit: 150 });

    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: DATUM })
      .expect(200);

    const spalte = response.body.mitarbeiter.find(item => item.mitarbeiter_id === 1);
    expect(spalte.kapazitaet_minuten).toBe(480);
    expect(spalte.last_minuten).toBe(495);
    expect(spalte.zettel[0].effektive_zeit_minuten).toBe(330);
    expect(spalte.zettel[1].effektive_zeit_minuten).toBe(165);
    expect(Math.round(spalte.last_minuten / spalte.kapazitaet_minuten * 100)).toBe(103);
    expect(spalte.zettel.map(item => [item.id, item.morgen])).toEqual([
      [1, false],
      [2, true]
    ]);
  });

  test('lässt abgeschlossene, stornierte und gelöschte Termine aus allen Zettellisten aus', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2, status: 'abgeschlossen' });
    await addTermin({ id: 3, warteschlange_pos: 3, status: 'storniert' });
    await addTermin({ id: 4, warteschlange_pos: 4, geloescht_am: '2026-11-06 12:00:00' });
    await addTermin({ id: 5, ist_schwebend: 1 });
    await addTermin({ id: 6, ist_schwebend: 1, status: 'abgeschlossen' });
    await addTermin({ id: 7, ist_schwebend: 1, status: 'storniert' });

    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: DATUM })
      .expect(200);

    const spalte = response.body.mitarbeiter.find(item => item.mitarbeiter_id === 1);
    expect(spalte.zettel.map(item => item.id)).toEqual([1]);
    expect(response.body.neu.termine.map(item => item.id)).toEqual([5]);
  });

  test('NEU enthält offene, aber keine verarbeiteten Auftragsimporte', async () => {
    await addImport(1, 'neu');
    await addImport(2, 'erkannt');
    await addImport(3, 'fehler');
    await addImport(4, 'verarbeitet');
    await addImport(5, 'verworfen');

    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: DATUM })
      .expect(200);

    expect(response.body.neu.auftragsimporte.map(item => item.id)).toEqual([3, 2, 1]);
    expect(response.body.neu.auftragsimporte[0]).not.toHaveProperty('text_extract');
    expect(response.body.neu.auftragsimporte[0]).not.toHaveProperty('dateipfad');
  });

  test('berücksichtigt Abwesenheit über die produktive Kapazitätslogik', async () => {
    await dbRun(db, `
      INSERT INTO abwesenheiten (mitarbeiter_id, typ, datum_von, datum_bis)
      VALUES (1, 'krank', ?, ?)
    `, [DATUM, DATUM]);
    await addTermin({ id: 1, warteschlange_pos: 1 });

    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: DATUM })
      .expect(200);

    const spalte = response.body.mitarbeiter.find(item => item.mitarbeiter_id === 1);
    expect(spalte.kapazitaet_minuten).toBe(0);
    expect(spalte.zettel[0].morgen).toBe(true);
  });
});

describe('Warteschlange — nächster Auftrag für Tablet', () => {
  const heute = () => {
    const jetzt = new Date();
    return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
  };

  test('liefert den obersten geplanten Zettel des Mechanikers für heute', async () => {
    await addTermin({ id: 1, datum: heute(), warteschlange_pos: 2 });
    await addTermin({ id: 2, datum: heute(), warteschlange_pos: 1, geschaetzte_zeit: 45 });
    await addTermin({ id: 3, datum: '2999-12-31', warteschlange_pos: 1 });
    await addTermin({ id: 4, datum: heute(), mitarbeiter_id: 2, warteschlange_pos: 1 });

    const response = await request(app)
      .get('/api/warteschlange/mitarbeiter/1/naechster')
      .expect(200);

    expect(response.body.datum).toBe(heute());
    expect(response.body.zettel).toMatchObject({
      id: 2,
      mitarbeiter_id: 1,
      mitarbeiter_name: 'Mechaniker 1',
      warteschlange_pos: 1,
      geschaetzte_zeit: 45,
      status: 'geplant',
      kunde_name: 'Kunde',
      kennzeichen: 'AB-123'
    });
  });

  test('liefert die relationalen Arbeiten mit ihren gespeicherten Stempelwerten', async () => {
    await addTermin({ id: 1, datum: heute(), warteschlange_pos: 1 });
    await dbRun(db, `
      INSERT INTO termine_arbeiten (
        termin_id, arbeit, zeit, mitarbeiter_id, stempel_start, stempel_ende
      ) VALUES (1, 'Inspektion', 45, 1, '08:15', NULL)
    `);

    const response = await request(app)
      .get('/api/warteschlange/mitarbeiter/1/naechster')
      .expect(200);

    expect(response.body.zettel.arbeiten).toEqual([
      expect.objectContaining({
        name: 'Inspektion',
        stempel_start: '08:15',
        stempel_ende: null
      })
    ]);
  });

  test('behält einen laufenden obersten Zettel und lässt Abgeschlossene nachrücken', async () => {
    await addTermin({ id: 1, datum: heute(), warteschlange_pos: 1, status: 'abgeschlossen' });
    await addTermin({ id: 2, datum: heute(), warteschlange_pos: 2, status: 'in_arbeit' });
    await addTermin({ id: 3, datum: heute(), warteschlange_pos: 3 });

    const response = await request(app)
      .get('/api/warteschlange/mitarbeiter/1/naechster')
      .expect(200);

    expect(response.body.zettel.id).toBe(2);
    expect(response.body.zettel.status).toBe('in_arbeit');

    await dbRun(db, "UPDATE termine SET status = 'abgeschlossen' WHERE id = 2");
    const naechster = await request(app)
      .get('/api/warteschlange/mitarbeiter/1/naechster')
      .expect(200);
    expect(naechster.body.zettel.id).toBe(3);
  });

  test.each([
    { status: 'abgeschlossen' },
    { status: 'storniert' },
    { status: 'wartend' },
    { status: 'offen' },
    { status: 'geplant', geloescht_am: '2026-11-07 12:00:00' },
    { status: 'geplant', ist_schwebend: 1 }
  ])('schließt nicht auswählbare Zettel aus: %o', async termin => {
    await addTermin({ id: 1, datum: heute(), warteschlange_pos: 1, ...termin });

    const response = await request(app)
      .get('/api/warteschlange/mitarbeiter/1/naechster')
      .expect(200);

    expect(response.body).toEqual({ datum: heute(), zettel: null });
  });

  test('liefert bei leerer Schlange einen verständlichen Leerzustand', async () => {
    const response = await request(app)
      .get('/api/warteschlange/mitarbeiter/1/naechster')
      .expect(200);

    expect(response.body).toEqual({ datum: heute(), zettel: null });
  });

  test('behandelt unbekannte Mechaniker und ungültige IDs wie bestehende Routen', async () => {
    const unbekannt = await request(app)
      .get('/api/warteschlange/mitarbeiter/999/naechster')
      .expect(404);
    expect(unbekannt.body).toMatchObject({ success: false, error: 'Mitarbeiter nicht gefunden' });

    const ungueltig = await request(app)
      .get('/api/warteschlange/mitarbeiter/abc/naechster')
      .expect(400);
    expect(ungueltig.body).toMatchObject({ success: false, error: 'mitarbeiter_id muss eine positive ganze Zahl sein' });
  });
});

describe('Warteschlange — nächster Arbeitstag', () => {
  test('verschiebt auf Montag, hängt dort an und schließt die alte Lücke', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2 });
    await addTermin({ id: 3, datum: '2026-11-09', warteschlange_pos: 1 });

    const response = await request(app)
      .post('/api/warteschlange/1/naechster-tag')
      .expect(200);

    expect(response.body.datum).toBe('2026-11-09');
    expect(response.body.warteschlange_pos).toBe(2);
    const oldQueue = await dbGet(db, 'SELECT warteschlange_pos FROM termine WHERE id = 2');
    expect(oldQueue.warteschlange_pos).toBe(1);
    expect(broadcastEvent).toHaveBeenCalledWith('termin.queue_updated', { mitarbeiter_id: 1 });
  });
});

describe('Warteschlange — Positionsintegrität', () => {
  test('Anhängen nutzt bei einer inaktiven Lücke MAX(Position) + 1', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2, status: 'abgeschlossen' });
    await addTermin({ id: 3, warteschlange_pos: 3 });
    await addTermin({ id: 4 });

    const response = await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 4, mitarbeiter_id: 1 })
      .expect(200);

    expect(response.body.warteschlange_pos).toBe(4);
    const rows = await dbAll(db, `
      SELECT warteschlange_pos FROM termine WHERE mitarbeiter_id = 1
    `);
    expect(new Set(rows.map(row => row.warteschlange_pos)).size).toBe(4);
  });

  test('Tageswechsel nutzt im Ziel ebenfalls MAX(Position) + 1', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, datum: '2026-11-09', warteschlange_pos: 1 });
    await addTermin({ id: 3, datum: '2026-11-09', warteschlange_pos: 2, status: 'storniert' });
    await addTermin({ id: 4, datum: '2026-11-09', warteschlange_pos: 3 });

    const response = await request(app)
      .post('/api/warteschlange/1/naechster-tag')
      .expect(200);

    expect(response.body.warteschlange_pos).toBe(4);
    const positions = await dbAll(db, `
      SELECT warteschlange_pos FROM termine
      WHERE datum = '2026-11-09' AND mitarbeiter_id = 1
    `);
    expect(new Set(positions.map(row => row.warteschlange_pos)).size).toBe(4);
  });

  test('lehnt eine partielle Reihenfolgeliste ohne Schreibzugriff ab', async () => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2 });
    await addTermin({ id: 3, warteschlange_pos: 3 });

    const response = await request(app)
      .put('/api/warteschlange/reihenfolge')
      .send({ mitarbeiter_id: 1, termin_ids: [3, 1] })
      .expect(400);

    expect(response.body.error).toBe('termin_ids muss die vollständige aktive Warteschlange enthalten');
    const rows = await dbAll(db, 'SELECT id, warteschlange_pos FROM termine ORDER BY id');
    expect(rows.map(row => row.warteschlange_pos)).toEqual([1, 2, 3]);
    expect(broadcastEvent).not.toHaveBeenCalled();
  });

  test.each([
    { warteschlange_pos: null, status: 'geplant' },
    { warteschlange_pos: 3, status: 'abgeschlossen' }
  ])('lehnt Termine außerhalb der aktiven Zielschlange ab: %o', async termin => {
    await addTermin({ id: 1, warteschlange_pos: 1 });
    await addTermin({ id: 2, warteschlange_pos: 2 });
    await addTermin({ id: 3, ...termin });

    await request(app)
      .put('/api/warteschlange/reihenfolge')
      .send({ mitarbeiter_id: 1, termin_ids: [2, 1, 3] })
      .expect(400);

    const rows = await dbAll(db, 'SELECT id, warteschlange_pos FROM termine ORDER BY id');
    expect(rows.map(row => row.warteschlange_pos)).toEqual([1, 2, termin.warteschlange_pos]);
    expect(broadcastEvent).not.toHaveBeenCalled();
  });
});

describe('Warteschlange — Ziel-datum beim Zuweisen', () => {
  test('übernimmt das gewählte Datum und zeigt schwebende Zettel in dieser Queue', async () => {
    const zielDatum = '2026-11-09';
    await addTermin({ id: 1, datum: DATUM, ist_schwebend: 1 });

    const response = await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 1, mitarbeiter_id: 1, datum: zielDatum })
      .expect(200);

    expect(response.body.datum).toBe(zielDatum);
    const termin = await dbGet(db, 'SELECT datum, ist_schwebend FROM termine WHERE id = 1');
    expect(termin).toMatchObject({ datum: zielDatum, ist_schwebend: 0 });

    const board = await request(app)
      .get('/api/warteschlange')
      .query({ datum: zielDatum })
      .expect(200);
    const spalte = board.body.mitarbeiter.find(item => item.mitarbeiter_id === 1);
    expect(spalte.zettel.map(item => item.id)).toEqual([1]);
  });

  test('lehnt ein Datum außerhalb des Formats YYYY-MM-DD unverändert ab', async () => {
    await addTermin({ id: 1, datum: DATUM, ist_schwebend: 1 });

    const response = await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 1, mitarbeiter_id: 1, datum: '09.11.2026' })
      .expect(400);

    expect(response.body.error).toBe('datum muss im Format YYYY-MM-DD angegeben werden');
    const termin = await dbGet(db, 'SELECT datum, ist_schwebend FROM termine WHERE id = 1');
    expect(termin).toMatchObject({ datum: DATUM, ist_schwebend: 1 });
    expect(broadcastEvent).not.toHaveBeenCalled();
  });
});

describe('Warteschlange — gleichzeitige Mutationen', () => {
  test('serialisiert zwei parallele HTTP-Zuweisungen mit eindeutiger Endreihenfolge', async () => {
    await addTermin({ id: 1 });
    await addTermin({ id: 2 });
    const model = require('../src/models/warteschlangeModel');
    const originalGetTermin = model.getTermin.bind(model);
    let releaseFirstRead;
    let markFirstRead;
    const firstReadStarted = new Promise(resolve => { markFirstRead = resolve; });
    const firstReadPause = new Promise(resolve => { releaseFirstRead = resolve; });
    let pauseFirstRead = true;
    const spy = jest.spyOn(model, 'getTermin').mockImplementation(async id => {
      if (id === 1 && pauseFirstRead) {
        pauseFirstRead = false;
        markFirstRead();
        await firstReadPause;
      }
      return originalGetTermin(id);
    });

    let responses;
    try {
      const first = request(app)
        .put('/api/warteschlange/zuweisen')
        .send({ termin_id: 1, mitarbeiter_id: 1 })
        .then(response => response);
      await firstReadStarted;
      const second = request(app)
        .put('/api/warteschlange/zuweisen')
        .send({ termin_id: 2, mitarbeiter_id: 1 })
        .then(response => response);
      await new Promise(resolve => setImmediate(resolve));
      releaseFirstRead();
      responses = await Promise.all([first, second]);
    } finally {
      releaseFirstRead();
      spy.mockRestore();
    }

    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const rows = await dbAll(db, `
      SELECT id, warteschlange_pos FROM termine
      WHERE mitarbeiter_id = 1 AND warteschlange_pos IS NOT NULL
      ORDER BY warteschlange_pos
    `);
    expect(rows.map(row => [row.id, row.warteschlange_pos])).toEqual([
      [1, 1],
      [2, 2]
    ]);
    expect(broadcastEvent.mock.calls.filter(([event]) => event === 'termin.queue_updated')).toHaveLength(2);
  });
});

describe('Warteschlange — echte Kalenderdaten', () => {
  test('GET lehnt einen nicht existierenden Kalendertag mit HTTP 400 ab', async () => {
    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: '2026-02-31' })
      .expect(400);

    expect(response.body.error).toBe('datum muss ein gültiges Datum im Format YYYY-MM-DD sein');
  });

  test('Zuweisen lehnt einen nicht existierenden Kalendertag ohne Schreibzugriff und Event ab', async () => {
    await addTermin({ id: 1, datum: DATUM, ist_schwebend: 1 });

    const response = await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 1, mitarbeiter_id: 1, datum: '2026-02-31' })
      .expect(400);

    expect(response.body.error).toBe('datum muss ein gültiges Datum im Format YYYY-MM-DD sein');
    const termin = await dbGet(db, 'SELECT datum, ist_schwebend FROM termine WHERE id = 1');
    expect(termin).toMatchObject({ datum: DATUM, ist_schwebend: 1 });
    expect(broadcastEvent).not.toHaveBeenCalled();
  });
});

describe('Warteschlange — Lehrlinge', () => {
  test('Lehrlings-Queue bleibt von Mechaniker mit derselben ID getrennt', async () => {
    await addLehrling(1);
    await addTermin({ id: 10, ist_schwebend: 1, datum: null });

    await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 10, person_typ: 'lehrling', person_id: 1, datum: DATUM })
      .expect(200);

    const zugewiesen = await dbGet(db, 'SELECT * FROM termine WHERE id = 10');
    expect(zugewiesen.mitarbeiter_id).toBeNull();
    expect(zugewiesen.lehrling_id).toBe(1);
    expect(zugewiesen.warteschlange_pos).toBe(1);
    expect(JSON.parse(zugewiesen.arbeitszeiten_details)._gesamt_mitarbeiter_id)
      .toEqual({ type: 'lehrling', id: 1 });

    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: DATUM })
      .expect(200);
    expect(response.body.lehrlinge[0].zettel.map(item => item.id)).toEqual([10]);
    expect(response.body.mitarbeiter[0].zettel.map(item => item.id)).not.toContain(10);
  });

  test('wendet Nebenzeit und Aufgabenbewältigung auf Lehrlingslast an', async () => {
    await addLehrling(1, 150);
    await dbRun(db, 'UPDATE werkstatt_einstellungen SET nebenzeit_prozent = 10 WHERE id = 1');
    await addTermin({ id: 10, ist_schwebend: 1, datum: null, geschaetzte_zeit: 100 });
    await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 10, person_typ: 'lehrling', person_id: 1, datum: DATUM })
      .expect(200);

    const response = await request(app)
      .get('/api/warteschlange')
      .query({ datum: DATUM })
      .expect(200);
    expect(response.body.lehrlinge[0].last_minuten).toBe(165);
    expect(response.body.lehrlinge[0].zettel[0].effektive_zeit_minuten).toBe(165);
  });

  test('lehnt unbekannte Lehrlinge mit 404 ab', async () => {
    await addTermin({ id: 10, ist_schwebend: 1, datum: null });
    await request(app)
      .put('/api/warteschlange/zuweisen')
      .send({ termin_id: 10, person_typ: 'lehrling', person_id: 999, datum: DATUM })
      .expect(404);
  });

  test('lehnt fremde Mechaniker-Termine beim Lehrlings-Sortieren ab', async () => {
    await addLehrling(1);
    await addTermin({ id: 10, warteschlange_pos: 1 });
    const response = await request(app)
      .put('/api/warteschlange/reihenfolge')
      .send({ person_typ: 'lehrling', person_id: 1, termin_ids: [10] })
      .expect(404);

    expect(response.body.error).toContain('Warteschlange');
    const termin = await dbGet(db, 'SELECT warteschlange_pos FROM termine WHERE id = 10');
    expect(termin.warteschlange_pos).toBe(1);
    expect(broadcastEvent).not.toHaveBeenCalled();
  });
});
