/**
 * Tests für die Auslastungs-/Restzeit-Berechnung (Tages-Minuten-Topf).
 *
 * Deckt die reine Rechenlogik aus utils/auslastung.js ab:
 * - Statusfilter (storniert/schwebend zählen nicht, abgeschlossen zählt)
 * - Zeitverteilung auf Mitarbeiter und Lehrlinge (keine Doppelzählung)
 * - Kapazität (Abwesenheit, nur_service, Lehrlinge)
 * - Gesamtergebnis inkl. Restzeit und Nebenzeit-Konsistenz
 */

const {
  istAuslastungsRelevant,
  verteileMitarbeiterZeiten,
  verteileLehrlingZeiten,
  berechneKapazitaet,
  berechneAuslastungErgebnis
} = require('../src/utils/auslastung');

// ---------------------------------------------------------------------------
// Hilfsfunktionen für Testdaten
// ---------------------------------------------------------------------------

function baueParams(overrides = {}) {
  const basis = {
    row: {
      gesamt_minuten: 0,
      geplant_minuten: 0,
      in_arbeit_minuten: 0,
      abgeschlossen_minuten: 0,
      termin_anzahl: 0,
      aktive_termine: 0
    },
    mitPuffer: false,
    mitarbeiter: [],
    lehrlinge: [],
    auslastungProMitarbeiter: [],
    auslastungProLehrling: [],
    abwesendeMitarbeiter: new Set(),
    abwesendeMitarbeiterTyp: new Map(),
    abwesendeLehrlinge: new Set(),
    abwesendeLehrlingeTyp: new Map(),
    globaleNebenzeit: 0,
    servicezeitWert: 10,
    pufferzeit: 15,
    urlaub: 0,
    krank: 0,
    debugAbwesenheiten: [],
    datum: '2026-08-05'
  };
  return { ...basis, ...overrides };
}

describe('auslastung – Statusfilter', () => {
  test('storniert und schwebend zählen nicht, abgeschlossen zählt', () => {
    expect(istAuslastungsRelevant({ status: 'geplant' })).toBe(true);
    expect(istAuslastungsRelevant({ status: 'offen' })).toBe(true);
    expect(istAuslastungsRelevant({ status: 'in_arbeit' })).toBe(true);
    expect(istAuslastungsRelevant({ status: 'wartend' })).toBe(true);
    expect(istAuslastungsRelevant({ status: 'abgeschlossen' })).toBe(true);
    expect(istAuslastungsRelevant({ status: 'storniert' })).toBe(false);
    expect(istAuslastungsRelevant({ status: 'geplant', ist_schwebend: 1 })).toBe(false);
    expect(istAuslastungsRelevant({ status: 'geplant', geloescht_am: '2026-08-01' })).toBe(false);
  });

  test('fehlender Status gilt als geplant', () => {
    expect(istAuslastungsRelevant({})).toBe(true);
  });
});

