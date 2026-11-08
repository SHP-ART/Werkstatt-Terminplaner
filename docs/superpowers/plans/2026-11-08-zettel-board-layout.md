# Zettel-Board-Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mitarbeiter und Lehrlinge mit ihren zugewiesenen Zetteln oben anzeigen und den gemeinsamen NEU-Bereich darunter anordnen.

**Architecture:** Das vorhandene Warteschlangen-Feature rendert zwei getrennte Container innerhalb von `#warteschlangeBoard`: eine horizontal scrollbarre Personenreihe und einen vollflächigen NEU-Bereich. Drag & Drop und alle API-Aufrufe bleiben unverändert, weil die vorhandenen Datenattribute erhalten bleiben.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, Vitest mit jsdom, Vite

## Global Constraints

- Die Änderung bleibt auf `frontend/` beschränkt; Backend, Datenmodell und Tablet-App bleiben unverändert.
- Die vorhandenen Klassen und Datenattribute für Zettel, Personen und Drop-Ziele bleiben erhalten.
- Auslastung, Warnungen, Sortieren, Kollegenauswahl und Auftragsimporte dürfen nicht verändert werden.
- Einrückung: 2 Leerzeichen.

---

### Task 1: Personenreihe und NEU-Bereich anordnen

**Files:**
- Modify: `frontend/tests/features/warteschlange.test.js`
- Modify: `frontend/src/features/warteschlange/warteschlangeFeature.js:96-136`
- Modify: `frontend/src/styles/style.css:17103-17121`

**Interfaces:**
- Consumes: `this.warteschlangeData`, `this.getWarteschlangeSpalten()`, `this.renderWarteschlangeTermin()`, `this.renderWarteschlangeImport()`.
- Produces: `.warteschlange-personen` als Container der Personen-Spalten und `.warteschlange-neu` als nachfolgender NEU-Bereich innerhalb von `#warteschlangeBoard`.

- [ ] **Step 1: Write the failing test**

Einen Test in `frontend/tests/features/warteschlange.test.js` ergänzen:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- warteschlange`

Expected: Der neue Test schlägt fehl, weil `.warteschlange-personen` noch nicht existiert.

- [ ] **Step 3: Write minimal implementation**

In `renderWarteschlange()` die Personen in einen eigenen Container setzen und den NEU-Bereich danach einfügen:

```js
const personenBereich = personen
  ? `<div class="warteschlange-personen">${personen}</div>`
  : '<p class="empty-state">Keine aktiven Mechaniker oder Lehrlinge vorhanden.</p>';

board.innerHTML = personenBereich + neuSpalte;
```

In `frontend/src/styles/style.css` das Board vertikal ausrichten und die horizontale Anordnung auf die Personenreihe übertragen:

```css
#warteschlange .warteschlange-board {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  padding: 4px;
}

#warteschlange .warteschlange-personen {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 12px;
}

#warteschlange .warteschlange-neu {
  flex: none;
  border-top: 4px solid var(--accent);
}

#warteschlange .warteschlange-neu .warteschlange-zettel-liste {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

#warteschlange .warteschlange-neu .warteschlange-zettel {
  margin-bottom: 0;
}
```

- [ ] **Step 4: Run focused and full frontend tests**

Run: `cd frontend && npm test -- warteschlange && npm test`

Expected: Alle Frontend-Tests bestehen.

- [ ] **Step 5: Build and verify the page**

Run: `cd frontend && npm run build`

Expected: Vite erzeugt den Produktions-Build ohne Fehler. Anschließend die Seite im Browser prüfen, sofern der lokale Entwicklungsserver verfügbar ist: Personen stehen oben, NEU liegt darunter, und ein neuer Zettel lässt sich einer Person zuweisen.
