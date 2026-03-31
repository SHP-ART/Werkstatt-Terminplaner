# Freier-Slot Zeitangabe-Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim Klick auf "Freien Slot finden" öffnet sich ein Modal, das die geschätzte Arbeitszeit abfragt (vorausgefüllt aus den eingetragenen Arbeiten), bevor die Slot-Suche startet.

**Architecture:** Das Modal wird dynamisch per JavaScript erstellt (wie das bestehende Überlastungswarnung-Modal in `app.js`). `handleNaechsterSlot()` wird umgeschrieben: statt direkt die API aufzurufen, öffnet es das Modal. Erst nach Bestätigung wird `getNaechsterSlot()` aufgerufen.

**Tech Stack:** Vanilla JS, inline HTML/CSS (kein Framework), konsistent mit dem Rest der App.

---

## Dateien

| Datei | Änderung |
|-------|----------|
| `frontend/src/components/app.js` | `handleNaechsterSlot()` umschreiben + neue Hilfsmethode `_oeffneZeitangabeModal()` |

Keine Änderungen an `index.html`, `api.js` oder dem Backend nötig — das Modal wird vollständig per JS erstellt, wie die anderen dynamischen Modals in der App.

---

### Task 1: `handleNaechsterSlot()` umschreiben

**Files:**
- Modify: `frontend/src/components/app.js` — Methode `handleNaechsterSlot()` (Zeilen ~32937–32962) und neue Methode `_oeffneZeitangabeModal()` direkt darunter

**Kontext:** Das bestehende Modal-Muster (z.B. Überlastungswarnung ~Zeile 34001) erstellt ein `div` mit `modal-overlay active`, setzt inline CSS für `position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10000;` und fügt es mit `document.body.appendChild(modal)` ein. Cleanup: `document.body.removeChild(modal)`.

`getGeschaetzteZeit(arbeitenListe)` (Zeile ~16073) erwartet eine Array von Arbeits-Strings. Die aktuelle `arbeitEingabe` ist ein Textarea mit ID `arbeitEingabe`. Die Methode `parseArbeiten(text)` (Zeile ~16099) parst den Text in ein Array.

- [ ] **Schritt 1: `handleNaechsterSlot()` durch Modal-Öffnung ersetzen**

Ersetze die gesamte Methode `handleNaechsterSlot()` (Zeilen 32937–32962) mit:

```js
  async handleNaechsterSlot() {
    const arbeitInput = document.getElementById('arbeitEingabe');
    const arbeiten = arbeitInput ? this.parseArbeiten(arbeitInput.value) : [];
    let vorschlag = this.getGeschaetzteZeit(arbeiten);
    if (!vorschlag || vorschlag < 15) vorschlag = 60;
    this._oeffneZeitangabeModal(vorschlag, arbeiten.length > 0);
  }
```

- [ ] **Schritt 2: Neue Methode `_oeffneZeitangabeModal()` direkt nach `handleNaechsterSlot()` einfügen**

Füge nach der schließenden `}` von `handleNaechsterSlot()` folgendes ein:

