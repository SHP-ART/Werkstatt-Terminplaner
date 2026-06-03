const {
  zeitTextZuMinuten,
  minutenZuZeitText,
  ermittleRessource,
  ermittleStartMinuten,
  ermittleDauer,
  baueIntervalle,
  ueberschneidetSich,
  findeUeberschneidungen,
  pruefeWarteKonflikt,
  findeFreieSlots
} = require('../src/utils/belegung');

describe('belegung – Zeit-Helfer', () => {
  test('zeitTextZuMinuten parst gültige Zeiten und lehnt ungültige ab', () => {
    expect(zeitTextZuMinuten('08:00')).toBe(480);
    expect(zeitTextZuMinuten('09:30')).toBe(570);
    expect(zeitTextZuMinuten('00:00')).toBe(0);
    expect(zeitTextZuMinuten('')).toBeNull();
    expect(zeitTextZuMinuten(null)).toBeNull();
    expect(zeitTextZuMinuten('25:00')).toBeNull();
    expect(zeitTextZuMinuten('8 Uhr')).toBeNull();
  });

  test('minutenZuZeitText formatiert korrekt', () => {
    expect(minutenZuZeitText(480)).toBe('08:00');
    expect(minutenZuZeitText(570)).toBe('09:30');
  });
});

describe('belegung – Ressource & Startzeit', () => {
  test('ermittleRessource bevorzugt _gesamt_mitarbeiter_id', () => {
    const termin = {
      mitarbeiter_id: 5,
      arbeitszeiten_details: JSON.stringify({ _gesamt_mitarbeiter_id: { type: 'lehrling', id: 3 } })
    };
    expect(ermittleRessource(termin)).toEqual({ typ: 'lehrling', id: 3 });
  });

  test('ermittleRessource nutzt mitarbeiter_id als Fallback', () => {
    expect(ermittleRessource({ mitarbeiter_id: 7 })).toEqual({ typ: 'mitarbeiter', id: 7 });
  });

  test('ermittleRessource liefert null ohne Zuordnung', () => {
    expect(ermittleRessource({ arbeitszeiten_details: '{}' })).toBeNull();
  });

  test('ermittleStartMinuten nutzt Reihenfolge startzeit > _startzeit > Arbeit > bring_zeit', () => {
    expect(ermittleStartMinuten({ startzeit: '08:00', bring_zeit: '07:00' })).toBe(480);
    expect(ermittleStartMinuten({
      arbeitszeiten_details: JSON.stringify({ _startzeit: '09:00' })
    })).toBe(540);
    expect(ermittleStartMinuten({ bring_zeit: '07:30' })).toBe(450);
    expect(ermittleStartMinuten({})).toBeNull();
  });

  test('ermittleDauer bevorzugt tatsaechliche_zeit', () => {
    expect(ermittleDauer({ tatsaechliche_zeit: 90, geschaetzte_zeit: 60 })).toBe(90);
    expect(ermittleDauer({ geschaetzte_zeit: 45 })).toBe(45);
    expect(ermittleDauer({})).toBe(60);
  });
});