describe('auslastung – Zeitverteilung Mitarbeiter', () => {
  const mitarbeiter = [
    { id: 1, name: 'Anna', arbeitsstunden_pro_tag: 8 },
    { id: 2, name: 'Bert', arbeitsstunden_pro_tag: 8 }
  ];

  test('verteilt Einzelarbeiten auf die jeweils zugeordneten Mitarbeiter', () => {
    const termine = [{
      id: 10,
      geschaetzte_zeit: 180,
      status: 'geplant',
      arbeitszeiten_details: JSON.stringify({
        Bremsen: { zeit: 120, type: 'mitarbeiter', mitarbeiter_id: 1 },
        Oelwechsel: { zeit: 60, type: 'mitarbeiter', mitarbeiter_id: 2 }
      })
    }];

    const map = verteileMitarbeiterZeiten(termine, mitarbeiter);
    expect(map[1].belegt_minuten).toBe(120);
    expect(map[2].belegt_minuten).toBe(60);
    expect(map[1].termin_anzahl).toBe(1);
  });

  test('nutzt die Gesamtzeit nur, wenn keine Einzelarbeit Zeit zugeordnet hat', () => {
    const termine = [{
      id: 11,
      mitarbeiter_id: 1,
      geschaetzte_zeit: 200,
      status: 'geplant',
      arbeitszeiten_details: JSON.stringify({ _gesamt_mitarbeiter_id: { type: 'mitarbeiter', id: 1 } })
    }];

    const map = verteileMitarbeiterZeiten(termine, mitarbeiter);
    expect(map[1].belegt_minuten).toBe(200);
  });

  test('stornierte Termine belegen keine Zeit', () => {
    const termine = [{
      id: 12,
      mitarbeiter_id: 1,
      geschaetzte_zeit: 240,
      status: 'storniert'
    }];

    const map = verteileMitarbeiterZeiten(termine, mitarbeiter);
    expect(map[1].belegt_minuten).toBe(0);
    expect(map[1].termin_anzahl).toBe(0);
  });

  test('tatsaechliche_zeit hat Vorrang vor geschaetzte_zeit', () => {
    const termine = [{
      id: 13,
      mitarbeiter_id: 1,
      geschaetzte_zeit: 60,
      tatsaechliche_zeit: 90,
      status: 'abgeschlossen'
    }];

    const map = verteileMitarbeiterZeiten(termine, mitarbeiter);
    expect(map[1].belegt_minuten).toBe(90);
    expect(map[1].abgeschlossen_minuten).toBe(90);
  });
});

describe('auslastung – Zeitverteilung Lehrlinge', () => {
  const lehrlinge = [
    { id: 1, name: 'Chris', arbeitsstunden_pro_tag: 8, aufgabenbewaeltigung_prozent: 150 },
    { id: 2, name: 'Dana', arbeitsstunden_pro_tag: 8, aufgabenbewaeltigung_prozent: 100 }
  ];

  test('zählt Gesamt-Zuordnung und Einzelarbeiten nicht doppelt', () => {
    // Termin hat sowohl _gesamt_mitarbeiter_id als auch eine Einzelarbeit auf denselben Lehrling
    const termine = [{
      id: 20,
      geschaetzte_zeit: 120,
      status: 'geplant',
      arbeitszeiten_details: JSON.stringify({
        _gesamt_mitarbeiter_id: { type: 'lehrling', id: 1 },
        Bremsen: { zeit: 120, type: 'lehrling', lehrling_id: 1 }
      })
    }];

    const map = verteileLehrlingZeiten(termine, lehrlinge);
    expect(map[1].belegt_minuten_roh).toBe(120);
    expect(map[1].termin_anzahl).toBe(1);
  });

  test('rechnet die Aufgabenbewältigung auf die belegte Zeit auf', () => {
    const termine = [{
      id: 21,
      geschaetzte_zeit: 240,
      status: 'geplant',
      arbeitszeiten_details: JSON.stringify({
        _gesamt_mitarbeiter_id: { type: 'lehrling', id: 1 }
      })
    }];

    const map = verteileLehrlingZeiten(termine, lehrlinge);
    expect(map[1].belegt_minuten_roh).toBe(240);
    // 150 % Aufgabenbewältigung: der Lehrling braucht 1,5-mal so lange
    expect(map[1].belegt_minuten_effektiv).toBe(360);
  });

  test('100 % Aufgabenbewältigung lässt die Zeit unverändert', () => {
    const termine = [{
      id: 22,
      geschaetzte_zeit: 100,
      status: 'geplant',
      arbeitszeiten_details: JSON.stringify({
        _gesamt_mitarbeiter_id: { type: 'lehrling', id: 2 }
      })
    }];

    const map = verteileLehrlingZeiten(termine, lehrlinge);
    expect(map[2].belegt_minuten_effektiv).toBe(100);
  });

  test('schwebende und stornierte Termine bleiben aussen vor', () => {
    const termine = [
      {
        id: 23,
        geschaetzte_zeit: 120,
        status: 'geplant',
        ist_schwebend: 1,
        arbeitszeiten_details: JSON.stringify({ _gesamt_mitarbeiter_id: { type: 'lehrling', id: 2 } })
      },
      {
        id: 24,
        geschaetzte_zeit: 60,
        status: 'storniert',
        arbeitszeiten_details: JSON.stringify({ _gesamt_mitarbeiter_id: { type: 'lehrling', id: 2 } })
      }
    ];

    const map = verteileLehrlingZeiten(termine, lehrlinge);
    expect(map[2].belegt_minuten_roh).toBe(0);
  });
});

