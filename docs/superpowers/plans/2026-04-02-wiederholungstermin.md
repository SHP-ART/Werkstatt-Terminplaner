# Wiederholungstermin-Erkennung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim Erstellen eines Termins nach ähnlichen Terminen desselben Kennzeichens ±7 Tage suchen, dem Nutzer einen Dialog zeigen, und bei Auswahl „Wiederholungstermin" den neuen Termin mit `ist_wiederholung = 1` speichern, überall rot markieren und im Dashboard als eigene KPI zählen.

**Architecture:** Neues DB-Feld `ist_wiederholung` (Migration 029). Neuer Backend-Endpoint `GET /termine/aehnliche`. Dialog in `executeTerminSave()` (app.js) vor dem API-Call. Rote Markierung in `loadTermine()`, `createTimelineTerminElement()`, `createTerminMiniCard()`, `renderHeuteKarten()`. Neues KPI-Feld in `reportingModel.js` + Dashboard in `index.html` + `loadDashboard()` in app.js.

**Tech Stack:** Vanilla JS (ES6+), Node.js/Express, SQLite, `TermineService` für API-Calls. Kein Test-Framework — manuelle Smoke-Tests nach jedem Task.

**Hinweis zu Tests:** Kein automatisiertes Test-Framework vorhanden. Jeder Task endet mit manuellen Smoke-Test-Schritten und einem Commit.

---

## Datei-Übersicht

| Datei | Änderung |
|---|---|
| `backend/migrations/029_wiederholung.js` | Neu: Migration `ist_wiederholung INTEGER DEFAULT 0` |
| `backend/migrations/index.js` | Migration 029 registrieren |
| `backend/src/routes/termineRoutes.js` | Route `GET /aehnliche` hinzufügen |
| `backend/src/controllers/termineController.js` | Methode `getAehnliche` hinzufügen |
| `backend/src/models/reportingModel.js` | KPI-Query um `wiederholungen_anzahl` + `wiederholungen_quote` erweitern |
| `frontend/index.html` | Neue KPI-Kachel `kpiWiederholung` nach `kpiNacharbeit` |
| `frontend/src/components/app.js` | 5 Änderungen (Dialog, Zeitverwaltung-Badge, Timeline, MiniCard, Heute-Karten, Dashboard) |
| `frontend/src/styles/style.css` | CSS für `.wiederholung-badge` |

---

## Task 1: DB-Migration `ist_wiederholung`

**Files:**
- Create: `backend/migrations/029_wiederholung.js`
- Modify: `backend/migrations/index.js` (letzte Zeile im `migrations`-Array)

- [ ] **Schritt 1: Migrationsdatei erstellen**

  Erstelle `backend/migrations/029_wiederholung.js`:

  ```javascript
  const { safeRun } = require('./helpers');

  const migration = {
    version: 29,
    description: 'Wiederholungstermin-Flag: ist_wiederholung in termine-Tabelle'
  };

  async function up(db) {
    console.log('Migration 029: Füge ist_wiederholung zu termine hinzu...');
    await safeRun(db, `
      ALTER TABLE termine ADD COLUMN ist_wiederholung INTEGER DEFAULT 0
    `);
    await safeRun(db, `
      CREATE INDEX IF NOT EXISTS idx_termine_wiederholung
      ON termine(ist_wiederholung, datum)
      WHERE ist_wiederholung = 1
    `);
    console.log('✓ Migration 029 abgeschlossen');
  }

  async function down(db) {
    console.log('Migration 029: Rückgängig (Spalte kann in SQLite nicht entfernt werden – ignoriert)');
    await safeRun(db, 'DROP INDEX IF EXISTS idx_termine_wiederholung');
    console.log('✓ Migration 029 rückgängig gemacht (Index entfernt)');
  }

  migration.up = up;
  migration.down = down;

  module.exports = migration;
  ```

