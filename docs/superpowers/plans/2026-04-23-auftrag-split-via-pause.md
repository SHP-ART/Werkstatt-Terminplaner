# Auftrag-Split via Pause-Button — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wenn ein Mitarbeiter auf dem Tablet "Termin aufteilen" im Pause-Dialog drückt, wird der laufende Auftrag am aktuellen Zeitpunkt geschnitten: Teil 1 erhält Status `unterbrochen` mit der bis dahin gearbeiteten Zeit, Teil 2 erbt den Mitarbeiter und erscheint als offener Eintrag in Planung & Zuweisung (Beta) — beide Teile zählen in der Zeiterfassung zusammen.

**Architecture:** Neuer Endpunkt `POST /api/termine/:id/pause-split` im bestehenden termine-System. Der Tablet-Dialog bekommt eine zweite Option neben "Kurze Unterbrechung". Im Web werden aufgeteilte Aufträge in Planung & Zuweisung in einem neuen Panel und in der Stempelzeiten-Tabelle als Gruppe mit Klammer angezeigt.

**Tech Stack:** Node.js/Express + SQLite (CommonJS), Vanilla JS/HTML/CSS (Frontend), Electron (Tablet)

---

## Dateiübersicht

| Datei | Art | Was ändert sich |
|---|---|---|
| `backend/migrations/036_termin_unterbrochen.js` | NEU | ALTER TABLE termine: +unterbrochen_am, +unterbrochen_grund; neuer Status per Constraint-Kommentar |
| `backend/migrations/index.js` | MODIFY | Migration 036 registrieren |
| `backend/src/config/constants.js` | MODIFY | TERMIN_STATUS.UNTERBROCHEN hinzufügen |
| `backend/src/models/termineModel.js` | MODIFY | pauseSplit()-Methode; getSplitPartner()-Methode |
| `backend/src/controllers/termineController.js` | MODIFY | pauseSplit()-Handler |
| `backend/src/routes/termineRoutes.js` | MODIFY | Route POST /:id/pause-split |
| `backend/src/controllers/stempelzeitenController.js` | MODIFY | Split-Partner mitladen wenn split_teil=1 und status=unterbrochen |
| `electron-intern-tablet/index.html` | MODIFY | Dialog-Erweiterung: zweite Option "Termin aufteilen" |
| `frontend/index.html` | MODIFY | Planung (Beta): neues Panel "Unterbrochene Aufträge" |
| `frontend/src/components/app.js` | MODIFY | loadPlanungDragDrop: unterbrochene Termine laden; renderZeitstempelungGruppe: Split-Gruppe; Zeitleiste: Farbe für Status unterbrochen |
| `backend/tests/termineSplit.test.js` | NEU | Tests für pause-split Endpunkt |

---

## Task 1: DB-Migration 036

**Files:**
- Create: `backend/migrations/036_termin_unterbrochen.js`
- Modify: `backend/migrations/index.js`

- [ ] **Schritt 1: Migrationsdatei anlegen**

```js
// backend/migrations/036_termin_unterbrochen.js
const { safeRun } = require('./helpers');

const migration = {
  version: 36,
  description: 'Auftrag-Split: unterbrochen_am + unterbrochen_grund Felder in termine'
};

async function up(db) {
  console.log('Migration 036: Füge unterbrochen_am + unterbrochen_grund zu termine hinzu...');
  await safeRun(db, `ALTER TABLE termine ADD COLUMN unterbrochen_am DATETIME`);
  await safeRun(db, `ALTER TABLE termine ADD COLUMN unterbrochen_grund TEXT`);
  console.log('✓ Migration 036 abgeschlossen');
}

async function down(db) {
  // SQLite unterstützt kein DROP COLUMN vor Version 3.35 — Spalten bleiben erhalten
  console.log('✓ Migration 036 rückgängig gemacht (Spalten bleiben erhalten)');
}

module.exports = { migration, up, down };
```

- [ ] **Schritt 2: Migration in index.js registrieren**

In `backend/migrations/index.js` nach der letzten require-Zeile (035) einfügen:

```js
  require('./036_termin_unterbrochen'),        // Version 36 - unterbrochen_am + unterbrochen_grund
```

- [ ] **Schritt 3: Migration testen**

```bash
cd backend && node -e "const { initializeDatabase } = require('./src/config/database'); initializeDatabase().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```

Erwartete Ausgabe: `Migration 036: Füge unterbrochen_am...` dann `✓ Migration 036 abgeschlossen` dann `OK`

- [ ] **Schritt 4: Commit**

```bash
git add backend/migrations/036_termin_unterbrochen.js backend/migrations/index.js
git commit -m "feat(db): migration 036 - unterbrochen_am + unterbrochen_grund in termine"
```

---

## Task 2: Konstante UNTERBROCHEN + Model-Methoden

**Files:**
- Modify: `backend/src/config/constants.js`
- Modify: `backend/src/models/termineModel.js`

- [ ] **Schritt 1: TERMIN_STATUS.UNTERBROCHEN hinzufügen**

In `backend/src/config/constants.js` in `TERMIN_STATUS`:

```js
const TERMIN_STATUS = {
  GEPLANT: 'geplant',
  IN_ARBEIT: 'in_arbeit',
  WARTEND: 'wartend',
  UNTERBROCHEN: 'unterbrochen',   // NEU: Auftrag aufgeteilt, Teil 1 erledigt
  ABGESCHLOSSEN: 'abgeschlossen',
  STORNIERT: 'storniert'
};
```

