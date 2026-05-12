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
