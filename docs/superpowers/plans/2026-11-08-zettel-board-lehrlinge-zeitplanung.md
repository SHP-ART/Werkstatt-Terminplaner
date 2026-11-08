# Zettel-Board: Lehrlinge und gemeinsame Zeitplanung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lehrlinge erhalten eigene Zettel-Queues, und alle Queue-Aufträge erscheinen mit zentral berechneten Zeiten sowie Bring-/Abholzeit-Warnungen konsistent in Board, Planung (Beta) und Tablet.

**Architecture:** Die Queue wird von einer reinen Mechaniker-Ressource zu einer typisierten Personenressource erweitert. Eine aus dem bestehenden Controller ausgelagerte Zeitplanungs-Servicefunktion wird sowohl vom bisherigen HTTP-Endpunkt als auch von Queue-Mutationen verwendet. Eine reine Warnungsfunktion erzeugt aus denselben gespeicherten Zeitfeldern die Meldungen für alle Clients.

**Tech Stack:** Node.js/CommonJS, Express, SQLite, Jest/Supertest, Vanilla JS/Vite/Vitest, Electron-Tablet mit Node-Test.

## Global Constraints

- Design: `docs/superpowers/specs/2026-11-08-zettel-board-lehrlinge-zeitplanung-design.md` ist freigegeben.
- Test-First: Jeder neue Verhaltensblock beginnt mit einem Test, der aus dem erwarteten Grund rot ist.
- Route → Controller → Model; Model nur DB, Controller Geschäftslogik.
- `dbHelper`, `asyncHandler`, `withTransaction()` und die vorhandene Queue-Serialisierung verwenden.
- CommonJS im Backend, 2 Leerzeichen, Semikolons; keine neue Dependency.
- `broadcastEvent('termin.queue_updated', ...)` und vorhandene `termin.*`-Reaktionen beibehalten.
- `API_BASE_URL` nur aus `api.js`; kein hartkodierter Host oder Port.
- `bring_zeit` ist die unveränderliche Kunden-Richtzeit und darf durch die Neuzeitberechnung nicht überschrieben werden.
- Gleichheit mit Bring- oder Abholzeit ist erlaubt; nur echtes Überschreiten erzeugt eine Warnung.
- Kein PDF-Import-, KI- oder unbeteiligtes Planungs-Refactoring.
- Kein Produktiv-Deployment, Push oder Tablet-Release ohne anschließende Freigabe.
- Vor jedem Commit: alle Tests ausführen, die den geänderten Bereich abdecken; vor `index.html`-Commits Tab-Prüfung aus `CLAUDE.md`.

---

### Task 1: Zentrale Bring-/Abholzeit-Warnungen

**Files:**
- Create: `backend/src/utils/terminWarnungen.js`
- Create: `backend/tests/terminWarnungen.test.js`

**Interfaces:**
- Consumes: vorhandene Terminfelder `startzeit`, `bring_zeit`, `endzeit_berechnet`, `abholung_zeit`, optional `abholung_datum`, `datum`.
- Produces: `erstelleTerminWarnungen(termin)` → Array von `{ code, message }` mit Codes `bringzeit_verpasst` und `abholzeit_verpasst`.

- [ ] **Step 1: Reine Grenzfälle als Test schreiben**

```js
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
```

- [ ] **Step 2: Test rot beobachten**

Run: `cd backend && npm test -- terminWarnungen --runInBand`
Expected: FAIL, weil `../src/utils/terminWarnungen` noch fehlt.

- [ ] **Step 3: Reine Funktion implementieren**