describe('auslastung – Kapazität', () => {
  test('summiert anwesende Mitarbeiter und Lehrlinge mit voller Arbeitszeit', () => {
    const kapazitaet = berechneKapazitaet({
      mitarbeiter: [
        { id: 1, arbeitsstunden_pro_tag: 8 },
        { id: 2, arbeitsstunden_pro_tag: 6 }
      ],
      lehrlinge: [{ id: 1, arbeitsstunden_pro_tag: 8, aufgabenbewaeltigung_prozent: 150 }],
      abwesendeMitarbeiter: new Set(),
      abwesendeLehrlinge: new Set()
    });

    // 480 + 360 + 480 – die Aufgabenbewältigung kürzt die Kapazität NICHT
    expect(kapazitaet).toBe(1320);
  });

  test('abwesende Personen liefern keine Kapazität', () => {
    const kapazitaet = berechneKapazitaet({
      mitarbeiter: [{ id: 1, arbeitsstunden_pro_tag: 8 }, { id: 2, arbeitsstunden_pro_tag: 8 }],
      lehrlinge: [{ id: 1, arbeitsstunden_pro_tag: 8 }],
      abwesendeMitarbeiter: new Set([2]),
      abwesendeLehrlinge: new Set([1])
    });

    expect(kapazitaet).toBe(480);
  });

  test('nur_service-Mitarbeiter zählen nicht in die Werkstatt-Kapazität', () => {
    const kapazitaet = berechneKapazitaet({
      mitarbeiter: [
        { id: 1, arbeitsstunden_pro_tag: 8 },
        { id: 2, arbeitsstunden_pro_tag: 8, nur_service: 1 }
      ],
      lehrlinge: [],
      abwesendeMitarbeiter: new Set(),
      abwesendeLehrlinge: new Set()
    });

    expect(kapazitaet).toBe(480);
  });
});

