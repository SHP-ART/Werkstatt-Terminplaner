jest.mock('../src/config/database', () => ({
  dataDir: '/tmp/werkstatt-test'
}));

jest.mock('../src/utils/dbHelper', () => ({
  getAsync: jest.fn(),
  allAsync: jest.fn(),
  runAsync: jest.fn()
}));

jest.mock('../src/utils/transaction', () => ({
  withTransaction: jest.fn(async (callback) => callback())
}));

jest.mock('../src/models/termineModel', () => ({
  create: jest.fn()
}));

jest.mock('../src/models/auftragsimportModel', () => ({
  getById: jest.fn(),
  update: jest.fn(),
  findByHash: jest.fn(),
  create: jest.fn()
}));

jest.mock('../src/services/auftragsParserService', () => ({
  parseAuftragsPdf: jest.fn(),
  applySystemArbeitszeitenFromDb: jest.fn()
}));

const { getAsync, runAsync } = require('../src/utils/dbHelper');
const TermineModel = require('../src/models/termineModel');
const AuftragsimportModel = require('../src/models/auftragsimportModel');
const AuftragsImportService = require('../src/services/auftragsImportService');

function makeImportItem(overrides = {}) {
  const { erkannte_daten: datenOverrides = {}, ...itemOverrides } = overrides;
  return {
    id: 10,
    dateipfad: null,
    status: 'erkannt',
    erkannte_daten: {
      kunde: { name: 'Laura Scholz' },
      kundennummer: '28243',
      datum: '13.05.2026',
      auftragsnummer: '1140',
      fahrzeug: {
        kennzeichen: 'SFB-LQ 99',
        vin: 'VR7BAHNSANE044250',
        raw: 'Citroen C4 PureTech 130 EAT8',
        kmStand: 53175
      },
      arbeit: {
        summary: 'AU',
        items: [{ text: 'AU', originalText: 'A.U. - Abgasuntersuchung', dauer_minuten: 30 }]
      },
      geschaetzte_zeit: 30,
      ...datenOverrides
    },
    ...itemOverrides
  };
}