```js
function erstelleTerminWarnungen(termin) {
  const warnungen = [];
  if (termin.startzeit && termin.bring_zeit && termin.startzeit > termin.bring_zeit) {
    warnungen.push({
      code: 'bringzeit_verpasst',
      message: `Bringzeit ${termin.bring_zeit} nicht eingehalten – frühester Start ${termin.startzeit}`
    });
  }
  const abholDatumGilt = !termin.abholung_datum || termin.abholung_datum === termin.datum;
  if (abholDatumGilt && termin.endzeit_berechnet && termin.abholung_zeit &&
      termin.endzeit_berechnet > termin.abholung_zeit) {
    warnungen.push({
      code: 'abholzeit_verpasst',
      message: `Abholzeit ${termin.abholung_zeit} nicht erreichbar – fertig ca. ${termin.endzeit_berechnet}`
    });
  }
  return warnungen;
}

module.exports = { erstelleTerminWarnungen };
```

- [ ] **Step 4: Test grün und committen**

Run: `cd backend && npm test -- terminWarnungen --runInBand`
Expected: 2/2 PASS.

```bash
git add backend/src/utils/terminWarnungen.js backend/tests/terminWarnungen.test.js
git commit -m "Add central appointment deadline warnings"
```

---

### Task 2: Lehrlings-Ressource und Queue-Isolation

**Files:**
- Create: `backend/migrations/053_warteschlange_lehrlinge.js`
- Modify: `backend/migrations/index.js`
- Modify: `backend/src/models/warteschlangeModel.js`
- Modify: `backend/src/controllers/warteschlangeController.js`
- Modify: `backend/tests/warteschlange.test.js`
- Create: `backend/tests/warteschlangeLehrlingeMigration.test.js`

**Interfaces:**
- Consumes: bestehende Mechaniker-Requests mit `mitarbeiter_id`; neue Requests mit `{ person_typ: 'lehrling', person_id: number }`.
- Produces: `loeseRessource(body)` → `{ typ, id }`; Model-Methoden akzeptieren diese Ressource. GET ergänzt `lehrlinge[]` mit `lehrling_id`, `lehrling_name`, `kapazitaet_minuten`, `last_minuten`, `zettel`.

- [ ] **Step 1: Migration- und API-Tests schreiben**

```js
test('Lehrlings-Queue bleibt von Mechaniker mit derselben ID getrennt', async () => {
  await dbRun(db, `INSERT INTO lehrlinge (id, name, aktiv, arbeitsstunden_pro_tag, aufgabenbewaeltigung_prozent)
    VALUES (1, 'Lehrling 1', 1, 8, 100)`);
  await addTermin({ id: 10, ist_schwebend: 1, datum: null });

  await request(app)
    .put('/api/warteschlange/zuweisen')
    .send({ termin_id: 10, person_typ: 'lehrling', person_id: 1, datum: DATUM })
    .expect(200);

  const zugewiesen = await dbGet(db, 'SELECT * FROM termine WHERE id = 10');
  expect(zugewiesen.mitarbeiter_id).toBeNull();
  expect(zugewiesen.lehrling_id).toBe(1);
  expect(zugewiesen.warteschlange_pos).toBe(1);

  const details = JSON.parse(zugewiesen.arbeitszeiten_details);
  expect(details._gesamt_mitarbeiter_id).toEqual({ type: 'lehrling', id: 1 });

  const response = await request(app).get('/api/warteschlange').query({ datum: DATUM }).expect(200);
  expect(response.body.lehrlinge[0].zettel.map(item => item.id)).toEqual([10]);
  expect(response.body.mitarbeiter[0].zettel.map(item => item.id)).not.toContain(10);
});
```

Migrationstest prüft `idx_termine_warteschlange_lehrlinge` auf `(lehrling_id, warteschlange_pos)` und die Registrierung mit Version 53. Vor der Migration in der isolierten Test-DB vorhandenen Index entfernen, damit der Test unabhängig vom Referenzstand funktioniert.

- [ ] **Step 2: Tests rot beobachten**

Run: `cd backend && npm test -- warteschlange --runInBand`
Expected: FAIL, weil `person_typ/person_id`, `lehrlinge[]` und Migration 053 fehlen.

- [ ] **Step 3: Migration und Ressourcenmodell implementieren**

Migration 053:

```js
async function up(db) {
  await new Promise((resolve, reject) => {
    db.run(`CREATE INDEX IF NOT EXISTS idx_termine_warteschlange_lehrlinge
      ON termine (lehrling_id, warteschlange_pos)`, error => error ? reject(error) : resolve());
  });
}
module.exports = { version: 53, description: 'Warteschlangenindex fuer Lehrlinge', up };
```

Controller-Hilfsfunktion:

```js
function loeseRessource(body) {
  if (body.person_typ !== undefined || body.person_id !== undefined) {
    if (!['mitarbeiter', 'lehrling'].includes(body.person_typ)) {
      throw new ValidationError('person_typ muss mitarbeiter oder lehrling sein');
    }
    return { typ: body.person_typ, id: parseId(body.person_id, 'person_id') };
  }
  if (body.lehrling_id !== undefined) {
    return { typ: 'lehrling', id: parseId(body.lehrling_id, 'lehrling_id') };
  }
  return { typ: 'mitarbeiter', id: parseId(body.mitarbeiter_id, 'mitarbeiter_id') };
}
```

Alle Queue-Queries filtern auf `mitarbeiter_id` **oder** `lehrling_id`, abhängig von `ressource.typ`. `zuweisen()` setzt das jeweils andere Hauptfeld auf `NULL`, `datum`, `ist_schwebend=0` und Position. Bei Lehrlingen werden `arbeitszeiten_details` um `_gesamt_mitarbeiter_id: { type:'lehrling', id }` ergänzt; bei Mechanikern wird die entsprechende Mechaniker-Gesamtzuordnung geschrieben. Vorhandene Arbeitstexte und Zeiten bleiben erhalten.

`LehrlingeModel.getAktive()` liefert die Spalten. `berechneKapazitaet()` erhält für eine Lehrlings-Spalte `lehrlinge:[person]` und die Menge abwesender Lehrlinge. `markiereUeberlauf()` erhält zusätzlich `aufgabenbewaeltigung_prozent`; die effektive Kartendauer ist:

```js
Math.round(roheMinuten * (1 + nebenzeitProzent / 100) * (aufgabenbewaeltigungProzent / 100))
```

- [ ] **Step 4: Unbekannte Lehrlinge und fremde Reihenfolge prüfen**

Tests ergänzen: unbekannter Lehrling → 404; `reihenfolge` mit Mechaniker-Termin in Lehrlings-Queue → 400/404 ohne Schreiben/Event; parallele Mechaniker- und Lehrlingszuweisungen bleiben konsistent.

Run: `cd backend && npm test -- warteschlange --runInBand`
Expected: alle Queue- und Migrationstests PASS.

- [ ] **Step 5: Gesamtlauf und Commit**

Run: `cd backend && npm test`

```bash
git add backend/migrations/053_warteschlange_lehrlinge.js backend/migrations/index.js backend/src/models/warteschlangeModel.js backend/src/controllers/warteschlangeController.js backend/tests/warteschlange.test.js backend/tests/warteschlangeLehrlingeMigration.test.js
git commit -m "Add apprentice queues to Zettel board"
```

---

### Task 3: Queue-Reihenfolge in die zentrale Neuzeitberechnung integrieren

**Files:**
- Create: `backend/src/services/zeitplanungService.js`
- Modify: `backend/src/controllers/termineController.js:2416-2617`
- Modify: `backend/src/controllers/warteschlangeController.js`
- Modify: `backend/src/utils/zeitBerechnung.js`
- Create: `backend/tests/zeitplanungService.test.js`
- Modify: `backend/tests/warteschlange.test.js`

**Interfaces:**
- Consumes: `warteschlange_pos`, `bring_zeit`, `arbeitszeiten_details`, Status und Personenfaktoren.
- Produces: `berechneZeitenFuerPerson({ personId, personTyp, datum, startTerminId })` → `{ success, aktualisiert, verschoben, aktualisierteTermine, verschobeneTermine }`; Queue-Mutationen rufen diese Funktion vor ihrem Commit auf.

- [ ] **Step 1: Queue-Reihenfolge und unveränderliche Bringzeit testen**

