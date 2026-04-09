# Neuer-Kunde-Popup im Terminformular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Modal-Popup in "Neuer Termin" ermöglicht das vollständige Anlegen eines neuen Kunden (Name, Vorname, Telefon, Kennzeichen, Auto Modell, KM-Stand) direkt beim ersten Kontakt, ohne die Termin-Erfassung zu unterbrechen.

**Architecture:** Reines Frontend-Feature. Das Modal `#neuerKundeModal` wird durch Badge-Klick oder Dropdown-Button geöffnet, nutzt `KundenService.create()` (bereits vorhanden), und befüllt nach Erfolg die Felder im Terminformular automatisch. Keine Backend-Änderungen.

**Tech Stack:** Vanilla JS (ES6, Klassen), HTML5, CSS3 (bestehende Modal-Styles wiederverwenden), Vite-Build

---

## Datei-Übersicht

| Datei | Aktion | Was |
|---|---|---|
| `frontend/index.html` | Modify | Modal-HTML `#neuerKundeModal` vor `#terminVorschauModal` einfügen |
| `frontend/src/styles/style.css` | Modify | CSS-Block für `#neuerKundeModal` am Ende der Datei ergänzen |
| `frontend/src/components/app.js` | Modify | 3 neue Methoden + Anpassungen in `handleNameSuche()`, `updateKundeStatusBadge()`, `bindLazyEventListeners()` |

---

## Task 1: Modal-HTML in index.html einfügen

**Files:**
- Modify: `frontend/index.html` — direkt vor dem `<!-- Termin Vorschau Modal mit Countdown -->` Kommentar (Zeile ~4523)

- [ ] **Schritt 1: Modal-HTML einfügen**

Suche in `frontend/index.html` nach:
```html
    <!-- Termin Vorschau Modal mit Countdown -->
    <div id="terminVorschauModal" class="modal-overlay" style="display: none;">
```

Füge DAVOR ein:
```html
    <!-- Neuer Kunde Modal -->
    <div id="neuerKundeModal" class="modal" style="display: none;">
        <div class="modal-content" style="max-width: 520px;">
            <span class="close" id="closeNeuerKundeModal">&times;</span>
            <h3 style="margin: 0 0 20px 0; color: #1565c0;">👤 Neuen Kunden anlegen</h3>

            <div id="nkFehler" style="display: none; background: #ffebee; color: #c62828; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 0.9em;"></div>

            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
                <div class="form-group" style="margin: 0;">
                    <label style="font-weight: 600;">Nachname *</label>
                    <input type="text" id="nkNachname" placeholder="z.B. Mustermann" autocomplete="off" style="width: 100%; padding: 9px 11px; border: 2px solid #ddd; border-radius: 6px; font-size: 1em; box-sizing: border-box;">
                </div>
                <div class="form-group" style="margin: 0;">
                    <label style="font-weight: 600;">Vorname</label>
                    <input type="text" id="nkVorname" placeholder="z.B. Max" autocomplete="off" style="width: 100%; padding: 9px 11px; border: 2px solid #ddd; border-radius: 6px; font-size: 1em; box-sizing: border-box;">
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 14px;">
                <label style="font-weight: 600;">Telefon (optional)</label>
                <input type="tel" id="nkTelefon" placeholder="z.B. 03573 123456" style="width: 100%; padding: 9px 11px; border: 2px solid #ddd; border-radius: 6px; font-size: 1em; box-sizing: border-box;">
            </div>

            <div class="form-group" style="margin-bottom: 14px;">
                <label style="font-weight: 600;">Kennzeichen *</label>
                <div class="kennzeichen-suche-felder">
                    <input type="text" id="nkKzBezirk" class="kz-feld kz-bezirk" placeholder="OSL" maxlength="3" autocomplete="off">
                    <div class="kz-siegel"></div>
                    <input type="text" id="nkKzBuchstaben" class="kz-feld kz-buchstaben" placeholder="KI" maxlength="2" autocomplete="off">
                    <input type="text" id="nkKzNummer" class="kz-feld kz-nummer" placeholder="123" maxlength="4" autocomplete="off">
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 14px;">
                <label style="font-weight: 600;">Auto Modell</label>
                <input type="text" id="nkFahrzeugtyp" placeholder="z.B. VW Golf 7" style="width: 100%; padding: 9px 11px; border: 2px solid #ddd; border-radius: 6px; font-size: 1em; box-sizing: border-box;">
            </div>

            <div class="form-group" style="margin-bottom: 20px;">
                <label style="font-weight: 600;">Kilometerstand ca.</label>
                <input type="number" id="nkKilometerstand" placeholder="z.B. 85000" min="0" style="width: 100%; padding: 9px 11px; border: 2px solid #ddd; border-radius: 6px; font-size: 1em; box-sizing: border-box;">
            </div>

            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" id="nkAbbrechenBtn" class="btn btn-secondary">Abbrechen</button>
                <button type="button" id="nkSpeichernBtn" class="btn btn-primary">✓ Kunden anlegen</button>
            </div>
        </div>
    </div>

```

