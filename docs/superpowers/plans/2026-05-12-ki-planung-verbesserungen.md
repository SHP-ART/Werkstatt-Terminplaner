# KI-Tagesvorschlag Verbesserungen – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## 🔖 FORTSCHRITT (Stand: 2026-05-12)

**Worktree:** `.worktrees/ki-planung-verbesserungen`
**Branch:** `feature/ki-planung-verbesserungen`
**Letzter Commit:** `a6d814d` – feat: ki-planung nutzt localAiService als Dauer-Fallback statt 60 Min

| Task | Status |
|---|---|
| Task 1: KI-Dauer-Fallback | ✅ ERLEDIGT |
| Task 2: Nicht platzierte Termine mit Grund | ✅ ERLEDIGT |
| Task 3: Balanciertes Verteilen | ✅ ERLEDIGT |
| Task 4: DB-Migration 044 | ✅ ERLEDIGT |
| Task 5: Backend Kompetenz-Bonus | ✅ ERLEDIGT |
| Task 6: Frontend Kompetenz-Konfiguration | ✅ ERLEDIGT |
| Task 7: CLAUDE.md aktualisieren | ✅ ERLEDIGT |

**🎉 ABGESCHLOSSEN — gemergt in master, gepusht (Commit `85dc6a7`), Worktree aufgeräumt.**

---

**Goal:** Den KI-Tagesvorschlag in 4 Bereichen verbessern damit Zuweisungen schneller und genauer werden: smarterer Dauer-Fallback, Sichtbarkeit nicht platzierter Termine, ausgeglichene Last-Verteilung und Kompetenz-basiertes Matching.

**Architecture:** Alle Backend-Änderungen in `kiPlanungController.js`. Der `localAiService.getZeitVorschlag()` ist bereits exportiert und wird als Fallback-Quelle genutzt. Das Kompetenz-Mapping wird in der bestehenden `werkstatt_einstellungen`-Tabelle als JSON-Spalte gespeichert (Migration 044).

**Tech Stack:** Node.js/Express, SQLite (via dbHelper), Vanilla JS Frontend, Jest/Supertest für Tests.

---

## Dateiübersicht

| Datei | Aktion |
|---|---|
| `backend/src/controllers/kiPlanungController.js` | Ändern – alle 4 Verbesserungen |
| `backend/migrations/044_kompetenz_mapping.js` | Erstellen – neue Spalte |
| `backend/tests/bugs/ki-planung-verbesserungen.test.js` | Erstellen – Unit-Tests für reine Funktionen |
| `frontend/src/features/kiPlanning/kiPlanningFeature.js` | Ändern – neue Sektionen anzeigen + Kompetenz-UI |
| `frontend/index.html` | Ändern – neue Modal-Sektionen + Kompetenz-Modal |

---

## ✅ Task 1: KI-Dauer-Fallback aus `localAiService` — ERLEDIGT

**Problem:** `getTerminDauerMinuten()` fällt auf 60 Min zurück wenn kein `geschaetzte_zeit` und kein `tatsaechliche_zeit` gesetzt ist. `localAiService.getZeitVorschlag()` kennt aber Durchschnittswerte aus echten Terminen.

**Dateien:**
- Ändern: `backend/src/controllers/kiPlanungController.js`
- Erstellen: `backend/tests/bugs/ki-planung-verbesserungen.test.js`

- [ ] **Schritt 1: Test schreiben (schlägt fehl)**

Erstelle `backend/tests/bugs/ki-planung-verbesserungen.test.js`:

```javascript
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
```

- [ ] **Schritt 2: Test fehlschlagen bestätigen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: `FAIL` – `_ki_dauer_min` wird noch nicht berücksichtigt.

- [ ] **Schritt 3: `getTerminDauerMinuten` anpassen**

In `backend/src/controllers/kiPlanungController.js`, ersetze die bestehende Methode `getTerminDauerMinuten` (Zeile ~395):