```js
test('verarbeitet Queue-Zettel nach Position und veraendert bring_zeit nicht', async () => {
  await dbRun(db, `INSERT INTO mitarbeiter (id, name, aktiv, arbeitsstunden_pro_tag)
    VALUES (1, 'Mechaniker 1', 1, 8)`);
  await dbRun(db, `INSERT INTO termine
    (id, termin_nr, kennzeichen, datum, geschaetzte_zeit, arbeit, status,
     mitarbeiter_id, warteschlange_pos, startzeit, bring_zeit)
    VALUES (1, 'T-1', 'AB-1', '2026-11-09', 60, 'Inspektion', 'geplant',
     1, 1, '10:00', '09:00'), (2, 'T-2', 'AB-2', '2026-11-09', 30, 'Bremsen',
     'geplant', 1, 2, '09:00', '08:00')`);
  await berechneZeitenFuerPerson({
    personId: 1, personTyp: 'mitarbeiter', datum: '2026-11-09', startTerminId: null
  });
  const zettel = await dbAll(db, 'SELECT * FROM termine ORDER BY warteschlange_pos');
  expect(zettel[0].startzeit).toBe('09:00');
  expect(zettel[0].bring_zeit).toBe('09:00');
  expect(zettel[1].startzeit).toBe(zettel[0].endzeit_berechnet);
  expect(zettel[1].bring_zeit).toBe('08:00');
});
```

Weitere Tests: erster Start nie vor Bringzeit; laufender Zettel behält tatsächlichen Start; Lehrlingsdauer verwendet `berechneEffektiveDauer()`; Nicht-Queue-Termine behalten das bisherige Verhalten.

- [ ] **Step 2: Tests rot beobachten**

Run: `cd backend && npm test -- zeitplanungService --runInBand`
Expected: FAIL, weil die Servicefunktion noch fehlt.

- [ ] **Step 3: Bestehende Berechnung als Service verfügbar machen**

`zeitplanungService.js` exportiert `module.exports = { berechneZeitenFuerPerson }`. Der Controller wird nach dem Auslagern auf diesen vollständigen Wrapper reduziert:

```js
static async berechneZeitenNeu(req, res) {
  const { personId, personTyp, datum, startTerminId } = req.body;
  if (!personId || !personTyp || !datum) {
    return res.status(400).json({ error: 'personId, personTyp und datum sind erforderlich' });
  }
  try {
    const ergebnis = await berechneZeitenFuerPerson({
      personId, personTyp, datum, startTerminId
    });
    return res.json(ergebnis);
  } catch (err) {
    console.error('Fehler bei berechneZeitenNeu:', err);
    return res.status(500).json({ error: err.message });
  }
}
```

Die bestehende Logik wird ohne HTTP-`req/res` in den Service übernommen. `TermineController.berechneZeitenNeu()` validiert weiterhin den Request, ruft den Service auf und schreibt die JSON-Response. Die Berechnung selbst öffnet keine zusätzliche Transaktion.

In der Servicefunktion:
- Queue-Zettel mit `warteschlange_pos IS NOT NULL` werden zuerst nach Position und ID sortiert; bisherige Nicht-Queue-Termine behalten den bisherigen Startzeit-Fallback.
- `UPDATE` schreibt `startzeit` und `endzeit_berechnet`, aber **nicht** `bring_zeit`.
- Cache-Invalidierung und `broadcastEvent('termin.updated', { datum })` bleiben nach erfolgreicher Berechnung erhalten.
- Bestehende Overflow-/Nachrücklogik bleibt unverändert, sofern sie die oben genannten Regeln nicht verletzt.

- [ ] **Step 4: Queue-Mutationen anbinden**

Nach `zuweisen`, `reihenfolge` und `naechsterTag` innerhalb von `withQueueTransaction()` aufrufen:

```js
await berechneZeitenFuerPerson({
  personId: ressource.id,
  personTyp: ressource.typ,
  datum: zielDatum,
  startTerminId: terminId
});
```

