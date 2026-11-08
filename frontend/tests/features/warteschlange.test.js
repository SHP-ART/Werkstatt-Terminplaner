import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  berechneWarteschlangeLast,
  installWarteschlangeFeature
} from '../../src/features/warteschlange/warteschlangeFeature.js';
import '../../src/services/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('berechneWarteschlangeLast', () => {
  it('zeigt eine leere Kapazität ohne Überlauf grün und leer an', () => {
    expect(berechneWarteschlangeLast(0, 0)).toEqual({
      prozent: 0,
      balkenProzent: 0,
      farbe: '#2e7d32',
      morgen: false
    });
  });

  it('berechnet eine normale Auslastung als grünen Balken', () => {
    expect(berechneWarteschlangeLast(60, 120)).toEqual({
      prozent: 50,
      balkenProzent: 50,
      farbe: '#2e7d32',
      morgen: false
    });
  });

  it('markiert mehr als 80 Prozent ohne Überlauf orange', () => {
    expect(berechneWarteschlangeLast(100, 120)).toEqual({
      prozent: 83,
      balkenProzent: 83,
      farbe: '#f57c00',
      morgen: false
    });
  });

  it('begrenzt Überlauf optisch auf 100 Prozent und meldet morgen', () => {
    expect(berechneWarteschlangeLast(150, 120)).toEqual({
      prozent: 125,
      balkenProzent: 100,
      farbe: '#c62828',
      morgen: true
    });
  });

  it('behandelt Last ohne Kapazität als vollen roten Überlauf', () => {
    expect(berechneWarteschlangeLast(30, 0)).toEqual({
      prozent: 100,
      balkenProzent: 100,
      farbe: '#c62828',
      morgen: true
    });
  });
});

describe('WarteschlangeService.zuweisen', () => {
  it('sendet das ausgewählte Board-Datum im Request-Body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    });
    vi.stubGlobal('CONFIG', { API_URL: 'http://test.local' });
    vi.stubGlobal('fetch', fetchMock);

    await window.WarteschlangeService.zuweisen(3, 7, 2, '2026-11-09');

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      termin_id: 3,
      mitarbeiter_id: 7,
      position: 2,
      datum: '2026-11-09'
    });
  });
});

function warteschlangeDaten(terminId) {
  return {
    datum: '2026-11-09',
    neu: { termine: [], auftragsimporte: [] },
    mitarbeiter: [{
      mitarbeiter_id: 7,
      mitarbeiter_name: 'Mechaniker',
      kapazitaet_minuten: 480,
      last_minuten: 60,
      zettel: [{
        id: terminId,
        kunde_name: 'Kunde',
        kennzeichen: 'AB-123',
        arbeit: 'Inspektion',
        geschaetzte_zeit: 60,
        morgen: false
      }]
    }]
  };
}

function createWarteschlangeApp() {
  class TestApp {}
  installWarteschlangeFeature(TestApp);
  const app = new TestApp();
  app.bindEventListenerOnce = (element, event, handler) => {
    element?.addEventListener(event, handler);
  };
  app.showToast = vi.fn();
  document.body.innerHTML = `
    <input id="warteschlangeDatum" value="2026-11-08">
    <p id="warteschlangeStatus"></p>
    <div id="warteschlangeBoard"></div>`;
  return app;
}

describe('Warteschlange-Ladezustand', () => {
  it('ersetzt alte Karten während eines Datumswechsels durch den Ladezustand', async () => {
    const app = createWarteschlangeApp();
    app.warteschlangeData = warteschlangeDaten(1);
    app.renderWarteschlange();
    let resolveLoad;
    vi.stubGlobal('WarteschlangeService', {
      getByDatum: vi.fn().mockReturnValue(new Promise(resolve => {
        resolveLoad = resolve;
      }))
    });

    document.getElementById('warteschlangeDatum').value = '2026-11-09';
    const ladung = app.loadWarteschlange();
    try {
      expect(document.querySelector('[data-termin-id="1"]')).toBeNull();
      expect(document.getElementById('warteschlangeBoard').textContent).toContain('wird geladen');
    } finally {
      resolveLoad(warteschlangeDaten(2));
      await ladung;
    }
  });

  it('lässt alte Karten nach einem Ladefehler nicht bedienbar stehen', async () => {
    const app = createWarteschlangeApp();
    app.warteschlangeData = warteschlangeDaten(1);
    app.renderWarteschlange();
    vi.stubGlobal('WarteschlangeService', {
      getByDatum: vi.fn().mockRejectedValue(new Error('offline'))
    });

    document.getElementById('warteschlangeDatum').value = '2026-11-09';
    await app.loadWarteschlange();

    expect(document.querySelector('[data-termin-id="1"]')).toBeNull();
    expect(document.getElementById('warteschlangeBoard').textContent).toContain('nicht verfügbar');
  });
});