```javascript
// ALT:
static getTerminDauerMinuten(termin) {
  const value = termin?.tatsaechliche_zeit || termin?.geschaetzte_zeit || DEFAULT_TERMIN_DAUER_MIN;
  const minuten = parseInt(value, 10);
  return Number.isFinite(minuten) && minuten > 0 ? minuten : DEFAULT_TERMIN_DAUER_MIN;
}

// NEU:
static getTerminDauerMinuten(termin) {
  const value = termin?.tatsaechliche_zeit || termin?.geschaetzte_zeit;
  if (value) {
    const minuten = parseInt(value, 10);
    if (Number.isFinite(minuten) && minuten > 0) return minuten;
  }
  if (termin?._ki_dauer_min) return termin._ki_dauer_min;
  return DEFAULT_TERMIN_DAUER_MIN;
}
```

- [ ] **Schritt 4: `enrichTermineWithKIDauer` hinzufügen**

Füge nach `getTerminDauerMinuten` (nach Zeile ~399) folgende neue Methode ein:

```javascript
static async enrichTermineWithKIDauer(termine) {
  await Promise.all((termine || []).map(async termin => {
    if (termin.tatsaechliche_zeit || termin.geschaetzte_zeit) return;
    const vorschlag = await localAiService.getZeitVorschlag(termin.arbeit || '');
    if (vorschlag && vorschlag.minuten > 0) {
      termin._ki_dauer_min = vorschlag.minuten;
    }
  }));
}
```

- [ ] **Schritt 5: `buildLocalTagesVorschlag` async machen und Anreicherung aufrufen**

In der Methodensignatur Zeile ~529, ändere:

```javascript
// ALT:
static buildLocalTagesVorschlag({ datum, mitarbeiter, lehrlinge, termine, schwebendeTermine, einstellungen, abwesenheiten }) {

// NEU:
static async buildLocalTagesVorschlag({ datum, mitarbeiter, lehrlinge, termine, schwebendeTermine, einstellungen, abwesenheiten }) {
```

Füge als erste Zeile im Methodenbody (vor `const personen = ...`) ein:

```javascript
await KIPlanungController.enrichTermineWithKIDauer([...(termine || []), ...(schwebendeTermine || [])]);
```

- [ ] **Schritt 6: `buildLocalWochenVorschlag` async machen und Anreicherung aufrufen**

In der Methodensignatur Zeile ~686, ändere:

```javascript
// ALT:
static buildLocalWochenVorschlag({ wochentage, wochenDaten, mitarbeiter, lehrlinge, schwebendeTermine, einstellungen }) {

// NEU:
static async buildLocalWochenVorschlag({ wochentage, wochenDaten, mitarbeiter, lehrlinge, schwebendeTermine, einstellungen }) {
```

Füge als erste Zeile im Methodenbody ein:

```javascript
const alleTermine = [...(schwebendeTermine || []), ...(wochenDaten || []).flatMap(d => d.termine || [])];
await KIPlanungController.enrichTermineWithKIDauer(alleTermine);
```

- [ ] **Schritt 7: Aufrufer in `getPlanungsvorschlag` auf `await` umstellen**

In `getPlanungsvorschlag` (Zeile ~53), ändere:

```javascript
// ALT:
const vorschlag = KIPlanungController.buildLocalTagesVorschlag({

// NEU:
const vorschlag = await KIPlanungController.buildLocalTagesVorschlag({
```

- [ ] **Schritt 8: Aufrufer in `getWochenvorschlag` auf `await` umstellen**

In `getWochenvorschlag` (Zeile ~180), ändere:

```javascript
// ALT:
const vorschlag = KIPlanungController.buildLocalWochenVorschlag({

// NEU:
const vorschlag = await KIPlanungController.buildLocalWochenVorschlag({
```

- [ ] **Schritt 9: Test laufen lassen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: Alle `getTerminDauerMinuten`-Tests bestehen.

- [ ] **Schritt 10: Commit**

```bash
git add backend/src/controllers/kiPlanungController.js backend/tests/bugs/ki-planung-verbesserungen.test.js
git commit -m "feat: ki-planung nutzt localAiService als Dauer-Fallback statt 60 Min"
```

---

