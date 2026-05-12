const KIPlanungController = require('../../src/controllers/kiPlanungController');

describe('KIPlanungController – getTerminDauerMinuten', () => {
  test('nutzt _ki_dauer_min wenn gesetzt und kein geschaetzte_zeit', () => {
    const termin = { _ki_dauer_min: 75 };
    expect(KIPlanungController.getTerminDauerMinuten(termin)).toBe(75);
  });

  test('bevorzugt tatsaechliche_zeit vor _ki_dauer_min', () => {
    const termin = { tatsaechliche_zeit: 90, _ki_dauer_min: 75 };
    expect(KIPlanungController.getTerminDauerMinuten(termin)).toBe(90);
  });

  test('bevorzugt geschaetzte_zeit vor _ki_dauer_min', () => {
    const termin = { geschaetzte_zeit: 45, _ki_dauer_min: 75 };
    expect(KIPlanungController.getTerminDauerMinuten(termin)).toBe(45);
  });

  test('fällt auf 60 Min zurück wenn alles fehlt', () => {
    expect(KIPlanungController.getTerminDauerMinuten({})).toBe(60);
  });

  test('fällt auf 60 Min zurück wenn termin null', () => {
    expect(KIPlanungController.getTerminDauerMinuten(null)).toBe(60);
  });
});

describe('KIPlanungController – buildLocalTagesVorschlag (nichtPlatziertTermine)', () => {
  test('liefert nichtPlatziertTermine wenn kein Slot frei', async () => {
    const result = await KIPlanungController.buildLocalTagesVorschlag({
      datum: '2026-05-12',
      mitarbeiter: [],
      lehrlinge: [],
      termine: [{
        id: 99, arbeit: 'Ölwechsel', kunde_name: 'Müller',
        geschaetzte_zeit: 60, mitarbeiter_id: null, arbeitszeiten_details: null,
        ist_schwebend: 0, status: 'geplant'
      }],
      schwebendeTermine: [],
      einstellungen: { mittagspause_minuten: 30, anomaly_detection_enabled: 0 },
      abwesenheiten: []
    });

    expect(result.nichtPlatziertTermine).toBeDefined();
    expect(result.nichtPlatziertTermine).toHaveLength(1);
    expect(result.nichtPlatziertTermine[0].terminId).toBe(99);
    expect(result.nichtPlatziertTermine[0].grund).toBeTruthy();
    expect(result.nichtPlatziertTermine[0].terminInfo).toContain('Ölwechsel');
    expect(typeof result.nichtPlatziertTermine[0].dauerMin).toBe('number');
  });

  test('liefert leeres nichtPlatziertTermine wenn alle Termine platziert', async () => {
    const result = await KIPlanungController.buildLocalTagesVorschlag({
      datum: '2026-05-12',
      mitarbeiter: [{
        id: 1, name: 'Max', arbeitsstunden_pro_tag: 8,
        mittagspause_start: '12:00', aktiv: 1, nur_service: 0
      }],
      lehrlinge: [],
      termine: [],
      schwebendeTermine: [],
      einstellungen: { mittagspause_minuten: 30, anomaly_detection_enabled: 0 },
      abwesenheiten: []
    });

    expect(result.nichtPlatziertTermine).toBeDefined();
    expect(result.nichtPlatziertTermine).toHaveLength(0);
  });
});

describe('KIPlanungController – pickBestCandidate (Balancing)', () => {
  function makeCandidate({ id, slotStart, usedMin, capacityMin, kompetenzBonus = 0 }) {
    return {
      entry: {
        person: { id, capacityMin, type: 'mitarbeiter' },
        usedMin,
        blocks: []
      },
      slotStart,
      remaining: capacityMin - usedMin - 60,
      durationAdjusted: 60,
      kompetenzBonus
    };
  }

  test('bevorzugt weniger ausgelastete Person bei gleicher Startzeit', () => {
    const candidates = [
      makeCandidate({ id: 1, slotStart: 480, usedMin: 360, capacityMin: 480 }), // 75%
      makeCandidate({ id: 2, slotStart: 480, usedMin: 60,  capacityMin: 480 }), // 12.5%
    ];
    const best = KIPlanungController.pickBestCandidate(candidates);
    expect(best.entry.person.id).toBe(2);
  });

  test('bevorzugt früheren Slot wenn Unterschied > 15 Min', () => {
    const candidates = [
      makeCandidate({ id: 1, slotStart: 480, usedMin: 400, capacityMin: 480 }),
      makeCandidate({ id: 2, slotStart: 520, usedMin: 0,   capacityMin: 480 }),
    ];
    const best = KIPlanungController.pickBestCandidate(candidates);
    expect(best.entry.person.id).toBe(1);
  });

  test('gibt null zurück bei leeren Kandidaten', () => {
    expect(KIPlanungController.pickBestCandidate([])).toBeNull();
  });

  test('gibt überlastete Person zurück wenn alle überlastet (Fallback)', () => {
    const candidates = [
      makeCandidate({ id: 1, slotStart: 480, usedMin: 500, capacityMin: 480 }),
    ];
    const best = KIPlanungController.pickBestCandidate(candidates);
    expect(best).not.toBeNull();
    expect(best.entry.person.id).toBe(1);
  });
});