- [ ] **Schritt 2: Prüfen**

Öffne `frontend/index.html` und stelle sicher, dass `id="neuerKundeModal"` genau einmal vorkommt. Suche nach `nkNachname` — muss einmal gefunden werden.

- [ ] **Schritt 3: Commit**

```bash
git add frontend/index.html
git commit -m "feat: add neuerKundeModal HTML to index.html"
```

---

## Task 2: CSS für das Modal ergänzen

**Files:**
- Modify: `frontend/src/styles/style.css` — am Ende der Datei

- [ ] **Schritt 1: CSS-Block anhängen**

Füge ans **Ende** von `frontend/src/styles/style.css` an:

```css
/* ===== NEUER KUNDE MODAL ===== */
#neuerKundeModal .modal-content {
  max-width: 520px;
}

#nkSpeichernBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Schritt 2: Commit**

```bash
git add frontend/src/styles/style.css
git commit -m "style: CSS for neuerKundeModal"
```

---

## Task 3: JS — 3 neue Methoden in app.js

**Files:**
- Modify: `frontend/src/components/app.js` — neue Methoden direkt nach `closeFahrzeugVerwaltungModal()` einfügen (Zeile ~3540, nach dem letzten `}` der Methode)

Zum Finden der richtigen Stelle: Suche nach `closeFahrzeugVerwaltungModal()` und dann nach dem Methodenende (der letzten `}` vor `async loadArbeitszeiten()`).

- [ ] **Schritt 1: 3 Methoden einfügen**

Suche in `frontend/src/components/app.js` nach:
```javascript
  // Fahrzeugverwaltung Modal schließen
  closeFahrzeugVerwaltungModal() {
    const modal = document.getElementById('fahrzeugVerwaltungModal');
    modal.style.display = 'none';
    this.fahrzeugVerwaltungKundeId = null;
    this.fahrzeugVerwaltungKundeName = null;
  }

  async loadArbeitszeiten() {
```

Ersetze durch:
```javascript
  // Fahrzeugverwaltung Modal schließen
  closeFahrzeugVerwaltungModal() {
    const modal = document.getElementById('fahrzeugVerwaltungModal');
    modal.style.display = 'none';
    this.fahrzeugVerwaltungKundeId = null;
    this.fahrzeugVerwaltungKundeName = null;
  }

  // ================================================
  // NEUER KUNDE MODAL
  // ================================================

  openNeuerKundeModal() {
    const modal = document.getElementById('neuerKundeModal');
    if (!modal) return;

    // Nachname aus Suchfeld vorausfüllen
    const suchtext = document.getElementById('terminNameSuche')?.value.trim() || '';
    const nkNachname = document.getElementById('nkNachname');
    if (nkNachname) nkNachname.value = suchtext;

    // Fehlermeldung zurücksetzen
    const fehler = document.getElementById('nkFehler');
    if (fehler) fehler.style.display = 'none';

    // Kennzeichen-Felder leeren
    ['nkKzBezirk', 'nkKzBuchstaben', 'nkKzNummer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Andere Felder leeren
    ['nkVorname', 'nkTelefon', 'nkFahrzeugtyp', 'nkKilometerstand'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Kennzeichen aus der KZ-Suche übernehmen falls ausgefüllt
    const bezirk = document.getElementById('kzSucheBezirk')?.value.trim().toUpperCase() || '';
    const buchstaben = document.getElementById('kzSucheBuchstaben')?.value.trim().toUpperCase() || '';
    const nummer = document.getElementById('kzSucheNummer')?.value.trim().toUpperCase() || '';
    if (bezirk) {
      const b = document.getElementById('nkKzBezirk');
      const bu = document.getElementById('nkKzBuchstaben');
      const n = document.getElementById('nkKzNummer');
      if (b) b.value = bezirk;
      if (bu) bu.value = buchstaben;
      if (n) n.value = nummer;
    }

    modal.style.display = 'block';

    // Fokus auf Nachname-Feld (nach kleiner Verzögerung für Display-Übergang)
    setTimeout(() => nkNachname?.focus(), 50);
  }

  closeNeuerKundeModal() {
    const modal = document.getElementById('neuerKundeModal');
    if (modal) modal.style.display = 'none';
  }

  async saveNeuerKunde() {
    const nachname = document.getElementById('nkNachname')?.value.trim() || '';
    const vorname = document.getElementById('nkVorname')?.value.trim() || '';
    const telefon = document.getElementById('nkTelefon')?.value.trim() || '';
    const kzBezirk = document.getElementById('nkKzBezirk')?.value.trim().toUpperCase() || '';
    const kzBuchstaben = document.getElementById('nkKzBuchstaben')?.value.trim().toUpperCase() || '';
    const kzNummer = document.getElementById('nkKzNummer')?.value.trim().toUpperCase() || '';
    const fahrzeugtyp = document.getElementById('nkFahrzeugtyp')?.value.trim() || '';
    const kilometerstand = document.getElementById('nkKilometerstand')?.value.trim() || '';

    const fehlerEl = document.getElementById('nkFehler');

    const zeigeFehlermeldung = (msg) => {
      if (fehlerEl) {
        fehlerEl.textContent = msg;
        fehlerEl.style.display = 'block';
      }
    };

    // Validierung
    if (!nachname) {
      zeigeFehlermeldung('Bitte Nachname eingeben.');
      document.getElementById('nkNachname')?.focus();
      return;
    }
    if (!kzBezirk) {
      zeigeFehlermeldung('Bitte Kennzeichen (Bezirk) eingeben.');
      document.getElementById('nkKzBezirk')?.focus();
      return;
    }

    // Namen zusammensetzen
    const name = vorname ? `${nachname}, ${vorname}` : nachname;

    // Kennzeichen zusammensetzen
    const kennzeichen = [kzBezirk, kzBuchstaben, kzNummer].filter(Boolean).join('-');

    // Button deaktivieren während des Speicherns
    const btn = document.getElementById('nkSpeichernBtn');
    if (btn) btn.disabled = true;
    if (fehlerEl) fehlerEl.style.display = 'none';

    try {
      const created = await KundenService.create({
        name,
        telefon: telefon || null,
        kennzeichen: kennzeichen || null,
        fahrzeugtyp: fahrzeugtyp || null
      });

      const kundeId = created.id;

      // Modal schließen
      this.closeNeuerKundeModal();

      // Terminformular befüllen
      const kundeIdInput = document.getElementById('kunde_id');
      if (kundeIdInput) kundeIdInput.value = kundeId;

      const terminNameSuche = document.getElementById('terminNameSuche');
      if (terminNameSuche) terminNameSuche.value = name;

      const statusBadge = document.getElementById('kundeStatusAnzeige');
      if (statusBadge) {
        statusBadge.textContent = '✓ Kunde angelegt';
        statusBadge.className = 'kunde-status-badge gefunden';
        statusBadge.style.display = 'inline-block';
        // Badge wieder nicht klickbar machen (Kunde ist jetzt ausgewählt)
        statusBadge.style.cursor = 'default';
        statusBadge.onclick = null;
      }

      // Gefundener-Kunde-Box anzeigen
      const gefundenerBox = document.getElementById('gefundenerKundeAnzeige');
      const gefundenerName = document.getElementById('gefundenerKundeName');
      const gefundenerTelefon = document.getElementById('gefundenerKundeTelefon');
      if (gefundenerBox) gefundenerBox.style.display = 'block';
      if (gefundenerName) gefundenerName.textContent = name;
      if (gefundenerTelefon) gefundenerTelefon.textContent = telefon ? `📞 ${telefon}` : '';

      // Felder im Termin befüllen
      const kennzeichenInput = document.getElementById('kennzeichen');
      if (kennzeichenInput && kennzeichen) kennzeichenInput.value = kennzeichen;

      const fahrzeugtypInput = document.getElementById('fahrzeugtyp');
      if (fahrzeugtypInput && fahrzeugtyp) fahrzeugtypInput.value = fahrzeugtyp;

      const kmInput = document.getElementById('kilometerstand');
      if (kmInput && kilometerstand) kmInput.value = kilometerstand;

      // Vorschläge schließen
      this.hideVorschlaege('name');
      this.hideVorschlaege('kennzeichen');

      // Kennzeichen-Pflichtmarkierung zurücksetzen (Kunde ist jetzt gesetzt)
      const kennzeichenField = document.getElementById('kennzeichen');
      const kennzeichenLabel = kennzeichenField?.parentElement?.querySelector('label');
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);

      // Kunden-Cache auffrischen
      this.loadKunden();

    } catch (err) {
      console.error('Fehler beim Anlegen des Kunden:', err);
      zeigeFehlermeldung('Fehler beim Anlegen: ' + (err.message || 'Unbekannter Fehler'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async loadArbeitszeiten() {
```

- [ ] **Schritt 2: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: add openNeuerKundeModal/closeNeuerKundeModal/saveNeuerKunde methods"
```

---

## Task 4: Badge und Dropdown-Button anpassen

**Files:**
- Modify: `frontend/src/components/app.js` — Methode `updateKundeStatusBadge()` (Zeile ~12109) und `handleNameSuche()` (Zeile ~12044)

- [ ] **Schritt 1: Badge in `updateKundeStatusBadge()` klickbar machen**

Suche nach:
```javascript
    } else {
      statusBadge.textContent = '+ Neuer Kunde';
      statusBadge.className = 'kunde-status-badge neuer-kunde';
      statusBadge.style.display = 'inline-block';
      // Kennzeichen ist Pflicht bei Neukunden!
      this.setKennzeichenPflicht(true, kennzeichenField, kennzeichenLabel);
    }
```

Ersetze durch:
```javascript
    } else {
      statusBadge.textContent = '+ Neuer Kunde';
      statusBadge.className = 'kunde-status-badge neuer-kunde';
      statusBadge.style.display = 'inline-block';
      statusBadge.style.cursor = 'pointer';
      statusBadge.title = 'Klicken zum schnellen Anlegen';
      statusBadge.onclick = () => this.openNeuerKundeModal();
      // Kennzeichen ist Pflicht bei Neukunden!
      this.setKennzeichenPflicht(true, kennzeichenField, kennzeichenLabel);
    }
```

- [ ] **Schritt 2: Badge-onclick bei gefundenem Kunden zurücksetzen**

Im selben `updateKundeStatusBadge()`, bei der `if (kundeId)` und `if (exakterTreffer)` Branches, stelle sicher dass `onclick` geleert wird. Suche nach:

```javascript
    if (kundeId) {
      statusBadge.textContent = '✓ Kunde ausgewählt';
      statusBadge.className = 'kunde-status-badge gefunden';
      statusBadge.style.display = 'inline-block';
      // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
      return;
    }
```

Ersetze durch:
```javascript
    if (kundeId) {
      statusBadge.textContent = '✓ Kunde ausgewählt';
      statusBadge.className = 'kunde-status-badge gefunden';
      statusBadge.style.display = 'inline-block';
      statusBadge.style.cursor = 'default';
      statusBadge.onclick = null;
      // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
      return;
    }
```

Und suche nach:
```javascript
    if (exakterTreffer) {
      statusBadge.textContent = '✓ Bekannter Kunde';
      statusBadge.className = 'kunde-status-badge gefunden';
      statusBadge.style.display = 'inline-block';
      // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
    } else {
```

Ersetze durch:
```javascript
    if (exakterTreffer) {
      statusBadge.textContent = '✓ Bekannter Kunde';
      statusBadge.className = 'kunde-status-badge gefunden';
      statusBadge.style.display = 'inline-block';
      statusBadge.style.cursor = 'default';
      statusBadge.onclick = null;
      // Kennzeichen ist nicht mehr Pflicht bei existierendem Kunden
      this.setKennzeichenPflicht(false, kennzeichenField, kennzeichenLabel);
    } else {
```

- [ ] **Schritt 3: "Jetzt anlegen"-Button in `handleNameSuche()` ergänzen**

Suche nach:
```javascript
    if (treffer.length === 0) {
      vorschlaegeDiv.innerHTML = '<div class="keine-vorschlaege">Kein Kunde gefunden - wird als neuer Kunde angelegt</div>';
      vorschlaegeDiv.classList.add('aktiv');
      return;
    }
```

Ersetze durch:
```javascript
    if (treffer.length === 0) {
      vorschlaegeDiv.innerHTML = `<div class="keine-vorschlaege" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <span>Kein Kunde gefunden</span>
        <button type="button" class="btn btn-primary" style="padding:4px 12px;font-size:0.85em;white-space:nowrap;" onmousedown="event.preventDefault()" onclick="app.openNeuerKundeModal()">➕ Jetzt anlegen</button>
      </div>`;
      vorschlaegeDiv.classList.add('aktiv');
      return;
    }
```

- [ ] **Schritt 4: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: neuerKundeModal trigger via badge click and dropdown button"
```

---

## Task 5: Event-Listener für Modal-Buttons registrieren

**Files:**
- Modify: `frontend/src/components/app.js` — Methode `bindLazyEventListeners()` (~Zeile 1100)

- [ ] **Schritt 1: Listener für Close- und Speichern-Button eintragen**

Suche nach:
```javascript
    const closeFahrzeugAuswahl = document.getElementById('closeFahrzeugAuswahl');
    this.bindEventListenerOnce(closeFahrzeugAuswahl, 'click', () => this.closeFahrzeugAuswahlModal(), 'CloseFahrzeugAuswahl');
```

Füge DAVOR ein:
```javascript
    const closeNeuerKundeModal = document.getElementById('closeNeuerKundeModal');
    this.bindEventListenerOnce(closeNeuerKundeModal, 'click', () => this.closeNeuerKundeModal(), 'CloseNeuerKundeModal');
    const nkAbbrechenBtn = document.getElementById('nkAbbrechenBtn');
    this.bindEventListenerOnce(nkAbbrechenBtn, 'click', () => this.closeNeuerKundeModal(), 'NkAbbrechen');
    const nkSpeichernBtn = document.getElementById('nkSpeichernBtn');
    this.bindEventListenerOnce(nkSpeichernBtn, 'click', () => this.saveNeuerKunde(), 'NkSpeichern');

    const neuerKundeModal = document.getElementById('neuerKundeModal');
    this.bindEventListenerOnce(neuerKundeModal, 'click', (e) => {
      if (e.target === neuerKundeModal) this.closeNeuerKundeModal();
    }, 'NeuerKundeModalBackdrop');

    // Kennzeichen-Auto-Advance im Neuer-Kunde-Modal
    const nkKzBezirk = document.getElementById('nkKzBezirk');
    this.bindEventListenerOnce(nkKzBezirk, 'input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      if (e.target.value.length >= 3) document.getElementById('nkKzBuchstaben')?.focus();
    }, 'NkKzBezirkInput');
    const nkKzBuchstaben = document.getElementById('nkKzBuchstaben');
    this.bindEventListenerOnce(nkKzBuchstaben, 'input', (e) => {
      e.target.value = e.target.value.toUpperCase();
      if (e.target.value.length >= 2) document.getElementById('nkKzNummer')?.focus();
    }, 'NkKzBuchstabenInput');
    const nkKzNummer = document.getElementById('nkKzNummer');
    this.bindEventListenerOnce(nkKzNummer, 'input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    }, 'NkKzNummerInput');

```

- [ ] **Schritt 2: ESC-Taste zum Schließen im window-click-Handler ergänzen**

Suche nach:
```javascript
    window.addEventListener('click', (event) => {
      const modal = document.getElementById('modal');
```

In diesem Block vor dem letzten `});` suche nach dem letzten `if (event.target === erweiterungModal)` Block und stelle sicher, dass der `neuerKundeModal` dort NICHT erscheint — der Backdrop-Click wird bereits in `bindLazyEventListeners` behandelt. Keine weitere Änderung nötig.

- [ ] **Schritt 3: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: register event listeners for neuerKundeModal"
```

---

## Task 6: Build und manueller Test

**Files:**
- Keine Code-Änderungen

- [ ] **Schritt 1: Frontend bauen**

```bash
cd frontend
npm run build
```

Erwartete Ausgabe: `✓ built in X.XXs` ohne Fehler. Notiere die neuen Dateinamen unter `frontend/dist/assets/main-*.{js,css}`.

- [ ] **Schritt 2: Manuller Test — Happy Path**

1. Backend starten: `cd backend && npm start`
2. Browser öffnen: `http://localhost:3001` (oder Electron)
3. Tab "Termine" → Sub-Tab "Neuer Termin"
4. Im Feld "Kundenname suchen" einen **unbekannten Namen** eingeben (z.B. "Tester12345")
5. Prüfen:
   - Badge `+ Neuer Kunde` erscheint rechts im Suchfeld
   - Dropdown zeigt `"Kein Kunde gefunden"` + Button `"➕ Jetzt anlegen"`
6. **Auf den Button klicken** → Modal öffnet sich, Nachname ist vorausgefüllt
7. Felder ausfüllen: Vorname "Max", Kennzeichen "OSL-KI-1", Modell "Golf 7", KM 50000
8. "✓ Kunden anlegen" klicken
9. Prüfen:
   - Modal schließt sich
   - Badge zeigt `✓ Kunde angelegt` (grün)
   - Grüne Kunden-Box erscheint
   - Kennzeichen-Feld im Termin zeigt `OSL-KI-1`
   - Fahrzeugtyp-Feld zeigt `Golf 7`
   - KM-Stand zeigt `50000`

- [ ] **Schritt 3: Test — Badge-Klick**

1. Suchfeld leeren, neuen Namen eingeben
2. Auf den `+ Neuer Kunde`-Badge klicken (rechts im Suchfeld)
3. Modal muss sich öffnen

- [ ] **Schritt 4: Test — Validierung**

1. Modal öffnen, Nachname leer lassen, "Kunden anlegen" klicken
2. Fehlermeldung muss erscheinen: `"Bitte Nachname eingeben."`
3. Nachname eingeben, Kennzeichen leer lassen, speichern
4. Fehlermeldung muss erscheinen: `"Bitte Kennzeichen (Bezirk) eingeben."`

- [ ] **Schritt 5: Test — Abbrechen**

1. Modal öffnen
2. "Abbrechen" klicken → Modal schließt sich, Terminformular unverändert
3. Außerhalb des Modals klicken → Modal schließt sich

- [ ] **Schritt 6: Commit nach erfolgreichem Test**

```bash
cd ..
git add frontend/dist/assets/main-*.js frontend/dist/assets/main-*.css frontend/dist/index.html
git commit -m "build: neuer-kunde-popup feature"
```

---

## Task 7: Deploy auf Produktivserver

**Files:**
- Keine Code-Änderungen

- [ ] **Schritt 1: DB-Backup**

```powershell
ssh root@100.124.168.108 "mkdir -p /var/lib/werkstatt-terminplaner/backups && cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-neuer-kunde-popup_$(date +%Y%m%d_%H%M%S).db && echo 'BACKUP OK'"
```

- [ ] **Schritt 2: Neue Build-Dateien hochladen**

Ersetze `XXXXXXXX` durch die tatsächlichen Hashes aus dem Build in Task 6:

```powershell
scp "frontend\dist\assets\main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\assets\main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/
```

- [ ] **Schritt 3: Git push + Server-Neustart**

```powershell
git push
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git pull && systemctl restart werkstatt-terminplaner && sleep 2 && systemctl is-active werkstatt-terminplaner"
```

Erwartete Ausgabe: `active`

- [ ] **Schritt 4: Smoke-Test auf Produktivserver**

Browser auf `http://100.124.168.108:3001` öffnen (oder Tailscale-IP), Schritt 2-4 aus Task 6 wiederholen. Prüfen dass keine JS-Konsolenfehler erscheinen.