- [ ] **Schritt 2: pauseSplit()-Methode in termineModel.js ergänzen**

Nach der bestehenden `splitTermin()`-Methode (ca. Zeile 1317) einfügen:

```js
  /**
   * Schneidet einen laufenden Termin am aktuellen Zeitpunkt auf.
   * Teil 1: status=unterbrochen, geschaetzte_zeit=gearbeitete_min, split_teil=1
   * Teil 2: neuer Termin, status=geplant, geschaetzte_zeit=rest_min, split_teil=2,
   *         kein Datum/Startzeit, mitarbeiter_id von Teil 1 erben
   *
   * @param {number} id - ID des laufenden Termins (muss status='in_arbeit' haben)
   * @param {string} grund - 'teil_fehlt' | 'rueckfrage_kunde' | 'vorrang' | 'sonstiges'
   * @returns {{ teil1: { id, gearbeitete_min }, teil2: { id, termin_nr, rest_min } }}
   */
  static async pauseSplit(id, grund) {
    const ERLAUBTE_GRUENDE = ['teil_fehlt', 'rueckfrage_kunde', 'vorrang', 'sonstiges'];
    if (!ERLAUBTE_GRUENDE.includes(grund)) {
      throw new Error(`Ungültiger Grund: ${grund}`);
    }

    const termin = await this.getById(id);
    if (!termin) throw new Error('Termin nicht gefunden');
    if (termin.status !== 'in_arbeit') throw new Error('Termin ist nicht in Arbeit');
    if (termin.split_teil === 1) throw new Error('Termin wurde bereits aufgeteilt');

    const jetzt = new Date();
    const jetztIso = jetzt.toISOString();

    // Gearbeitete Zeit berechnen
    let gearbeiteteMin = 0;
    const startzeit = termin.startzeit; // "HH:MM"
    if (startzeit && /^\d{2}:\d{2}$/.test(startzeit)) {
      const [sh, sm] = startzeit.split(':').map(Number);
      const startMs = sh * 60 * 60 * 1000 + sm * 60 * 1000;
      const jetztMs = jetzt.getHours() * 60 * 60 * 1000 + jetzt.getMinutes() * 60 * 1000;
      gearbeiteteMin = Math.max(5, Math.round((jetztMs - startMs) / 60000));
    } else {
      // Kein Startzeit-Stempel: Fallback auf Hälfte der geplanten Zeit
      gearbeiteteMin = Math.max(5, Math.round((termin.geschaetzte_zeit || 30) / 2));
    }

    const restMin = Math.max(1, (termin.geschaetzte_zeit || 30) - gearbeiteteMin);

    return await withTransaction(async () => {
      // Teil 1 aktualisieren
      await runAsync(
        `UPDATE termine SET
           status = 'unterbrochen',
           geschaetzte_zeit = ?,
           tatsaechliche_zeit = ?,
           unterbrochen_am = ?,
           unterbrochen_grund = ?,
           split_teil = 1
         WHERE id = ?`,
        [gearbeiteteMin, gearbeiteteMin, jetztIso, grund, id]
      );

      // Neue Termin-Nummer für Teil 2
      const terminNr = await this.generateTerminNr();

      // Teil 2 anlegen
      const result = await runAsync(
        `INSERT INTO termine
           (termin_nr, kunde_id, kunde_name, kunde_telefon, kennzeichen, arbeit, umfang,
            geschaetzte_zeit, datum, status, abholung_typ, abholung_details, abholung_zeit,
            bring_zeit, kontakt_option, kilometerstand, ersatzauto, mitarbeiter_id, lehrling_id,
            arbeitszeiten_details, dringlichkeit, vin, fahrzeugtyp, parent_termin_id, split_teil,
            unterbrochen_grund)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'geplant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)`,
        [
          terminNr,
          termin.kunde_id, termin.kunde_name, termin.kunde_telefon,
          termin.kennzeichen,
          termin.arbeit + ' (Fortsetzung)',
          termin.umfang,
          restMin,
          termin.abholung_typ, termin.abholung_details, termin.abholung_zeit,
          termin.bring_zeit, termin.kontakt_option, termin.kilometerstand,
          termin.ersatzauto,
          termin.mitarbeiter_id, termin.lehrling_id,
          termin.arbeitszeiten_details,
          termin.dringlichkeit, termin.vin, termin.fahrzeugtyp,
          id,
          grund
        ]
      );

      return {
        teil1: { id, gearbeitete_min: gearbeiteteMin },
        teil2: { id: result.lastID, termin_nr: terminNr, rest_min: restMin }
      };
    });
  }

  /**
   * Lädt den Split-Partner eines Termins.
   * Für split_teil=1: gibt Teil 2 zurück (parent_termin_id = id)
   * Für split_teil=2: gibt Teil 1 zurück (id = parent_termin_id)
   */
  static async getSplitPartner(id) {
    const termin = await this.getById(id);
    if (!termin) return null;

    if (termin.split_teil === 1) {
      return await getAsync(
        `SELECT * FROM termine WHERE parent_termin_id = ? AND split_teil = 2 AND geloescht_am IS NULL LIMIT 1`,
        [id]
      );
    } else if (termin.split_teil === 2 && termin.parent_termin_id) {
      return await getAsync(
        `SELECT * FROM termine WHERE id = ? AND geloescht_am IS NULL`,
        [termin.parent_termin_id]
      );
    }
    return null;
  }
