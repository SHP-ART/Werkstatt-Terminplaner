# Intern-Tab Gleichstellung mit Tablet-App – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den "Intern"-Tab im Haupt-Frontend vollständig mit der Tablet-App gleichstellen: Starten/Fertig-Buttons, Mittagspause-Button, Einzelarbeiten-Buttons, Badges, interne Auftragsnummer und Lehrling-Leer-Zustand.

**Architecture:** Erweiterung von `app.js` (neue Methoden + überarbeitetes `renderInternPersonKachel`) und `style.css` (neue CSS-Klassen). Keine Backend-Änderungen nötig – alle API-Endpunkte existieren bereits. Tablet-Code wird adaptiert (CSS-Präfix `.intern-*`, API über `ApiService`, Methoden als `app.intern*`).

**Tech Stack:** Vanilla JS (ES2020+), CSS3, Vite Build, Node/Express Backend (Port 3001)

**Spec:** `docs/superpowers/specs/2026-04-03-intern-tab-gleichstellung-tablet.md`

---

## Dateiübersicht

| Datei | Änderungstyp | Zeilen (ca.) |
|---|---|---|
| `frontend/src/components/app.js` | Erweitern | 29733–30350 (betroffen) |
| `frontend/src/styles/style.css` | Erweitern | ~13950 (Einfügepunkt) |

---

## Task 1: `loadInternTeamUebersicht` – Pause-Daten laden

**Files:**
- Modify: `frontend/src/components/app.js:29751-29758`

### Kontext
Aktuell fehlt `/pause/aktive` und `/pause/heute` im Promise.all. Ohne diese Daten kann der Mittagspause-Button nicht korrekt dargestellt werden.

- [ ] **Step 1: Promise.all erweitern**

Finde in `app.js` (Zeile 29751) das aktuelle Promise.all:

```javascript
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, abwesenheiten, aktiveArbeitspausen] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  EinstellungenService.getWerkstatt(),
  ApiService.get(`/abwesenheiten/datum/${heute}`).catch(() => []),
  ApiService.get('/arbeitspausen/aktive').catch(() => [])
]);
```

Ersetze es durch:

```javascript
const [mitarbeiterRaw, lehrlingeRaw, termineRaw, einstellungen, abwesenheiten, aktiveArbeitspausen, aktivePausen, heutigePausen] = await Promise.all([
  ApiService.get('/mitarbeiter'),
  ApiService.get('/lehrlinge'),
  ApiService.get(`/termine?datum=${heute}`),
  EinstellungenService.getWerkstatt(),
  ApiService.get(`/abwesenheiten/datum/${heute}`).catch(() => []),
  ApiService.get('/arbeitspausen/aktive').catch(() => []),
  ApiService.get('/pause/aktive').catch(() => []),
  ApiService.get('/pause/heute').catch(() => [])
]);
```

- [ ] **Step 2: Pause-Daten in Person-Objekte mergen**

Direkt nach dem `Promise.all`-Block (vor dem `normalisieren`-Kommentar oder nach den `relevanteTermine`-Calc), aber VOR dem Rendern, finde die Stelle wo `aktiveMitarbeiter` und `aktiveLehrlinge` gebaut werden und füge folgendes hinzu:

```javascript
// Merge Mittagspause-Tracking in Person-Objekte
const pausenMap = {};
(aktivePausen || []).forEach(pause => {
  const key = pause.mitarbeiter_id
    ? `mitarbeiter_${pause.mitarbeiter_id}`
    : `lehrling_${pause.lehrling_id}`;
  pausenMap[key] = {
    pause_tracking_aktiv: true,
    pause_verbleibende_minuten: pause.verbleibende_minuten || 0
  };
});

const heutePausenSet = new Set();
(heutigePausen || []).forEach(pause => {
  if (pause.abgeschlossen === 1) {
    const key = pause.mitarbeiter_id
      ? `mitarbeiter_${pause.mitarbeiter_id}`
      : `lehrling_${pause.lehrling_id}`;
    heutePausenSet.add(key);
  }
});

aktiveMitarbeiter.forEach(m => {
  const pauseInfo = pausenMap[`mitarbeiter_${m.id}`];
  if (pauseInfo) {
    m.pause_tracking_aktiv = pauseInfo.pause_tracking_aktiv;
    m.pause_verbleibende_minuten = pauseInfo.pause_verbleibende_minuten;
  }
  if (heutePausenSet.has(`mitarbeiter_${m.id}`)) {
    m.pause_bereits_gemacht = true;
  }
});

aktiveLehrlinge.forEach(l => {
  const pauseInfo = pausenMap[`lehrling_${l.id}`];
  if (pauseInfo) {
    l.pause_tracking_aktiv = pauseInfo.pause_tracking_aktiv;
    l.pause_verbleibende_minuten = pauseInfo.pause_verbleibende_minuten;
  }
  if (heutePausenSet.has(`lehrling_${l.id}`)) {
    l.pause_bereits_gemacht = true;
  }
});
```

