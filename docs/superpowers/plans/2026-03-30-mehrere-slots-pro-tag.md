# Mehrere Zeitslots pro Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pro Tag bis zu 4 freie Zeitslots anzeigen und Klick auf eine Zeit setzt Datum + Bringzeit ins Formular.

**Architecture:** Backend erweitert die Slot-Suche auf bis zu 4 Zeiten pro Tag/Kandidat und gibt ein `zeiten`-Array statt `startzeit` zurück. Frontend rendert pro Tag eine Zeile mit Zeitchips; `_uebernimmSlot` bekommt einen `zeit`-Parameter und setzt `#bring_zeit`.

**Tech Stack:** Node.js/Express Backend, Vanilla JS Frontend (kein Framework).

---

## Dateien

| Datei | Änderung |
|-------|----------|
| `backend/src/controllers/termineController.js` | `getNaechsterSlot`: mehrere Zeiten pro Tag, `zeiten[]` statt `startzeit` |
| `frontend/src/components/app.js` | `_zeigeSlotVorschlaege`: neue Zeilen-Darstellung; `_uebernimmSlot`: Bringzeit setzen |

---

### Task 1: Backend — bis zu 4 Zeiten pro Tag

**Files:**
- Modify: `backend/src/controllers/termineController.js` — innerhalb der `for (const kandidat of zuPruefende)` Schleife, Zeilen ~2847–2871

**Kontext:** Die aktuelle Schleife ruft `findAvailableSlot` einmal auf und pusht ein Objekt mit `startzeit` (String). Wir ersetzen das durch einen inneren Loop der bis zu 4 Mal sucht, ab dem Ende des zuletzt gefundenen Slots.

`KIPlanungController.findAvailableSlot(blocks, preferredStart, duration, dayStart, dayEnd)` gibt eine Startzeit in Minuten zurück oder `null`.

- [ ] **Schritt 1: Alten Slot-Push-Block ersetzen**

Ersetze in `backend/src/controllers/termineController.js` den Block:

```js
          const slotStart = KIPlanungController.findAvailableSlot(
            blocks, tagStart, benoetigt, tagStart, tagEnde
          );

          if (slotStart !== null) {
            const belegtMinuten = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
            const verfuegbarMinuten = (kandidat.arbeitsstunden_pro_tag || 8) * 60;
            const auslastungProzent = verfuegbarMinuten > 0
              ? Math.round((belegtMinuten / verfuegbarMinuten) * 100)
              : 0;

            const h = Math.floor(slotStart / 60);
            const m = slotStart % 60;
            const startzeit = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

            slots.push({
              datum: datumStr,
              startzeit,
              mitarbeiter_id: kandidat._typ === 'mitarbeiter' ? kandidat.id : null,
              lehrling_id: kandidat._typ === 'lehrling' ? kandidat.id : null,
              mitarbeiter_name: kandidat.name,
              auslastung_prozent: auslastungProzent
            });
            slotGefunden = true;
          }
```

mit:

```js
          const zeiten = [];
          let suchAb = tagStart;
          while (zeiten.length < 4) {
            const slotStart = KIPlanungController.findAvailableSlot(
              blocks, suchAb, benoetigt, tagStart, tagEnde
            );
            if (slotStart === null) break;
            const h = Math.floor(slotStart / 60);
            const m = slotStart % 60;
            zeiten.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            suchAb = slotStart + benoetigt;
          }

          if (zeiten.length > 0) {
            const belegtMinuten = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
            const verfuegbarMinuten = (kandidat.arbeitsstunden_pro_tag || 8) * 60;
            const auslastungProzent = verfuegbarMinuten > 0
              ? Math.round((belegtMinuten / verfuegbarMinuten) * 100)
              : 0;

            slots.push({
              datum: datumStr,
              zeiten,
              mitarbeiter_id: kandidat._typ === 'mitarbeiter' ? kandidat.id : null,
              lehrling_id: kandidat._typ === 'lehrling' ? kandidat.id : null,
              mitarbeiter_name: kandidat.name,
              auslastung_prozent: auslastungProzent
            });
            slotGefunden = true;
          }
```

- [ ] **Schritt 2: Backend manuell testen**

```bash
curl "http://localhost:3001/termine/naechster-slot?geschaetzte_zeit=60"
```

Erwartetes Ergebnis: Jedes Slot-Objekt hat `zeiten: ["08:00", "10:00", ...]` (Array), kein `startzeit` mehr.

- [ ] **Schritt 3: Commit**

```bash
git add backend/src/controllers/termineController.js
git commit -m "feat: Slot-Suche gibt bis zu 4 Zeiten pro Tag zurück"
```

---

### Task 2: Frontend — Zeitchips-Zeilen + Bringzeit setzen

**Files:**
- Modify: `frontend/src/components/app.js` — Methoden `_zeigeSlotVorschlaege` (Zeilen ~33056–33075) und `_uebernimmSlot` (Zeilen ~33077–33100)

