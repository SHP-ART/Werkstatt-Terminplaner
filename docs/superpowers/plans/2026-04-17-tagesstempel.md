# Tagesstempel (Arbeitsbeginn / Arbeitsende / Arbeitsunterbrechung) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeden Mitarbeiter/Lehrling kann seinen Arbeitsbeginn, Arbeitsende und Arbeitsunterbrechungen dokumentieren – mit Button in der Tablet-App und im Intern-Tab der Web-App. Bei Arbeitsende mit laufenden Aufträgen erscheint ein Bestätigungsdialog zum Verschieben auf den nächsten Tag.

**Architecture:** Neue Tabellen `tagesstempel` (Kommen/Gehen) und `arbeitsunterbrechungen` (Unterbrechungen) via Migration 034. Neuer Backend-Controller + Routes `/api/tagesstempel`. Tablet-App: Button in jeder Person-Kachel im `person-header`. Web-Frontend: Tagesstempel + Unterbrechungen direkt in jeder Person-Gruppe integriert.

**Tech Stack:** Node.js/Express, SQLite (WAL), CommonJS, Vanilla JS (Frontend/Tablet), dbHelper.js (getAsync/allAsync/runAsync)

---

## Dateiübersicht

| Aktion | Datei |
|---|---|
| Erstellen | `backend/migrations/033_tagesstempel.js` |
| Erstellen | `backend/src/controllers/tagesstempelController.js` |
| Erstellen | `backend/src/routes/tagesstempelRoutes.js` |
| Ändern | `backend/migrations/index.js` (Migration registrieren) |
| Ändern | `backend/src/routes/index.js` (Route mounten) |
| Ändern | `electron-intern-tablet/index.html` (Buttons + API-Calls) |
| Ändern | `frontend/src/components/app.js` (Tagesstempel-Sektion in Zeitstempelung-Tab) |

---

## Task 1: Migration 033 – Tabellen anlegen

**Files:**
- Create: `backend/migrations/033_tagesstempel.js`

- [ ] **Schritt 1: Migration-Datei erstellen**

```js
// backend/migrations/033_tagesstempel.js
module.exports = {
  version: 33,
  name: 'tagesstempel',
  up: async (db) => {
    await db.run(`
      CREATE TABLE IF NOT EXISTS tagesstempel (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mitarbeiter_id INTEGER REFERENCES mitarbeiter(id) ON DELETE SET NULL,
        lehrling_id    INTEGER REFERENCES lehrlinge(id)   ON DELETE SET NULL,
        datum          TEXT NOT NULL,
        kommen_zeit    TEXT NOT NULL,
        gehen_zeit     TEXT,
        erstellt_am    TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(mitarbeiter_id, datum),
        UNIQUE(lehrling_id, datum),
        CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
      )
    `);
    await db.run(`
      CREATE TABLE IF NOT EXISTS arbeitsunterbrechungen (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        mitarbeiter_id INTEGER REFERENCES mitarbeiter(id) ON DELETE SET NULL,
        lehrling_id    INTEGER REFERENCES lehrlinge(id)   ON DELETE SET NULL,
        datum          TEXT NOT NULL,
        start_zeit     TEXT NOT NULL,
        ende_zeit      TEXT,
        erstellt_am    TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL)
      )
    `);
  },
  down: async (db) => {
    await db.run(`DROP TABLE IF EXISTS arbeitsunterbrechungen`);
    await db.run(`DROP TABLE IF EXISTS tagesstempel`);
  }
};
```

- [ ] **Schritt 2: Migration in index.js registrieren**

Datei: `backend/migrations/index.js`

Nach der Zeile mit `require('./033_relax_termine_arbeiten_person_constraint')` einfügen:
```js
  require('./034_tagesstempel'),        // Version 34 - Tagesstempel + Arbeitsunterbrechungen
```

- [ ] **Schritt 3: Server starten und Migration prüfen**

```powershell
cd backend ; node -e "require('./src/config/database').initializeDatabase().then(() => { console.log('OK'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```
Erwartete Ausgabe: `OK` (keine Fehlermeldung, Migration 33 wird ausgeführt)

- [ ] **Schritt 4: Tabellen prüfen**

```powershell
cd backend ; node -e "const {db}=require('./src/config/database'); setTimeout(()=>{db.all(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tagesstempel','arbeitsunterbrechungen')\",[],(e,r)=>{console.log(r);process.exit(0);})},1000)"
```
Erwartete Ausgabe: Array mit beiden Tabellennamen

- [ ] **Schritt 5: Commit**

```powershell
git add backend/migrations/033_tagesstempel.js backend/migrations/index.js
git commit -m "feat: migration 034 – tagesstempel + arbeitsunterbrechungen tabellen"
```

---

## Task 2: Backend Controller

**Files:**
- Create: `backend/src/controllers/tagesstempelController.js`

- [ ] **Schritt 1: Controller erstellen**