Beim Mechanikerwechsel die alte Person nach Kompaktierung ebenfalls neu berechnen. Servicefehler an den bestehenden Error-Handler weitergeben; keine Erfolgsmeldung oder Queue-Event nach Fehler.

- [ ] **Step 5: Tests und Commit**

Run: `cd backend && npm test -- zeitplanungService --runInBand`
Run: `cd backend && npm test -- warteschlange --runInBand`
Run: `cd backend && npm test`

```bash
git add backend/src/services/zeitplanungService.js backend/src/controllers/termineController.js backend/src/controllers/warteschlangeController.js backend/src/utils/zeitBerechnung.js backend/tests/zeitplanungService.test.js backend/tests/warteschlange.test.js
git commit -m "Calculate queue times through shared scheduler"
```

---

### Task 4: Zettel-Board zeigt Lehrlinge und zentrale Warnungen

**Files:**
- Modify: `frontend/src/features/warteschlange/warteschlangeFeature.js`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/styles/style.css`
- Modify: `frontend/tests/features/warteschlange.test.js`

**Interfaces:**
- Consumes: GET `mitarbeiter[]`, `lehrlinge[]`, `warnungen[]`, `effektive_zeit_minuten`; `WarteschlangeService.zuweisen()` mit Ressource.
- Produces: einheitliche Karten-/Spaltenausgabe für beide Personentypen; keine neue globale API.

- [ ] **Step 1: Rendering- und Service-Tests schreiben**

```js
it('zeigt Lehrlings-Spalte und beide Warnungstexte am Zettel', () => {
  const app = createWarteschlangeApp();
  app.warteschlangeData = {
    neu: { termine: [], auftragsimporte: [] },
    mitarbeiter: [],
    lehrlinge: [{
      lehrling_id: 3, lehrling_name: 'Lehrling Lena',
      kapazitaet_minuten: 480, last_minuten: 165,
      zettel: [{
        id: 9, kunde_name: 'Kunde', kennzeichen: 'AB-1', arbeit: 'Inspektion',
        geschaetzte_zeit: 150, effektive_zeit_minuten: 165,
        warnungen: [
          { code: 'bringzeit_verpasst', message: 'Bringzeit 09:00 nicht eingehalten – frühester Start 10:15' },
          { code: 'abholzeit_verpasst', message: 'Abholzeit 16:00 nicht erreichbar – fertig ca. 16:30' }
        ]
      }]
    }]
  };
  app.renderWarteschlange();
  expect(document.getElementById('warteschlangeBoard').textContent).toContain('Lehrling Lena');
  expect(document.getElementById('warteschlangeBoard').textContent).toContain('Bringzeit 09:00 nicht eingehalten');
  expect(document.getElementById('warteschlangeBoard').textContent).toContain('Abholzeit 16:00 nicht erreichbar');
});
```

Service-Test prüft, dass ein Lehrlings-Drop `{ termin_id, person_typ:'lehrling', person_id, datum }` sendet. Reorder sendet ebenfalls Typ und ID.

- [ ] **Step 2: Tests rot beobachten**

Run: `cd frontend && npm test -- warteschlange`
Expected: FAIL an fehlender Lehrlings-Spalte/Warnung und altem Request-Body.

- [ ] **Step 3: Board und Service implementieren**

`WarteschlangeService.zuweisen(terminId, ressource, position, datum)` akzeptiert ein Ressourcenobjekt und serialisiert:

```js
{
  termin_id: terminId,
  person_typ: ressource.typ,
  person_id: ressource.id,
  position,
  datum
}
```

Für Kompatibilität darf der bisherige Aufruf mit numerischer Mechaniker-ID intern in `{ typ:'mitarbeiter', id }` übersetzt werden. `reihenfolge()` erhält dieselbe Ressource.

Das Frontend erzeugt aus `mitarbeiter` und `lehrlinge` normalisierte Spalten `{ typ, id, name, kapazitaet, last, zettel }`. Karten enthalten `data-person-typ` und `data-person-id`; Drop und Reorder verwenden diese Werte. `warnungen.map()` wird escaped als `<div role="alert">...</div>` ausgegeben. Warnungs-CSS nutzt vorhandene Fehlerfarben und nicht nur Farbe zur Unterscheidung.

- [ ] **Step 4: Tests, Build und Commit**

Run: `cd frontend && npm test && npm run build`

```bash
git add frontend/src/features/warteschlange/warteschlangeFeature.js frontend/src/services/api.js frontend/src/styles/style.css frontend/tests/features/warteschlange.test.js
git commit -m "Show apprentices and deadline warnings on board"
```

---

### Task 5: Planung (Beta) und Tablet verwenden dieselben Warnungen

**Files:**
- Modify: `backend/src/controllers/termineController.js`
- Modify: `backend/src/controllers/warteschlangeController.js`
- Modify: `frontend/src/features/planung/planungFeature.js`
- Modify: `frontend/src/features/planung/dragDropFeature.js`
- Modify: `electron-intern-tablet/index.html`
- Create: `frontend/tests/features/zeitWarnungen.test.js`
- Modify: `electron-intern-tablet/tests/zettel-board.test.js`

**Interfaces:**
- Consumes: `erstelleTerminWarnungen(termin)` aus Task 1 und `berechneZeitenFuerPerson()` aus Task 3.
- Produces: `warnungen[]` an Queue-, Termin- und `naechster`-Responses; sichtbare Textwarnungen in Planung und Tablet; `GET /api/warteschlange/lehrling/:id/naechster`.

- [ ] **Step 1: Backend- und Client-Tests schreiben**

Backend-Test: Queue- und normale Termin-Responses enthalten nach Überschreiten dasselbe `warnungen`-Objekt. `naechster` für Lehrlinge liefert obersten Lehrlings-Zettel mit `arbeiten` und `warnungen`.

Tablet-VM-Test:

```js
test('Tablet zeigt zentrale Abholzeit-Meldung als Text', () => {
  const output = renderKachel({
    zettel: {
      id: 2, status: 'geplant', termin_nr: 'T-2', kunde_name: 'Queue Kunde',
      warnungen: [{ code: 'abholzeit_verpasst', message: 'Abholzeit 16:00 nicht erreichbar – fertig ca. 16:30' }]
    }
  });
  assert.match(output, /Abholzeit 16:00 nicht erreichbar/);
});
```

Frontend-Test prüft Kartenmarkierung und Banner aus `termin.warnungen`, ohne bestehende Abholzeit-Speicherwarnung zu entfernen.

- [ ] **Step 2: Tests rot beobachten**

Run: `cd backend && npm test -- warteschlange --runInBand`
Run: `cd frontend && npm test -- zeitWarnungen`
Run: `cd electron-intern-tablet && node --test tests/zettel-board.test.js`
Expected: jeweils FAIL an fehlenden Warnungsfeldern/-Texten oder Lehrlings-Endpunkt.

- [ ] **Step 3: Zentrale Felder an alle Responses anhängen**

In Queue-GET, `naechster` und den von Planung verwendeten Termin-GET-Controllern:

```js
const { erstelleTerminWarnungen } = require('../utils/terminWarnungen');
const mitWarnungen = { ...termin, warnungen: erstelleTerminWarnungen(termin) };
```

Keine bereits vorhandenen Felder entfernen. Der Lehrlings-`naechster`-Endpunkt verwendet `getNaechster(datum, { typ:'lehrling', id })`, prüft den Lehrling und liefert `arbeiten` wie der Mechaniker-Endpunkt.

- [ ] **Step 4: Planung und Tablet rendern**

Planung zeigt `warnungen` escaped an der Karte und sammelt die Meldungen im vorhandenen `auslastungWarnungBanner`. Die bestehende Bestätigungswarnung beim manuellen Speichern bleibt unverändert.

Tablet zeigt alle `warnungen` als escaped Text im aktuellen und nächsten Auftrag. Die bisherige lokale `istVerspaetet`-Kartenmarkierung bleibt kompatibel; die zentrale Meldung ergänzt den konkreten Text. Beim Laden der Teamübersicht wird für aktive Lehrlinge ebenfalls der Lehrlings-`naechster`-Endpunkt abgefragt. Fehler/Leerzustand verändern den klassischen Fallback nicht.

- [ ] **Step 5: Alle betroffenen Tests und Commit**

Run: `cd backend && npm test`
Run: `cd frontend && npm test && npm run build`
Run: `cd electron-intern-tablet && node --test tests/zettel-board.test.js && node --check main.js && node --check preload.js`

```bash
git add backend/src/controllers/termineController.js backend/src/controllers/warteschlangeController.js frontend/src/features/planung/planungFeature.js frontend/src/features/planung/dragDropFeature.js electron-intern-tablet/index.html electron-intern-tablet/tests/zettel-board.test.js frontend/tests/features/zeitWarnungen.test.js
git commit -m "Share queue deadline warnings across clients"
```

---

### Task 6: End-to-End-Prüfung und Dokumentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/PROJEKT.md`
- Modify: `.claude/GRAPH.md`
- Modify: `.claude/RETRO.md`
- Modify: `FEATURES.md`