**Kontext:**
- `_zeigeSlotVorschlaege(slots)` rendert aktuell pro Slot eine `<div class="slot-item">` mit `onclick="app._uebernimmSlot(...)"`. Die Signatur ist `_uebernimmSlot(datum, mitarbeiterId, mitarbeiterName, idx)`.
- `#bring_zeit` ist ein `<input type="text">` im Neuer-Termin-Formular (HH:MM Format).
- `s.lehrling_id` ist neu im Slot-Objekt — es gibt keinen Lehrling-Select im Formular, nur `#mitarbeiterId` / `#mitarbeiterSelect` für Mitarbeiter.

- [ ] **Schritt 1: `_zeigeSlotVorschlaege` ersetzen**

Ersetze die gesamte Methode `_zeigeSlotVorschlaege(slots)`:

```js
  _zeigeSlotVorschlaege(slots) {
    const container = document.getElementById('slotVorschlaegeDropdown');
    if (!container) return;
    if (!slots || slots.length === 0) {
      container.innerHTML = '<div class="slot-kein-ergebnis">Kein freier Slot in den nächsten 14 Tagen gefunden.</div>';
      container.style.display = 'block';
      return;
    }
    const zeilen = slots.map(s => {
      const datum = new Date(s.datum).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
      const zeiten = (s.zeiten || (s.startzeit ? [s.startzeit] : []));
      const chipsHtml = zeiten.map(zeit =>
        `<span class="slot-zeit-chip" onclick="app._uebernimmSlot('${s.datum}','${s.mitarbeiter_id || ''}','${s.mitarbeiter_name}','${zeit}')" style="
          display:inline-block;padding:4px 10px;border-radius:14px;cursor:pointer;
          font-size:12px;font-weight:600;margin:2px;
          background:#e8f4fd;color:#4a90e2;border:1px solid #4a90e2;">
          ${zeit}
        </span>`
      ).join('');
      return `<div class="slot-item-row" style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid #f0f0f0;gap:10px;flex-wrap:wrap;">
        <span style="min-width:130px;font-weight:600;color:#333;font-size:13px;">${datum}</span>
        <span style="display:flex;flex-wrap:wrap;flex:1;gap:4px;">${chipsHtml}</span>
        <span class="slot-auslastung" style="font-size:11px;color:#888;white-space:nowrap;">${s.mitarbeiter_name} · ${s.auslastung_prozent}% ausgelastet</span>
      </div>`;
    }).join('');
    container.innerHTML =
      '<div class="slot-header">🗓️ Vorgeschlagene freie Slots:</div>' +
      zeilen +
      '<div class="slot-close" onclick="document.getElementById(\'slotVorschlaegeDropdown\').style.display=\'none\'" style="padding:8px 14px;text-align:right;cursor:pointer;color:#999;font-size:12px;">✕ Schließen</div>';
    container.style.display = 'block';
  }
```

- [ ] **Schritt 2: `_uebernimmSlot` ersetzen**

Ersetze die gesamte Methode `_uebernimmSlot(datum, mitarbeiterId, mitarbeiterName, idx)`:

```js
  _uebernimmSlot(datum, mitarbeiterId, mitarbeiterName, zeit) {
    // Datum ins Terminformular übernehmen
    const datumInput = document.getElementById('datum');
    if (datumInput) {
      datumInput.value = datum;
      datumInput.dispatchEvent(new Event('change'));
    }
    // Bringzeit setzen
    const bringZeitInput = document.getElementById('bring_zeit');
    if (bringZeitInput && zeit) {
      bringZeitInput.value = zeit;
      bringZeitInput.dispatchEvent(new Event('change'));
    }
    // Kalender auf das Datum setzen
    if (this.setupAuslastungKalender) {
      const d = new Date(datum);
      this.currentKalenderDatum = d;
      this.selectedDatum = datum;
      this.renderAuslastungKalender();
      const display = document.getElementById('selectedDatumDisplay');
      if (display) display.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    }
    // Mitarbeiter vorauswählen falls Feld vorhanden
    const maSelect = document.getElementById('mitarbeiterId') || document.getElementById('mitarbeiterSelect');
    if (maSelect && mitarbeiterId) {
      maSelect.value = mitarbeiterId;
    }
    document.getElementById('slotVorschlaegeDropdown').style.display = 'none';
    this.showToast(`Slot ${datum} ${zeit ? 'um ' + zeit + ' Uhr ' : ''}übernommen`, 'success');
  }
```

- [ ] **Schritt 3: Frontend bauen**

```bash
cd frontend && npm run build
```

Erwartetes Ergebnis: `✓ built in X.XXs` ohne Fehler.

- [ ] **Schritt 4: Manuell testen**

1. App öffnen → Neuer Termin → "🔍 Freien Slot finden"
2. Arbeitszeit eingeben und "Slot suchen" klicken
3. Dropdown zeigt pro Tag eine Zeile mit mehreren Zeitchips
4. Einen Chip klicken → Datum + Bringzeit (`#bring_zeit`) im Formular gefüllt
5. Toast zeigt "Slot 2026-03-31 um 10:00 Uhr übernommen"

- [ ] **Schritt 5: Commit + Deploy**

```bash
git add frontend/src/components/app.js
git commit -m "feat: Slot-Vorschläge als Zeitchips, Bringzeit wird übernommen"
git push

# Frontend deployen
scp "frontend/dist/assets/main-*.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend/dist/assets/main-*.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend/dist/index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git pull && systemctl restart werkstatt-terminplaner && echo 'DEPLOY OK'"
```