- [ ] **Schritt 2: Migration in index.js registrieren**

  In `backend/migrations/index.js`, letzte Zeile des `migrations`-Arrays ergänzen:

  ```javascript
  require('./028_nacharbeit_tracking'), // Version 28 - Nacharbeit-Tracking: nacharbeit_start_zeit
  require('./029_wiederholung')         // Version 29 - Wiederholungstermin-Flag
  ```

- [ ] **Schritt 3: Manuell testen**

  Backend neu starten (oder `node -e "require('./backend/migrations/029_wiederholung').up(db)"` ausführen). Im Log erscheint: `✓ Migration 029 abgeschlossen`.

  Prüfen via SQLite: `PRAGMA table_info(termine)` → Spalte `ist_wiederholung` mit Default `0` vorhanden.

- [ ] **Schritt 4: Committen**

  ```bash
  git add backend/migrations/029_wiederholung.js backend/migrations/index.js
  git commit -m "feat: Migration 029 - ist_wiederholung Feld in termine-Tabelle"
  ```

---

## Task 2: Backend-Endpoint `GET /termine/aehnliche`

**Files:**
- Modify: `backend/src/controllers/termineController.js` (neue Methode vor `module.exports`)
- Modify: `backend/src/routes/termineRoutes.js` (Route vor der `/:id`-Route)

- [ ] **Schritt 1: Methode `getAehnliche` in termineController.js hinzufügen**

  Füge direkt vor `module.exports` in `termineController.js` ein:

  ```javascript
  /**
   * Sucht ähnliche Termine (gleiches Kennzeichen, ±7 Tage)
   * GET /termine/aehnliche?kennzeichen=X&datum=YYYY-MM-DD
   */
  static async getAehnliche(req, res) {
    try {
      const { kennzeichen, datum } = req.query;

      if (!kennzeichen || !datum) {
        return res.status(400).json({ error: 'kennzeichen und datum sind erforderlich' });
      }

      const { allAsync } = require('../utils/dbHelper');

      const termine = await allAsync(`
        SELECT id, termin_nr, datum, arbeit, status, bring_zeit, kunde_name, kennzeichen
        FROM termine
        WHERE kennzeichen = ?
          AND datum BETWEEN date(?, '-7 days') AND date(?, '+7 days')
          AND status != 'abgesagt'
          AND geloescht_am IS NULL
        ORDER BY datum ASC
      `, [kennzeichen, datum, datum]);

      res.json({
        hatAehnliche: termine.length > 0,
        anzahl: termine.length,
        termine
      });
    } catch (err) {
      console.error('Fehler bei getAehnliche:', err);
      res.status(500).json({ error: err.message });
    }
  }
  ```

- [ ] **Schritt 2: Route in termineRoutes.js registrieren**

  Füge in `termineRoutes.js` **vor** `router.get('/duplikat-check', ...)` (Zeile ~39) ein:

  ```javascript
  router.get('/aehnliche', TermineController.getAehnliche);
  ```

- [ ] **Schritt 3: Manuell testen**

  Backend neu starten. Im Browser oder mit curl aufrufen:
  ```
  GET http://localhost:3001/api/termine/aehnliche?kennzeichen=ABC-123&datum=2026-04-02
  ```
  Erwartetes Ergebnis: `{ "hatAehnliche": false, "anzahl": 0, "termine": [] }` (oder Treffer wenn vorhanden).

- [ ] **Schritt 4: Committen**

  ```bash
  git add backend/src/controllers/termineController.js backend/src/routes/termineRoutes.js
  git commit -m "feat: GET /termine/aehnliche - Suche ähnliche Termine nach Kennzeichen ±7 Tage"
  ```

---

## Task 3: Dialog in `executeTerminSave()` (app.js)

**Files:**
- Modify: `frontend/src/components/app.js` (~Zeile 4921, in `executeTerminSave()`)

