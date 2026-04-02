# Status-Popup mit Zeitfeld (Zeitverwaltung) — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Status-Badge in der Zeitverwaltungs-Tabelle öffnet per Klick ein Floating-Dropdown mit Status-Auswahl (5 Optionen) und kontextabhängigem Zeitfeld (Startzeit bei „In Arbeit", Fertigstellungszeit bei „Abgeschlossen").

**Architecture:** Der bestehende Status-Badge in `loadTermine()` (app.js:6180) bekommt einen Click-Handler der ein Floating-Div in den `<body>` hängt. Drei neue Methoden in der App-Klasse übernehmen Rendering, State und Speichern. Kein Backend nötig — `TermineService.update()` und die DB-Felder `startzeit` / `fertigstellung_zeit` existieren bereits.

**Tech Stack:** Vanilla JS (ES6+), inline CSS via cssText, `TermineService.update()` für API-Calls, SQLite-Felder laut DATENBANK.md

**Hinweis zu Tests:** Dieses Projekt hat keine automatisierte Test-Infrastruktur. Jeder Task endet mit manuellen Smoke-Test-Schritten und einem Commit.

---

## Datei-Übersicht

| Datei | Änderung |
|---|---|
| `frontend/src/components/app.js:6180` | Click-Handler + `cursor:pointer` auf Status-Badge |
| `frontend/src/components/app.js` (nach Zeile ~11250) | Neue Methoden `openStatusPopup`, `_updateStatusPopupZeitfeld`, `saveStatusPopup` |
| `frontend/src/styles/style.css` (Ende Datei) | Hover-Stil für `.status-popup-item` |

---

## Task 1: Status-Badge klickbar machen

**Files:**
- Modify: `frontend/src/components/app.js:6180`

- [ ] **Schritt 1: Zeile 6180 in app.js öffnen und lesen**

  Aktuelle Zeile 6180:
  ```javascript
  <td><span class="status-badge ${statusClass}">${termin.status}</span></td>
  ```

- [ ] **Schritt 2: Zeile 6180 ersetzen**

  Ersetze die Zeile durch:
  ```javascript
  <td><span class="status-badge ${statusClass}" style="cursor:pointer;" onclick="event.stopPropagation(); app.openStatusPopup(${termin.id}, this)">${termin.status}</span></td>
  ```

  `event.stopPropagation()` verhindert, dass der Zeilen-Click-Handler (der `openArbeitszeitenModal` öffnet) ausgelöst wird.

- [ ] **Schritt 3: Manuell testen**

  1. Anwendung neu laden
  2. Zeitverwaltung-Tab öffnen
  3. Auf einen Status-Badge klicken → Browser-Konsole zeigt `TypeError: app.openStatusPopup is not a function` (erwarteter Fehler — Funktion existiert noch nicht)
  4. Kein Modal öffnet sich → `stopPropagation` funktioniert ✓

- [ ] **Schritt 4: Committen**

  ```bash
  git add frontend/src/components/app.js
  git commit -m "feat: Status-Badge in Zeitverwaltung klickbar machen (stopPropagation + openStatusPopup hook)"
  ```

---

## Task 2: `openStatusPopup` + `_updateStatusPopupZeitfeld` implementieren

**Files:**
- Modify: `frontend/src/components/app.js` (neue Methoden nach `saveStatusPopup` aus Task 3 — oder direkt nach `updateTerminStatus` bei Zeile ~11250)
- Modify: `frontend/src/styles/style.css` (Hover-Stil ans Ende)

- [ ] **Schritt 1: Hover-CSS in `style.css` am Ende der Datei einfügen**

  ```css
  /* Status-Popup */
  .status-popup-item:hover {
      background: rgba(255,255,255,0.07);
  }
  ```

