jest.mock('../src/models/auftragsimportModel', () => ({
  getAll: jest.fn(),
  getById: jest.fn()
}));
jest.mock('../src/services/auftragsImportService', () => ({
  IMPORT_DIR: '/import',
  LOCOSOFT_PRUEFEN_DIR: '/pruefen'
}));
jest.mock('../src/utils/websocket', () => ({ broadcastEvent: jest.fn() }));
jest.mock('../src/controllers/termineController', () => ({ invalidateTermineCache: jest.fn() }));

const Model = require('../src/models/auftragsimportModel');
const Controller = require('../src/controllers/auftragsimportController');

const row = {
  id: 1,
  original_dateiname: 'auftrag.pdf',
  status: 'neu',
  dateipfad: '/srv/import/auftrag.pdf',
  text_extract: 'Kunde Max Mustermann, WDB123'
};

function mockRes() {
  const res = { statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('AuftragsimportController - keine internen Felder in GET-Antworten', () => {
  test('getAll liefert weder text_extract noch dateipfad', async () => {
    Model.getAll.mockResolvedValue([row]);
    const res = mockRes();
    await Controller.getAll({ query: {} }, res);
    expect(res.body.imports).toHaveLength(1);
    expect(res.body.imports[0]).not.toHaveProperty('text_extract');
    expect(res.body.imports[0]).not.toHaveProperty('dateipfad');
    expect(res.body.imports[0].original_dateiname).toBe('auftrag.pdf');
  });

  test('getById liefert weder text_extract noch dateipfad', async () => {
    Model.getById.mockResolvedValue(row);
    const res = mockRes();
    await Controller.getById({ params: { id: 1 } }, res);
    expect(res.body).not.toHaveProperty('text_extract');
    expect(res.body).not.toHaveProperty('dateipfad');
    expect(res.body.status).toBe('neu');
  });

  test('getById gibt 404 wenn nicht gefunden', async () => {
    Model.getById.mockResolvedValue(null);
    const res = mockRes();
    await Controller.getById({ params: { id: 99 } }, res);
    expect(res.statusCode).toBe(404);
  });
});