## Task 2: Nicht platzierte Termine mit Grund anzeigen

**Problem:** Wenn ein Termin keinen Slot bekommt, verschwindet er still. Der Nutzer weiß nicht warum.

**Dateien:**
- Ändern: `backend/src/controllers/kiPlanungController.js`
- Ändern: `frontend/index.html`
- Ändern: `frontend/src/features/kiPlanning/kiPlanningFeature.js`

- [ ] **Schritt 1: Test schreiben**

Ergänze `backend/tests/bugs/ki-planung-verbesserungen.test.js`:

```javascript
describe('KIPlanungController – buildLocalTagesVorschlag (nichtPlatziertTermine)', () => {
  const { createTestDb, closeTestDb } = require('../helpers/testSetup');

  let db;
  beforeEach(async () => { db = await createTestDb(); });
  afterEach(async () => { await closeTestDb(db); });

  test('liefert nichtPlatziertTermine wenn kein Slot frei', async () => {
    // Keine Mitarbeiter → kein Slot möglich
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
  });
});
```

- [ ] **Schritt 2: Test fehlschlagen bestätigen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: FAIL – `nichtPlatziertTermine` ist undefined.

- [ ] **Schritt 3: `nichtPlatziertTermine` in `buildLocalTagesVorschlag` einbauen**

In `buildLocalTagesVorschlag`, nach der Deklaration von `warnungen` (Zeile ~533), füge hinzu:

```javascript
const nichtPlatziertTermine = [];
```

Im `offeneTermine.forEach`-Block, ersetze den bestehenden `if (!best)` Zweig:

```javascript
// ALT:
if (!best) {
  warnungen.push(`Kein freier Slot für Termin #${termin.id} (${termin.arbeit || 'ohne Arbeit'}).`);
  return;
}

// NEU:
if (!best) {
  const grund = candidates.length === 0
    ? 'Alle Mitarbeiter voll ausgelastet – keine Kapazität verfügbar'
    : `Kein freier ${duration}-Min-Slot – Termin passt in keine verbleibende Lücke`;
  nichtPlatziertTermine.push({
    terminId: termin.id,
    terminInfo: `${termin.arbeit || 'Termin'} - ${termin.kunde_name || 'k.A.'}`,
    dauerMin: duration,
    grund
  });
  return;
}
```

Am Ende von `buildLocalTagesVorschlag`, füge `nichtPlatziertTermine` zum Rückgabe-Objekt hinzu:

```javascript
// ALT:
return {
  zusammenfassung,
  kapazitaetsAnalyse: { ... },
  warnungen,
  tagesZuordnungen,
  schwebendeVorschlaege
};

// NEU:
return {
  zusammenfassung,
  kapazitaetsAnalyse: {
    gesamtKapazitaet: `${gesamtKapazitaet} min`,
    genutzt: `${genutztMinuten} min`,
    frei: `${freiMinuten} min`
  },
  warnungen,
  tagesZuordnungen,
  schwebendeVorschlaege,
  nichtPlatziertTermine
};
```

- [ ] **Schritt 4: Test laufen lassen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: Alle bisherigen Tests bestehen.

- [ ] **Schritt 5: HTML-Sektion in `frontend/index.html` hinzufügen**

Suche in `frontend/index.html` nach der Stelle mit `id="kiSchwebendeSection"`. Füge direkt danach (nach dem schließenden `</div>` dieser Sektion) ein:

```html
<!-- Nicht platzierte Termine -->
<div id="kiNichtPlatziertSection" style="display:none;">
  <h4 style="color:#e74c3c;margin:12px 0 6px">⚠️ Nicht platzierbar</h4>
  <div id="kiNichtPlatziert"></div>