Der Ähnlichkeits-Dialog wird **nach** dem bestehenden Duplikat-Check und **vor** `TermineService.validate()` eingefügt (ca. Zeile 4949, nach `} // Ende Duplikat-Erkennung Guard`).

- [ ] **Schritt 1: Hilfsmethode `_zeigeWiederholungsDialog` nach `executeTerminSave` einfügen**

  Suche nach `cancelTerminVorschau()` (Funktion nach `executeTerminSave`). Füge vor `cancelTerminVorschau` ein:

  ```javascript
  async _zeigeWiederholungsDialog(aehnlicheTermine, neuesTerminData) {
    return new Promise((resolve) => {
      // Alten Dialog entfernen
      const existing = document.getElementById('wiederholung-dialog');
      if (existing) existing.remove();

      const termineHtml = aehnlicheTermine.map(t => {
        const datumFormatiert = new Date(t.datum + 'T12:00:00').toLocaleDateString('de-DE');
        const arbeiten = t.arbeit && t.arbeit.length > 60 ? t.arbeit.substring(0, 60) + '…' : (t.arbeit || '—');
        return `<div style="padding:6px 8px;background:#f9fafb;border-radius:6px;margin-bottom:4px;font-size:12px;">
          <strong>${t.termin_nr || '?'}</strong> — ${datumFormatiert}<br>
          <span style="color:#6b7280;">${arbeiten}</span>
        </div>`;
      }).join('');

      const overlay = document.createElement('div');
      overlay.id = 'wiederholung-dialog';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

      overlay.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
          <h3 style="margin:0 0 8px;font-size:16px;color:#1f2937;">🔍 Ähnlicher Termin gefunden</h3>
          <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">
            Für <strong>${neuesTerminData.kennzeichen}</strong> gibt es ${aehnlicheTermine.length} Termin(e) in den nächsten/letzten 7 Tagen:
          </p>
          <div style="margin-bottom:16px;">${termineHtml}</div>
          <p style="margin:0 0 16px;font-size:13px;color:#374151;font-weight:500;">Was ist dieser neue Termin?</p>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button id="wdh-gleich" style="padding:10px;border-radius:8px;border:1px solid #93b4f5;background:#e8f0fe;color:#1a4a9b;font-weight:600;cursor:pointer;text-align:left;">
              ✏️ Gleicher Termin — bestehenden Termin bearbeiten
            </button>
            <button id="wdh-wiederholung" style="padding:10px;border-radius:8px;border:1px solid #f0a0a0;background:#fce8e8;color:#8a2020;font-weight:600;cursor:pointer;text-align:left;">
              🔁 Wiederholungstermin — neu anlegen (rot markiert)
            </button>
            <button id="wdh-kein" style="padding:10px;border-radius:8px;border:1px solid #d0d5dd;background:#f9fafb;color:#374151;cursor:pointer;text-align:left;">
              ➡️ Kein Zusammenhang — normal speichern
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('#wdh-gleich').addEventListener('click', () => {
        overlay.remove();
        // Öffne bestehenden Termin (ersten Treffer) zur Bearbeitung
        const ersterTreffer = aehnlicheTermine[0];
        resolve({ aktion: 'gleich', terminId: ersterTreffer.id });
      });

      overlay.querySelector('#wdh-wiederholung').addEventListener('click', () => {
        overlay.remove();
        resolve({ aktion: 'wiederholung' });
      });

      overlay.querySelector('#wdh-kein').addEventListener('click', () => {
        overlay.remove();
        resolve({ aktion: 'kein' });
      });
    });
  }
  ```

