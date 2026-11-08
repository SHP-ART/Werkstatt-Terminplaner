const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const regular = html.indexOf(`    function ${name}(`);
  const async = html.indexOf(`    async function ${name}(`);
  const starts = [regular, async].filter(index => index !== -1);
  assert.ok(starts.length > 0, `${name} fehlt`);
  const start = Math.min(...starts);
  const nextRegular = html.indexOf('\n    function ', start + 1);
  const nextAsync = html.indexOf('\n    async function ', start + 1);
  const ends = [nextRegular, nextAsync].filter(index => index !== -1);
  return html.slice(start, Math.min(...ends));
}

function renderKachel(queueEintrag) {
  const klassischerTermin = {
    id: 1,
    termin_nr: 'T-1',
    kunde_name: 'Klassisch Kunde',
    kennzeichen: 'KL-1',
    arbeit: 'Inspektion',
    status: 'geplant',
    mitarbeiter_id: 7,
    geschaetzte_zeit: 60
  };
  const context = vm.createContext({
    console: { log() {}, error() {} },
    Date,
    escapeHtml: value => String(value ?? ''),
    formatDateLocal: () => '2026-11-07',
    formatMinutesToHours: value => `${value} min`,
    getArbeitenFromTermin: () => [],
    getEffektiveArbeitszeitMitFaktoren: termin => termin.geschaetzte_zeit,
    getEffektiveStartzeit: termin => termin.startzeit || null,
    istPersonAktuellInPause: () => false,
    isTerminFuerPerson: (termin, personId) => termin.mitarbeiter_id === personId,
    renderArbeitenKompakt: () => '',
    renderTagesstempelZeile: () => ''
  });
  vm.runInContext(`${extractFunction('renderTerminWarnungenTablet')}; ${extractFunction('renderPersonKachel')}; this.render = renderPersonKachel;`, context);
  return context.render(
    { id: 7, name: 'Mechaniker', aktiv: 1 },
    [klassischerTermin],
    'mitarbeiter',
    0,
    null,
    [],
    null,
    [],
    queueEintrag
  );
}

test('leere Queue behält den klassischen nächsten Auftrag und dessen Startweg', () => {
  const output = renderKachel({ zettel: null });
  assert.match(output, /Klassisch Kunde/);
  assert.match(output, /handleBestaetigen\(7, 'mitarbeiter', 1,/);
});

test('fehlerhafte Queue behält den klassischen nächsten Auftrag und dessen Startweg', () => {
  const output = renderKachel({ zettel: null, fehler: true });
  assert.match(output, /Klassisch Kunde/);
  assert.match(output, /handleBestaetigen\(7, 'mitarbeiter', 1,/);
});

test('ein geplanter Queue-Zettel ersetzt die klassische Auswahl', () => {
  const output = renderKachel({
    zettel: {
      id: 2,
      termin_nr: 'T-2',
      kunde_name: 'Queue Kunde',
      kennzeichen: 'QU-2',
      arbeit: 'Bremsen',
      status: 'geplant',
      mitarbeiter_id: 7,
      geschaetzte_zeit: 30
    }
  });
  assert.match(output, /Queue Kunde/);
  assert.doesNotMatch(output, /Klassisch Kunde/);
  assert.match(output, /handleNaechstenAuftragAnstempeln\(7, 2,/);
});

test('Tablet zeigt zentrale Abholzeit-Meldung als Text', () => {
  const output = renderKachel({
    zettel: {
      id: 2,
      status: 'geplant',
      termin_nr: 'T-2',
      kunde_name: 'Queue Kunde',
      kennzeichen: 'QU-2',
      arbeit: 'Bremsen',
      geschaetzte_zeit: 30,
      warnungen: [{
        code: 'abholzeit_verpasst',
        message: 'Abholzeit 16:00 nicht erreichbar – fertig ca. 16:30'
      }]
    }
  });
  assert.match(output, /Abholzeit 16:00 nicht erreichbar/);
});

function createAnstempelHarness() {
  const calls = [];
  const toasts = [];
  let statusAttempts = 0;
  let currentDate = '2026-11-07T09:15:00';
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length > 0 ? args : [currentDate]));
    }
  }
  const zettel = {
    id: 7,
    kunde_name: 'Queue Kunde',
    arbeit: 'Inspektion',
    arbeitszeiten_details: { Inspektion: { zeit: 60 } }
  };
  const storage = new Map();
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    ApiService: {
      put: async (url, body) => {
        calls.push({ url, body: { ...body } });
        if (url === '/termine/7' && statusAttempts++ === 0) {
          throw new Error('Status nicht erreichbar');
        }
        return {};
      },
      post: async () => ({})
    },
    Date: FakeDate,
    Map,
    console: { log() {}, error() {} },
    formatDateLocal: () => '2026-11-07',
    loadTeamUebersicht: async () => {},
    naechsteZettelNachId: new Map([[7, zettel]]),
    showToast: (...args) => toasts.push(args)
  });
  vm.runInContext(`
    ${extractFunction('getArbeitenFromTermin')}
    ${extractFunction('handleBestaetigen')}
    ${extractFunction('handleNaechstenAuftragAnstempeln')}
    this.bestaetigen = handleBestaetigen;
    this.anstempeln = handleNaechstenAuftragAnstempeln;
  `, context);
  return {
    calls,
    context,
    toasts,
    zettel,
    storage,
    advanceClock() { currentDate = '2026-11-07T09:20:00'; }
  };
}