**Interfaces:**
- Consumes: alle tatsächlich implementierten Schnittstellen aus Tasks 1–5.
- Produces: aktuelle Route-, Datenmodell-, Test- und Betriebsdokumentation; nachweisbarer Abnahmebericht im RETRO.

- [ ] **Step 1: Isolierte Live-Daten und Browserprüfung vorbereiten**

Eigenen `DATA_DIR` und Testserver verwenden; keine Produktivdaten. Mechaniker und Lehrling mit je einem Auftrag, Bringzeit und Abholzeit anlegen. Einen Zettel zuweisen, umsortieren und in Planung (Beta) prüfen.

- [ ] **Step 2: Abnahmeszenarien ausführen und belegen**

Nachweisen:
1. Lehrling erscheint als Spalte und erhält ganzen Auftrag per Drag & Drop.
2. Queue-Reihenfolge und Planungs-Reihenfolge stimmen überein; `bring_zeit` bleibt unverändert.
3. Bringzeit-Verletzung erzeugt Text auf Board, Planung und Tablet.
4. Abholzeit exakt erreicht → keine Warnung; eine Minute später → Warnung auf allen drei Oberflächen.
5. Zweiter Browser aktualisiert sich; Konsole und Netzwerk ohne neue Fehler.
6. Unbekannte Lehrling-ID → 404; fremde Queue-Reihenfolge → kein Schreibzugriff/Event.