- [ ] **Schritt 2: Aufruf in `executeTerminSave()` einbauen**

  In `executeTerminSave()` nach der Zeile `} // Ende Duplikat-Erkennung Guard` (ca. Zeile 4949) und vor `// Validiere Termin vor dem Erstellen` folgendes einfügen:

  ```javascript
  // Wiederholungstermin-Erkennung (gleiches Kennzeichen, ±7 Tage)
  if (termin.kennzeichen) {
    try {
      const aehnlichCheck = await TermineService.getAehnliche(termin.kennzeichen, termin.datum);
      if (aehnlichCheck.hatAehnliche) {
        const dialogResult = await this._zeigeWiederholungsDialog(aehnlichCheck.termine, termin);
        if (dialogResult.aktion === 'gleich') {
          // Bestehenden Termin zur Bearbeitung öffnen
          this.pendingTerminData = null;
          this.showTerminDetails(dialogResult.terminId);
          return;
        } else if (dialogResult.aktion === 'wiederholung') {
          termin.ist_wiederholung = 1;
        }
        // Bei 'kein': termin.ist_wiederholung bleibt undefined/0 → normaler Termin
      }
    } catch (aehnlichErr) {
      console.warn('[Wiederholungs-Check] Fehler (ignoriert):', aehnlichErr);
    }
  }
  ```

- [ ] **Schritt 3: `TermineService.getAehnliche` in api.js hinzufügen**

  In `frontend/src/services/api.js`, in der `TermineService`-Klasse (nach `checkDuplikate`):

  ```javascript
  static async getAehnliche(kennzeichen, datum) {
    return ApiService.get(`/termine/aehnliche?kennzeichen=${encodeURIComponent(kennzeichen)}&datum=${encodeURIComponent(datum)}`);
  }
  ```

- [ ] **Schritt 4: Manuell testen**

  1. Termin A für Kennzeichen `XX-123` anlegen (z.B. für heute) → normal speichern (kein Dialog erwartet)
  2. Termin B für dasselbe Kennzeichen 3 Tage später anlegen → Dialog erscheint ✓
  3. „Kein Zusammenhang" klicken → Termin B wird normal gespeichert ✓
  4. Termin C für dasselbe Kennzeichen anlegen → Dialog erscheint → „Wiederholungstermin" klicken → Termin C wird gespeichert ✓
  5. „Gleicher Termin" klicken → `showTerminDetails` öffnet sich für Termin A ✓

- [ ] **Schritt 5: Committen**

  ```bash
  git add frontend/src/components/app.js frontend/src/services/api.js
  git commit -m "feat: Wiederholungstermin-Dialog in executeTerminSave - Ähnlichkeitsprüfung ±7 Tage"
  ```

---

## Task 4: Rote Markierung — CSS + Zeitverwaltung + Heute-Karten

**Files:**
- Modify: `frontend/src/styles/style.css` (Ende der Datei)
- Modify: `frontend/src/components/app.js` — `loadTermine()` (Zeile ~6153) + `renderHeuteKarten()` (Zeile ~10956)

- [ ] **Schritt 1: CSS-Klasse `.wiederholung-badge` in style.css ans Ende anfügen**

  ```css
  /* Wiederholungstermin-Badge */
  .wiederholung-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      background: #dc3545;
      color: white;
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      margin-left: 6px;
  }

  tr.wiederholung-row {
      border-left: 3px solid #dc3545;
  }
  ```

- [ ] **Schritt 2: Badge in `loadTermine()` hinzufügen**

  In `loadTermine()` (app.js ~Zeile 6158), nach der Zeile mit `teileStatusBadge`:

  ```javascript
  // Wiederholungs-Badge
  const wiederholungBadge = termin.ist_wiederholung ? '<span class="wiederholung-badge">🔁 Wiederholung</span>' : '';
  ```

  Und in der `row.innerHTML` Zeile ~6171, das Badge zur `termin_nr`-Zelle hinzufügen:

  ```javascript
  <td><strong>${termin.termin_nr || '-'}</strong>${terminDringlichkeit}${terminFolgetermin}${schwebendBadge}${splitBadge}${teileStatusBadge}${wiederholungBadge}</td>
  ```

  Und nach `row.style.cursor = 'pointer';` (Zeile ~6192):

  ```javascript
  if (termin.ist_wiederholung) {
    row.classList.add('wiederholung-row');
  }
  ```