- [ ] **Schritt 2: `openStatusPopup`-Methode in app.js nach `updateTerminStatus` (ca. Zeile 11250) einfügen**

  Suche nach der Zeile:
  ```javascript
  async updateTerminStatus(terminId, status) {
  ```
  Scrolle ans Ende dieser Funktion (ca. Zeile 11260) und füge direkt danach ein:

  ```javascript
  openStatusPopup(terminId, anchorEl) {
    // Altes Popup entfernen
    const existing = document.getElementById('status-popup');
    if (existing) existing.remove();

    const termin = this.termineById[terminId];
    if (!termin) return;

    const STATUS_LIST = [
      { value: 'wartend',       label: '⏳ Wartend' },
      { value: 'geplant',       label: '📋 Geplant' },
      { value: 'in_arbeit',     label: '🔧 In Arbeit' },
      { value: 'abgeschlossen', label: '✅ Abgeschlossen' },
      { value: 'abgesagt',      label: '❌ Abgesagt' },
    ];

    const currentStatus = termin.status || 'geplant';
    let selectedStatus = currentStatus;

    const popup = document.createElement('div');
    popup.id = 'status-popup';
    popup.style.cssText = [
      'position:fixed',
      'z-index:9999',
      'background:var(--card-bg,#1e2235)',
      'border:1px solid var(--border,#3a4a6a)',
      'border-radius:8px',
      'padding:12px',
      'min-width:210px',
      'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
      'font-family:inherit',
    ].join(';');

    popup.innerHTML = `
      <div style="font-size:10px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.8px;">Status</div>
      <div id="status-popup-list">
        ${STATUS_LIST.map(s => `
          <div class="status-popup-item"
               data-value="${s.value}"
               style="padding:6px 8px;border-radius:5px;cursor:pointer;font-size:13px;
                      border-left:3px solid ${s.value === currentStatus ? 'var(--primary,#4a7adb)' : 'transparent'};
                      font-weight:${s.value === currentStatus ? 'bold' : 'normal'};">
            ${s.label}
          </div>
        `).join('')}
      </div>
      <div id="status-popup-zeitfeld"></div>
      <button id="status-popup-save"
              style="margin-top:10px;width:100%;border-radius:5px;padding:7px;font-size:12px;cursor:pointer;border:1px solid #555;background:#2a2a3e;color:#aaa;">
        💾 Speichern
      </button>
    `;

    // Popup positionieren
    const rect = anchorEl.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 4) + 'px';
    popup.style.left = rect.left + 'px';
    document.body.appendChild(popup);

    // Initiales Zeitfeld rendern
    this._updateStatusPopupZeitfeld(terminId, selectedStatus);

    // Status-Item klicken
    popup.querySelectorAll('.status-popup-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedStatus = item.dataset.value;
        popup.querySelectorAll('.status-popup-item').forEach(i => {
          const active = i.dataset.value === selectedStatus;
          i.style.borderLeft = active ? '3px solid var(--primary,#4a7adb)' : '3px solid transparent';
          i.style.fontWeight  = active ? 'bold' : 'normal';
        });
        this._updateStatusPopupZeitfeld(terminId, selectedStatus);
      });
    });

    // Speichern
    popup.querySelector('#status-popup-save').addEventListener('click', async () => {
      const input = popup.querySelector('#status-popup-zeit-input');
      const zeitValue = input ? input.value : null;
      popup.remove();
      document.removeEventListener('click', closeHandler, true);
      await this.saveStatusPopup(terminId, selectedStatus, zeitValue);
    });

    // Außen-Klick schließt Popup
    const closeHandler = (e) => {
      if (!popup.contains(e.target) && e.target !== anchorEl) {
        popup.remove();
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
  }
  ```