describe('auslastung – Gesamtergebnis und Restzeit', () => {
  test('Restzeit ist Kapazität minus belegter Zeit', () => {
    const result = berechneAuslastungErgebnis(baueParams({
      row: { gesamt_minuten: 300, geplant_minuten: 300, aktive_termine: 2, termin_anzahl: 2 },
      mitarbeiter: [{ id: 1, name: 'Anna', arbeitsstunden_pro_tag: 8 }],
      auslastungProMitarbeiter: [{ mitarbeiter_id: 1, belegt_minuten: 300, termin_anzahl: 2 }]
    }));

    expect(result.gesamt_minuten).toBe(480);
    expect(result.belegt_minuten_mit_service).toBe(300);
    expect(result.verfuegbar_minuten).toBe(180);
    expect(result.auslastung_prozent).toBe(63);
  });

  test('Lehrlings-Verlangsamung wirkt nur auf die Zeit, nicht auf die Kapazität', () => {
    const lehrling = { id: 1, name: 'Chris', arbeitsstunden_pro_tag: 8, aufgabenbewaeltigung_prozent: 150 };
    const result = berechneAuslastungErgebnis(baueParams({
      row: { gesamt_minuten: 240, geplant_minuten: 240, aktive_termine: 1, termin_anzahl: 1 },
      lehrlinge: [lehrling],
      auslastungProLehrling: [{
        lehrling_id: 1,
        lehrling_name: 'Chris',
        arbeitsstunden_pro_tag: 8,
        aufgabenbewaeltigung_prozent: 150,
        belegt_minuten_roh: 240,
        belegt_minuten_effektiv: 360
      }]
    }));

    // Kapazität = volle 8 h, belegt = 240 * 1,5 = 360, Rest = 120
    expect(result.gesamt_minuten).toBe(480);
    expect(result.belegt_minuten_mit_service).toBe(360);
    expect(result.verfuegbar_minuten).toBe(120);
    expect(result.auslastung_prozent).toBe(75);
  });

  test('Einzelzeile des Lehrlings passt zur Gesamtsumme', () => {
    const lehrling = { id: 1, name: 'Chris', arbeitsstunden_pro_tag: 8, aufgabenbewaeltigung_prozent: 150 };
    const result = berechneAuslastungErgebnis(baueParams({
      row: { gesamt_minuten: 240, geplant_minuten: 240, aktive_termine: 1, termin_anzahl: 1 },
      lehrlinge: [lehrling],
      auslastungProLehrling: [{
        lehrling_id: 1,
        lehrling_name: 'Chris',
        arbeitsstunden_pro_tag: 8,
        aufgabenbewaeltigung_prozent: 150,
        belegt_minuten_roh: 240,
        belegt_minuten_effektiv: 360
      }]
    }));

    const zeile = result.lehrlinge_auslastung[0];
    expect(zeile.belegt_minuten).toBe(360);
    expect(zeile.verfuegbar_minuten).toBe(480);
    expect(zeile.auslastung_prozent).toBe(75);
    expect(zeile.auslastung_prozent).toBe(result.auslastung_prozent);
  });

  test('Nebenzeit wird beim nur_service-Abzug mit demselben Faktor gerechnet', () => {
    // 1000 min gesamt, davon 300 min beim Service-Mitarbeiter, 20 % Nebenzeit
    const result = berechneAuslastungErgebnis(baueParams({
      row: { gesamt_minuten: 1000, geplant_minuten: 1000, aktive_termine: 5, termin_anzahl: 5 },
      globaleNebenzeit: 20,
      mitarbeiter: [
        { id: 1, name: 'Anna', arbeitsstunden_pro_tag: 8 },
        { id: 2, name: 'Sven', arbeitsstunden_pro_tag: 8, nur_service: 1 }
      ],
      auslastungProMitarbeiter: [
        { mitarbeiter_id: 1, belegt_minuten: 700, termin_anzahl: 3 },
        { mitarbeiter_id: 2, belegt_minuten: 300, termin_anzahl: 2 }
      ]
    }));

    // 1000 * 1,2 = 1200 gesamt, Service 300 * 1,2 = 360 → 840 bleiben in der Werkstatt
    expect(result.belegt_minuten_mit_service).toBe(840);
    // Kapazität: nur Anna (Service-Mitarbeiter zählt nicht mit) = 480
    expect(result.gesamt_minuten).toBe(480);
    expect(result.verfuegbar_minuten).toBe(0);
  });

  test('abwesender Mitarbeiter liefert keine Kapazität und wird markiert', () => {
    const result = berechneAuslastungErgebnis(baueParams({
      row: { gesamt_minuten: 120, geplant_minuten: 120, aktive_termine: 1, termin_anzahl: 1 },
      mitarbeiter: [
        { id: 1, name: 'Anna', arbeitsstunden_pro_tag: 8 },
        { id: 2, name: 'Bert', arbeitsstunden_pro_tag: 8 }
      ],
      auslastungProMitarbeiter: [{ mitarbeiter_id: 1, belegt_minuten: 120, termin_anzahl: 1 }],
      abwesendeMitarbeiter: new Set([2]),
      abwesendeMitarbeiterTyp: new Map([[2, 'urlaub']])
    }));

    expect(result.gesamt_minuten).toBe(480);
    expect(result.verfuegbar_minuten).toBe(360);

    const bert = result.mitarbeiter_auslastung.find(m => m.mitarbeiter_id === 2);
    expect(bert.ist_abwesend).toBe(true);
    expect(bert.abwesenheits_typ).toBe('urlaub');
    expect(bert.verfuegbar_minuten).toBe(0);
  });

  test('Restzeit wird bei Überlast auf 0 begrenzt, Prozent aber nicht', () => {
    const result = berechneAuslastungErgebnis(baueParams({
      row: { gesamt_minuten: 600, geplant_minuten: 600, aktive_termine: 3, termin_anzahl: 3 },
      mitarbeiter: [{ id: 1, name: 'Anna', arbeitsstunden_pro_tag: 8 }],
      auslastungProMitarbeiter: [{ mitarbeiter_id: 1, belegt_minuten: 600, termin_anzahl: 3 }]
    }));

    expect(result.verfuegbar_minuten).toBe(0);
    expect(result.auslastung_prozent).toBe(125);
  });

  test('ohne Kapazität und ohne Termine bleibt alles bei 0', () => {
    const result = berechneAuslastungErgebnis(baueParams());

    expect(result.gesamt_minuten).toBe(0);
    expect(result.verfuegbar_minuten).toBe(0);
    expect(result.auslastung_prozent).toBe(0);
  });
});