- [ ] **Schritt 3: Banner in `renderHeuteKarten()` hinzufügen**

  In `renderHeuteKarten()` (app.js ~Zeile 10956), nach dem `folgeterminBanner`:

  ```javascript
  // Wiederholungstermin-Banner
  const wiederholungBanner = termin.ist_wiederholung
    ? `<div style="background: #dc3545; color: white; padding: 8px; text-align: center; font-weight: bold; border-radius: ${(termin.abholung_typ === 'warten' || folgeterminMatch) ? '0' : '5px 5px 0 0'};">🔁 WIEDERHOLUNGSTERMIN</div>`
    : '';
  ```

  Und in `karte.innerHTML` nach `${folgeterminBanner}` ergänzen:

  ```javascript
  ${wiederholungBanner}
  ```

- [ ] **Schritt 4: Manuell testen**

  1. Zeitverwaltung öffnen → Wiederholungstermin hat rotes 🔁-Badge neben Termin-Nr. ✓
  2. Heute-Ansicht öffnen → Wiederholungstermin hat rotes Banner ✓

- [ ] **Schritt 5: Committen**

  ```bash
  git add frontend/src/components/app.js frontend/src/styles/style.css
  git commit -m "feat: Wiederholungstermin rot markiert in Zeitverwaltung und Heute-Ansicht"
  ```

---

## Task 5: Rote Markierung — Timeline (Planung & Zuweisung)

**Files:**
- Modify: `frontend/src/components/app.js` — `createTimelineTerminElement()` (Zeile ~24217) + `createTerminMiniCard()` (Zeile ~26247)

- [ ] **Schritt 1: Roter Rand in `createTimelineTerminElement()`**

  Nach Zeile ~24220 (`div.className = 'timeline-termin' + ...`), füge direkt danach ein:

  ```javascript
  if (termin.ist_wiederholung) {
    div.style.borderLeft = '3px solid #dc3545';
    div.title = (div.title || '') + '\n🔁 Wiederholungstermin';
  }
  ```

- [ ] **Schritt 2: Badge in `createTerminMiniCard()`**

  In `createTerminMiniCard()` (Zeile ~26247), nach `const schwebendBadge = ...`:

  ```javascript
  const wiederholungMiniCardBadge = (termin.ist_wiederholung)
    ? '<span style="background:#dc3545;color:white;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:bold;">🔁</span>'
    : '';
  ```

  Und in `card.innerHTML` Zeile ~26281 in der `.header`-Zeile ergänzen:

  ```javascript
  <span>${schwebendBadge}${istErweiterungBadge}${wiederholungMiniCardBadge}${termin.termin_nr || 'Neu'}${erweiterungBadge}</span>
  ```

- [ ] **Schritt 3: Manuell testen**

  Planung & Zuweisung öffnen → Wiederholungstermin hat roten linken Rand auf Timeline-Block + 🔁 in Mini-Card ✓

- [ ] **Schritt 4: Committen**

  ```bash
  git add frontend/src/components/app.js
  git commit -m "feat: Wiederholungstermin rot markiert in Planung & Zuweisung Timeline"
  ```

---

## Task 6: Dashboard KPI „Wiederholungen"

**Files:**
- Modify: `backend/src/models/reportingModel.js` (Funktion `getKPIs`)
- Modify: `frontend/index.html` (neue KPI-Kachel nach `kpiNacharbeit`)
- Modify: `frontend/src/components/app.js` (~Zeile 33901, in `loadDashboard`)