- [ ] **Schritt 3: `_updateStatusPopupZeitfeld`-Methode direkt danach einfügen**

  ```javascript
  _updateStatusPopupZeitfeld(terminId, status) {
    const zeitfeldDiv = document.getElementById('status-popup-zeitfeld');
    const saveBtn     = document.getElementById('status-popup-save');
    if (!zeitfeldDiv) return;

    const termin = this.termineById[terminId];

    // Speichern-Button-Farbe je Status
    const BTN_COLORS = {
      in_arbeit:     { bg: '#1a3050', color: '#7eb8f7', border: '#4a7adb' },
      abgeschlossen: { bg: '#1a3025', color: '#7aba8a', border: '#4a8a5a' },
      abgesagt:      { bg: '#3a1a1a', color: '#c07070', border: '#8a4040' },
    };
    const c = BTN_COLORS[status];
    if (saveBtn) {
      saveBtn.style.background = c ? c.bg    : '#2a2a3e';
      saveBtn.style.color      = c ? c.color : '#aaa';
      saveBtn.style.border     = c ? `1px solid ${c.border}` : '1px solid #555';
    }

    if (status === 'in_arbeit') {
      const geplant = termin ? (termin.startzeit || termin.bring_zeit || '') : '';
      zeitfeldDiv.innerHTML = `
        <div style="border-top:1px solid #333;padding-top:10px;margin-top:8px;">
          <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px;">Startzeit</div>
          <div style="font-size:11px;color:#666;margin-bottom:5px;">
            Geplant: <span style="color:#4a7a9b;">${geplant || '—'}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:11px;color:#aaa;">Tatsächlich:</span>
            <input id="status-popup-zeit-input" type="text"
                   value="${geplant}" placeholder="HH:MM" maxlength="5"
                   style="width:60px;background:#111827;border:1px solid #4a7a9b;color:#7eb8f7;
                          padding:3px 6px;border-radius:4px;font-size:12px;" />
          </div>
        </div>`;

    } else if (status === 'abgeschlossen') {
      // ISO → HH:MM konvertieren
      let fertig = '';
      if (termin) {
        const fz = termin.fertigstellung_zeit;
        if (fz && (fz.includes('T') || fz.includes('Z'))) {
          const d = new Date(fz);
          if (!isNaN(d)) fertig = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        } else if (fz) {
          fertig = fz;
        }
        if (!fertig) fertig = termin.endzeit_berechnet || '';
      }
      zeitfeldDiv.innerHTML = `
        <div style="border-top:1px solid #333;padding-top:10px;margin-top:8px;">
          <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.8px;">Fertigstellungszeit</div>
          <div style="font-size:11px;color:#666;margin-bottom:5px;">
            Berechnet: <span style="color:#4a8a5a;">${fertig || '—'}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:11px;color:#aaa;">Tatsächlich:</span>
            <input id="status-popup-zeit-input" type="text"
                   value="${fertig}" placeholder="HH:MM" maxlength="5"
                   style="width:60px;background:#111827;border:1px solid #4a8a5a;color:#7aba8a;
                          padding:3px 6px;border-radius:4px;font-size:12px;" />
          </div>
        </div>`;
    } else {
      zeitfeldDiv.innerHTML = '';
    }

    // Validierung auf Eingabefeld verdrahten
    const input = document.getElementById('status-popup-zeit-input');
    if (input && saveBtn) {
      const borderOk = status === 'abgeschlossen' ? '#4a8a5a' : '#4a7a9b';
      input.addEventListener('input', () => {
        const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(input.value);
        input.style.borderColor = valid ? borderOk : '#cc4444';
        saveBtn.disabled = !valid;
      });
    }
  }
  ```

