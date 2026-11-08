import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDragDropFeature } from '../../src/features/planung/dragDropFeature.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Slot-Nachfüllung', () => {
  it('verwendet einen echten freien Slot aus der Belegungs-API', async () => {
    class TestApp {}
    installDragDropFeature(TestApp);
    const app = new TestApp();
    app.formatDateLocal = () => '2026-11-09';
    app._zeigeSlotNachfuellungPopup = vi.fn();

    document.body.innerHTML = `
      <input id="slotNachfuellungEnabled" type="checkbox" checked>
      <input id="auslastungDragDropDatum" value="2026-11-10">
    `;

    const get = vi.fn().mockResolvedValue({
      ressourcen: [{
        typ: 'mitarbeiter',
        id: 7,
        abwesend: false,
        freie_slots: [{ von: '10:00', bis: '11:30', dauer: 90 }]
      }]
    });
    const getLueckenVorschlaege = vi.fn().mockResolvedValue({ vorschlaege: [] });
    vi.stubGlobal('ApiService', { get });
    vi.stubGlobal('KIPlanungService', { getLueckenVorschlaege });

    await app._pruefeSlotNachfuellung();

    expect(get).toHaveBeenCalledWith('/termine/belegung?datum=2026-11-10');
    expect(getLueckenVorschlaege).toHaveBeenCalledWith(
      '2026-11-10',
      7,
      '10:00',
      '11:30'
    );
  });
});