</div>
```

- [ ] **Schritt 6: Frontend in `kiPlanningFeature.js` rendern**

In `displayKITagesvorschlag` (nach dem Block für `kiSchwebendeSection`), füge hinzu:

```javascript
// Nicht platzierte Termine
const nichtPlatziertSection = document.getElementById('kiNichtPlatziertSection');
const nichtPlatziertDiv = document.getElementById('kiNichtPlatziert');
if (vorschlag.nichtPlatziertTermine && vorschlag.nichtPlatziertTermine.length > 0) {
  nichtPlatziertSection.style.display = 'block';
  nichtPlatziertDiv.innerHTML = vorschlag.nichtPlatziertTermine.map(t => `
    <div class="ki-suggestion-item invalid" style="margin-bottom:6px;padding:8px 12px;">
      <strong>#${t.terminId}: ${t.terminInfo}</strong>
      <div style="color:#999;font-size:12px;margin-top:2px;">
        ${t.dauerMin} Min – ${t.grund}
      </div>
    </div>
  `).join('');
} else {
  nichtPlatziertSection.style.display = 'none';
}
```

In `displayKITagesvorschlag`, stelle außerdem sicher dass `kiNichtPlatziertSection` beim Reset auf `none` gesetzt wird (bei Wochen-Ansicht):

In `displayKIWochenvorschlag`, nach den bestehenden `style.display = 'none'` Zeilen, füge hinzu:

```javascript
const npSection = document.getElementById('kiNichtPlatziertSection');
if (npSection) npSection.style.display = 'none';
```

- [ ] **Schritt 7: Frontend bauen und testen**

```bash
cd frontend && npm run build
```

Dann manuell: KI-Tagesvorschlag für einen Tag anfordern bei dem Termine vorhanden aber alle Mitarbeiter ausgelastet sind. Die neue Sektion "Nicht platzierbar" soll erscheinen.

- [ ] **Schritt 8: Commit**

```bash
git add backend/src/controllers/kiPlanungController.js frontend/index.html frontend/src/features/kiPlanning/kiPlanningFeature.js backend/tests/bugs/ki-planung-verbesserungen.test.js
git commit -m "feat: nicht platzierte Termine mit Grund in KI-Vorschlag anzeigen"
```

---

## Task 3: Balanciertes Verteilen (Round-Robin Auslastung)

**Problem:** `pickBestCandidate` schreibt immer Person A voll, bevor Person B einen Termin bekommt. Alle starten bei Startzeit 08:00, also gewinnt immer die erste Person in der Map.

**Dateien:**
- Ändern: `backend/src/controllers/kiPlanungController.js`

- [ ] **Schritt 1: Test schreiben**

Ergänze `backend/tests/bugs/ki-planung-verbesserungen.test.js`:

```javascript
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

  test('nimmt überlastete Person als Fallback wenn alle überlastet', () => {
    const candidates = [
      makeCandidate({ id: 1, slotStart: 480, usedMin: 500, capacityMin: 480 }),
    ];
    const best = KIPlanungController.pickBestCandidate(candidates);
    expect(best).not.toBeNull();
    expect(best.entry.person.id).toBe(1);
  });
});
```

- [ ] **Schritt 2: Test fehlschlagen bestätigen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: Der erste Test ("weniger ausgelastete Person") FAIL – aktuell sortiert nur nach `remaining` absolut, nicht prozentual.

- [ ] **Schritt 3: `pickBestCandidate` ersetzen**

Ersetze die gesamte Methode `pickBestCandidate` in `kiPlanungController.js` (Zeile ~518):

```javascript
static pickBestCandidate(candidates) {
  if (!candidates.length) return null;
  const withCapacity = candidates.filter(c => c.remaining >= 0);
  const pool = withCapacity.length ? withCapacity : candidates;

  pool.sort((a, b) => {
    // 1. Kompetenz-Bonus hat höchste Priorität (wird in Task 5 befüllt)
    const bonusDiff = (b.kompetenzBonus || 0) - (a.kompetenzBonus || 0);
    if (Math.abs(bonusDiff) > 0.1) return bonusDiff;

    // 2. Wenn Startzeiten deutlich abweichen (> 15 Min), nimm früheren Slot
    if (Math.abs(a.slotStart - b.slotStart) > 15) {
      return a.slotStart - b.slotStart;
    }

    // 3. Bei ähnlicher Startzeit: Person mit niedrigerer prozentualer Auslastung
    const auslastungA = a.entry.usedMin / Math.max(a.entry.person.capacityMin, 1);
    const auslastungB = b.entry.usedMin / Math.max(b.entry.person.capacityMin, 1);
    if (Math.abs(auslastungA - auslastungB) > 0.05) {
      return auslastungA - auslastungB;
    }

    // 4. Tiebreaker: früherer Slot
    return a.slotStart - b.slotStart;
  });

  return pool[0];
}
```

Hinweis: Das Feld `kompetenzBonus` wird in Task 5 zu den `candidates`-Objekten hinzugefügt. Bis dahin ist es `undefined`, der `|| 0`-Fallback sorgt dafür, dass diese Änderung sicher ist.

- [ ] **Schritt 4: Test laufen lassen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: Alle bisherigen Tests bestehen.

- [ ] **Schritt 5: Commit**

```bash
git add backend/src/controllers/kiPlanungController.js backend/tests/bugs/ki-planung-verbesserungen.test.js
git commit -m "feat: ki-planung verteilt Termine ausgeglichen (prozentuale Auslastung)"
```

---

## Task 4: DB-Migration für Kompetenz-Mapping

**Dateien:**
- Erstellen: `backend/migrations/044_kompetenz_mapping.js`

- [ ] **Schritt 1: Migration erstellen**

Erstelle `backend/migrations/044_kompetenz_mapping.js`:

```javascript
const migration = {
  version: 44,
  description: 'Kompetenz-Mapping Spalte in werkstatt_einstellungen'
};