- [ ] **Schritt 4: Manuell testen**

  1. Anwendung neu laden
  2. Zeitverwaltung öffnen, auf Status-Badge klicken → Popup erscheint mit Status-Liste ✓
  3. Status wechseln → aktiver Eintrag wechselt Hervorhebung ✓
  4. „In Arbeit" wählen → Startzeit-Feld erscheint ✓
  5. „Abgeschlossen" wählen → Fertigstellungszeit-Feld erscheint ✓
  6. „Geplant" wählen → kein Zeitfeld ✓
  7. Außerhalb klicken → Popup schließt ohne Speichern ✓
  8. Ungültige Zeit eingeben (z.B. „99:99") → Speichern-Button graut aus, Feld rot ✓

- [ ] **Schritt 5: Committen**

  ```bash
  git add frontend/src/components/app.js frontend/src/styles/style.css
  git commit -m "feat: openStatusPopup + Zeitfeld-Rendering für Zeitverwaltung-Status"
  ```

---

## Task 3: `saveStatusPopup` implementieren

**Files:**
- Modify: `frontend/src/components/app.js` (neue Methode nach `_updateStatusPopupZeitfeld`)

- [ ] **Schritt 1: `saveStatusPopup`-Methode direkt nach `_updateStatusPopupZeitfeld` einfügen**

  ```javascript
  async saveStatusPopup(terminId, status, zeitValue) {
    const termin = this.termineById[terminId];
    const updatePayload = { status };

    if (status === 'in_arbeit' && zeitValue) {
      updatePayload.startzeit = zeitValue;
    } else if (status === 'abgeschlossen' && zeitValue) {
      const datum = termin ? termin.datum : new Date().toISOString().slice(0, 10);
      const iso   = new Date(`${datum}T${zeitValue}:00`);
      updatePayload.fertigstellung_zeit = isNaN(iso.getTime()) ? zeitValue : iso.toISOString();
    }

    try {
      const result = await TermineService.update(terminId, updatePayload);

      // Cache aktualisieren
      if (this.termineById[terminId]) {
        this.termineById[terminId].status = status;
        if (updatePayload.startzeit)          this.termineById[terminId].startzeit          = updatePayload.startzeit;
        if (updatePayload.fertigstellung_zeit) this.termineById[terminId].fertigstellung_zeit = updatePayload.fertigstellung_zeit;
        if (result && result.berechneteZeit)   this.termineById[terminId].tatsaechliche_zeit  = result.berechneteZeit;
      }

      const statusLabel = { wartend:'Wartend', geplant:'Geplant', in_arbeit:'In Arbeit',
                             abgeschlossen:'Abgeschlossen', abgesagt:'Abgesagt' }[status] || status;
      this.showToast(`✅ Status: ${statusLabel}`, 'success');

      // Tabelle + Seiteneffekte
      await this.loadTermine();
      if (status === 'in_arbeit' || status === 'abgeschlossen') {
        if (termin) this._nachrueckenFuerTermin(termin).catch(() => {});
      }
      this.updateTimelineBlockStatus(terminId, status);
      this.loadDashboard();
      await this.loadHeuteTermine();

    } catch (e) {
      console.error('[saveStatusPopup] Fehler:', e);
      this.showToast('Fehler beim Speichern des Status', 'error');
    }
  }
  ```

- [ ] **Schritt 2: End-to-End-Test „Status + Zeit speichern"**

  **Szenario A — Startzeit bei In Arbeit:**
  1. Termin mit Status „Geplant" wählen der eine `startzeit` hat (z.B. 08:30)
  2. Badge klicken → „In Arbeit" wählen
  3. Zeitfeld zeigt 08:30 als Vorbelegung ✓
  4. Zeit auf `09:00` ändern → Eingabe wird blau umrahmt ✓
  5. „Speichern" klicken → Toast „Status: In Arbeit" ✓
  6. Zeile in Tabelle zeigt neuen Status ✓
  7. Badge erneut klicken → Zeitfeld zeigt `09:00` als neue Vorbelegung ✓

  **Szenario B — Fertigstellungszeit bei Abgeschlossen:**
  1. Einen „In Arbeit"-Termin wählen
  2. Badge klicken → „Abgeschlossen" wählen
  3. Zeitfeld zeigt berechnete Endzeit ✓
  4. Zeit auf `11:30` ändern
  5. „Speichern" → Toast ✓
  6. DB-Eintrag: `fertigstellung_zeit` ist ISO-String mit `11:30` Uhrzeit ✓
     (Prüfen via Browser DevTools → Network → PUT-Request payload)

  **Szenario C — Status ohne Zeit (Geplant):**
  1. Einen „In Arbeit"-Termin wählen → Badge klicken → „Geplant" wählen
  2. Kein Zeitfeld sichtbar ✓
  3. „Speichern" → Toast ✓
  4. Status wechselt zu „Geplant", `startzeit` bleibt unverändert ✓

- [ ] **Schritt 3: Committen**

  ```bash
  git add frontend/src/components/app.js
  git commit -m "feat: saveStatusPopup - Status + Startzeit/Fertigstellungszeit speichern"
  ```

---

## Abschluss-Checkliste

- [ ] Alle 3 Tasks committed
- [ ] Kein Konsolenfehler beim normalen Klick auf Tabellenzeile (Modal öffnet weiterhin)
- [ ] Kein Konsolenfehler beim Klick außerhalb des Popups
- [ ] `fertigstellung_zeit` wird als ISO-8601 in DB gespeichert (nicht als HH:MM-String)
- [ ] `startzeit` wird als HH:MM gespeichert