describe('Warteschlange-Mutationen', () => {
  it('meldet einen Reload-Fehler nicht als fehlgeschlagene Server-Mutation', async () => {
    const app = createWarteschlangeApp();
    app.setWarteschlangeStatus = vi.fn();
    app.loadWarteschlange = vi.fn().mockRejectedValue(new Error('offline'));
    const mutation = vi.fn().mockResolvedValue({});

    await app.mutiereWarteschlange(mutation, 'Gespeichert');

    expect(mutation).toHaveBeenCalledOnce();
    expect(app.showToast).toHaveBeenCalledWith('Gespeichert', 'success');
    expect(app.showToast).not.toHaveBeenCalledWith('Die Warteschlange wurde nicht geändert.', 'error');
    expect(app.setWarteschlangeStatus).toHaveBeenCalledWith(
      expect.stringContaining('Änderung gespeichert'),
      true
    );
  });
});

describe('Warteschlange-Kollegenauswahl', () => {
  it('vergleicht freie Kapazität mit der effektiven Zetteldauer inklusive Nebenzeit', () => {
    const app = createWarteschlangeApp();
    app.warteschlangeData = {
      mitarbeiter: [
        { mitarbeiter_id: 1, kapazitaet_minuten: 480, last_minuten: 495 },
        { mitarbeiter_id: 2, kapazitaet_minuten: 480, last_minuten: 330 }
      ]
    };

    const kollegen = app.getWarteschlangeKollegen({
      geschaetzte_zeit: 150,
      effektive_zeit_minuten: 165
    }, 1);

    expect(kollegen).toEqual([]);
  });
});

describe('Warteschlange-Terminstatus', () => {
  it('markiert einen Zettel mit Status in_arbeit sichtbar als läuft', () => {
    const app = createWarteschlangeApp();
    app.warteschlangeData = warteschlangeDaten(1);
    app.warteschlangeData.mitarbeiter[0].zettel[0].status = 'in_arbeit';

    app.renderWarteschlange();

    const karte = document.querySelector('[data-termin-id="1"]');
    expect(karte.textContent).toContain('läuft');
  });
});

describe('Warteschlange-Lehrlinge und Warnungen', () => {
  it('zeigt Lehrlings-Spalte und beide Warnungstexte am Zettel', () => {
    const app = createWarteschlangeApp();
    app.warteschlangeData = {
      neu: { termine: [], auftragsimporte: [] },
      mitarbeiter: [],
      lehrlinge: [{
        lehrling_id: 3,
        lehrling_name: 'Lehrling Lena',
        kapazitaet_minuten: 480,
        last_minuten: 165,
        zettel: [{
          id: 9,
          kunde_name: 'Kunde',
          kennzeichen: 'AB-1',
          arbeit: 'Inspektion',
          geschaetzte_zeit: 150,
          effektive_zeit_minuten: 165,
          warnungen: [
            { code: 'bringzeit_verpasst', message: 'Bringzeit 09:00 nicht eingehalten – frühester Start 10:15' },
            { code: 'abholzeit_verpasst', message: 'Abholzeit 16:00 nicht erreichbar – fertig ca. 16:30' }
          ]
        }]
      }]
    };

    app.renderWarteschlange();

    const text = document.getElementById('warteschlangeBoard').textContent;
    expect(text).toContain('Lehrling Lena');
    expect(text).toContain('Bringzeit 09:00 nicht eingehalten');
    expect(text).toContain('Abholzeit 16:00 nicht erreichbar');
  });

  it('sendet die Lehrlings-Ressource beim Zuweisen', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('CONFIG', { API_URL: 'http://test.local' });
    vi.stubGlobal('fetch', fetchMock);

    await window.WarteschlangeService.zuweisen(9, { typ: 'lehrling', id: 3 }, null, '2026-11-09');

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      termin_id: 9,
      person_typ: 'lehrling',
      person_id: 3,
      datum: '2026-11-09'
    });
  });
});

describe('Warteschlange-Layout', () => {
  it('zeigt Personen oberhalb des gemeinsamen NEU-Bereichs', () => {
    const app = createWarteschlangeApp();
    app.warteschlangeData = warteschlangeDaten(1);
    app.warteschlangeData.neu.termine = [{
      id: 2,
      kunde_name: 'Neuer Kunde',
      kennzeichen: 'NEU-1',
      arbeit: 'Bremsen',
      geschaetzte_zeit: 90
    }];

    app.renderWarteschlange();

    const board = document.getElementById('warteschlangeBoard');
    const personen = board.querySelector(':scope > .warteschlange-personen');
    const neu = board.querySelector(':scope > .warteschlange-neu');
    expect(personen).not.toBeNull();
    expect(neu).not.toBeNull();
    expect(personen.nextElementSibling).toBe(neu);
    expect(personen.querySelector('[data-termin-id="1"]')).not.toBeNull();
    expect(neu.querySelector('[data-termin-id="2"]')).not.toBeNull();
  });
});