describe('auslastung – Verkettung wie im Betrieb', () => {
  // Die Verteilfunktionen liefern genau das, was berechneAuslastungErgebnis
  // erwartet. Dieser Test hält beide Schichten zusammen.
  test('Verteilung und Gesamtergebnis passen zusammen', () => {
    const mitarbeiter = [{ id: 1, name: 'Anna', arbeitsstunden_pro_tag: 8 }];
    const lehrlinge = [{ id: 1, name: 'Chris', arbeitsstunden_pro_tag: 8, aufgabenbewaeltigung_prozent: 150 }];

    const termine = [
      // Mitarbeiter-Termin: 120 min
      { id: 1, mitarbeiter_id: 1, geschaetzte_zeit: 120, status: 'geplant' },
      // Lehrlings-Termin: 240 min Grundzeit
      {
        id: 2,
        geschaetzte_zeit: 240,
        status: 'geplant',
        arbeitszeiten_details: JSON.stringify({ _gesamt_mitarbeiter_id: { type: 'lehrling', id: 1 } })
      },
      // Storniert: darf nirgends auftauchen
      { id: 3, mitarbeiter_id: 1, geschaetzte_zeit: 300, status: 'storniert' }
    ];

    const proMitarbeiter = Object.values(verteileMitarbeiterZeiten(termine, mitarbeiter));
    const proLehrling = Object.values(verteileLehrlingZeiten(termine, lehrlinge));

    expect(proMitarbeiter[0].belegt_minuten).toBe(120);
    expect(proLehrling[0].belegt_minuten_effektiv).toBe(360);

    const result = berechneAuslastungErgebnis(baueParams({
      // Das SQL summiert die Grundzeiten der nicht stornierten Termine: 120 + 240
      row: { gesamt_minuten: 360, geplant_minuten: 360, aktive_termine: 2, termin_anzahl: 2 },
      mitarbeiter,
      lehrlinge,
      auslastungProMitarbeiter: proMitarbeiter,
      auslastungProLehrling: proLehrling
    }));

    // Kapazität 2 x 480 = 960; belegt 120 + 360 = 480
    expect(result.gesamt_minuten).toBe(960);
    expect(result.belegt_minuten_mit_service).toBe(480);
    expect(result.verfuegbar_minuten).toBe(480);
    expect(result.auslastung_prozent).toBe(50);
  });
});