- [ ] **Step 3: Commit**

```
git add frontend/src/components/app.js
git commit -m "feat: intern-tab lädt Mittagspause-Tracking-Daten"
```

---

## Task 2: Neue Hilfsfunktionen (intern Arbeiten)

**Files:**
- Modify: `frontend/src/components/app.js` – direkt VOR `renderInternPersonKachel` (Zeile 29917) einfügen

Diese Methoden werden als App-Klassen-Methoden eingefügt (gleiche Einrückungsebene wie `renderInternPersonKachel`).

- [ ] **Step 1: Drei Hilfsmethoden einfügen**

Direkt vor der Zeile `renderInternPersonKachel(person, alleTermine, typ = 'mitarbeiter', kontext = {}) {` (Zeile 29917) einfügen:

```javascript
  internGetArbeitenFromTermin(termin) {
    if (!termin) return [];
    try {
      let details = termin.arbeitszeiten_details;
      if (typeof details === 'string') details = JSON.parse(details);
      if (!details) return [];
      const arbeiten = Array.isArray(details) ? details : (details.arbeiten || []);
      return arbeiten.map((a, idx) => ({
        name: a.name || a.arbeit || `Arbeit ${idx + 1}`,
        zeit: a.dauer_minuten || a.zeit || 0,
        abgeschlossen: !!(a.abgeschlossen || a.fertig),
        index: idx
      }));
    } catch (e) {
      return [];
    }
  }

  internRenderArbeitenKompakt(termin) {
    const arbeiten = this.internGetArbeitenFromTermin(termin);
    if (!arbeiten.length) return '';
    return `<div class="intern-arbeiten-kompakt">${arbeiten.map(a =>
      `<span class="${a.abgeschlossen ? 'arbeit-erledigt' : 'arbeit-offen'}">${a.abgeschlossen ? '✅' : '•'} ${this.escapeHtml(a.name)}</span>`
    ).join('')}</div>`;
  }

  internRenderArbeitenListe(termin, personId, typ) {
    const arbeiten = this.internGetArbeitenFromTermin(termin);
    if (!arbeiten.length) return '';
    return `
      <div class="intern-arbeiten-liste">
        ${arbeiten.map(a => `
          <div class="intern-arbeit-item ${a.abgeschlossen ? 'abgeschlossen' : ''}">
            <span class="arbeit-name">${a.abgeschlossen ? '✅' : '○'} ${this.escapeHtml(a.name)}</span>
            ${!a.abgeschlossen ? `<button class="intern-btn-einzelarbeit-fertig"
              onclick="app.internBeendenEinzelarbeit(${termin.id}, ${a.index}, this)">✓ Fertig</button>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

```

- [ ] **Step 2: Commit**

```
git add frontend/src/components/app.js
git commit -m "feat: intern-tab Hilfsfunktionen für Einzelarbeiten"
```

---

## Task 3: Neue App-Aktionsmethoden

**Files:**
- Modify: `frontend/src/components/app.js` – direkt NACH `interneArbeitFortsetzen` (nach Zeile ~30350)

- [ ] **Step 1: Vier neue Methoden nach `interneArbeitFortsetzen` einfügen**

Suche das `}` das `interneArbeitFortsetzen` abschließt (ca. Zeile 30350) und füge danach ein:

```javascript
  async internStarten(terminId, kundeName) {
    if (!confirm(`Auftrag für ${kundeName} starten?`)) return;
    try {
      await ApiService.post(`/termine/${terminId}/starten`, {});
      await this.loadInternTeamUebersicht();
    } catch (e) {
      console.error('Fehler beim Starten:', e);
      alert(`Fehler: ${e.message}`);
    }
  }

  async internBeenden(terminId, kundeName) {
    if (!confirm(`Auftrag für ${kundeName} als fertig markieren?`)) return;
    try {
      await ApiService.post(`/termine/${terminId}/beenden`, {});
      await this.loadInternTeamUebersicht();
    } catch (e) {
      console.error('Fehler beim Beenden:', e);
      alert(`Fehler: ${e.message}`);
    }
  }

  async internBeendenEinzelarbeit(terminId, arbeitIndex, btn) {
    if (btn) btn.disabled = true;
    try {
      await ApiService.post(`/termine/${terminId}/arbeit-beenden`, { arbeit_index: arbeitIndex });
      await this.loadInternTeamUebersicht();
    } catch (e) {
      console.error('Fehler beim Beenden der Einzelarbeit:', e);
      if (btn) btn.disabled = false;
      alert(`Fehler: ${e.message}`);
    }
  }

  async internPauseStarten(personId, personTyp, datum, imZeitfenster) {
    if (!imZeitfenster) {
      const ok = confirm('⚠️ Die Pausenzeit liegt nach der eingestellten Mittagspause.\n\nTrotzdem Pause starten?');
      if (!ok) return;
    }
    try {
      await ApiService.post('/pause/starten', {
        personId: parseInt(personId),
        personTyp: String(personTyp),
        datum: String(datum)
      });
      await this.loadInternTeamUebersicht();
    } catch (e) {
      console.error('Fehler beim Pause starten:', e);
      alert(`Fehler: ${e.message}`);
    }
  }

```

- [ ] **Step 2: Prüfen ob `/termine/:id/starten` und `/termine/:id/beenden` existieren**

```
grep -n "starten\|beenden" backend/src/routes/termine.js
```

Erwartete Ausgabe: Routen für `starten` und `beenden` sind vorhanden (existieren seit längerem).

- [ ] **Step 3: Prüfen ob `/termine/:id/arbeit-beenden` existiert**

```
grep -rn "arbeit-beenden" backend/src/routes/
```

Falls diese Route NICHT existiert: Schritt 3b ausführen. Falls sie existiert: direkt zu Step 4.

- [ ] **Step 3b (nur falls arbeit-beenden fehlt): Route im Backend anlegen**

In `backend/src/routes/termine.js` die Route hinzufügen (nach der `beenden`-Route):

```javascript
router.post('/:id/arbeit-beenden', terminController.beendenEinzelarbeit);
```

Und in `backend/src/controllers/termine.js` die Methode:

```javascript
async beendenEinzelarbeit(req, res) {
  try {
    const terminId = parseInt(req.params.id);
    const { arbeit_index } = req.body;
    const termin = await TerminModel.getById(terminId);
    if (!termin) return res.status(404).json({ error: 'Termin nicht gefunden' });

    let details = termin.arbeitszeiten_details;
    if (typeof details === 'string') details = JSON.parse(details);
    if (!details) return res.status(400).json({ error: 'Keine Arbeiten vorhanden' });

    const arbeiten = Array.isArray(details) ? details : (details.arbeiten || []);
    if (arbeit_index < 0 || arbeit_index >= arbeiten.length) {
      return res.status(400).json({ error: 'Ungültiger Arbeits-Index' });
    }

    arbeiten[arbeit_index].abgeschlossen = true;
    if (Array.isArray(details)) {
      details = arbeiten;
    } else {
      details.arbeiten = arbeiten;
    }

    await TerminModel.update(terminId, { arbeitszeiten_details: JSON.stringify(details) });
    res.json({ success: true });
  } catch (e) {
    console.error('Fehler bei arbeit-beenden:', e);
    res.status(500).json({ error: e.message });
  }
}
```

- [ ] **Step 4: Commit**

```
git add frontend/src/components/app.js backend/src/routes/termine.js backend/src/controllers/termine.js
git commit -m "feat: intern-tab Aktionsmethoden (internStarten, internBeenden, internPauseStarten)"
```

---

## Task 4: `renderInternPersonKachel` – Badge-Fixes und Auto-Pause-Fix

**Files:**
- Modify: `frontend/src/components/app.js:30028-30035` (Badge) und `~30037-30044` (inPause-Body) und `30233` (zeigeArbeitszeit)

- [ ] **Step 1: Arbeitspause-Badge mit Grund anzeigen**

Finde (Zeile ~30028):
```javascript
    } else if (istArbeitPausiert) {
      badgeClass = 'arbeit-pausiert';
      badgeText = '⏸️ Pausiert';
    } else if (aktuellerAuftrag) {
```

Ersetze durch:
```javascript
    } else if (istArbeitPausiert) {
      badgeClass = 'arbeit-pausiert';
      const grundLabels = { teil_fehlt: 'Teil fehlt', rueckfrage_kunde: 'Rückfrage Kunde', vorrang: 'Vorrang' };
      const grundText = aktiveArbeitspause ? (grundLabels[aktiveArbeitspause.grund] || '') : '';
      badgeText = grundText ? `⏸️ Pausiert – ${grundText}` : '⏸️ Pausiert';
    } else if (aktuellerAuftrag) {
```

- [ ] **Step 2: Auto-Pause soll Menü nicht sperren (nur manuelle Pause)**

Finde (Zeile ~30037):
```javascript
    if (inPause) {
      bodyContent = `
        <div class="intern-person-schule">
          <div class="schule-icon">🍽️</div>
          <div class="schule-text">Mittagspause</div>
        </div>
      `;
    } else if (istAbwesend) {
```

Ersetze durch:
```javascript
    if (inPause && person.pause_tracking_aktiv) {
      bodyContent = `
        <div class="intern-person-schule">
          <div class="schule-icon">🍽️</div>
          <div class="schule-text">Mittagspause</div>
        </div>
      `;
    } else if (istAbwesend) {
```

- [ ] **Step 3: `zeigeArbeitszeit` nur bei manueller Pause sperren**

Finde (Zeile 30233):
```javascript
    const zeigeArbeitszeit = !inPause && !inBerufsschule && !istAbwesend;
```

Ersetze durch:
```javascript
    const manuellePauseAktiv = !!person.pause_tracking_aktiv;
    const zeigeArbeitszeit = !manuellePauseAktiv && !inBerufsschule && !istAbwesend;
```

- [ ] **Step 4: Commit**

```
git add frontend/src/components/app.js
git commit -m "fix: intern-tab Badge zeigt Pausengrund, Auto-Pause sperrt keine Buttons"
```

---

## Task 5: `renderInternPersonKachel` – Auftragsinfo verbessern

**Files:**
- Modify: `frontend/src/components/app.js` – innerhalb des `else if (aktuellerAuftrag)` Blocks

Ziel: Verschoben/Verspätet-Badges, interne Auftragsnummer und Einzelarbeiten-Buttons.

- [ ] **Step 1: Verschoben/Verspätet und interne Nr. hinzufügen**

Innerhalb des `else if (aktuellerAuftrag)` Blocks, finde den Beginn der `bodyContent`-Erstellung des aktuellen Auftrags. Füge VOR der `bodyContent = ...` Zuweisung folgende Berechnung hinzu:

```javascript
        // Verschoben / Verspätet prüfen
        const istVerschoben = aktuellerAuftrag.verschoben_von_datum != null;
        const abholDatumGilt = !aktuellerAuftrag.abholung_datum ||
          aktuellerAuftrag.abholung_datum === aktuellerAuftrag.datum;
        const istVerspaetet = abholDatumGilt &&
          aktuellerAuftrag.endzeit_berechnet &&
          aktuellerAuftrag.abholung_zeit &&
          aktuellerAuftrag.endzeit_berechnet > aktuellerAuftrag.abholung_zeit;

        let statusBadges = '';
        if (istVerschoben) statusBadges += '<span class="badge-verschoben">📅 Verschoben</span>';
        if (istVerspaetet) statusBadges += '<span class="badge-verspaetet">⚠️ Verzögerung</span>';

        const interneNrAnzeige = aktuellerAuftrag.interne_auftragsnummer &&
          aktuellerAuftrag.interne_auftragsnummer.trim()
          ? ` <span class="auftrag-interne-nr">· ${this.escapeHtml(aktuellerAuftrag.interne_auftragsnummer.trim())}</span>`
          : '';
```

- [ ] **Step 2: statusBadges und interneNrAnzeige in bodyContent einbauen**

Suche im `bodyContent`-Template des aktuellen Auftrags nach der Zeile die die Termin-Nummer anzeigt, z.B.:
```javascript
              <div class="intern-auftrag-nr">${this.escapeHtml(aktuellerAuftrag.termin_nr) || '-'}</div>
```

Ersetze durch:
```javascript
              <div class="intern-auftrag-nr">${this.escapeHtml(aktuellerAuftrag.termin_nr) || '-'}${interneNrAnzeige} ${statusBadges}</div>
```

- [ ] **Step 3: Einzelarbeiten-Liste einbauen**

Im `bodyContent` des aktuellen Auftrags, wo bisher die Arbeitsbeschreibung angezeigt wird (getArbeitenDetailsList oder `aktuellerAuftrag.arbeit`), prüfe ob mehrere Arbeiten vorliegen und zeige die neue Liste:

Suche den Block der die Arbeit rendert, z.B.:
```javascript
              <div class="intern-auftrag-arbeit">${this.escapeHtml(aktuellerAuftrag.arbeit) || '-'}</div>
```

Füge darunter (oder ersetze wenn es bereits getArbeitenDetailsList gibt) hinzu:
```javascript
              ${(() => {
                const arbeiten = this.internGetArbeitenFromTermin(aktuellerAuftrag);
                if (arbeiten.length > 1) {
                  return this.internRenderArbeitenListe(aktuellerAuftrag, personId, typ);
                }
                return '';
              })()}
```

- [ ] **Step 4: Commit**

```
git add frontend/src/components/app.js
git commit -m "feat: intern-tab Auftragsinfo mit Badges, interne Nr und Einzelarbeiten"
```

---

## Task 6: `renderInternPersonKachel` – Buttons im Kachel-Header

**Files:**
- Modify: `frontend/src/components/app.js:30233-30266` (return-Block)

Ziel: Starten/Fertig-Button und Mittagspause-Button analog zur Tablet-App in den Kachel-Header.

- [ ] **Step 1: Button-Logik berechnen**

Direkt NACH der `manuellePauseAktiv`-Zeile (Step 3 aus Task 4) und VOR dem `return`-Block, füge ein:

```javascript
    // Termin für Buttons bestimmen
    const terminMitButtons = aktuellerAuftrag || naechsterAuftrag;
    const terminArbeiten = terminMitButtons ? this.internGetArbeitenFromTermin(terminMitButtons) : [];
    const hatMehrereArbeiten = terminArbeiten.length > 1;
    const alleArbeitenAbgeschlossen = terminArbeiten.length > 0 && terminArbeiten.every(a => a.abgeschlossen);

    const kannStarten = terminMitButtons && !manuellePauseAktiv && !inBerufsschule && !istAbwesend &&
      (terminMitButtons.status === 'geplant' || terminMitButtons.status === 'offen' || terminMitButtons.status === 'wartend');
    const kannBeenden = terminMitButtons && !manuellePauseAktiv && !inBerufsschule && !istAbwesend &&
      terminMitButtons.status === 'in_arbeit' && !hatMehrereArbeiten;
    const kannAlleBeenden = hatMehrereArbeiten && alleArbeitenAbgeschlossen && !manuellePauseAktiv;
    const kannGlobalBeenden = terminMitButtons && terminMitButtons.status === 'in_arbeit' &&
      hatMehrereArbeiten && !manuellePauseAktiv && !inBerufsschule && !istAbwesend;

    // Starten / Fertig Button
    let startenFertigBtn = '';
    if (kannStarten) {
      startenFertigBtn = `<button class="intern-btn-starten"
        onclick="app.internStarten(${terminMitButtons.id}, '${this.escapeHtml(terminMitButtons.kunde_name || '')}')">
        <span>▶️</span> Starten
      </button>`;
    } else if (kannBeenden || kannAlleBeenden) {
      const btnText = kannAlleBeenden ? 'Alle Fertig' : 'Fertig';
      startenFertigBtn = `<button class="intern-btn-fertig"
        onclick="app.internBeenden(${terminMitButtons.id}, '${this.escapeHtml(terminMitButtons.kunde_name || '')}')">
        <span>✓</span> ${btnText}
      </button>`;
    } else if (kannGlobalBeenden) {
      startenFertigBtn = `<button class="intern-btn-fertig"
        onclick="app.internBeenden(${terminMitButtons.id}, '${this.escapeHtml(terminMitButtons.kunde_name || '')}')">
        <span>✓</span> Fertig
      </button>`;
    } else {
      startenFertigBtn = `<button class="intern-btn-starten" disabled><span>▶️</span> Starten</button>`;
    }

    // Mittagspause Button
    const jetzt = new Date();
    const jetztMinuten = jetzt.getHours() * 60 + jetzt.getMinutes();
    const [pauseH, pauseM] = (person.mittagspause_start || '12:00').split(':').map(Number);
    const pausenStartMin = pauseH * 60 + pauseM;
    const pausenEndeMin = pausenStartMin + (person.pausenzeit_minuten || 30);
    const zeitfensterMin = pausenStartMin - 60;
    const zeitfensterMax = pausenEndeMin + 60;
    const imIdealemZeitfenster = jetztMinuten >= zeitfensterMin && jetztMinuten <= pausenStartMin;
    const imAnzeigeZeitraum = jetztMinuten >= zeitfensterMin && jetztMinuten <= zeitfensterMax;
    const heuteDatum = jetzt.toISOString().split('T')[0];

    let pauseBtn = '';
    if (person.pause_tracking_aktiv) {
      const verblMin = person.pause_verbleibende_minuten || 0;
      pauseBtn = `<button class="intern-btn-mittagspause aktiv" disabled>⏸️ Pause (${verblMin} Min)</button>`;
    } else if (person.pause_bereits_gemacht) {
      pauseBtn = `<button class="intern-btn-mittagspause" disabled title="Pause heute bereits gemacht">✅ Pause erledigt</button>`;
    } else if (imAnzeigeZeitraum && !inBerufsschule && !istAbwesend) {
      const pIcon = imIdealemZeitfenster ? '🍽️' : '⚠️';
      const pText = imIdealemZeitfenster ? 'Pause' : 'Pause (spät)';
      pauseBtn = `<button class="intern-btn-mittagspause ${imIdealemZeitfenster ? '' : 'ausserhalb'}"
        onclick="app.internPauseStarten(${personId}, '${typ}', '${heuteDatum}', ${imIdealemZeitfenster})">
        ${pIcon} ${pText}
      </button>`;
    } else {
      pauseBtn = `<button class="intern-btn-mittagspause" disabled>🍽️ Pause</button>`;
    }
```

- [ ] **Step 2: Buttons in den return-Block einbauen**

Finde den `return`-Block (Zeile ~30235):
```javascript
    return `
      <div class="intern-person-kachel ${isLehrling ? 'lehrling' : ''} ${istArbeitPausiert ? 'arbeit-pausiert' : ''}">
        <div class="intern-person-header">
          <div class="intern-person-name">
            <span class="person-icon">${isLehrling ? '🎓' : '👷'}</span>
            <span>${this.escapeHtml(personName)}</span>
          </div>
          <div class="intern-person-badge ${badgeClass}">${badgeText}</div>
        </div>
```

Ersetze durch:
```javascript
    return `
      <div class="intern-person-kachel ${isLehrling ? 'lehrling' : ''} ${istArbeitPausiert ? 'arbeit-pausiert' : ''}">
        <div class="intern-person-header">
          <div class="intern-person-header-left">
            <div class="intern-person-name">
              <span class="person-icon">${isLehrling ? '🎓' : '👷'}</span>
              <span>${this.escapeHtml(personName)}</span>
            </div>
            <div class="intern-person-badge ${badgeClass}">${badgeText}</div>
          </div>
          <div class="intern-kachel-buttons">
            ${startenFertigBtn}
            ${pauseBtn}
          </div>
        </div>
```

- [ ] **Step 3: Commit**

```
git add frontend/src/components/app.js
git commit -m "feat: intern-tab Starten/Fertig/Pause-Buttons im Kachel-Header"
```

---

## Task 7: `renderInternPersonKachel` – Leer-Zustand Lehrling

**Files:**
- Modify: `frontend/src/components/app.js:30196-30202`

- [ ] **Step 1: Leer-Zustand anpassen**

Finde (Zeile ~30196):
```javascript
    } else {
      // Keine Aufträge heute
      bodyContent = `
        <div class="intern-person-leer">
          <div class="leer-icon">🎉</div>
          <div class="leer-text">Keine Aufträge für heute</div>
        </div>
      `;
    }
```

Ersetze durch:
```javascript
    } else {
      const leerIcon = isLehrling ? '🧹' : '🎉';
      const leerText = isLehrling ? 'Werkstatt-Reinigung' : 'Keine Aufträge für heute';
      bodyContent = `
        <div class="intern-person-leer">
          <div class="leer-icon">${leerIcon}</div>
          <div class="leer-text">${leerText}</div>
        </div>
      `;
    }
```

- [ ] **Step 2: Commit**

```
git add frontend/src/components/app.js
git commit -m "feat: intern-tab Lehrling ohne Aufträge zeigt Werkstatt-Reinigung"
```

---

## Task 8: CSS-Ergänzungen

**Files:**
- Modify: `frontend/src/styles/style.css` – nach Zeile ~13950 (vor `.intern-tablet-mode` Overrides)

- [ ] **Step 1: Neues CSS einfügen**

Nach dem Block mit `.intern-btn-arbeit-fortsetzen` (Zeile ~13570) und VOR dem ersten `.intern-tablet-mode` Block (~13952) folgendes CSS einfügen:

```css
/* Kachel-Header mit Buttons */
.intern-person-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
}