describe('belegung – Intervalle & Überschneidung', () => {
  const termine = [
    { id: 1, termin_nr: 'T-1', mitarbeiter_id: 1, startzeit: '08:00', geschaetzte_zeit: 60, kunde_name: 'A' },
    { id: 2, termin_nr: 'T-2', mitarbeiter_id: 1, startzeit: '09:30', geschaetzte_zeit: 60, kunde_name: 'B' },
    { id: 3, termin_nr: 'T-3', startzeit: '08:00', geschaetzte_zeit: 60, kunde_name: 'C' }, // keine Ressource
    { id: 4, termin_nr: 'T-4', mitarbeiter_id: 2, geschaetzte_zeit: 60, kunde_name: 'D' },   // keine Startzeit
    { id: 5, termin_nr: 'T-5', mitarbeiter_id: 1, startzeit: '10:00', status: 'abgeschlossen', geschaetzte_zeit: 60 }
  ];

  test('baueIntervalle trennt harte und flexible Termine', () => {
    const { intervalle, flexibel } = baueIntervalle(termine);
    expect(intervalle.map(i => i.terminId).sort()).toEqual([1, 2]);
    // 3 = keine Ressource, 4 = keine Startzeit, 5 = abgeschlossen (ausgefiltert)
    expect(flexibel.map(f => f.terminId).sort()).toEqual([3, 4]);
  });

  test('ueberschneidetSich erkennt Overlap korrekt', () => {
    expect(ueberschneidetSich(480, 540, 530, 600)).toBe(true);
    expect(ueberschneidetSich(480, 540, 540, 600)).toBe(false); // direkt anschließend
    expect(ueberschneidetSich(480, 540, 600, 660)).toBe(false);
  });

  test('findeUeberschneidungen findet Doppelbuchung beim selben Mitarbeiter', () => {
    const { intervalle } = baueIntervalle(termine);
    const treffer = findeUeberschneidungen(intervalle, {
      ressourceTyp: 'mitarbeiter', ressourceId: 1, start: 480, ende: 540 // 08:00-09:00
    });
    // T-1 (08:00-09:00) ist Treffer, aber als excludeTerminId ausgeschlossen testen:
    expect(treffer.map(t => t.terminId)).toEqual([1]);

    const treffer2 = findeUeberschneidungen(intervalle, {
      ressourceTyp: 'mitarbeiter', ressourceId: 1, start: 480, ende: 540, excludeTerminId: 1
    });
    expect(treffer2).toHaveLength(0);

    // Anderer Mitarbeiter -> kein Konflikt
    const treffer3 = findeUeberschneidungen(intervalle, {
      ressourceTyp: 'mitarbeiter', ressourceId: 99, start: 480, ende: 540
    });
    expect(treffer3).toHaveLength(0);
  });
});

describe('belegung – Warte-Kunden', () => {
  test('pruefeWarteKonflikt erkennt zu viele gleichzeitige Wartende', () => {
    const termine = [
      { id: 1, mitarbeiter_id: 1, startzeit: '08:00', geschaetzte_zeit: 60, abholung_typ: 'warten' },
      { id: 2, mitarbeiter_id: 2, startzeit: '08:30', geschaetzte_zeit: 60, abholung_typ: 'warten' }
    ];
    const { intervalle } = baueIntervalle(termine);
    // Neuer Warte-Kunde 08:15-09:15, nur 2 MA verfügbar -> 3 gleichzeitig = Konflikt
    const ergebnis = pruefeWarteKonflikt(intervalle, { start: 495, ende: 555 }, 2);
    expect(ergebnis.gleichzeitig).toBe(3);
    expect(ergebnis.konflikt).toBe(true);
  });

  test('pruefeWarteKonflikt ohne Überschneidung kein Konflikt', () => {
    const termine = [
      { id: 1, mitarbeiter_id: 1, startzeit: '08:00', geschaetzte_zeit: 60, abholung_typ: 'warten' }
    ];
    const { intervalle } = baueIntervalle(termine);
    const ergebnis = pruefeWarteKonflikt(intervalle, { start: 600, ende: 660 }, 2);
    expect(ergebnis.gleichzeitig).toBe(1);
    expect(ergebnis.konflikt).toBe(false);
  });
});

describe('belegung – freie Slots', () => {
  test('findeFreieSlots liefert Lücken inkl. Mittagspause', () => {
    const termine = [
      { id: 1, mitarbeiter_id: 1, startzeit: '08:00', geschaetzte_zeit: 60 }, // 08:00-09:00
      { id: 2, mitarbeiter_id: 1, startzeit: '10:00', geschaetzte_zeit: 60 }  // 10:00-11:00
    ];
    const { intervalle } = baueIntervalle(termine);
    const slots = findeFreieSlots(intervalle, {
      ressourceTyp: 'mitarbeiter', ressourceId: 1,
      tagStart: 480, tagEnde: 1020, // 08:00-17:00
      pause: { start: 720, ende: 750 } // 12:00-12:30
    }, 15);
    // Erwartet: 09:00-10:00, 11:00-12:00, 12:30-17:00
    expect(slots).toEqual([
      { start: 540, ende: 600, dauer: 60 },
      { start: 660, ende: 720, dauer: 60 },
      { start: 750, ende: 1020, dauer: 270 }
    ]);
  });
});