```js
  _oeffneZeitangabeModal(vorschlagMinuten, hatArbeiten) {
    const chips = [
      { label: '30 min', wert: 30 },
      { label: '1 Std.', wert: 60 },
      { label: '1,5 Std.', wert: 90 },
      { label: '2 Std.', wert: 120 },
      { label: '4 Std.', wert: 240 },
    ];

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6); display: flex;
      align-items: center; justify-content: center; z-index: 10000;
    `;

    const hinweisHtml = hatArbeiten
      ? `<div style="font-size:11px;color:#4a90e2;background:#e8f4fd;border-radius:6px;padding:6px 10px;margin-bottom:16px;">
           ℹ️ Vorausgefüllt aus eingetragenen Arbeiten
         </div>`
      : '';

    const chipsHtml = chips.map(c => {
      const aktiv = c.wert === vorschlagMinuten;
      return `<span class="zeitangabe-chip" data-wert="${c.wert}" style="
        display:inline-block; padding:6px 14px; border-radius:20px; cursor:pointer;
        font-size:13px; margin:3px;
        background:${aktiv ? '#e8f4fd' : '#fff'};
        border:${aktiv ? '2px solid #4a90e2' : '1px solid #ddd'};
        color:${aktiv ? '#4a90e2' : '#555'};
        font-weight:${aktiv ? '600' : 'normal'};
      ">${c.label}</span>`;
    }).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:12px;padding:24px;width:320px;
                  box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <strong style="font-size:15px;color:#333;">⏱️ Geschätzte Arbeitszeit</strong>
          <span id="zeitangabeModalClose" style="cursor:pointer;color:#999;font-size:20px;line-height:1;">✕</span>
        </div>
        <div style="font-size:12px;color:#777;margin-bottom:14px;">
          Wie lange dauert die Arbeit voraussichtlich?
        </div>
        <div style="margin-bottom:14px;">${chipsHtml}</div>
        ${hinweisHtml}
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
          <input id="zeitangabeMinuten" type="number" min="5" max="960" value="${vorschlagMinuten}"
            style="flex:1;padding:9px 12px;border:1px solid #ccc;border-radius:6px;
                   font-size:14px;text-align:center;">
          <span style="font-size:13px;color:#666;white-space:nowrap;">Minuten</span>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="zeitangabeAbbrechen" style="flex:1;padding:10px;background:#f0f0f0;
            color:#555;border:none;border-radius:6px;font-size:13px;cursor:pointer;">
            Abbrechen
          </button>
          <button id="zeitangabeSuchen" style="flex:1;padding:10px;background:#4a90e2;
            color:white;border:none;border-radius:6px;font-size:13px;
            font-weight:600;cursor:pointer;">
            🔍 Slot suchen
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const schliesseModal = () => document.body.removeChild(modal);

    // Chips: Klick setzt Input-Wert und hebt Chip hervor
    modal.querySelectorAll('.zeitangabe-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        modal.querySelectorAll('.zeitangabe-chip').forEach(c => {
          c.style.background = '#fff';
          c.style.border = '1px solid #ddd';
          c.style.color = '#555';
          c.style.fontWeight = 'normal';
        });
        chip.style.background = '#e8f4fd';
        chip.style.border = '2px solid #4a90e2';
        chip.style.color = '#4a90e2';
        chip.style.fontWeight = '600';
        document.getElementById('zeitangabeMinuten').value = chip.dataset.wert;
      });
    });

    // Schließen per ✕ oder Abbrechen
    modal.querySelector('#zeitangabeModalClose').addEventListener('click', schliesseModal);
    modal.querySelector('#zeitangabeAbbrechen').addEventListener('click', schliesseModal);

    // Klick auf Overlay (außerhalb des Inhalts) schließt Modal
    modal.addEventListener('click', e => { if (e.target === modal) schliesseModal(); });

    // Suchen-Button
    modal.querySelector('#zeitangabeSuchen').addEventListener('click', async () => {
      const input = document.getElementById('zeitangabeMinuten');
      let minuten = parseInt(input.value, 10);
      if (!Number.isFinite(minuten) || minuten < 5) minuten = 60;
      schliesseModal();

      const btn = document.getElementById('btnFreienSlotFinden');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Suche...'; }
      try {
        const slotResponse = await window.TermineService.getNaechsterSlot(minuten, null, null);
        const slots = Array.isArray(slotResponse) ? slotResponse : (slotResponse.slots || []);
        this._zeigeSlotVorschlaege(slots);
      } catch (err) {
        this.showToast('Slot-Suche fehlgeschlagen: ' + (err.message || err), 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🔍 Freien Slot finden'; }
      }
    });
  }
```

- [ ] **Schritt 3: Manuell testen**

1. App starten (falls nicht bereits laufend)
2. Tab "Termine" → Sub-Tab "Neuer Termin" öffnen
3. Auf "🔍 Freien Slot finden" klicken
4. Prüfen: Modal öffnet sich mit 60 min vorausgefüllt (kein Arbeit eingetragen → Fallback)
5. Eine Arbeit eintragen (z.B. "Reifenwechsel"), dann Button erneut klicken
6. Prüfen: Modal öffnet sich mit dem berechneten Wert aus der Arbeit + blauer Hinweis
7. Chip "2 Std." anklicken → Input zeigt 120, Chip wird blau hervorgehoben
8. "Slot suchen" klicken → Modal schließt, Slot-Vorschläge erscheinen wie bisher
9. Modal erneut öffnen → "Abbrechen" klicken → schließt ohne Suche
10. Modal erneut öffnen → ✕ klicken → schließt ohne Suche
11. Modal erneut öffnen → auf das dunkle Overlay außen klicken → schließt ohne Suche

- [ ] **Schritt 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: Zeitangabe-Modal vor Freien-Slot-Suche"
```