```js
// backend/src/controllers/tagesstempelController.js
const { getAsync, allAsync, runAsync } = require('../utils/dbHelper');
const { broadcastEvent } = require('../utils/websocket');

const ZEIT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function getJetztZeit() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

function getHeuteDatum() {
  return new Date().toISOString().slice(0, 10);
}

class TagesstempelController {

  /**
   * POST /api/tagesstempel/kommen
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Setzt kommen_zeit auf aktuelle Uhrzeit. Idempotent: zweiter Aufruf hat keinen Effekt.
   */
  static async kommen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      if (mitarbeiter_id) {
        const existing = await getAsync(
          `SELECT id FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`,
          [mitarbeiter_id, datum]
        );
        if (existing) {
          return res.json({ success: true, message: 'Bereits gestempelt', zeit: existing.kommen_zeit });
        }
        await runAsync(
          `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, erstellt_am) VALUES (?, ?, ?, datetime('now'))`,
          [mitarbeiter_id, datum, zeit]
        );
      } else {
        const existing = await getAsync(
          `SELECT id FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`,
          [lehrling_id, datum]
        );
        if (existing) {
          return res.json({ success: true, message: 'Bereits gestempelt', zeit: existing.kommen_zeit });
        }
        await runAsync(
          `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, erstellt_am) VALUES (?, ?, ?, datetime('now'))`,
          [lehrling_id, datum, zeit]
        );
      }

      broadcastEvent('tagesstempel.kommen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum, zeit });
      res.json({ success: true, zeit });
    } catch (err) {
      console.error('[Tagesstempel-Kommen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/gehen
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Setzt gehen_zeit auf aktuelle Uhrzeit.
   * Prüft laufende Aufträge (status='in_arbeit') – gibt diese zurück statt direkt zu speichern.
   * Frontend zeigt Bestätigungsdialog, dann ruft es /gehen/bestaetigen auf.
   */
  static async gehen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();

      // Laufende Aufträge ermitteln
      let laufendeTermine = [];
      if (mitarbeiter_id) {
        laufendeTermine = await allAsync(
          `SELECT id, termin_nr, kennzeichen, kunde_name, arbeit FROM termine
           WHERE datum = ? AND mitarbeiter_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
          [datum, mitarbeiter_id]
        );
      } else {
        laufendeTermine = await allAsync(
          `SELECT id, termin_nr, kennzeichen, kunde_name, arbeit FROM termine
           WHERE datum = ? AND lehrling_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
          [datum, lehrling_id]
        );
      }

      if (laufendeTermine.length > 0) {
        // Nicht direkt speichern – Frontend muss bestätigen
        return res.json({
          success: false,
          bestaetigung_erforderlich: true,
          laufende_termine: laufendeTermine
        });
      }

      // Keine laufenden Aufträge → direkt speichern
      await TagesstempelController._setzeGehenZeit(mitarbeiter_id, lehrling_id, datum);
      broadcastEvent('tagesstempel.gehen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, zeit: getJetztZeit() });
    } catch (err) {
      console.error('[Tagesstempel-Gehen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/gehen/bestaetigen
   * Body: { mitarbeiter_id?, lehrling_id?, termine_verschieben: boolean }
   * Setzt gehen_zeit. Wenn termine_verschieben=true: alle in_arbeit-Termine auf nächsten Tag.
   */
  static async gehenBestaetigen(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id, termine_verschieben } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const morgen = new Date();
      morgen.setDate(morgen.getDate() + 1);
      const morgenStr = morgen.toISOString().slice(0, 10);

      if (termine_verschieben) {
        let laufendeIds = [];
        if (mitarbeiter_id) {
          const rows = await allAsync(
            `SELECT id FROM termine WHERE datum = ? AND mitarbeiter_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
            [datum, mitarbeiter_id]
          );
          laufendeIds = rows.map(r => r.id);
        } else {
          const rows = await allAsync(
            `SELECT id FROM termine WHERE datum = ? AND lehrling_id = ? AND status = 'in_arbeit' AND geloescht_am IS NULL`,
            [datum, lehrling_id]
          );
          laufendeIds = rows.map(r => r.id);
        }

        for (const id of laufendeIds) {
          await runAsync(
            `UPDATE termine SET datum = ?, status = 'wartend', verschoben_von_datum = ? WHERE id = ?`,
            [morgenStr, datum, id]
          );
          broadcastEvent('termin.updated', { id, datum, newDatum: morgenStr });
        }
      }

      await TagesstempelController._setzeGehenZeit(mitarbeiter_id, lehrling_id, datum);
      broadcastEvent('tagesstempel.gehen', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, zeit: getJetztZeit(), verschoben: termine_verschieben || false });
    } catch (err) {
      console.error('[Tagesstempel-GehenBestaetigen] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  static async _setzeGehenZeit(mitarbeiter_id, lehrling_id, datum) {
    const zeit = getJetztZeit();
    if (mitarbeiter_id) {
      const existing = await getAsync(
        `SELECT id FROM tagesstempel WHERE mitarbeiter_id = ? AND datum = ?`,
        [mitarbeiter_id, datum]
      );
      if (existing) {
        await runAsync(`UPDATE tagesstempel SET gehen_zeit = ? WHERE mitarbeiter_id = ? AND datum = ?`, [zeit, mitarbeiter_id, datum]);
      } else {
        await runAsync(
          `INSERT INTO tagesstempel (mitarbeiter_id, datum, kommen_zeit, gehen_zeit, erstellt_am) VALUES (?, ?, ?, ?, datetime('now'))`,
          [mitarbeiter_id, datum, zeit, zeit]
        );
      }
    } else {
      const existing = await getAsync(
        `SELECT id FROM tagesstempel WHERE lehrling_id = ? AND datum = ?`,
        [lehrling_id, datum]
      );
      if (existing) {
        await runAsync(`UPDATE tagesstempel SET gehen_zeit = ? WHERE lehrling_id = ? AND datum = ?`, [zeit, lehrling_id, datum]);
      } else {
        await runAsync(
          `INSERT INTO tagesstempel (lehrling_id, datum, kommen_zeit, gehen_zeit, erstellt_am) VALUES (?, ?, ?, ?, datetime('now'))`,
          [lehrling_id, datum, zeit, zeit]
        );
      }
    }
  }

  /**
   * GET /api/tagesstempel?datum=YYYY-MM-DD
   * Gibt alle Tagesstempel + Arbeitsunterbrechungen für ein Datum zurück.
   */
  static async getByDatum(req, res) {
    try {
      const datum = req.query.datum || getHeuteDatum();

      const stempel = await allAsync(
        `SELECT ts.id, ts.mitarbeiter_id, ts.lehrling_id, ts.datum,
                ts.kommen_zeit, ts.gehen_zeit,
                m.name AS mitarbeiter_name, l.name AS lehrling_name
         FROM tagesstempel ts
         LEFT JOIN mitarbeiter m ON ts.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON ts.lehrling_id = l.id
         WHERE ts.datum = ?
         ORDER BY ts.kommen_zeit`,
        [datum]
      );

      const pausen = await allAsync(
        `SELECT rp.id, rp.mitarbeiter_id, rp.lehrling_id, rp.datum,
                rp.start_zeit, rp.ende_zeit,
                m.name AS mitarbeiter_name, l.name AS lehrling_name
         FROM arbeitsunterbrechungen rp
         LEFT JOIN mitarbeiter m ON rp.mitarbeiter_id = m.id
         LEFT JOIN lehrlinge l ON rp.lehrling_id = l.id
         WHERE rp.datum = ?
         ORDER BY rp.start_zeit`,
        [datum]
      );

      res.json({ stempel, unterbrechungen });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/unterbrechung/start
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Öffnet eine neue Arbeitsunterbrechung (Ende noch offen).
   */
  static async unterbrechungStart(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      const result = await runAsync(
        `INSERT INTO arbeitsunterbrechungen (mitarbeiter_id, lehrling_id, datum, start_zeit, erstellt_am) VALUES (?, ?, ?, ?, datetime('now'))`,
        [mitarbeiter_id || null, lehrling_id || null, datum, zeit]
      );

      broadcastEvent('tagesstempel.unterbrechung', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, id: result.lastID, start_zeit: zeit });
    } catch (err) {
      console.error('[Unterbrechung-Start] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/tagesstempel/unterbrechung/ende
   * Body: { mitarbeiter_id?, lehrling_id? }
   * Schließt die offene Arbeitsunterbrechung (ende_zeit = jetzt).
   */
  static async unterbrechungEnde(req, res) {
    try {
      const { mitarbeiter_id, lehrling_id } = req.body;
      if (!mitarbeiter_id && !lehrling_id) {
        return res.status(400).json({ error: 'mitarbeiter_id oder lehrling_id erforderlich' });
      }

      const datum = getHeuteDatum();
      const zeit = getJetztZeit();

      let offene;
      if (mitarbeiter_id) {
        offene = await getAsync(
          `SELECT id FROM arbeitsunterbrechungen WHERE mitarbeiter_id = ? AND datum = ? AND ende_zeit IS NULL ORDER BY id DESC LIMIT 1`,
          [mitarbeiter_id, datum]
        );
      } else {
        offene = await getAsync(
          `SELECT id FROM arbeitsunterbrechungen WHERE lehrling_id = ? AND datum = ? AND ende_zeit IS NULL ORDER BY id DESC LIMIT 1`,
          [lehrling_id, datum]
        );
      }

      if (!offene) {
        return res.status(404).json({ error: 'Keine offene Arbeitsunterbrechung gefunden' });
      }

      await runAsync(`UPDATE arbeitsunterbrechungen SET ende_zeit = ? WHERE id = ?`, [zeit, offene.id]);
      broadcastEvent('tagesstempel.unterbrechung', { mitarbeiter_id: mitarbeiter_id || null, lehrling_id: lehrling_id || null, datum });
      res.json({ success: true, ende_zeit: zeit });
    } catch (err) {
      console.error('[Unterbrechung-Ende] Fehler:', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = TagesstempelController;
```

- [ ] **Schritt 2: Commit**

```powershell
git add backend/src/controllers/tagesstempelController.js
git commit -m "feat: tagesstempelController – kommen/gehen/unterbrechung"
```

---

## Task 3: Backend Routes + Registrierung

**Files:**
- Create: `backend/src/routes/tagesstempelRoutes.js`
- Modify: `backend/src/routes/index.js`

- [ ] **Schritt 1: Routes-Datei erstellen**

```js
// backend/src/routes/tagesstempelRoutes.js
const express = require('express');
const router = express.Router();
const TagesstempelController = require('../controllers/tagesstempelController');

router.get('/', TagesstempelController.getByDatum);
router.post('/kommen', TagesstempelController.kommen);
router.post('/gehen', TagesstempelController.gehen);
router.post('/gehen/bestaetigen', TagesstempelController.gehenBestaetigen);
router.post('/unterbrechung/start', TagesstempelController.unterbrechungStart);
router.post('/unterbrechung/ende', TagesstempelController.unterbrechungEnde);

module.exports = router;
```

- [ ] **Schritt 2: Route in index.js mounten**

In `backend/src/routes/index.js` nach der Zeile `const stempelzeitenRoutes = require('./stempelzeitenRoutes');` einfügen:
```js
const tagesstempelRoutes = require('./tagesstempelRoutes');
```

Und nach `router.use('/stempelzeiten', stempelzeitenRoutes);` einfügen:
```js
router.use('/tagesstempel', tagesstempelRoutes);
```

- [ ] **Schritt 3: Endpunkte testen**

```powershell
# Backend starten
cd backend ; npm run dev
```

```powershell
# In neuem Terminal – Kommen stempeln (mitarbeiter_id=1 anpassen auf vorhandene ID)
Invoke-RestMethod -Method POST -Uri "http://localhost:3001/api/tagesstempel/kommen" -ContentType "application/json" -Body '{"mitarbeiter_id":1}'
```
Erwartete Ausgabe: `{ success: true, zeit: "HH:MM" }`

```powershell
# Stempel abrufen
Invoke-RestMethod -Uri "http://localhost:3001/api/tagesstempel?datum=$(Get-Date -Format 'yyyy-MM-dd')"
```
Erwartete Ausgabe: `{ stempel: [...], pausen: [] }`

- [ ] **Schritt 4: Commit**

```powershell
git add backend/src/routes/tagesstempelRoutes.js backend/src/routes/index.js
git commit -m "feat: tagesstempel routes unter /api/tagesstempel"
```

---

## Task 4: Tablet-App – Buttons in Person-Kachel

**Files:**
- Modify: `electron-intern-tablet/index.html`

Die Tablet-App hat eine `renderPersonKachel()`-Funktion (Zeile ~1917). Die Funktion erhält bereits `arbeitszeit` als Parameter.
Buttons kommen in den `person-header` rechts neben den bestehenden Buttons.

- [ ] **Schritt 1: CSS für neue Buttons ergänzen**

In `electron-intern-tablet/index.html` nach dem Block `.intern-btn-arbeit-fortsetzen { ... }` (nach Zeile ~264) einfügen:

```css
    .tages-btn-gruppe {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .btn-tagesstempel {
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 0.8em;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-tagesstempel.kommen {
      background: #28a745;
      color: #fff;
    }

    .btn-tagesstempel.gehen {
      background: #dc3545;
      color: #fff;
    }

    .btn-tagesstempel.unterbrechung-start {
      background: #6c757d;
      color: #fff;
    }

    .btn-tagesstempel.unterbrechung-ende {
      background: #fd7e14;
      color: #fff;
    }

    .btn-tagesstempel:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .tagesstempel-info {
      font-size: 0.75em;
      color: var(--text-muted);
      text-align: right;
      line-height: 1.4;
    }
```

- [ ] **Schritt 2: `loadTeamUebersicht()` – Tagesstempel laden**

In `loadTeamUebersicht()` (Zeile ~2330), beim `Promise.all`-Array, einen weiteren Eintrag hinzufügen:

```js
// Vorher:
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, aktivePausen, abwesenheiten, heutigePausen, aktiveArbeitspausen] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  ApiService.get('/einstellungen/werkstatt'),
  ApiService.get('/pause/aktive'),
  ApiService.get(`/abwesenheiten/datum/${heute}`),
  ApiService.get('/pause/heute'),
  ApiService.get('/arbeitspausen/aktive').catch(() => [])
]);

// Nachher:
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, aktivePausen, abwesenheiten, heutigePausen, aktiveArbeitspausen, tagesstempelData] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  ApiService.get('/einstellungen/werkstatt'),
  ApiService.get('/pause/aktive'),
  ApiService.get(`/abwesenheiten/datum/${heute}`),
  ApiService.get('/pause/heute'),
  ApiService.get('/arbeitspausen/aktive').catch(() => []),
  ApiService.get(`/tagesstempel?datum=${heute}`).catch(() => ({ stempel: [], unterbrechungen: [] }))
]);
const tagesstempel = tagesstempelData?.stempel || [];
const unterbrechungen = tagesstempelData?.unterbrechungen || [];
```

- [ ] **Schritt 3: `renderPersonKachel()` – Tagesstempel-Daten übergeben**

Signatur der Funktion ergänzen (Zeile ~1917):
```js
// Vorher:
function renderPersonKachel(person, alleTermine, typ, globaleNebenzeit, arbeitszeit, aktiveArbeitspausen = []) {

// Nachher:
function renderPersonKachel(person, alleTermine, typ, globaleNebenzeit, arbeitszeit, aktiveArbeitspausen = [], tagesstempel = [], unterbrechungen = []) {
```

Direkt nach dem `const isLehrling = typ === 'lehrling';` Block folgende Variablen ergänzen:
```js
// Tagesstempel für diese Person finden
const meinStempel = tagesstempel.find(s =>
  isLehrling ? s.lehrling_id === personId : s.mitarbeiter_id === personId
);
const meineOffeneUnterbrechung = unterbrechungen.find(p =>
  (isLehrling ? p.lehrling_id === personId : p.mitarbeiter_id === personId) && !p.ende_zeit
);
const hatKommen = !!meinStempel;
const hatGehen = !!(meinStempel && meinStempel.gehen_zeit);
```

- [ ] **Schritt 4: Tagesstempel-Buttons HTML generieren**

Direkt vor `return \`...\`` am Ende von `renderPersonKachel()` folgenden Block einfügen:

```js
// Tagesstempel-Buttons
const personParam = isLehrling
  ? `null, ${personId}`
  : `${personId}, null`;

let tagesBtnsHtml = '';
if (!hatKommen) {
  tagesBtnsHtml = `<button class="btn-tagesstempel kommen" onclick="tagesstempelKommen(${personParam})">▶ Arbeitsbeginn</button>`;
} else if (!hatGehen) {
  const kommenInfo = `<div class="tagesstempel-info">⏱ seit ${meinStempel.kommen_zeit}</div>`;
  const unterbrechungBtn = meineOffeneUnterbrechung
    ? `<button class="btn-tagesstempel unterbrechung-ende" onclick="unterbrechungEnde(${personParam})">⏸ Ende (seit ${meineOffeneUnterbrechung.start_zeit})</button>`
    : `<button class="btn-tagesstempel unterbrechung-start" onclick="unterbrechungStart(${personParam})">⏸ Unterbrechung</button>`;
  tagesBtnsHtml = `${kommenInfo}<button class="btn-tagesstempel gehen" onclick="tagesstempelGehen(${personParam})">■ Arbeitsende</button>${unterbrechungBtn}`;
} else {
  tagesBtnsHtml = `<div class="tagesstempel-info">✅ ${meinStempel.kommen_zeit} – ${meinStempel.gehen_zeit}</div>`;
}
```

Im `return`-Template den `buttonsHtml`-Block im `person-header` erweitern:
```js
// Vorher:
${buttonsHtml ? `<div class="tablet-buttons in-header">${buttonsHtml}</div>` : ''}

// Nachher:
${buttonsHtml ? `<div class="tablet-buttons in-header">${buttonsHtml}</div>` : ''}
<div class="tages-btn-gruppe">${tagesBtnsHtml}</div>
```

- [ ] **Schritt 5: Aufruf von `renderPersonKachel()` – tagesstempel übergeben**

In `loadTeamUebersicht()` die zwei Aufrufe von `renderPersonKachel` aktualisieren (Zeile ~2469 und ~2475):

```js
// Vorher (Mitarbeiter):
allKacheln.push(renderPersonKachel(m, relevanteTermine, 'mitarbeiter', globaleNebenzeit, arbeitszeit, normAktiveArbeitspausen));

// Nachher:
allKacheln.push(renderPersonKachel(m, relevanteTermine, 'mitarbeiter', globaleNebenzeit, arbeitszeit, normAktiveArbeitspausen, tagesstempel, unterbrechungen));

// Nachher:
allKacheln.push(renderPersonKachel(m, relevanteTermine, 'mitarbeiter', globaleNebenzeit, arbeitszeit, normAktiveArbeitspausen, tagesstempel, unterbrechungen));

// Vorher (Lehrlinge):
allKacheln.push(renderPersonKachel(l, relevanteTermine, 'lehrling', globaleNebenzeit, arbeitszeit, normAktiveArbeitspausen));

// Nachher:
allKacheln.push(renderPersonKachel(l, relevanteTermine, 'lehrling', globaleNebenzeit, arbeitszeit, normAktiveArbeitspausen, tagesstempel, unterbrechungen));
```

- [ ] **Schritt 6: API-Funktionen (Kommen/Gehen/Raucherpause) ergänzen**

Am Ende des `<script>`-Blocks (vor `</script>`) folgende Funktionen einfügen:

```js
async function tagesstempelKommen(mitarbeiter_id, lehrling_id) {
  try {
    const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
    await ApiService.post('/tagesstempel/kommen', body);
    loadTeamUebersicht();
  } catch (err) {
    console.error('Fehler Tagesstempel Kommen:', err);
  }
}

async function tagesstempelGehen(mitarbeiter_id, lehrling_id) {
  try {
    const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
    const result = await ApiService.post('/tagesstempel/gehen', body);

    if (result.bestaetigung_erforderlich) {
      const anzahl = result.laufende_termine.length;
      const nummern = result.laufende_termine.map(t => t.termin_nr || t.id).join(', ');
      const verschieben = confirm(
        `${anzahl} Auftrag${anzahl > 1 ? 'räge laufen' : ' läuft'} noch (${nummern}).\n\nAuf morgen verschieben?`
      );
      const bestBody = mitarbeiter_id
        ? { mitarbeiter_id, termine_verschieben: verschieben }
        : { lehrling_id, termine_verschieben: verschieben };
      await ApiService.post('/tagesstempel/gehen/bestaetigen', bestBody);
    }
    loadTeamUebersicht();
  } catch (err) {
    console.error('Fehler Tagesstempel Gehen:', err);
  }
}

async function unterbrechungStart(mitarbeiter_id, lehrling_id) {
  try {
    const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
    await ApiService.post('/tagesstempel/unterbrechung/start', body);
    loadTeamUebersicht();
  } catch (err) {
    console.error('Fehler Unterbrechung Start:', err);
  }
}

async function unterbrechungEnde(mitarbeiter_id, lehrling_id) {
  try {
    const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
    await ApiService.post('/tagesstempel/unterbrechung/ende', body);
    loadTeamUebersicht();
  } catch (err) {
    console.error('Fehler Unterbrechung Ende:', err);
  }
}
```

- [ ] **Schritt 7: Commit**

```powershell
git add electron-intern-tablet/index.html
git commit -m "feat: tablet – arbeitsbeginn/arbeitsende/unterbrechung buttons in person-kachel"
```

---

## Task 5: Web-Frontend – Tagesstempel in Zeitstempelung-Tab integrieren

**Files:**
- Modify: `frontend/src/components/app.js`

Der Tagesstempel wird **in jede bestehende Person-Gruppe** in `renderZeitstempelungGruppe()` integriert.
Im `card-header` erscheinen: Arbeitsbeginn-Zeit, Arbeitsende-Zeit, Netto-Arbeitszeit, Raucherpausen-Zusammenfassung und Buttons.
Keine separate Top-Sektion – alles pro Person inline.

Hilfsfunktion für Netto-Arbeitszeit:
- `netto = gehen - kommen - Summe(vollständige Raucherpausen in Minuten)`
- Wenn `gehen_zeit` fehlt → Anzeige bis jetzt berechnen (laufend)

- [ ] **Schritt 1: `loadZeitstempelung()` – Tagesstempel-Daten parallel laden**

```js
// Vorher (Zeile ~30753):
async loadZeitstempelung() {
  const container = document.getElementById('zeitstempelungContainer');
  const datumInput = document.getElementById('zeitstempelungDatum');
  if (!container || !datumInput) return;

  const datum = datumInput.value || this.formatDateLocal(this.getToday());
  container.innerHTML = '<p class="loading-text">Lade Stempelzeiten…</p>';

  try {
    const gruppen = await ApiService.get(`/stempelzeiten?datum=${datum}`);
    if (!gruppen || gruppen.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Keine Arbeiten für diesen Tag.</p></div>';
      return;
    }
    container.innerHTML = gruppen.map(g => this.renderZeitstempelungGruppe(g)).join('');
  } catch (err) {
    console.error('[Zeitstempelung] Ladefehler:', err);
    container.innerHTML = '<div class="error-state"><p>Fehler beim Laden der Stempelzeiten.</p></div>';
  }
}

// Nachher:
async loadZeitstempelung() {
  const container = document.getElementById('zeitstempelungContainer');
  const datumInput = document.getElementById('zeitstempelungDatum');
  if (!container || !datumInput) return;

  const datum = datumInput.value || this.formatDateLocal(this.getToday());
  container.innerHTML = '<p class="loading-text">Lade Stempelzeiten…</p>';

  try {
    const [gruppen, tagesstempelData] = await Promise.all([
      ApiService.get(`/stempelzeiten?datum=${datum}`),
      ApiService.get(`/tagesstempel?datum=${datum}`).catch(() => ({ stempel: [], unterbrechungen: [] }))
    ]);

    const istHeute = datum === this.formatDateLocal(this.getToday());

    if (!gruppen || gruppen.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>Keine Arbeiten für diesen Tag.</p></div>';
      return;
    }
    container.innerHTML = gruppen.map(g => this.renderZeitstempelungGruppe(g, tagesstempelData, istHeute)).join('');
  } catch (err) {
    console.error('[Zeitstempelung] Ladefehler:', err);
    container.innerHTML = '<div class="error-state"><p>Fehler beim Laden der Stempelzeiten.</p></div>';
  }
}
```

- [ ] **Schritt 2: `renderZeitstempelungGruppe()` – Tagesstempel-Parameter und Kopfzeile ergänzen**

Signatur und `card-header` der Methode erweitern:

```js
// Vorher:
renderZeitstempelungGruppe(gruppe) {
  const gesamtGeschaetzt = gruppe.arbeiten.reduce((s, a) => s + (a.richtwert_min || 0), 0);
  const gesamtIst = gruppe.arbeiten.reduce((s, a) => s + (a.ist_min || 0), 0);
  const icon = gruppe.person_typ === 'lehrling' ? '🎓' : '👷';

  // ... (rows-Code bleibt unverändert) ...

  return `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${icon} ${this.escapeHtml(gruppe.person_name)}</strong>
        <span class="text-muted" style="font-size:13px;">
          Richtwert: ${gesamtGeschaetzt} Min
          ${gesamtIst ? '· Gestempelt: ' + gesamtIst + ' Min' : ''}
        </span>
      </div>
      <div class="card-body" style="padding:0;">
        <table class="table table-striped" style="margin:0;">
          <thead>
            <tr>
              <th>Auftrag</th>
              <th>Locosoft-Nr.</th>
              <th>Kundenname</th>
              <th>Kennzeichen</th>
              <th>Arbeit</th>
              <th class="text-success">Start ▶</th>
              <th class="text-danger">Ende ■</th>
              <th class="text-warning">Richtwert</th>
              <th>Ist-Zeit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// Nachher (vollständige Methode):
renderZeitstempelungGruppe(gruppe, tagesstempelData = null, istHeute = false) {
  const gesamtGeschaetzt = gruppe.arbeiten.reduce((s, a) => s + (a.richtwert_min || 0), 0);
  const gesamtIst = gruppe.arbeiten.reduce((s, a) => s + (a.ist_min || 0), 0);
  const icon = gruppe.person_typ === 'lehrling' ? '🎓' : '👷';

  // Tagesstempel für diese Person ermitteln
  const stempelListe = tagesstempelData?.stempel || [];
  const unterbrechungenListe = tagesstempelData?.unterbrechungen || [];
  const meinStempel = stempelListe.find(s =>
    gruppe.person_typ === 'lehrling' ? s.lehrling_id === gruppe.person_id : s.mitarbeiter_id === gruppe.person_id
  );
  const meineUnterbrechungen = unterbrechungenListe.filter(p =>
    gruppe.person_typ === 'lehrling' ? p.lehrling_id === gruppe.person_id : p.mitarbeiter_id === gruppe.person_id
  );
  const offeneUnterbrechung = meineUnterbrechungen.find(p => !p.ende_zeit);

  // Netto-Arbeitszeit berechnen
  const _zeitZuMin = (str) => {
    if (!str) return null;
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m;
  };
  let nettoHtml = '';
  if (meinStempel?.kommen_zeit) {
    const kommenMin = _zeitZuMin(meinStempel.kommen_zeit);
    const jetztMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
    const gehenMin = meinStempel.gehen_zeit ? _zeitZuMin(meinStempel.gehen_zeit) : jetztMin;
    const unterbrechungenMin = meineUnterbrechungen
      .filter(p => p.ende_zeit)
      .reduce((sum, p) => sum + (_zeitZuMin(p.ende_zeit) - _zeitZuMin(p.start_zeit)), 0);
    const netto = gehenMin - kommenMin - unterbrechungenMin;
    const nettoStd = Math.floor(netto / 60);
    const nettoRest = netto % 60;
    const nettoText = `${nettoStd}h ${nettoRest}min`;
    const laufendLabel = !meinStempel.gehen_zeit ? ' <span class="badge badge-info">laufend</span>' : '';
    nettoHtml = `<span style="font-size:12px;">⏱ ${nettoText}${laufendLabel}</span>`;
  }

  // Unterbrechungen-Zusammenfassung
  const unterbrechungenHtml = meineUnterbrechungen.length > 0
    ? `<span style="font-size:12px;color:#6c757d;">⏸ ${meineUnterbrechungen.map(p => `${p.start_zeit}\u2013${p.ende_zeit || '\u2026'}`).join(', ')}</span>`
    : '';

  // Tagesstempel-Buttons (nur für heute)
  const mid = gruppe.person_typ === 'lehrling' ? null : gruppe.person_id;
  const lid = gruppe.person_typ === 'lehrling' ? gruppe.person_id : null;
  let tagesButtons = '';
  if (istHeute) {
    if (!meinStempel) {
      tagesButtons = `<button class="btn btn-sm btn-success" onclick="app.webTagesstempelKommen(${mid}, ${lid})">▶ Arbeitsbeginn</button>`;
    } else if (!meinStempel.gehen_zeit) {
      const unterbBtn = offeneUnterbrechung
        ? `<button class="btn btn-sm btn-warning" onclick="app.webUnterbrechungEnde(${mid}, ${lid})">⏸ Pause Ende</button>`
        : `<button class="btn btn-sm btn-secondary" onclick="app.webUnterbrechungStart(${mid}, ${lid})">⏸ Unterbrechung</button>`;
      tagesButtons = `<button class="btn btn-sm btn-danger" onclick="app.webTagesstempelGehen(${mid}, ${lid})">■ Arbeitsende</button> ${unterbBtn}`;
    }
  }

  // Kommen/Gehen-Zeiten-Anzeige
  const kommenText = meinStempel?.kommen_zeit ? `<span class="text-success">▶ ${meinStempel.kommen_zeit}</span>` : '';
  const gehenText = meinStempel?.gehen_zeit ? `<span class="text-danger"> ■ ${meinStempel.gehen_zeit}</span>` : '';

  const rows = gruppe.arbeiten.map(a => {
    const istMin = a.ist_min;
    const richtMin = a.richtwert_min || 0;
    const ueberschritten = istMin !== null && richtMin > 0 && istMin > richtMin * 1.1;
    const istText = a.stempel_start && !a.stempel_ende
      ? '<span class="badge badge-info">laufend…</span>'
      : istMin !== null
        ? `<span class="${ueberschritten ? 'text-warning' : 'text-success'}">${istMin} Min${ueberschritten ? ' ⚠️' : ''}</span>`
        : '<span class="text-muted">—</span>';

    return `
      <tr>
        <td>${this.escapeHtml(a.termin_nr || '')}</td>
        <td>${this.escapeHtml(a.interne_auftragsnummer || '—')}</td>
        <td>${this.escapeHtml(a.kunde_name || '—')}</td>
        <td>${this.escapeHtml(a.kennzeichen || '')}</td>
        <td>${this.escapeHtml(a.arbeit)}</td>
        <td class="text-success">${a.stempel_start || '<span class="text-muted">—</span>'}</td>
        <td class="text-danger">${a.stempel_ende || '<span class="text-muted">—</span>'}</td>
        <td class="text-warning">${richtMin ? richtMin + ' Min' : '—'}</td>
        <td>${istText}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card" style="margin-bottom: 16px;">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
        <strong>${icon} ${this.escapeHtml(gruppe.person_name)}</strong>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${kommenText}${gehenText}
          ${nettoHtml}
          ${unterbrechungenHtml}
          <span class="text-muted" style="font-size:13px;">
            Richtwert: ${gesamtGeschaetzt} Min
            ${gesamtIst ? '· Gestempelt: ' + gesamtIst + ' Min' : ''}
          </span>
          ${tagesButtons}
        </div>
      </div>
      <div class="card-body" style="padding:0;">
        <table class="table table-striped" style="margin:0;">
          <thead>
            <tr>
              <th>Auftrag</th>
              <th>Locosoft-Nr.</th>
              <th>Kundenname</th>
              <th>Kennzeichen</th>
              <th>Arbeit</th>
              <th class="text-success">Start ▶</th>
              <th class="text-danger">Ende ■</th>
              <th class="text-warning">Richtwert</th>
              <th>Ist-Zeit</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}
```

- [ ] **Schritt 3: Web-API-Methoden am Ende der Klasse hinzufügen**

Am Ende der `App`-Klasse (vor der letzten `}`) folgende Methoden einfügen:

```js
async webTagesstempelKommen(mitarbeiter_id, lehrling_id) {
  const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
  try {
    await ApiService.post('/tagesstempel/kommen', body);
    this.loadZeitstempelung();
  } catch (err) { console.error('Fehler Tagesstempel Kommen:', err); }
}

async webTagesstempelGehen(mitarbeiter_id, lehrling_id) {
  const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
  try {
    const result = await ApiService.post('/tagesstempel/gehen', body);
    if (result.bestaetigung_erforderlich) {
      const anzahl = result.laufende_termine.length;
      const nummern = result.laufende_termine.map(t => t.termin_nr || t.id).join(', ');
      const verschieben = confirm(`${anzahl} Auftrag${anzahl > 1 ? 'räge laufen' : ' läuft'} noch (${nummern}).\n\nAuf morgen verschieben?`);
      const bestBody = mitarbeiter_id
        ? { mitarbeiter_id, termine_verschieben: verschieben }
        : { lehrling_id, termine_verschieben: verschieben };
      await ApiService.post('/tagesstempel/gehen/bestaetigen', bestBody);
    }
    this.loadZeitstempelung();
  } catch (err) { console.error('Fehler Tagesstempel Gehen:', err); }
}

async webUnterbrechungStart(mitarbeiter_id, lehrling_id) {
  const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
  try {
    await ApiService.post('/tagesstempel/unterbrechung/start', body);
    this.loadZeitstempelung();
  } catch (err) { console.error('Fehler Unterbrechung Start:', err); }
}

async webUnterbrechungEnde(mitarbeiter_id, lehrling_id) {
  const body = mitarbeiter_id ? { mitarbeiter_id } : { lehrling_id };
  try {
    await ApiService.post('/tagesstempel/unterbrechung/ende', body);
    this.loadZeitstempelung();
  } catch (err) { console.error('Fehler Unterbrechung Ende:', err); }
}
```

- [ ] **Schritt 4: Frontend bauen**

```powershell
cd frontend ; npm run build
```
Erwartete Ausgabe: Build erfolgreich, keine Fehler

- [ ] **Schritt 5: Commit**

```powershell
git add frontend/src/components/app.js frontend/dist/
git commit -m "feat: zeitstempelung-tab – tagesstempel/arbeitszeit/unterbrechungen in person-gruppen integriert"
```

---

## Task 6: CLAUDE.md + PROJEKT.md aktualisieren

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/PROJEKT.md`

- [ ] **Schritt 1: CLAUDE.md – neue Route in Abschnitt 8 eintragen**

In der Routen-Tabelle nach der Zeile mit `stempelzeitenRoutes.js` einfügen:
```
| `tagesstempelRoutes.js` | Arbeitsbeginn/Arbeitsende/Arbeitsunterbrechungen je Person und Tag |
```

- [ ] **Schritt 2: PROJEKT.md – neuen Controller + Migration eintragen**

In Abschnitt 4 "Controller" nach `stempelzeitenController.js` einfügen:
```
| `tagesstempelController.js` | Tagesstempel (Kommen/Gehen) + Raucherpausen pro Person/Tag |
```

In Abschnitt 6 "Datenmodell" (Migration):
```
- `033_tagesstempel.js` – tagesstempel-Tabelle + raucherpausen-Tabelle
```

- [ ] **Schritt 3: Commit**

```powershell
git add CLAUDE.md .claude/PROJEKT.md
git commit -m "docs: tagesstempel in projektdokumentation eingetragen"
```

---

## Manueller Endtest

Nach allen Commits:

1. Server neu starten → Migration 033 läuft durch
2. Tablet-App öffnen → Person-Kachel zeigt **„▶ Arbeitsbeginn"**
3. Auf Arbeitsbeginn klicken → Button wechselt zu **„■ Arbeitsende"** + **„🚬 Raucherpause"**
4. Raucherpause starten → Button zeigt **„🚬 Ende (seit HH:MM)"**
5. Raucherpause beenden → Button zeigt wieder **„🚬 Raucherpause"**
6. Termin auf `in_arbeit` setzen, dann Arbeitsende klicken → Bestätigungsdialog erscheint mit Termin-Nummern
7. „OK" → Termin wird auf morgen verschoben, `gehen_zeit` gesetzt
8. Web-Frontend → Zeitstempelung-Tab → Tagesstempel-Sektion zeigt Kommen/Gehen-Zeiten + Raucherpausen