- [ ] **Step 3: Dokumentation und Feature-Ledger aktualisieren**

Eintragen: Migration 053, Lehrlings-Ressource, `zeitplanungService`, `terminWarnungen`, neue Felder und Lehrlings-`naechster`, tatsächliche Testzahlen, Live-Nachweise und nicht geprüfte Hardware-/Deployment-Schritte. Alle in geänderten Dateien gelisteten Bestandsfunktionen per Suchlauf bestätigen.

- [ ] **Step 4: Finale Standardprüfungen**

Run: `cd backend && npm test`
Run: `cd frontend && npm test && npm run build`
Run: `cd electron-intern-tablet && node --test tests/zettel-board.test.js && node --check main.js && node --check preload.js`
Run: Tab-Prüfung aus `CLAUDE.md` und `git diff --check`.

- [ ] **Step 5: Dokumentations-Commit**

```bash
git add CLAUDE.md FEATURES.md docs/superpowers/plans/2026-11-08-zettel-board-lehrlinge-zeitplanung.md
git add -f .claude/PROJEKT.md
git commit -m "Document apprentice queue time planning"
```

`.claude/RETRO.md` und `.claude/GRAPH.md` lokal aktualisieren. Kein Push, Deployment, Installer oder Produktiv-Schreibtest in dieser Aufgabe.