- [ ] **Schritt 1: KPI-Query in `reportingModel.js` erweitern**

  In `getKPIs()`, das `Promise.all`-Array um einen neuen Eintrag erweitern.

  Füge nach dem letzten `getAsync`-Aufruf (vor der schließenden `]` von `Promise.all`) ein:

  ```javascript
  ,
  // Wiederholungstermine im Zeitraum
  getAsync(`
    SELECT COUNT(*) as wert
    FROM termine
    WHERE ist_wiederholung = 1
      AND datum BETWEEN ? AND ?
      AND geloescht_am IS NULL
  `, [vonDatum, bisDatum])
  ```

  Den neuen Wert im destructuring am Anfang von `getKPIs` ergänzen:

  ```javascript
  const [
    durchlaufzeit,
    genauigkeit,
    abgeschlossene,
    nacharbeit,
    storniert,
    schwebend,
    teileOffen,
    teileDringend,
    ueberfaellig,
    wiederholungen      // NEU
  ] = await Promise.all([...]);
  ```

  Und im `return`-Objekt ergänzen:

  ```javascript
  wiederholungen_anzahl: wiederholungen?.wert || 0,
  wiederholungen_quote: gesamt > 0 ? (wiederholungen?.wert || 0) / gesamt : 0,
  ```

- [ ] **Schritt 2: Neue KPI-Kachel in `index.html`**

  Nach der `kpiNacharbeit`-Kachel (Zeile ~150) einfügen:

  ```html
  <div class="kpi-card" id="kpiWiederholung">
      <div class="kpi-icon">🔁</div>
      <div class="kpi-label">Wiederholungen</div>
      <div class="kpi-value" id="kpiWiederholungWert">—</div>
      <div class="kpi-sub" id="kpiWiederholungSub">0%</div>
  </div>
  ```

- [ ] **Schritt 3: Dashboard-Anzeige in `loadDashboard()` (app.js ~33901)**

  Nach der Zeile `set('kpiNacharbeitWert', ...)` einfügen:

  ```javascript
  const wdh = kpis.wiederholungen_anzahl ?? 0;
  const wdhQuote = kpis.wiederholungen_quote != null ? Math.round(kpis.wiederholungen_quote * 100) : 0;
  set('kpiWiederholungWert', wdh);
  set('kpiWiederholungSub', `${wdhQuote}% der Termine`);
  const wdhCard = document.getElementById('kpiWiederholung');
  if (wdhCard) {
    wdhCard.classList.toggle('kpi-schlecht', wdh > 0);
    wdhCard.classList.toggle('kpi-gut', wdh === 0);
  }
  ```

- [ ] **Schritt 4: Manuell testen**

  1. Dashboard öffnen → neue Kachel „🔁 Wiederholungen" sichtbar ✓
  2. Anzahl zeigt korrekte Zahl der Wiederholungstermine im aktuellen Monat ✓
  3. Quote: 0% wenn keine Wiederholungen ✓

- [ ] **Schritt 5: Committen**

  ```bash
  git add backend/src/models/reportingModel.js frontend/index.html frontend/src/components/app.js
  git commit -m "feat: Dashboard KPI Wiederholungen - Anzahl + Quote"
  ```

---

## Abschluss-Checkliste

- [ ] Migration 029 läuft durch ohne Fehler
- [ ] `GET /termine/aehnliche` liefert korrekte Ergebnisse
- [ ] Dialog erscheint nur wenn Kennzeichen vorhanden und Treffer gefunden
- [ ] „Gleicher Termin" → öffnet Details des gefundenen Termins, kein neuer Termin angelegt
- [ ] „Wiederholungstermin" → neuer Termin mit `ist_wiederholung = 1` in DB ✓
- [ ] „Kein Zusammenhang" → neuer normaler Termin ohne Flag ✓
- [ ] Rotes Badge in Zeitverwaltung sichtbar
- [ ] Rotes Banner in Heute-Ansicht sichtbar
- [ ] Roter Rand auf Timeline-Block sichtbar
- [ ] Dashboard-KPI zeigt korrekte Anzahl + Quote