test('Statusfehler stellt den Stempel wieder her und Retry behält den ursprünglichen Start', async () => {
  const harness = createAnstempelHarness();

  await harness.context.anstempeln(7, 7, null);
  harness.advanceClock();
  await harness.context.anstempeln(7, 7, null);

  const stempelCalls = harness.calls.filter(call => call.url === '/stempelzeiten/stempel');
  assert.equal(stempelCalls.length, 3);
  assert.equal(stempelCalls[0].body.stempel_start, '09:15');
  assert.equal(stempelCalls[1].body.stempel_start, null);
  assert.equal(stempelCalls[1].body.stempel_ende, null);
  assert.equal(stempelCalls[2].body.stempel_start, '09:15');
  assert.equal(harness.calls.filter(call => call.url === '/termine/7').length, 2);
});

test('bestehende Bestätigen-Aufrufer behalten ihre interne Fehleranzeige', async () => {
  const harness = createAnstempelHarness();

  await harness.context.bestaetigen(7, 'mitarbeiter', 7, 'Queue Kunde');

  assert.deepEqual(harness.toasts.at(-1), ['Fehler: Status nicht erreichbar', 'error']);
});

test('Retry nach Reload verwendet den ursprünglichen Anstempel-Start', async () => {
  const harness = createAnstempelHarness();

  await harness.context.anstempeln(7, 7, null);
  harness.advanceClock();
  harness.context.naechsteZettelNachId = new Map([[7, {
    id: 7,
    kunde_name: 'Queue Kunde',
    arbeit: 'Inspektion',
    arbeitszeiten_details: { Inspektion: { zeit: 60 } }
  }]]);
  await harness.context.anstempeln(7, 7, null);

  const stempelCalls = harness.calls.filter(call => call.url === '/stempelzeiten/stempel');
  assert.equal(stempelCalls[2].body.stempel_start, '09:15');
});

test('Rollback verwendet die relational gespeicherten vorherigen Stempelwerte', async () => {
  const harness = createAnstempelHarness();
  harness.context.naechsteZettelNachId.get(7).arbeiten = [{
    name: 'Inspektion',
    zeit: 60,
    abgeschlossen: false,
    stempel_start: '08:00',
    stempel_ende: '08:30'
  }];

  await harness.context.anstempeln(7, 7, null);

  const stempelCalls = harness.calls.filter(call => call.url === '/stempelzeiten/stempel');
  assert.equal(stempelCalls[0].body.stempel_start, '08:00');
  const rollback = stempelCalls[1];
  assert.equal(rollback.body.stempel_start, '08:00');
  assert.equal(rollback.body.stempel_ende, '08:30');
});
