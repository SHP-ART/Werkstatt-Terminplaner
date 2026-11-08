const { erstelleTerminWarnungen } = require('../src/utils/terminWarnungen');

test('Gleichheit ist erlaubt, Überschreiten erzeugt beide Warnungen', () => {
  expect(erstelleTerminWarnungen({
    startzeit: '09:00', bring_zeit: '09:00',
    endzeit_berechnet: '16:00', abholung_zeit: '16:00'
  })).toEqual([]);

  expect(erstelleTerminWarnungen({
    startzeit: '10:15', bring_zeit: '09:00',
    endzeit_berechnet: '16:30', abholung_zeit: '16:00'
  })).toEqual([
    {
      code: 'bringzeit_verpasst',
      message: 'Bringzeit 09:00 nicht eingehalten – frühester Start 10:15'
    },
    {
      code: 'abholzeit_verpasst',
      message: 'Abholzeit 16:00 nicht erreichbar – fertig ca. 16:30'
    }
  ]);
});

test('fehlende Richtzeiten und andere Abholdaten erzeugen keine Warnung', () => {
  expect(erstelleTerminWarnungen({
    startzeit: '10:00', endzeit_berechnet: '12:00',
    datum: '2026-11-08', abholung_datum: '2026-11-09', abholung_zeit: '11:00'
  })).toEqual([]);
});