```

- [ ] **Schritt 3: Imports in termineModel.js prüfen**

`withTransaction`, `runAsync`, `getAsync` müssen oben in termineModel.js importiert sein. Prüfen:

```bash
grep -n "withTransaction\|runAsync\|getAsync" backend/src/models/termineModel.js | head -5
```

Falls `getAsync` fehlt, in den Imports ergänzen:
```js
const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
```

- [ ] **Schritt 4: Commit**

```bash
git add backend/src/config/constants.js backend/src/models/termineModel.js
git commit -m "feat(model): pauseSplit() + getSplitPartner() + TERMIN_STATUS.UNTERBROCHEN"
```

---

## Task 3: Backend — Controller + Route

**Files:**
- Modify: `backend/src/controllers/termineController.js`
- Modify: `backend/src/routes/termineRoutes.js`

- [ ] **Schritt 1: pauseSplit-Handler in termineController.js einfügen**

Nach dem bestehenden `splitTermin`-Handler (Zeile ~1920) einfügen:

```js
  /**
   * POST /api/termine/:id/pause-split
   * Body: { grund: 'teil_fehlt' | 'rueckfrage_kunde' | 'vorrang' | 'sonstiges' }
   * Teilt einen laufenden Termin am aktuellen Zeitpunkt auf.
   */
  static async pauseSplit(req, res) {
    const { id } = req.params;
    const { grund } = req.body;

    if (!grund) {
      return res.status(400).json({ error: 'grund ist erforderlich' });
    }

    const erlaubteGruende = ['teil_fehlt', 'rueckfrage_kunde', 'vorrang', 'sonstiges'];
    if (!erlaubteGruende.includes(grund)) {
      return res.status(400).json({ error: `grund muss einer von: ${erlaubteGruende.join(', ')} sein` });
    }

    const termin = await TermineModel.getById(id);
    if (!termin) {
      return res.status(404).json({ error: 'Termin nicht gefunden' });
    }
    if (termin.status !== 'in_arbeit') {
      return res.status(409).json({ error: 'Termin ist nicht in Arbeit und kann nicht aufgeteilt werden' });
    }
    if (termin.split_teil === 1) {
      return res.status(409).json({ error: 'Termin wurde bereits aufgeteilt' });
    }

    const result = await TermineModel.pauseSplit(id, grund);

    invalidateAuslastungCache(termin.datum);
    invalidateTermineCache();
    broadcastEvent('termin.updated', { id: Number(id), datum: termin.datum || null, status: 'unterbrochen' });
    broadcastEvent('termin.created', { id: result.teil2.id, datum: null });

    res.json({
      message: 'Auftrag erfolgreich aufgeteilt',
      ...result
    });
  }
```

- [ ] **Schritt 2: Route in termineRoutes.js einfügen**

Nach `router.post('/:id/split', ...)` (Zeile 16):

```js
router.post('/:id/pause-split', validateId, asyncHandler(TermineController.pauseSplit));
```

- [ ] **Schritt 3: Manuellen Test durchführen**

```bash
# Backend starten
cd backend && npm run dev

# Termin in Arbeit finden (ID anpassen):
curl -s http://localhost:3001/api/termine?status=in_arbeit | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const t=JSON.parse(d);console.log(t.termine?.[0]?.id, t.termine?.[0]?.status)"

# pause-split aufrufen (ID anpassen):
curl -s -X POST http://localhost:3001/api/termine/42/pause-split \
  -H "Content-Type: application/json" \
  -d '{"grund":"teil_fehlt"}'
```

Erwartete Antwort:
```json
{ "message": "Auftrag erfolgreich aufgeteilt", "teil1": { "id": 42, "gearbeitete_min": 35 }, "teil2": { "id": 43, "termin_nr": "T-2026-022", "rest_min": 25 } }
```

- [ ] **Schritt 4: Commit**

```bash
git add backend/src/controllers/termineController.js backend/src/routes/termineRoutes.js
git commit -m "feat(api): POST /api/termine/:id/pause-split"
```

---

## Task 4: Tests

**Files:**
- Create: `backend/tests/terminePauseSplit.test.js`

- [ ] **Schritt 1: Testdatei anlegen**

```js
// backend/tests/terminePauseSplit.test.js
const request = require('supertest');
const { app } = require('../src/server');