async function up(db) {
  console.log('Migration 044: kompetenz_mapping Spalte hinzufügen...');
  await new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN kompetenz_mapping TEXT DEFAULT NULL`,
      (err) => err ? reject(err) : resolve()
    );
  });
  console.log('✓ Migration 044 abgeschlossen');
}

async function down(db) {
  // SQLite unterstützt kein DROP COLUMN – Migration ist nur vorwärts
  console.log('Migration 044 down: SQLite unterstützt kein DROP COLUMN, keine Aktion.');
}

migration.up = up;
migration.down = down;

module.exports = migration;
```

- [ ] **Schritt 2: Migration testen**

```bash
cd backend && npm test -- migrations
```

Erwartetes Ergebnis: Alle bestehenden Migrations-Tests bestehen.

- [ ] **Schritt 3: Commit**

```bash
git add backend/migrations/044_kompetenz_mapping.js
git commit -m "feat: migration 044 – kompetenz_mapping Spalte in werkstatt_einstellungen"
```

---

## Task 5: Backend Kompetenz-Bonus

**Dateien:**
- Ändern: `backend/src/controllers/kiPlanungController.js`

- [ ] **Schritt 1: Tests schreiben**

Ergänze `backend/tests/bugs/ki-planung-verbesserungen.test.js`:

```javascript
describe('KIPlanungController – getKompetenzBonus', () => {
  test('gibt 1 wenn Person für Kategorie eingetragen', () => {
    const person = { id: 1, type: 'mitarbeiter' };
    expect(KIPlanungController.getKompetenzBonus(person, 'Motor', { Motor: [1, 3] })).toBe(1);
  });

  test('gibt -0.5 wenn andere Person für Kategorie eingetragen', () => {
    const person = { id: 2, type: 'mitarbeiter' };
    expect(KIPlanungController.getKompetenzBonus(person, 'Motor', { Motor: [1, 3] })).toBe(-0.5);
  });

  test('gibt 0 wenn keine Konfiguration für diese Kategorie', () => {
    const person = { id: 1, type: 'mitarbeiter' };
    expect(KIPlanungController.getKompetenzBonus(person, 'Bremsen', { Motor: [1] })).toBe(0);
  });

  test('gibt 0 für Sonstiges (immer alle)', () => {
    const person = { id: 5, type: 'mitarbeiter' };
    expect(KIPlanungController.getKompetenzBonus(person, 'Sonstiges', { Sonstiges: [1, 2] })).toBe(0);
  });

  test('gibt 0 wenn kompetenzen null', () => {
    const person = { id: 1, type: 'mitarbeiter' };
    expect(KIPlanungController.getKompetenzBonus(person, 'Motor', null)).toBe(0);
  });

  test('gibt 0 wenn kompetenzen leeres Objekt', () => {
    const person = { id: 1, type: 'mitarbeiter' };
    expect(KIPlanungController.getKompetenzBonus(person, 'Motor', {})).toBe(0);
  });
});
```

- [ ] **Schritt 2: Test fehlschlagen bestätigen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: FAIL – `getKompetenzBonus` existiert noch nicht.

- [ ] **Schritt 3: `parseKompetenzen` und `getKompetenzBonus` hinzufügen**

Füge nach `resolveKIMode` (Zeile ~323) folgende zwei Methoden ein:

```javascript
static parseKompetenzen(einstellungen) {
  if (!einstellungen?.kompetenz_mapping) return null;
  try {
    return JSON.parse(einstellungen.kompetenz_mapping);
  } catch {
    return null;
  }
}

static getKompetenzBonus(person, terminKategorie, kompetenzen) {
  if (!kompetenzen || !terminKategorie || terminKategorie === 'Sonstiges') return 0;
  const zugeordnet = kompetenzen[terminKategorie];
  if (!Array.isArray(zugeordnet) || zugeordnet.length === 0) return 0;
  return zugeordnet.includes(person.id) ? 1 : -0.5;
}
```

- [ ] **Schritt 4: `kompetenzBonus` in `buildLocalTagesVorschlag` einbauen**

In `buildLocalTagesVorschlag`, füge nach `const personen = ...` (Zeile ~530) hinzu:

```javascript
const kompetenzen = KIPlanungController.parseKompetenzen(einstellungen);
```

Im `offeneTermine.forEach`-Block, füge vor `candidates.push(...)` die Kategorie-Bestimmung ein:

```javascript
// ALT (innerhalb schedule.forEach):
const remaining = entry.person.capacityMin - entry.usedMin - adjusted;
candidates.push({
  entry,
  slotStart,
  remaining,
  durationAdjusted: adjusted
});

// NEU:
const remaining = entry.person.capacityMin - entry.usedMin - adjusted;
const kompetenzBonus = kompetenzen
  ? KIPlanungController.getKompetenzBonus(entry.person, terminKategorie, kompetenzen)
  : 0;
candidates.push({
  entry,
  slotStart,
  remaining,
  durationAdjusted: adjusted,
  kompetenzBonus
});
```

Außerdem benötigst du `terminKategorie` vor dem `schedule.forEach`. Füge nach `const duration = ...` und `const preferredStart = ...` ein:

```javascript
const terminKategorie = localAiService.kategorisiereArbeit(termin.arbeit || '');
```

Das gleiche für den `schwebendeTermine.forEach`-Block: Füge `terminKategorie` und `kompetenzBonus` analog ein.

- [ ] **Schritt 5: Test laufen lassen**

```bash
cd backend && npm test -- ki-planung-verbesserungen
```

Erwartetes Ergebnis: Alle Tests bestehen.

- [ ] **Schritt 6: Alle Tests laufen lassen**

```bash
cd backend && npm test
```

Erwartetes Ergebnis: Alle Tests bestehen, keine Regressionen.

- [ ] **Schritt 7: Commit**

```bash
git add backend/src/controllers/kiPlanungController.js backend/tests/bugs/ki-planung-verbesserungen.test.js
git commit -m "feat: kompetenz-basiertes matching im ki-tagesvorschlag"
```

---

## Task 6: Frontend Kompetenz-Konfiguration

**Ziel:** Der Nutzer kann pro Mitarbeiter/Lehrling einstellen welche Kategorien er bevorzugt bekommt. Diese Konfiguration wird in `werkstatt_einstellungen.kompetenz_mapping` gespeichert.

**Dateien:**
- Ändern: `frontend/index.html`
- Ändern: `frontend/src/features/kiPlanning/kiPlanningFeature.js`

- [ ] **Schritt 1: Kompetenz-Modal-HTML in `index.html` hinzufügen**

Suche in `frontend/index.html` nach dem Block `id="kiPlanungModal"`. Füge direkt davor (vor dem KI-Planungs-Modal) ein neues Modal ein:

```html
<!-- Kompetenz-Konfiguration Modal -->
<div id="kompetenzModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1100;align-items:center;justify-content:center;flex-direction:column;">
  <div style="background:#fff;border-radius:8px;width:90%;max-width:700px;max-height:85vh;overflow-y:auto;padding:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="margin:0;">⚙️ Kompetenz-Zuordnung</h3>
      <button onclick="app.closeKompetenzModal()" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button>
    </div>
    <p style="color:#666;font-size:13px;margin-bottom:16px;">
      Wähle welche Mitarbeiter für welche Arbeits-Kategorien bevorzugt werden sollen.
      Nicht konfigurierte Kategorien werden gleichmäßig verteilt.
    </p>
    <div id="kompetenzMatrix"></div>
    <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end;">
      <button onclick="app.closeKompetenzModal()" class="btn btn-secondary">Abbrechen</button>
      <button onclick="app.saveKompetenzMapping()" class="btn btn-primary">💾 Speichern</button>
    </div>
  </div>
</div>
```

- [ ] **Schritt 2: Kompetenz-Button in der Auslastungsansicht hinzufügen**

Suche in `frontend/index.html` nach `id="kiTagesplanungBtn"`. Füge direkt danach ein:

```html
<button id="kiKompetenzBtn" class="btn btn-secondary btn-sm" onclick="app.openKompetenzModal()" title="Kompetenz-Zuordnung konfigurieren">
  ⚙️ Kompetenzen
</button>
```

- [ ] **Schritt 3: Kompetenz-Methoden in `kiPlanningFeature.js` hinzufügen**

Füge am Ende der Datei (vor der letzten schließenden Klammer) ein:

```javascript
AppClass.prototype.openKompetenzModal = async function() {
  const modal = document.getElementById('kompetenzModal');
  const matrix = document.getElementById('kompetenzMatrix');
  modal.style.display = 'flex';
  matrix.innerHTML = '<p>Lade…</p>';

  try {
    const [mitarbeiterRes, lehrlingeRes, settingsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/mitarbeiter`).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/lehrlinge`).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/einstellungen/werkstatt`).then(r => r.json())
    ]);

    const personen = [
      ...(mitarbeiterRes.data || mitarbeiterRes || []).filter(m => m.aktiv).map(m => ({ ...m, typ: 'mitarbeiter' })),
      ...(lehrlingeRes.data || lehrlingeRes || []).filter(l => l.aktiv).map(l => ({ ...l, typ: 'lehrling' }))
    ];

    let mapping = {};
    try {
      if (settingsRes.kompetenz_mapping) {
        mapping = JSON.parse(settingsRes.kompetenz_mapping);
      }
    } catch {}

    const kategorien = ['Inspektion', 'Bremsen', 'Motor', 'Elektrik', 'Klima', 'Reifen', 'Karosserie'];
    this._kompetenzPersonen = personen;

    matrix.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #eee;">Kategorie</th>
            ${personen.map(p => `<th style="text-align:center;padding:6px 4px;border-bottom:2px solid #eee;font-weight:normal;">
              <div style="font-weight:600;">${p.name}</div>
              <div style="color:#999;font-size:11px;">${p.typ === 'lehrling' ? 'Lehrling' : 'MA'}</div>
            </th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${kategorien.map(kat => `
            <tr>
              <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0;font-weight:500;">${kat}</td>
              ${personen.map(p => {
                const checked = Array.isArray(mapping[kat]) && mapping[kat].includes(p.id) ? 'checked' : '';
                return `<td style="text-align:center;padding:6px 4px;border-bottom:1px solid #f0f0f0;">
                  <input type="checkbox" data-kat="${kat}" data-person-id="${p.id}" ${checked}>
                </td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    matrix.innerHTML = `<p style="color:red;">Fehler beim Laden: ${err.message}</p>`;
  }
};

AppClass.prototype.closeKompetenzModal = function() {
  document.getElementById('kompetenzModal').style.display = 'none';
};

AppClass.prototype.saveKompetenzMapping = async function() {
  const checkboxes = document.querySelectorAll('#kompetenzMatrix input[type=checkbox]');
  const mapping = {};
  checkboxes.forEach(cb => {
    if (!cb.checked) return;
    const kat = cb.dataset.kat;
    const id = parseInt(cb.dataset.personId, 10);
    if (!mapping[kat]) mapping[kat] = [];
    mapping[kat].push(id);
  });

  try {
    const res = await fetch(`${API_BASE_URL}/api/einstellungen/werkstatt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kompetenz_mapping: JSON.stringify(mapping) })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    this.closeKompetenzModal();
    this.showToast('✅ Kompetenz-Zuordnung gespeichert', 'success');
  } catch (err) {
    this.showToast(`Fehler beim Speichern: ${err.message}`, 'error');
  }
};
```

- [ ] **Schritt 4: Frontend bauen**

```bash
cd frontend && npm run build
```

Erwartetes Ergebnis: Build erfolgreich ohne Fehler.

- [ ] **Schritt 5: Manuell testen**

1. Öffne die Auslastungsansicht → neuer Button "⚙️ Kompetenzen" soll erscheinen
2. Klick auf "⚙️ Kompetenzen" → Modal mit Checkbox-Matrix öffnet sich
3. Hake einige Kategorien für Mitarbeiter an → "Speichern" klicken → Toast "gespeichert"
4. Modal schließen und wieder öffnen → Häkchen sollen noch gesetzt sein
5. KI-Tagesvorschlag anfordern → In der Begründung soll eine kompetenz-bevorzugte Zuweisung erkennbar sein

- [ ] **Schritt 6: Vollständige Test-Suite laufen lassen**

```bash
cd backend && npm test
```

Erwartetes Ergebnis: Alle Tests bestehen.

- [ ] **Schritt 7: Tab-Verlust prüfen (laut CLAUDE.md Pflicht bei index.html Änderungen)**

```bash
cd backend && node -e "
const fs = require('fs');
const html = fs.readFileSync('../frontend/index.html', 'utf8');
const tabs = ['dashboard','heute','termine','kalender','kunden','zeitverwaltung','zeitstempelung','auslastung','intern','papierkorb','einstellungen'];
tabs.forEach(tab => {
  if (!html.includes('data-tab=\"' + tab + '\"')) console.log('FEHLT: ' + tab);
  else console.log('OK: ' + tab);
});
"
```

Erwartetes Ergebnis: Alle Tabs vorhanden (`OK: ...` für jeden).

- [ ] **Schritt 8: Commit**

```bash
git add frontend/index.html frontend/src/features/kiPlanning/kiPlanningFeature.js
git commit -m "feat: kompetenz-konfigurations-UI für ki-planung"
```

---

## Task 7: CLAUDE.md aktualisieren

- [ ] **Schritt 1: Migrations-Nummer in CLAUDE.md aktualisieren**

In `CLAUDE.md`, im Abschnitt "Migrations-Nummerierung", ändere:

```
Immer den höchsten vorhandenen Stand prüfen (aktuell: 034).
```

zu:

```
Immer den höchsten vorhandenen Stand prüfen (aktuell: 044).
```

- [ ] **Schritt 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: migrations-stand auf 044 aktualisieren"
```

---

## Abschließende Verifikation

- [ ] `cd backend && npm test` → Alle Tests grün
- [ ] `cd frontend && npm run build` → Build erfolgreich
- [ ] Server starten und golden path testen:
  1. KI-Tagesvorschlag für einen Tag mit unzugeordneten Terminen
  2. Prüfen dass Termine jetzt gleichmäßiger verteilt werden
  3. Prüfen dass "Nicht platzierbar"-Sektion erscheint wenn nötig
  4. Kompetenz-Modal öffnen, konfigurieren, speichern
  5. Erneuter KI-Vorschlag → Kompetenz-konfigurierte Person soll bevorzugt werden