.intern-person-header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
}

.intern-kachel-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
}

/* Starten / Fertig Buttons */
.intern-btn-starten,
.intern-btn-fertig {
    padding: 7px 14px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
}

.intern-btn-starten {
    background: #00b894;
    color: white;
}
.intern-btn-starten:hover:not(:disabled) { background: #00a381; }
.intern-btn-starten:disabled { background: #b2bec3; cursor: default; }

.intern-btn-fertig {
    background: #0984e3;
    color: white;
}
.intern-btn-fertig:hover:not(:disabled) { background: #0773c5; }

/* Mittagspause Button */
.intern-btn-mittagspause {
    padding: 7px 14px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
    white-space: nowrap;
    background: #74b9ff;
    color: #2d3436;
}
.intern-btn-mittagspause:hover:not(:disabled) { background: #5da2e8; }
.intern-btn-mittagspause:disabled { background: #dfe6e9; color: #636e72; cursor: default; }
.intern-btn-mittagspause.aktiv { background: #fdcb6e; color: #2d3436; }
.intern-btn-mittagspause.ausserhalb { background: #e17055; color: white; }

/* Status-Badges im Auftrag */
.badge-verschoben {
    display: inline-block;
    background: #fdcb6e;
    color: #2d3436;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 4px;
}
.badge-verspaetet {
    display: inline-block;
    background: #e17055;
    color: white;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 4px;
}

/* Interne Auftragsnummer */
.auftrag-interne-nr {
    font-size: 0.85em;
    color: var(--text-secondary, #636e72);
    font-weight: 400;
}

/* Einzelarbeiten-Liste */
.intern-arbeiten-liste {
    margin: 8px 0 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.intern-arbeit-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    padding: 4px 6px;
    background: #f8f9fa;
    border-radius: 6px;
}
.intern-arbeit-item.abgeschlossen {
    opacity: 0.6;
    text-decoration: line-through;
}
.intern-arbeit-item .arbeit-name {
    flex: 1;
}
.intern-btn-einzelarbeit-fertig {
    padding: 3px 10px;
    background: #00b894;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    margin-left: 8px;
}
.intern-btn-einzelarbeit-fertig:hover:not(:disabled) { background: #00a381; }
.intern-btn-einzelarbeit-fertig:disabled { background: #b2bec3; cursor: default; }

/* Kompakte Arbeiten-Vorschau */
.intern-arbeiten-kompakt {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}
.intern-arbeiten-kompakt .arbeit-erledigt { color: #00b894; font-size: 12px; }
.intern-arbeiten-kompakt .arbeit-offen { color: #636e72; font-size: 12px; }
```

- [ ] **Step 2: Commit**

```
git add frontend/src/styles/style.css
git commit -m "feat: intern-tab CSS für Kachel-Buttons, Badges, Einzelarbeiten"
```

---

## Task 9: Frontend bauen und deployen

**Files:**
- Build: `frontend/dist/`

- [ ] **Step 1: Frontend bauen**

```powershell
cd frontend ; npm run build ; cd ..
```

Erwartete Ausgabe: `✓ built in Xs` ohne Fehler. Neue Dateinamen in `frontend/dist/assets/` notieren (z.B. `main-XXXXXXXX.js` + `main-XXXXXXXX.css`).

- [ ] **Step 2: DB-Backup erstellen**

```powershell
ssh root@100.124.168.108 'cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-intern-tab-update.db && echo BACKUP_OK'
```

Erwartete Ausgabe: `BACKUP_OK`

- [ ] **Step 3: Frontend-Dateien hochladen**

```powershell
# Dateinamen aus Step 1 anpassen!
scp "frontend\dist\assets\main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\assets\main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/
```

- [ ] **Step 4: Git push + Backend deployen**

```powershell
git add -A
git commit -m "feat: intern-tab vollständige Gleichstellung mit Tablet-App"
git push
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git stash && git pull && systemctl restart werkstatt-terminplaner && echo DEPLOY_OK"
```

Erwartete Ausgabe: `DEPLOY_OK`

- [ ] **Step 5: Verifizieren**

```powershell
ssh root@100.124.168.108 "systemctl is-active werkstatt-terminplaner"
```

Erwartete Ausgabe: `active`

- [ ] **Step 6: Manuelle Tests (Checkliste)**

Im Browser den Intern-Tab öffnen und prüfen:
- [ ] Termin mit Status `geplant` zeigt ▶️ Starten-Button
- [ ] Starten-Klick → Termin wechselt auf `in_arbeit`, Fertig-Button erscheint
- [ ] Fertig-Klick → Termin verschwindet aus Liste
- [ ] Lehrling ohne Aufträge zeigt "🧹 Werkstatt-Reinigung"
- [ ] Arbeitspause-Badge zeigt Grund ("⏸️ Pausiert – Teil fehlt")
- [ ] Auto-Pause (Zeitfenster): Badge "🍽️ Pause", Buttons bleiben aktiv
- [ ] Manuelle Pause: "Mittagspause"-Body, Starten/Fertig gesperrt

---

## Selbst-Review

**Spec Coverage:**
- ✅ Starten-Button → Task 6
- ✅ Fertig-Button → Task 6
- ✅ Einzelarbeiten-Buttons → Task 5 (rendering) + Task 2 (helpers) + Task 3 (action)
- ✅ Mittagspause-Button → Task 6 (button) + Task 1 (data)
- ✅ Arbeitspause-Grund im Badge → Task 4
- ✅ Verschoben/Verspätet-Badges → Task 5
- ✅ Interne Auftragsnummer → Task 5
- ✅ Lehrling Werkstatt-Reinigung → Task 7
- ✅ Auto-Pause blockiert keine Buttons → Task 4
- ✅ CSS → Task 8
- ✅ Deploy → Task 9

**Keine Platzhalter** – alle Steps enthalten vollständigen Code.

**Typ-Konsistenz:**
- `internGetArbeitenFromTermin` → in Task 2 definiert, in Task 5 und 6 verwendet ✅
- `internRenderArbeitenListe` → in Task 2 definiert, in Task 5 verwendet ✅
- `internBeendenEinzelarbeit` → in Task 3 definiert, in Task 2 referenziert (`app.internBeendenEinzelarbeit`) ✅
- `manuellePauseAktiv` → in Task 4 (Step 3) definiert, in Task 6 verwendet ✅
- `terminMitButtons`, `kannStarten` etc. → in Task 6 (Step 1) definiert, in Step 2 verwendet ✅
