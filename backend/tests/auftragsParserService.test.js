const {
  parseAuftragsText,
  applySystemArbeitszeiten
} = require('../src/services/auftragsParserService');

describe('auftragsParserService', () => {
  test('erkennt Kernfelder aus Locosoft-Text', () => {
    const text = [
      'Frau',
      'Laura Scholz',
      'Briesker Strasse 36',
      '01968 Senftenberg',
      'Datum: 13.05.2026',
      'Berater: Sven Hube',
      'Auftragsbestaetigung Nr. 1140',
      'Kd.Nr.: 28243 Seite: 1',
      'unv. Bringtermin: ___________ um _______ Uhr , unv. Abholtermin: 13.05.26 um 17:00 Uhr',
      'Citroen C4 PureTech 130 EAT8 Farbe: EQN-Islandblau km-Stand: 53175',
      'SFB-LQ 99 Fg-Nr: VR7BAHNSANE044250 Erstzul.: 19.09.2022 MC: TD*142176*',
      'P. Arb/ET-Nr. Dienstleistung/Benennung A Anz/Mng* Stueckpr. EUR',
      '1. 202 A.U. - Abgasuntersuchung durchfuehren 2J. 10 46,64',
      'Auftragssumme netto EUR 415,50'
    ].join('\n');

    const result = parseAuftragsText(text);

    expect(result.kunde.name).toBe('Laura Scholz');
    expect(result.datum).toBe('13.05.2026');
    expect(result.auftragsnummer).toBe('1140');
    expect(result.kundennummer).toBe('28243');
    expect(result.abholung).toEqual({ datum: '13.05.26', zeit: '17:00' });
    expect(result.fahrzeug.kennzeichen).toBe('SFB-LQ 99');
    expect(result.fahrzeug.vin).toBe('VR7BAHNSANE044250');
    expect(result.arbeit.summary).toContain('AU');
    expect(result.arbeit.items).toEqual([
      {
        text: 'AU',
        originalText: 'A.U. - Abgasuntersuchung durchfuehren 2J.',
        sourceLines: ['1. 202 A.U. - Abgasuntersuchung durchfuehren 2J. 10 46,64'],
        dauer_minuten_pdf: 60
      }
    ]);
  });

  test('fasst mehrzeilige Arbeiten zusammen und filtert Materialzeilen', () => {
    const text = [
      'Firma',
      'BLUMENHAUS SCHOLZ',
      'Sylvia Scholz',
      'Briesker Str. 36',
      '01968 Senftenberg',
      'Datum: 13.05.2026',
      'Berater: Marcus Petsch',
      'Auftragsbestaetigung Nr. 1116',
      'Kd.Nr.: 31046 Seite: 1',
      'unv. Bringtermin: ___________ um _______ Uhr , unv. Abholtermin: 13.05.26 um 16:00 Uhr',
      'Citroen SPACETOURER BlueHDi 150 2.0 Bus Farbe: Schwarz EXY km-Stand: 52102',
      'SFB-SY 742 Fg-Nr: VF7VEAHXHJZ062800 Erstzul.: 29.06.2018 MC: TD*118967*',
      'Arb.Nr. durchzufuehrende Arbeiten BA Anzahl AW EUR',
      'MONTREIFEN ERNEUERT INKL. VENTIL UND',
      'AUSWUCHTEN10655,44',
      'ALTREALTREIFENENTSORGUNG102,10',
      'CHECKFAHRZEUGCHECK UEBERPRUEFUNG DER',
      'BETRIEBSFLUESSIGKEITEN, KONTROLLE DER',
      'BREMSEN, REIFEN, BELEUCHTUNG,',
      'WISCHERBLAETTER, SICHTPRUEFUNG DER',
      'FAHRWERKSTEILE1016,77',
      'Teile-Nummer Benennung TA Menge * Stueckpr. EUR',
      '2255517SOMMERREIFEN102 140,67 281,34',
      'Auftragssumme netto EUR 409,01'
    ].join('\n');

    const result = parseAuftragsText(text);

    expect(result.arbeit.items.map((item) => item.text)).toEqual([
      'Reifen erneuern',
      'Altreifenentsorgung',
      'Fahrzeugcheck'
    ]);
    expect(result.arbeit.summary).not.toContain('SOMMERREIFEN');
  });

  test('erkennt ausgeschriebene AWs als 6-Minuten-Arbeitswerte', () => {
    const text = [
      'Herr',
      'Frank Bartsch',
      'Musterstrasse 1',
      '01968 Senftenberg',
      'Datum: 19.05.2026',
      'Berater: Sven Hube',
      'Auftragsbestaetigung Nr. 1200',
      'Kd.Nr.: 12345 Seite: 1',
      'Citroen C5 Farbe: Grau km-Stand: 100000',
      'OSL-DM 844 Fg-Nr: VF7ABCDEFG1234567 Erstzul.: 01.01.2020',
      'Arb.Nr. durchzufuehrende Arbeiten BA Anzahl AW EUR',
      '001AUSTAUSCH GENERATOR 19AWs 123,45',
      'Auftragssumme netto EUR 123,45'
    ].join('\n');

    const result = parseAuftragsText(text);

    expect(result.arbeit.items).toEqual([
      expect.objectContaining({
        text: 'AUSTAUSCH GENERATOR',
        originalText: 'AUSTAUSCH GENERATOR',
        dauer_minuten_pdf: 114
      })
    ]);
  });

  test('nutzt System-Arbeitszeiten fuer geschaetzte Zeit wenn PDF keine Zeit liefert', () => {
    const daten = {
      arbeit: {
        items: [
          { text: 'AU', originalText: 'A.U. - Abgasuntersuchung' },
          { text: 'HU', originalText: 'Hauptuntersuchung DEKRA' },
          { text: 'Wartung', originalText: 'SYSTEMATISCHE WARTUNGSARBEITEN' },
          { text: 'Pollenfilter', originalText: 'AUSTAUSCH POLLENFILTER WARTUNG' }
        ],
        summary: 'AU; HU; Wartung; Pollenfilter'
      }
    };
    const arbeitszeiten = [
      { id: 1, bezeichnung: 'Abgasuntersuchung', standard_minuten: 45, aliase: 'AU,A.U.' },
      { id: 2, bezeichnung: 'Hauptuntersuchung', standard_minuten: 45, aliase: 'HU,DEKRA' },
      { id: 3, bezeichnung: 'Wartung', standard_minuten: 90, aliase: 'Inspektion,Systematische Wartung' },
      { id: 3, bezeichnung: 'Pollenfilter', standard_minuten: 15, aliase: 'Innenraumfilter' }
    ];

    const result = applySystemArbeitszeiten(daten, arbeitszeiten);

    expect(result.geschaetzte_zeit).toBe(120);
    expect(result.zeit_quelle).toBe('arbeitszeiten');
    expect(result.arbeit.summary).toBe(['AU/HU', 'Wartung'].join('\n'));
    expect(result.arbeit.items.map((item) => item.text)).toEqual(['AU/HU', 'Wartung']);
    expect(result.arbeit.items.map((item) => item.dauer_minuten)).toEqual([30, 90]);
    expect(result.arbeit.items.map((item) => item.zeit_quelle)).toEqual([
      'pruefung_max_30',
      'arbeitszeiten'
    ]);
  });

  test('markiert Fallback wenn keine System-Arbeitszeit passt', () => {
    const daten = {
      arbeit: {
        items: [{ text: 'Unbekannte Arbeit', originalText: 'Unbekannte Arbeit' }],
        summary: 'Unbekannte Arbeit'
      }
    };

    const result = applySystemArbeitszeiten(daten, [], { fallbackMinuten: 60 });

    expect(result.geschaetzte_zeit).toBe(60);
    expect(result.zeit_quelle).toBe('fallback');
    expect(result.arbeit.items[0].zeit_quelle).toBe('fallback');
  });

  test('addiert unbekannte Nebenarbeiten nicht als 60-Minuten-Fallback wenn Systemzeiten gefunden wurden', () => {
    const daten = {
      arbeit: {
        items: [
          { text: 'Reifen erneuern', originalText: 'Reifen erneuert inkl. Auswuchten' },
          { text: 'Altreifenentsorgung', originalText: 'Altreifenentsorgung' },
          { text: 'Fahrzeugcheck', originalText: 'Fahrzeugcheck' }
        ],
        summary: 'Reifen erneuern; Altreifenentsorgung; Fahrzeugcheck'
      }
    };
    const arbeitszeiten = [
      { id: 1, bezeichnung: 'Reifen erneuern', standard_minuten: 45, aliase: 'Auswuchten' },
      { id: 2, bezeichnung: 'Fahrzeugcheck', standard_minuten: 20, aliase: '' }
    ];

    const result = applySystemArbeitszeiten(daten, arbeitszeiten);

    expect(result.geschaetzte_zeit).toBe(65);
    expect(result.arbeit.items.map((item) => item.dauer_minuten)).toEqual([45, 0, 20]);
    expect(result.arbeit.items[1].zeit_quelle).toBe('ohne_systemzeit');
  });

  test('zaehlt Wartung nach Herstellervorgaben nicht doppelt zur systematischen Wartung', () => {
    const daten = {
      arbeit: {
        items: [
          { text: 'AU', originalText: 'A.U. - Abgasuntersuchung' },
          { text: 'HU', originalText: 'Hauptuntersuchung DEKRA' },
          { text: 'Wartung nach Herstellervorgaben', originalText: 'Wartung nach Herstellervorgaben' },
          { text: 'Wartung', originalText: 'WARTUNGEN: SYSTEMATISCHE ARBEITEN' }
        ],
        summary: 'AU; HU; Wartung nach Herstellervorgaben; Wartung'
      }
    };
    const arbeitszeiten = [
      { id: 1, bezeichnung: 'Wartung', standard_minuten: 125, aliase: 'Inspektion,Systematische Wartung' }
    ];

    const result = applySystemArbeitszeiten(daten, arbeitszeiten);

    expect(result.arbeit.items.map((item) => item.text)).toEqual(['AU/HU', 'Wartung']);
    expect(result.arbeit.items.map((item) => item.dauer_minuten)).toEqual([30, 125]);
    expect(result.geschaetzte_zeit).toBe(155);
  });

  test('zaehlt Zuendkerzen-Austausch mit Wartung nicht doppelt', () => {
    const daten = {
      arbeit: {
        items: [
          { text: 'AU', originalText: 'A.U. - Abgasuntersuchung' },
          { text: 'HU', originalText: 'Hauptuntersuchung DEKRA' },
          { text: 'Wartung', originalText: 'WARTUNG NACH HERSTELLERVORGABEN' },
          {
            text: 'AUSTAUSCH ZUENDKERZEN (SATZ) WARTUNG',
            originalText: 'AUSTAUSCH ZUENDKERZEN (SATZ) WARTUNG'
          }
        ],
        summary: 'AU\nHU\nWartung\nAUSTAUSCH ZUENDKERZEN (SATZ) WARTUNG'
      }
    };
    const arbeitszeiten = [
      { id: 1, bezeichnung: 'Wartung', standard_minuten: 125, aliase: 'Inspektion,Systematische Wartung' }
    ];

    const result = applySystemArbeitszeiten(daten, arbeitszeiten);

    expect(result.arbeit.items.map((item) => item.text)).toEqual(['AU/HU', 'Wartung']);
    expect(result.arbeit.items.map((item) => item.dauer_minuten)).toEqual([30, 125]);
    expect(result.geschaetzte_zeit).toBe(155);
  });

});
