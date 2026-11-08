const localAiService = require('../src/services/localAiService');
const { dbWrapper } = require('../src/config/database');

afterAll(async () => {
  await dbWrapper.readyPromise;
  if (dbWrapper.connection) {
    await new Promise((resolve, reject) => {
      dbWrapper.connection.close(error => error ? reject(error) : resolve());
    });
    dbWrapper.connection = null;
  }
});

describe('Lokale KI-Regressionen', () => {
  test('Freitext mit Datum und Uhrzeit liest die echte Uhrzeit', async () => {
    const result = await localAiService.parseTerminFromText(
      'Herr Mustermann mit Citroën C3, Inspektion am 12.11.2026 um 09:30'
    );

    expect(result.termin.datum).toBe('2026-11-12');
    expect(result.termin.uhrzeit).toBe('09:30');
  });

  test('Datum ohne Uhrzeit erzeugt keine falsche Uhrzeit', async () => {
    const result = await localAiService.parseTerminFromText(
      'Herr Mustermann mit Citroën C3, Inspektion am 12.11.2026'
    );

    expect(result.termin.uhrzeit).toBeNull();
  });

  test('VIN-Teilecheck nutzt die hinterlegten Motorspezifikationen', () => {
    const result = localAiService.checkTeileKompatibilitaet(
      'VF7SX5F55GW123456',
      'Ölwechsel'
    );

    expect(result.success).toBe(true);
    expect(result.empfehlungen).toEqual(expect.arrayContaining([
      expect.objectContaining({ teil: 'Motoröl', spezifikation: 'PSA B71 2290 (0W-30)' }),
      expect.objectContaining({ teil: 'Ölfilter', oe_nummer: 'OE 1109.CK' })
    ]));
  });
});