describe('POST /api/termine/:id/pause-split', () => {
  let terminId;

  beforeAll(async () => {
    // Testkunden anlegen
    const kundeRes = await request(app)
      .post('/api/kunden')
      .send({ name: 'Split-Test-Kunde', kennzeichen: 'ST-1234' });
    const kundeId = kundeRes.body.id;

    // Testtermin anlegen und in Arbeit setzen
    const terminRes = await request(app)
      .post('/api/termine')
      .send({
        kennzeichen: 'ST-1234',
        arbeit: 'Testarbeit Split',
        geschaetzte_zeit: 60,
        datum: new Date().toISOString().slice(0, 10),
        startzeit: '08:00',
        umfang: 'mittel'
      });
    terminId = terminRes.body.id;

    await request(app)
      .put(`/api/termine/${terminId}`)
      .send({ status: 'in_arbeit' });
  });

  it('teilt Termin in zwei Teile auf', async () => {
    const res = await request(app)
      .post(`/api/termine/${terminId}/pause-split`)
      .send({ grund: 'teil_fehlt' });

    expect(res.status).toBe(200);
    expect(res.body.teil1.id).toBe(terminId);
    expect(res.body.teil1.gearbeitete_min).toBeGreaterThan(0);
    expect(res.body.teil2.id).toBeGreaterThan(terminId);
    expect(res.body.teil2.rest_min).toBeGreaterThan(0);
  });

  it('setzt Teil 1 auf Status unterbrochen', async () => {
    const res = await request(app).get(`/api/termine/${terminId}`);
    expect(res.body.status).toBe('unterbrochen');
    expect(res.body.split_teil).toBe(1);
    expect(res.body.unterbrochen_grund).toBe('teil_fehlt');
  });

  it('erstellt Teil 2 mit status geplant und ohne Datum', async () => {
    const res = await request(app).get(`/api/termine/${terminId}/split-termine`);
    const teil2 = res.body.find(t => t.split_teil === 2);
    expect(teil2).toBeDefined();
    expect(teil2.status).toBe('geplant');
    expect(teil2.datum).toBeNull();
    expect(teil2.parent_termin_id).toBe(terminId);
  });

  it('lehnt Aufruf ab wenn Termin nicht in_arbeit', async () => {
    const res = await request(app)
      .post(`/api/termine/${terminId}/pause-split`)
      .send({ grund: 'vorrang' });
    expect(res.status).toBe(409);
  });

  it('lehnt ungültigen Grund ab', async () => {
    const res = await request(app)
      .post(`/api/termine/999/pause-split`)
      .send({ grund: 'unbekannt' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Schritt 2: Tests ausführen**

```bash
cd backend && npm test -- terminePauseSplit
```

Erwartete Ausgabe: Alle 5 Tests PASS

- [ ] **Schritt 3: Commit**

```bash
git add backend/tests/terminePauseSplit.test.js
git commit -m "test: pause-split Endpunkt Tests"
```

---

## Task 5: Tablet — Dialog-Erweiterung

**Files:**
- Modify: `electron-intern-tablet/index.html` — Funktion `interneArbeitPausierenTablet` (ca. Zeile 2953)

- [ ] **Schritt 1: Dialog um Typ-Auswahl erweitern**

In `interneArbeitPausierenTablet()` das `modal.innerHTML` ersetzen. Den Abschnitt zwischen `modal.innerHTML = \`` und dem schließenden Backtick ersetzen durch:

```js
      modal.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <strong style="font-size:15px;">⏸️ Auftrag unterbrechen</strong>
            <span id="tabletPauseClose" style="cursor:pointer;color:#999;font-size:20px;">✕</span>
          </div>

          <p style="font-size:13px;color:#666;margin-bottom:10px;">Was soll danach passieren?</p>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;">
            <label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:2px solid #1976d2;border-radius:8px;cursor:pointer;font-size:13px;background:#e3f2fd;">
              <input type="radio" name="tabletPauseTyp" value="kurz" checked style="accent-color:#1976d2;margin-top:2px;">
              <div>
                <div style="font-weight:600;color:#1976d2;">⏸ Kurze Unterbrechung</div>
                <div style="color:#555;font-size:12px;margin-top:2px;">Schraffierung in Zeitleiste. Auftrag läuft weiter — ich setze gleich fort.</div>
              </div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;font-size:13px;">
              <input type="radio" name="tabletPauseTyp" value="split" style="accent-color:#e65100;margin-top:2px;">
              <div>
                <div style="font-weight:600;color:#e65100;">✂️ Termin aufteilen</div>
                <div style="color:#555;font-size:12px;margin-top:2px;">Rest kommt in Planung zur Neuzuweisung. Für längere Unterbrechungen oder anderen Tag.</div>
              </div>
            </label>
          </div>

          <p style="font-size:13px;color:#666;margin-bottom:10px;">Warum wird der Auftrag unterbrochen?</p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
            ${Object.entries(grundLabels).map(([val, label]) => `
              <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e0e0e0;border-radius:8px;cursor:pointer;font-size:14px;">
                <input type="radio" name="tabletPauseGrund" value="${val}" style="accent-color:#1976d2;">
                ${label}
              </label>
            `).join('')}
          </div>
          <div style="display:flex;gap:8px;">
            <button id="tabletPauseAbbrechen" style="flex:1;padding:10px;background:#f0f0f0;color:#555;border:none;border-radius:6px;font-size:13px;cursor:pointer;">Abbrechen</button>
            <button id="tabletPauseBestaetigen" style="flex:1;padding:10px;background:#636e72;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">⏸️ Bestätigen</button>
          </div>
        </div>
      `;
```

- [ ] **Schritt 2: onClick-Handler anpassen**

Den `tabletPauseBestaetigen.onclick`-Block ersetzen:

```js
      modal.querySelector('#tabletPauseBestaetigen').onclick = async () => {
        const selectedGrund = modal.querySelector('input[name="tabletPauseGrund"]:checked');
        const selectedTyp = modal.querySelector('input[name="tabletPauseTyp"]:checked');
        if (!selectedGrund) { alert('Bitte einen Grund auswählen.'); return; }
        const bestaetigenBtn = modal.querySelector('#tabletPauseBestaetigen');
        bestaetigenBtn.disabled = true;
        try {
          if (selectedTyp && selectedTyp.value === 'split') {
            // Termin aufteilen
            await ApiService.post(`/termine/${terminId}/pause-split`, {
              grund: selectedGrund.value
            });
            schliesseModal();
            showToast('✂️ Auftrag aufgeteilt — Rest wartet in der Planung', 'success');
          } else {
            // Kurze Unterbrechung (bestehendes Verhalten)
            await ApiService.post('/arbeitspausen/starten', {
              termin_id: terminId,
              mitarbeiter_id: mitarbeiterId || null,
              lehrling_id: lehrlingId || null,
              grund: selectedGrund.value
            });
            schliesseModal();
          }
          await loadTeamUebersicht();
        } catch (e) {
          console.error('[Tablet-Pause] Fehler:', e);
          bestaetigenBtn.disabled = false;
          alert('Fehler beim Verarbeiten der Pause.');
        }
      };
```

- [ ] **Schritt 3: showToast-Funktion prüfen**

```bash
grep -n "function showToast\|showToast" electron-intern-tablet/index.html | head -5
```

Falls `showToast` nicht existiert, vor `schliesseModal()` statt Toast ein `alert()` verwenden:
```js
alert('✂️ Auftrag aufgeteilt — Rest wartet in der Planung');
```

- [ ] **Schritt 4: Manuell testen**

Tablet-App starten, einen laufenden Auftrag auswählen, Pause-Button drücken. Beide Optionen prüfen:
- "Kurze Unterbrechung" → Schraffierung erscheint, kein Split
- "Termin aufteilen" → API-Call, Toast erscheint, Auftrag verschwindet aus der Ansicht

- [ ] **Schritt 5: Commit**

```bash
git add electron-intern-tablet/index.html
git commit -m "feat(tablet): Pause-Dialog um 'Termin aufteilen' erweitert"
```

---

## Task 6: Status `unterbrochen` in Zeitleiste & Heute-Ansicht

**Files:**
- Modify: `frontend/src/components/app.js` — Zeitleisten-Rendering und Status-Farben

- [ ] **Schritt 1: Status-Farbe für `unterbrochen` finden und ergänzen**

```bash
grep -n "in_arbeit\|wartend\|geplant\|status.*color\|statusColor\|getStatusColor\|farb.*status" frontend/src/components/app.js | head -20
```

Die gefundene Funktion/Map um `unterbrochen` erweitern. Typisches Muster:

```js
// In der Status-Farb-Map:
unterbrochen: '#ff9800',   // Orange
```

Und im CSS-Pattern für Schraffierung (nach `in_arbeit`-Muster):

```js
if (status === 'unterbrochen') {
  return `repeating-linear-gradient(
    -45deg,
    #ff9800,
    #ff9800 4px,
    #fff3e0 4px,
    #fff3e0 10px
  )`;
}
```

- [ ] **Schritt 2: Badge-Text für `unterbrochen` ergänzen**

```bash
grep -n "statusLabel\|status_label\|geplant.*Geplant\|wartend.*Wartend" frontend/src/components/app.js | head -10
```

In der gefundenen Label-Map:
```js
unterbrochen: '⏸ Unterbrochen',
```

- [ ] **Schritt 3: Visuell prüfen**

Backend starten, Termin manuell auf `unterbrochen` setzen:
```bash
curl -s -X PUT http://localhost:3001/api/termine/42 \
  -H "Content-Type: application/json" \
  -d '{"status":"unterbrochen"}'
```

Im Frontend-Dev-Server (`npm run dev`) prüfen: Termin erscheint orange mit Schraffierung in der Zeitleiste.

- [ ] **Schritt 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat(frontend): Status 'unterbrochen' - orange Schraffierung in Zeitleiste"
```

---

## Task 7: Planung & Zuweisung — Panel "Unterbrochene Aufträge"

**Files:**
- Modify: `frontend/index.html` — Template `tab-template-auslastung-dragdrop`
- Modify: `frontend/src/components/app.js` — loadPlanungDragDrop + neues Panel rendern

- [ ] **Schritt 1: HTML-Panel in index.html einfügen**

Im Template `tab-template-auslastung-dragdrop` nach dem `ueberfaellige-panel`-Div und vor `</div>` (schließendes `planning-layout`) einfügen:

```html
<!-- Unterbrochene Aufträge: Split-Teil-2-Termine ohne Datum -->
<div class="unterbrochene-panel" id="unterbrochenePanel">
    <div class="unterbrochene-header">
        <h3>✂️ Unterbrochene Aufträge</h3>
        <div class="unterbrochene-controls">
            <span id="unterbrocheneCount" class="unterbrochene-count">0 Aufträge</span>
        </div>
    </div>
    <p class="unterbrochene-hint" style="font-size:12px;color:#888;margin:4px 0 8px 0;">
        Aufgeteilte Aufträge ohne Datum — per Drag &amp; Drop in die Zeitleiste einplanen oder Richtzeit anpassen.
    </p>
    <div id="unterbrocheneTermineContainer" class="unterbrochene-container drop-zone source-zone" data-mitarbeiter-id="null">
        <div class="empty-state">Keine unterbrochenen Aufträge</div>
    </div>
</div>
```

- [ ] **Schritt 2: Unterbrochene Termine laden in app.js**

In `loadPlanungDragDrop()` (oder der Funktion die `schwebendeTermine` lädt) nach dem Laden der schwebenden Termine ergänzen:

```js
// Unterbrochene Aufträge laden: split_teil=2, status=geplant, kein Datum
const unterbrocheneRaw = await ApiService.get('/termine?split_teil=2&status=geplant&ohne_datum=1').catch(() => []);
const unterbrochene = Array.isArray(unterbrocheneRaw) ? unterbrocheneRaw : (unterbrocheneRaw.termine || []);
this.renderUnterbrocheneTermine(unterbrochene);
```

- [ ] **Schritt 3: renderUnterbrocheneTermine() in app.js implementieren**

```js
renderUnterbrocheneTermine(termine) {
  const container = document.getElementById('unterbrocheneTermineContainer');
  const countEl = document.getElementById('unterbrocheneCount');
  if (!container) return;

  const offen = termine.filter(t => !t.datum);
  if (countEl) countEl.textContent = `${offen.length} Auftrag${offen.length !== 1 ? 'e' : ''}`;

  if (offen.length === 0) {
    container.innerHTML = '<div class="empty-state">Keine unterbrochenen Aufträge</div>';
    return;
  }

  const grundLabels = {
    teil_fehlt: '⏳ Teil fehlt',
    rueckfrage_kunde: '❓ Rückfrage Kunde',
    vorrang: '🔀 Vorrang',
    sonstiges: '📝 Sonstiges'
  };

  container.innerHTML = offen.map(t => {
    const grundLabel = grundLabels[t.unterbrochen_grund] || t.unterbrochen_grund || '';
    const mitarbeiterName = t.mitarbeiter_name || '—';
    return `
      <div class="unterbrochene-karte draggable-termin"
           draggable="true"
           data-termin-id="${t.id}"
           data-dauer="${t.geschaetzte_zeit || 30}"
           data-mitarbeiter-id="${t.mitarbeiter_id || ''}"
           style="background:#fff8f0;border:1px solid #ff9800;border-left:4px solid #ff9800;border-radius:6px;padding:10px 12px;margin-bottom:8px;cursor:grab;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:12px;color:#888;margin-bottom:2px;">${this.escapeHtml(t.termin_nr || '')} · ✂️ Fortsetzung</div>
            <div style="font-weight:600;font-size:13px;">${this.escapeHtml(t.kunde_name || '')} · ${this.escapeHtml(t.kennzeichen || '')}</div>
            <div style="font-size:13px;color:#555;margin-top:2px;">${this.escapeHtml(t.arbeit || '')}</div>
            <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:10px;padding:1px 8px;font-size:11px;">${grundLabel}</span>
              <span style="color:#888;font-size:11px;">👷 ${this.escapeHtml(mitarbeiterName)}</span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:12px;color:#888;">Richtzeit</div>
            <div style="font-weight:600;font-size:14px;color:#e65100;">${t.geschaetzte_zeit || '?'} min</div>
            <button onclick="window.app.unterbrocheneRichtzeitAnpassen(${t.id}, ${t.geschaetzte_zeit || 30})"
                    style="margin-top:4px;border:none;background:none;cursor:pointer;color:#888;font-size:11px;padding:0;">✏️ anpassen</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
```

- [ ] **Schritt 4: unterbrocheneRichtzeitAnpassen() implementieren**

```js
async unterbrocheneRichtzeitAnpassen(terminId, aktuelleMin) {
  const eingabe = prompt(`Neue Richtzeit in Minuten (aktuell: ${aktuelleMin} min):`, aktuelleMin);
  if (!eingabe || isNaN(parseInt(eingabe))) return;
  const neueMin = Math.max(1, parseInt(eingabe));
  try {
    await ApiService.put(`/termine/${terminId}`, { geschaetzte_zeit: neueMin });
    await this.loadPlanungDragDrop();
  } catch (e) {
    alert('Fehler beim Aktualisieren der Richtzeit.');
  }
}
```

- [ ] **Schritt 5: Query-Parameter `ohne_datum` im Backend unterstützen**

In `backend/src/controllers/termineController.js` in der `getAll()`-Methode, dort wo Query-Filter aufgebaut werden, ergänzen:

```js
// Unterbrochene Teil-2-Termine: ohne Datum
if (query.ohne_datum === '1' || query.ohne_datum === 'true') {
  conditions.push('t.datum IS NULL');
}
if (query.split_teil) {
  conditions.push('t.split_teil = ?');
  params.push(parseInt(query.split_teil));
}
```

- [ ] **Schritt 6: Visuell prüfen**

Im Dev-Server: Planung (Beta) Tab öffnen. Ein unterbrochener Auftrag muss im neuen Panel erscheinen. Richtzeit anpassen und prüfen ob sie sich aktualisiert.

- [ ] **Schritt 7: Commit**

```bash
git add frontend/index.html frontend/src/components/app.js backend/src/controllers/termineController.js
git commit -m "feat(planung): Panel 'Unterbrochene Aufträge' mit Richtzeit-Anpassung"
```

---

## Task 8: Stempelzeiten — Split-Gruppe anzeigen

**Files:**
- Modify: `backend/src/controllers/stempelzeitenController.js`
- Modify: `frontend/src/components/app.js` — `renderZeitstempelungGruppe`

- [ ] **Schritt 1: Split-Partner in stempelzeitenController mitladen**

Am Anfang der `getStempelzeiten`-Funktion, nach dem Laden von `alleTermine`, einfügen:

```js
// Split-Partner mitladen: für split_teil=1/unterbrochen den Teil-2 dazuholen (auch wenn anderes Datum)
const splitPartnerIds = new Set();
for (const t of alleTermine) {
  if (t.split_teil === 1 && t.status === 'unterbrochen') {
    // Teil 2 suchen
    const teil2 = await getAsync(
      `SELECT id, termin_nr, arbeit, geschaetzte_zeit, datum, startzeit, status,
              mitarbeiter_id, lehrling_id, unterbrochen_grund, split_teil, parent_termin_id
         FROM termine
        WHERE parent_termin_id = ? AND split_teil = 2 AND geloescht_am IS NULL`,
      [t.id]
    );
    if (teil2) {
      t._split_partner = teil2;
    }
  }
}
```

- [ ] **Schritt 2: Split-Partner in API-Response einbauen**

In der Stelle wo `arbeitData` für einen Termin zusammengebaut wird, das `_split_partner`-Feld durchreichen:

```js
// Im arbeitData-Objekt (wo stempel_start, stempel_ende etc. zusammengebaut werden):
if (termin._split_partner) {
  arbeitData.split_partner = {
    id: termin._split_partner.id,
    termin_nr: termin._split_partner.termin_nr,
    arbeit: termin._split_partner.arbeit,
    geschaetzte_zeit: termin._split_partner.geschaetzte_zeit,
    datum: termin._split_partner.datum,
    status: termin._split_partner.status,
    unterbrochen_grund: termin._split_partner.unterbrochen_grund
  };
}
```

- [ ] **Schritt 3: Tabellenzeilen in renderZeitstempelungGruppe ergänzen**

In `app.js` in der `rows`-Map, nach dem Ende einer normalen Zeile (`return \`<tr...>...</tr>\`;`), die Logik um eine Folgezeile für den Split-Partner erweitern:

```js
// Nach dem return der normalen Zeile, in der map-Funktion:
const hauptZeile = `
  <tr${rowStyle}>
    <td>${terminNrZelle}</td>
    <td>${this.escapeHtml(a.interne_auftragsnummer || '')}</td>
    <td>${this.escapeHtml(a.kunde_name || '')}</td>
    <td>${this.escapeHtml(a.kennzeichen || '')}</td>
    <td>${this.escapeHtml(a.arbeit)}</td>
    <td>${planStartCell}</td>
    <td>${planEndeCell}</td>
    <td class="text-success">${startCell}</td>
    <td class="text-danger">${endeCell}</td>
    <td class="text-warning">${richtwertMin ? richtwertMin + ' Min' : '—'}</td>
    <td>${istText}${pauseBadge}${a.termin_status === 'unterbrochen' ? ' <span style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;">⏸ unterbrochen</span>' : ''}</td>
  </tr>
`;

// Split-Partner-Zeile wenn vorhanden
let partnerZeile = '';
if (a.split_partner) {
  const sp = a.split_partner;
  const spDatumStr = sp.datum ? (() => { const d = new Date(sp.datum); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; })() : null;
  const spDatumBadge = spDatumStr
    ? `<span style="background:#e8f5e9;color:#388e3c;border:1px solid #a5d6a7;border-radius:10px;padding:1px 7px;font-size:11px;">📅 ${spDatumStr}</span>`
    : `<span style="background:#fce4ec;color:#c62828;border:1px solid #ef9a9a;border-radius:10px;padding:1px 7px;font-size:11px;">📅 noch offen</span>`;
  partnerZeile = `
    <tr style="background:#fff8f0;border-left:3px solid #ff9800;">
      <td style="padding-left:20px;color:#888;font-size:12px;">${this.escapeHtml(sp.termin_nr || '')} ✂️</td>
      <td></td>
      <td></td>
      <td></td>
      <td style="color:#888;font-size:12px;">${this.escapeHtml(sp.arbeit || '')} ${spDatumBadge}</td>
      <td><span class="text-muted">—</span></td>
      <td><span class="text-muted">—</span></td>
      <td><span class="text-muted">—</span></td>
      <td><span class="text-muted">—</span></td>
      <td style="color:#e65100;">${sp.geschaetzte_zeit ? sp.geschaetzte_zeit + ' Min' : '—'}</td>
      <td><span class="text-muted">—</span></td>
    </tr>
  `;
}

return hauptZeile + partnerZeile;
```

- [ ] **Schritt 4: Testen**

Stempelzeiten-Tab öffnen für einen Tag mit einem unterbrochenen Auftrag. Prüfen:
- Hauptzeile: orange Badge "⏸ unterbrochen"
- Folgezeile: leicht oranges Hintergrund, Termin-Nr mit ✂️, Datum-Badge (grün wenn geplant, rot wenn noch offen)

- [ ] **Schritt 5: Commit**

```bash
git add backend/src/controllers/stempelzeitenController.js frontend/src/components/app.js
git commit -m "feat(stempelzeiten): Split-Partner als Folgezeile in Stempelzeiten-Tabelle"
```

---

## Task 9: Zeitverwaltung — Zeitkorrektur Teil 1 + Richtzeit Teil 2

**Files:**
- Modify: `frontend/src/components/app.js` — `renderZeitstempelungGruppe`

Die Zeitkorrektur läuft über den bestehenden Zeitkorrektur-Mechanismus. Hier wird nur die UI ergänzt.

- [ ] **Schritt 1: Zeitkorrektur-Button für Teil 1 in der Stempelzeilen-Zelle**

In der `hauptZeile` die `istText`-Zelle erweitern (Zeile mit `<td>${istText}...`):

```js
// Zeitkorrektur-Button nur für unterbrochene Termine (Teil 1)
const korrekturBtn = a.termin_status === 'unterbrochen'
  ? ` <button onclick="window.app.zeitkorrekturPauseSplit(${a.termin_id || a.id}, ${gesamtIst || 0})"
              title="Gearbeitete Zeit korrigieren"
              style="border:none;background:none;cursor:pointer;color:#888;font-size:11px;padding:0 2px;">✏️</button>`
  : '';

// In die Zelle einfügen:
`<td>${istText}${pauseBadge}${unterbrochBadge}${korrekturBtn}</td>`
```

- [ ] **Schritt 2: zeitkorrekturPauseSplit() implementieren**

```js
async zeitkorrekturPauseSplit(terminId, aktuelleMin) {
  const eingabe = prompt(
    `Gearbeitete Zeit korrigieren (aktuell: ${aktuelleMin} min):\nWird als tatsaechliche_zeit und geschaetzte_zeit für Teil 1 gesetzt.`,
    aktuelleMin
  );
  if (!eingabe || isNaN(parseInt(eingabe))) return;
  const neueMin = Math.max(1, parseInt(eingabe));
  try {
    await ApiService.put(`/termine/${terminId}`, {
      tatsaechliche_zeit: neueMin,
      geschaetzte_zeit: neueMin
    });
    await this.loadZeitstempelung();
  } catch (e) {
    alert('Fehler beim Korrigieren der Zeit.');
  }
}
```

- [ ] **Schritt 3: Richtzeit-Button für Teil 2 in der Folgezeile**

In `partnerZeile` die Richtzeit-Zelle erweitern:

```js
`<td style="color:#e65100;">
  ${sp.geschaetzte_zeit ? sp.geschaetzte_zeit + ' Min' : '—'}
  <button onclick="window.app.unterbrocheneRichtzeitAnpassen(${sp.id}, ${sp.geschaetzte_zeit || 30})"
          style="border:none;background:none;cursor:pointer;color:#888;font-size:11px;padding:0 2px;">✏️</button>
</td>`
```

- [ ] **Schritt 4: Testen**

In Stempelzeiten-Tab: ✏️ bei Teil 1 drücken → Prompt erscheint → Wert eingeben → Tabelle aktualisiert sich. ✏️ bei Teil 2 drücken → Richtzeit wird angepasst.

- [ ] **Schritt 5: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat(zeitverwaltung): Zeitkorrektur Teil1 + Richtzeit Teil2 in Stempelzeiten"
```

---

## Task 10: Frontend-Build + Deploy-Vorbereitung

- [ ] **Schritt 1: Frontend bauen**

```bash
cd frontend && npm run build
```

Neue Hash-Namen in `dist/assets/` notieren für den Deploy-Befehl.

- [ ] **Schritt 2: Alle Tests nochmals laufen lassen**

```bash
cd backend && npm test
```

Alle Tests müssen PASS sein.

- [ ] **Schritt 3: Tab-Check**

```powershell
foreach ($tab in @("dashboard","heute","termine","kalender","kunden","zeitverwaltung","zeitstempelung","auslastung","intern","papierkorb","einstellungen")) {
  if (!(Select-String -Path "frontend/index.html" -Pattern "data-tab=`"$tab`"" -Quiet)) {
    Write-Host "FEHLT: $tab" -ForegroundColor Red
  }
}
```

Erwartete Ausgabe: Keine roten Zeilen.

- [ ] **Schritt 4: Finaler Commit**

```bash
git add -A
git commit -m "feat: Auftrag-Split via Pause-Button (Tablet + Web + Stempelzeiten)"
```

---

## Selbst-Review gegen Design

| Design-Anforderung | Task |
|---|---|
| Migration 036: unterbrochen_am + unterbrochen_grund | Task 1 |
| TERMIN_STATUS.UNTERBROCHEN | Task 2 |
| POST /api/termine/:id/pause-split | Task 3 |
| Tests für pause-split | Task 4 |
| Tablet: Dialog mit Typ-Auswahl (kurz / split) | Task 5 |
| Zeitleiste: Status unterbrochen orange mit Schraffierung | Task 6 |
| Planung (Beta): Panel "Unterbrochene Aufträge" | Task 7 |
| Stempelzeiten: Split-Partner als Folgezeile | Task 8 |
| Zeitverwaltung: Zeitkorrektur Teil 1 + Richtzeit Teil 2 | Task 9 |
| Frontend-Build + Tab-Check | Task 10 |

Alle Design-Anforderungen sind abgedeckt. Keine Platzhalter.