describe('auftragsImportService Stammdatenanlage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuftragsimportModel.update.mockResolvedValue({ changes: 1 });
  });

  test('legt unbekannten PDF-Kunden mit Hauptfahrzeug an und verknuepft den Termin', async () => {
    const importItem = makeImportItem();
    const createdKunde = {
      id: 77,
      name: 'Laura Scholz',
      telefon: null,
      locosoft_id: '28243',
      kennzeichen: 'SFB-LQ 99'
    };

    AuftragsimportModel.getById
      .mockResolvedValueOnce(importItem)
      .mockResolvedValueOnce({ ...importItem, status: 'verarbeitet', termin_id: 123 });
    TermineModel.create.mockResolvedValue({ id: 123, datum: '2026-05-16' });
    runAsync.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO kunden')) return { lastID: 77, changes: 1 };
      return { lastID: 1, changes: 1 };
    });
    getAsync.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM kunden WHERE id = ?')) return createdKunde;
      return null;
    });

    await AuftragsImportService.createSchnelltermin(10, { datum: '2026-05-16' });

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO kunden'),
      [
        'Laura Scholz',
        null,
        null,
        null,
        '28243',
        'SFB-LQ 99',
        'VR7BAHNSANE044250',
        'Citroen C4 PureTech 130 EAT8'
      ]
    );
    expect(TermineModel.create).toHaveBeenCalledWith(expect.objectContaining({
      kunde_id: 77,
      kunde_name: 'Laura Scholz',
      kennzeichen: 'SFB-LQ 99',
      interne_auftragsnummer: '1140'
    }));
    expect(AuftragsimportModel.update).toHaveBeenCalledWith(10, expect.objectContaining({
      termin_id: 123,
      status: 'verarbeitet',
      dateipfad: null
    }));
  });

  test('verknuepft bestehenden Kunden und nutzt das neue Kennzeichen als Kundenfahrzeug am Termin', async () => {
    const importItem = makeImportItem({
      erkannte_daten: {
        kundennummer: null,
        fahrzeug: {
          kennzeichen: 'SFB-NEU 123',
          raw: 'Citroen Berlingo',
          vin: null,
          kmStand: 88000
        }
      }
    });
    const existingKunde = {
      id: 5,
      name: 'Laura Scholz',
      telefon: '03573',
      kennzeichen: 'SFB-ALT 1',
      fahrzeugtyp: 'Citroen C3',
      vin: null,
      locosoft_id: null
    };

    AuftragsimportModel.getById
      .mockResolvedValueOnce(importItem)
      .mockResolvedValueOnce({ ...importItem, status: 'verarbeitet', termin_id: 456 });
    TermineModel.create.mockResolvedValue({ id: 456, datum: '2026-05-16' });
    getAsync.mockImplementation(async (sql) => {
      if (sql.includes('LOWER(TRIM(name))')) return existingKunde;
      return null;
    });
    runAsync.mockResolvedValue({ lastID: 1, changes: 1 });

    await AuftragsImportService.createSchnelltermin(10, { datum: '2026-05-16' });

    expect(runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO kunden'), expect.any(Array));
    expect(TermineModel.create).toHaveBeenCalledWith(expect.objectContaining({
      kunde_id: 5,
      kunde_name: 'Laura Scholz',
      kunde_telefon: '03573',
      kennzeichen: 'SFB-NEU 123',
      fahrzeugtyp: 'Citroen Berlingo'
    }));
  });

  test('erkennt Kunden ueber Kennzeichen aus frueheren Terminen statt einen Neukunden anzulegen', async () => {
    const existingKunde = {
      id: 9,
      name: 'Bestandskunde',
      telefon: null,
      kennzeichen: null,
      fahrzeugtyp: null,
      vin: null,
      locosoft_id: null
    };
    getAsync.mockImplementation(async (sql) => {
      if (sql.includes('JOIN kunden k ON k.id = t.kunde_id')) return existingKunde;
      if (sql.includes('SELECT * FROM kunden WHERE id = ?')) {
        return { ...existingKunde, kennzeichen: 'SFB-LQ 99' };
      }
      return null;
    });
    runAsync.mockResolvedValue({ lastID: 1, changes: 1 });

    const result = await AuftragsImportService.ensureKundeForImport(makeImportItem().erkannte_daten);

    expect(result.kunde.id).toBe(9);
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE kunden'),
      ['SFB-LQ 99', 'Citroen C4 PureTech 130 EAT8', 'VR7BAHNSANE044250', '28243', 9]
    );
    expect(runAsync).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO kunden'), expect.any(Array));
  });

  test('verwerfen markiert Import und leert den Dateipfad nach dem Loeschversuch', async () => {
    const importItem = makeImportItem({ dateipfad: 'C:/tmp/nicht-vorhanden.pdf' });
    AuftragsimportModel.getById
      .mockResolvedValueOnce(importItem)
      .mockResolvedValueOnce({ ...importItem, status: 'verworfen', dateipfad: null });

    await AuftragsImportService.discard(10);

    expect(AuftragsimportModel.update).toHaveBeenCalledWith(10, expect.objectContaining({
      status: 'verworfen',
      dateipfad: null
    }));
  });

  test('updateErkannteArbeiten speichert korrigierte Arbeitstexte vor dem Import', async () => {
    const importItem = makeImportItem();
    AuftragsimportModel.getById
      .mockResolvedValueOnce(importItem)
      .mockResolvedValueOnce({
        ...importItem,
        erkannte_daten: {
          ...importItem.erkannte_daten,
          arbeit: {
            summary: 'Inspektion\nBremsen pruefen',
            items: [
              { text: 'Inspektion', originalText: 'AU', dauer_minuten: 90, zeit_quelle: 'manuell' },
              { text: 'Bremsen pruefen', originalText: 'Bremsen pruefen', dauer_minuten: 30, zeit_quelle: 'manuell' }
            ]
          },
          geschaetzte_zeit: 120
        }
      });

    await AuftragsImportService.updateErkannteArbeiten(10, [
      { text: '  Inspektion  ', originalText: 'AU', dauer_minuten: '90' },
      { text: 'Bremsen pruefen', dauer_minuten: 30 },
      { text: '   ', dauer_minuten: 15 }
    ]);

    expect(AuftragsimportModel.update).toHaveBeenCalledWith(10, {
      erkannte_daten: expect.objectContaining({
        geschaetzte_zeit: 120,
        arbeit: {
          summary: 'Inspektion\nBremsen pruefen',
          items: [
            { text: 'Inspektion', originalText: 'AU', dauer_minuten: 90, zeit_quelle: 'manuell' },
            { text: 'Bremsen pruefen', originalText: 'Bremsen pruefen', dauer_minuten: 30, zeit_quelle: 'manuell' }
          ]
        }
      })
    });
  });

  test('updateErkannteArbeiten blockiert bereits verarbeitete Importe', async () => {
    AuftragsimportModel.getById.mockResolvedValueOnce(makeImportItem({ status: 'verarbeitet' }));

    await expect(AuftragsImportService.updateErkannteArbeiten(10, [
      { text: 'Inspektion', dauer_minuten: 90 }
    ])).rejects.toThrow('Nur offene Auftragsimporte');

    expect(AuftragsimportModel.update).not.toHaveBeenCalled();
  });

  test('buildTerminData nutzt bereinigte Arbeitstexte fuer Umfang', () => {
    const item = makeImportItem({
      erkannte_daten: {
        arbeit: {
          summary: 'AU/HU\nWartung',
          items: [
            { text: 'AU/HU', originalText: 'AU/HU' },
            { text: 'Wartung', originalText: 'AUSTAUSCH ZUENDKERZEN (SATZ) WARTUNG' }
          ]
        }
      }
    });

    const result = AuftragsImportService.buildTerminData(item);

    expect(result.arbeit).toBe('AU/HU\nWartung');
    expect(result.umfang).toBe('AU/HU\nWartung');
    expect(result.umfang).not.toContain('ZUENDKERZEN');
  });
});
