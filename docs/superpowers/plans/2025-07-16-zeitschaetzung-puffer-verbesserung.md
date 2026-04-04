# Zeitschätzung + Puffer-ML Verbesserung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Historische `tatsaechliche_zeit`-Daten aus abgeschlossenen Terminen als KI-Zeitvorschlag für unbekannte Arbeiten nutzen + Puffer-ML auf Basis echter Zeiten (nicht Schätzungs-Differenz) fixen.

**Architecture:** Backend-Service `localAiService.js` besitzt bereits `trainZeitModel()` das `byArbeit[key].avgMinutes` pro normalisierter Arbeitsbezeichnung aufbaut. Es fehlt: (1) ein Lookup-Endpunkt der diesen Cache nutzt, (2) ein Fix für `trainPufferModel()` dessen Berechnungsgrundlage strukturell kaputt ist, (3) Frontend-Verdrahtung die das Ergebnis in `geschaetzte_zeit` einspeist.

**Tech Stack:** Node.js/Express (CommonJS), SQLite (`allAsync`), Vite Frontend (HTML/JS), `/api/ai/*` Routen — kein Auth nötig (bereits ohne `requireAuth` gemountet).

---

## Dateien-Map

| Aktion | Datei | Verantwortung |
|--------|-------|---------------|
| Modify | `backend/src/services/localAiService.js` | Fix `trainPufferModel()` + neues `getZeitVorschlag(arbeit)` |
| Modify | `backend/src/controllers/aiController.js` | Neuer `getZeitVorschlag` Controller |
| Modify | `backend/src/routes/aiRoutes.js` | Route `GET /zeit-vorschlag` registrieren |
| Modify | `frontend/src/services/api.js` | `AIService.getZeitVorschlag(arbeit)` hinzufügen |
| Modify | `frontend/index.html` | 2× hidden input `geschaetzte_zeit_auto` (Neu-Form + Edit-Modal) |
| Modify | `frontend/src/components/app.js` | `updateZeitschaetzung()` + `updateEditZeitschaetzung()` + `getGeschaetzteZeit()` |

---

## Task 1: Fix `trainPufferModel()` in localAiService.js

**Kernproblem:** Derzeit berechnet `trainPufferModel()` `ueberzug = tatsaechliche_zeit - geschaetzte_zeit`, aber `geschaetzte_zeit` ist immer 30 (Default, kein User-Eingabefeld). Alle Deltas sind Ausreißer → IQR filtert alles → `byKategorie = {}` → `ki-lern-statistiken` meldet 0 Datenpunkte.

**Fix:** Gruppiere `tatsaechliche_zeit` direkt pro Kategorie, berechne Median und p80. Puffer = `p80 - median` (wie viel über typische Dauer 80% der Jobs läuft).

**Datei:** `backend/src/services/localAiService.js`

- [ ] **Schritt 1.1: SQL-Query in `trainPufferModel()` anpassen — `geschaetzte_zeit`-Bedingung entfernen**

Suche die Funktion `trainPufferModel()` (ca. L621). Ersetze den gesamten Funktionsinhalt:

```js
async function trainPufferModel() {
  try {
    const rows = await allAsync(`
      SELECT arbeit, tatsaechliche_zeit
      FROM termine
      WHERE status = 'abgeschlossen'
        AND tatsaechliche_zeit > 0
        AND geloescht_am IS NULL
        AND (ki_training_exclude IS NULL OR ki_training_exclude = 0)
    `);

    // Tatsächliche Zeiten pro Kategorie sammeln
    const rawByKat = {};
    rows.forEach(row => {
      const kat = kategorisiereArbeit(row.arbeit);
      if (!rawByKat[kat]) rawByKat[kat] = [];
      rawByKat[kat].push(row.tatsaechliche_zeit);
    });

    const byKategorie = {};
    Object.entries(rawByKat).forEach(([kat, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      if (sorted.length < 3) {
        byKategorie[kat] = 0;
        return;
      }
      const median = sorted[Math.floor(sorted.length * 0.5)];
      const p80 = sorted[Math.floor(sorted.length * 0.8)];
      byKategorie[kat] = Math.max(0, Math.round(p80 - median));
    });

    pufferModelCache = { trainedAt: Date.now(), byKategorie };
    console.log('[Puffer-ML] Training abgeschlossen:', byKategorie);
  } catch (err) {
    console.warn('[Puffer-ML] Training fehlgeschlagen:', err.message);
  }
}
```

- [ ] **Schritt 1.2: Manuell testen — Training auslösen und Statistiken prüfen**

```bash
# Backend neustarten (lokal)
cd backend && npm start
# Dann im Browser oder via curl:
curl http://localhost:3001/api/ai/ki-lern-statistiken
```

Erwartet: JSON mit `puffer_kategorien` > 0 (z.B. `{ "Inspektion": 8, "Bremsen": 12, ... }`).
Falls Statistik-Endpoint noch `puffer_kategorien` nicht zeigt, ist das OK — der Fix wird mit Task 3 verifiziert.

- [ ] **Schritt 1.3: Commit**

```bash
git add backend/src/services/localAiService.js
git commit -m "Fix: Puffer-ML trainiert von tatsaechliche_zeit statt Schätzungs-Differenz"
```

---

## Task 2: `getZeitVorschlag()` in localAiService.js hinzufügen

Füge nach `getPufferEmpfehlung()` (ca. L682) die neue Funktion ein. Sie nutzt den bereits vorhandenen `zeitModelCache.byArbeit` über `getZeitModel()`.

**Datei:** `backend/src/services/localAiService.js`

- [ ] **Schritt 2.1: Funktion `getZeitVorschlag` nach `getPufferEmpfehlung` einfügen**

Füge nach der schließenden `}` von `getPufferEmpfehlung()` ein:

```js
/**
 * Gibt KI-Zeitvorschlag für eine Arbeit zurück.
 * Sucht zuerst im gelernten Modell (byArbeit), dann Kategorie-Fallback.
 * @param {string} arbeit - Arbeitsbezeichnung (frei)
 * @returns {Promise<{minuten: number, basis: string, n: number}|null>}
 */
async function getZeitVorschlag(arbeit) {
  if (!arbeit || !arbeit.trim()) return null;
  const model = await getZeitModel(); // stellt sicher dass Cache geladen ist

  // 1. Exakter Treffer im gelernten Modell
  const key = normalizeText(arbeit);
  if (model.byArbeit[key]) {
    const { avgMinutes, samples } = model.byArbeit[key];
    return { minuten: Math.round(avgMinutes), basis: 'historisch', n: samples };
  }

  // 2. Token-Overlap über alle bekannten Arbeiten
  const tokens = new Set(tokenize(key));
  let bestMatch = null;
  let bestScore = 0;
  Object.entries(model.byArbeit).forEach(([k, v]) => {
    const ktokens = tokenize(k);
    let overlap = 0;
    ktokens.forEach(t => { if (tokens.has(t)) overlap++; });
    const score = ktokens.length > 0
      ? overlap / Math.max(ktokens.length, tokens.size)
      : 0;
    if (score > 0.5 && score > bestScore) {
      bestScore = score;
      bestMatch = v;
    }
  });
  if (bestMatch) {
    return { minuten: Math.round(bestMatch.avgMinutes), basis: 'historisch_ähnlich', n: bestMatch.samples };
  }

  // 3. Kategorie-Fallback
  const kat = kategorisiereArbeit(arbeit);
  const katDefaults = {
    Inspektion: 90, Bremsen: 90, Motor: 120, Elektrik: 60,
    Klima: 45, Reifen: 30, Karosserie: 120, Sonstiges: 60
  };
  if (katDefaults[kat]) {
    return { minuten: katDefaults[kat], basis: 'kategorie', n: 0 };
  }
  return null;
}
```

- [ ] **Schritt 2.2: Export hinzufügen**

Suche `module.exports` am Ende der Datei (ca. L798). Füge `getZeitVorschlag` zur Export-Liste hinzu:

```js
module.exports = {
  // ... bestehende Exports ...
  getZeitVorschlag,
  // ... Rest der bestehenden Exports ...
};
```

- [ ] **Schritt 2.3: Commit**

```bash
git add backend/src/services/localAiService.js
git commit -m "feat: getZeitVorschlag Service-Funktion für historische Zeitvorschläge"
```

---

## Task 3: Controller + Route für `/api/ai/zeit-vorschlag`

**Datei:** `backend/src/controllers/aiController.js` + `backend/src/routes/aiRoutes.js`

Note: `/ai`-Routen sind in `index.js` ohne `requireAuth` gemountet — kein Auth-Fix nötig.

- [ ] **Schritt 3.1: `getZeitVorschlag` Controller in `aiController.js` hinzufügen**

Suche `getPufferEmpfehlung` (ca. L1442) und füge **direkt davor** ein:

```js
async getZeitVorschlag(req, res) {
  try {
    const arbeit = (req.query.arbeit || '').trim();
    if (!arbeit) {
      return res.status(400).json({ error: 'Parameter "arbeit" fehlt' });
    }
    const ergebnis = await localAiService.getZeitVorschlag(arbeit);
    if (!ergebnis) {
      return res.json({ minuten: null, basis: 'unbekannt', n: 0 });
    }
    res.json(ergebnis);
  } catch (err) {
    console.error('[AI] getZeitVorschlag Fehler:', err.message);
    res.status(500).json({ error: 'Interner Fehler' });
  }
},
```

- [ ] **Schritt 3.2: `getZeitVorschlag` im Controller-Exports ergänzen**

Suche `module.exports` am Ende von `aiController.js` und füge `getZeitVorschlag` hinzu:

```js
module.exports = {
  // ... bestehende Exports ...
  getZeitVorschlag,
  // ...
};
```

- [ ] **Schritt 3.3: Route in `aiRoutes.js` registrieren**

Suche `router.get('/puffer-empfehlung', ...)` in `aiRoutes.js` (ca. L201) und füge **direkt davor** ein:

```js
router.get('/zeit-vorschlag', aiController.getZeitVorschlag);
```

- [ ] **Schritt 3.4: Backend starten und Endpunkt manuell testen**

```bash
cd backend && npm start
# In neuem Terminal:
curl "http://localhost:3001/api/ai/zeit-vorschlag?arbeit=%C3%96lwechsel"
```

Erwartete Antwort (Inhalt variiert je nach vorhandenem Training):
```json
{"minuten": 45, "basis": "historisch", "n": 12}
```
oder bei keinem Training:
```json
{"minuten": 90, "basis": "kategorie", "n": 0}
```

```bash
curl "http://localhost:3001/api/ai/zeit-vorschlag?arbeit=Bremsen+vorne"
# Erwartet: {"minuten": ..., "basis": "...", "n": ...}

curl "http://localhost:3001/api/ai/zeit-vorschlag"
# Erwartet: 400 {"error": "Parameter \"arbeit\" fehlt"}
```

- [ ] **Schritt 3.5: Commit**

```bash
git add backend/src/controllers/aiController.js backend/src/routes/aiRoutes.js
git commit -m "feat: GET /api/ai/zeit-vorschlag Endpunkt für historische Zeitvorschläge"
```

---

## Task 4: Frontend — API-Methode + Hidden Inputs in HTML

**Dateien:** `frontend/src/services/api.js` + `frontend/index.html`

- [ ] **Schritt 4.1: `getZeitVorschlag` zu `AIService` in `api.js` hinzufügen**

Suche `static async getPufferEmpfehlung(arbeit)` (ca. L980 in `api.js`) und füge **direkt danach** ein:

```js
static async getZeitVorschlag(arbeit) {
  return ApiService.get(`/ai/zeit-vorschlag?arbeit=${encodeURIComponent(arbeit)}`);
}
```

- [ ] **Schritt 4.2: Hidden Input für Neu-Termin-Formular in `index.html` hinzufügen**

Suche in `frontend/index.html` den Block `</div>` der `zeitschaetzungAnzeige`-Div (ca. L644). Füge direkt **nach** dem schließenden `</div>` und **vor** dem nächsten `<div>`-Block ein:

```html
<input type="hidden" id="geschaetzte_zeit_auto" value="0">
```

Der Kontext sieht so aus:
```html
                            <!-- Geschätzte Zeit Anzeige -->
                            <div id="zeitschaetzungAnzeige" style="...">
                                ...
                                <div id="zeitschaetzungDetails" ...></div>
                            </div>
                            <input type="hidden" id="geschaetzte_zeit_auto" value="0">
                        </div>
```

- [ ] **Schritt 4.3: Hidden Input für Edit-Modal in `index.html` hinzufügen**

Suche `id="editZeitschaetzungAnzeige"` (ca. L936). Füge direkt **nach** dem schließenden `</div>` der `editZeitschaetzungAnzeige` ein:

```html
<input type="hidden" id="edit_geschaetzte_zeit_auto" value="0">
```

Der Kontext sieht so aus:
```html
                                    <div id="editZeitschaetzungAnzeige" style="...">
                                        ...
                                        <div id="editZeitschaetzungDetails" ...></div>
                                    </div>
                                    <input type="hidden" id="edit_geschaetzte_zeit_auto" value="0">
```

- [ ] **Schritt 4.4: Commit**

```bash
git add frontend/src/services/api.js frontend/index.html
git commit -m "feat: AIService.getZeitVorschlag + hidden inputs für KI-Zeitvorschlag in Forms"
```

---

## Task 5: Frontend — app.js Verdrahtung

**Datei:** `frontend/src/components/app.js`

Drei Stellen werden geändert:
1. `updateZeitschaetzung()` (ca. L4072) — KI-Abruf für ⚠️-Arbeiten + hidden input befüllen
2. `updateEditZeitschaetzung()` (ca. L2453) — dasselbe für Edit-Modal
3. `getGeschaetzteZeit()` (ca. L16860) — liest hidden input als Fallback vor dem 30er-Default

- [ ] **Schritt 5.1: `updateZeitschaetzung()` — KI-Abruf nach dem `forEach` einfügen**

Suche in `app.js` den Block direkt **nach** dem `forEach`-Loop mit `nichtGefunden.push(arbeit)` (Ende des forEach, ca. L4132) und **vor** dem bestehenden `// 🧠 Puffer-ML`-Block.

Füge folgenden Block zwischen `}); // Ende forEach` und `// 🧠 Puffer-ML` ein:

```js
    // 📊 KI-Zeitvorschlag für unbekannte Arbeiten (historische Daten)
    if (nichtGefunden.length > 0) {
      try {
        const kiErgebnisse = await Promise.allSettled(
          nichtGefunden.map(a => window.AIService.getZeitVorschlag(a))
        );
        kiErgebnisse.forEach((result, i) => {
          const arbeit = nichtGefunden[i];
          if (result.status === 'fulfilled' && result.value?.minuten) {
            const { minuten, basis, n } = result.value;
            gesamtMinuten += minuten;
            const std = Math.floor(minuten / 60);
            const min = minuten % 60;
            const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
            const quellLabel = basis === 'historisch' ? `aus ${n} Terminen`
              : basis === 'historisch_ähnlich' ? `ähnliche Arbeit`
              : `Kategorie-Schätzung`;
            const idx = details.findIndex(d => d.startsWith(`⚠️ ${arbeit}:`));
            if (idx !== -1) {
              details[idx] = `📊 ${arbeit}: <strong>${zeitStr}</strong> <small style="color:#888">(${quellLabel})</small>`;
            }
          }
        });
      } catch (e) { /* KI-Zeitvorschlag nicht kritisch */ }
    }
```

- [ ] **Schritt 5.2: `updateZeitschaetzung()` — hidden input am Ende befüllen**

Suche den Block am Ende von `updateZeitschaetzung()` — direkt **nach** dem Färben der `zeitschaetzungWert.style.color` (ca. L4188) und **vor** der schließenden `}`. Füge ein:

```js
    // Hidden input für geschaetzte_zeit befüllen (wird beim Submit gelesen)
    const autoZeitInput = document.getElementById('geschaetzte_zeit_auto');
    if (autoZeitInput) autoZeitInput.value = String(gesamtMitPuffer > 0 ? gesamtMitPuffer : 0);
```

- [ ] **Schritt 5.3: `updateEditZeitschaetzung()` — KI-Abruf + hidden input**

Suche in `updateEditZeitschaetzung()` (ca. L2453) den Block nach dem `forEach`-Loop und **vor** `// 🧠 Puffer-ML`.

Füge denselben KI-Block ein (mit `edit_`-Varianten):

```js
    // 📊 KI-Zeitvorschlag für unbekannte Arbeiten (historische Daten)
    const nichtGefundenEdit = arbeiten.filter((_, i) => details[i]?.startsWith('⚠️'));
    if (nichtGefundenEdit.length > 0) {
      try {
        const kiErgebnisse = await Promise.allSettled(
          nichtGefundenEdit.map(a => window.AIService.getZeitVorschlag(a))
        );
        kiErgebnisse.forEach((result, i) => {
          const arbeit = nichtGefundenEdit[i];
          if (result.status === 'fulfilled' && result.value?.minuten) {
            const { minuten, basis, n } = result.value;
            gesamtMinuten += minuten;
            const std = Math.floor(minuten / 60);
            const min = minuten % 60;
            const zeitStr = std > 0 ? `${std} h${min > 0 ? ` ${min} min` : ''}` : `${min} min`;
            const quellLabel = basis === 'historisch' ? `aus ${n} Terminen`
              : basis === 'historisch_ähnlich' ? `ähnliche Arbeit`
              : `Kategorie-Schätzung`;
            const idx = details.findIndex(d => d.startsWith(`⚠️ ${arbeit}:`));
            if (idx !== -1) {
              details[idx] = `📊 ${arbeit}: ${minuten} min <small style="color:#888">(${quellLabel})</small>`;
            }
          }
        });
      } catch (e) { /* KI-Zeitvorschlag nicht kritisch */ }
    }
```

Füge direkt **vor** der schließenden `}` von `updateEditZeitschaetzung()` ein:

```js
    // Hidden input für geschaetzte_zeit befüllen (wird beim Edit-Submit gelesen)
    const editAutoZeitInput = document.getElementById('edit_geschaetzte_zeit_auto');
    if (editAutoZeitInput) editAutoZeitInput.value = String(gesamtMitPuffer > 0 ? gesamtMitPuffer : 0);
```

Beachte: In `updateEditZeitschaetzung()` wird `gesamtMitPuffer` analog zu `updateZeitschaetzung()` berechnet — prüfe ob die Variable dort schon vorhanden ist oder noch hinzugefügt werden muss (aktuell heißt sie nur `gesamtMitPuffer`).

- [ ] **Schritt 5.4: `getGeschaetzteZeit()` — hidden inputs als Fallback einbauen**

Suche `getGeschaetzteZeit(arbeitenListe)` (ca. L16860). Ersetze den Funktionskörper folgendermaßen (nach dem bestehenden `zeitFeld`-Check und **vor** dem `forEach`-Loop):

```js
  getGeschaetzteZeit(arbeitenListe) {
    const zeitFeld = document.getElementById('geschaetzte_zeit');
    const input = zeitFeld ? zeitFeld.value : null;
    const inputMinuten = input ? parseInt(input, 10) : null;
    if (Number.isFinite(inputMinuten) && inputMinuten > 0) {
      return inputMinuten;
    }

    // KI-Vorschlag aus Zeitschätzungs-Anzeige (Neu-Formular)
    const autoFeld = document.getElementById('geschaetzte_zeit_auto');
    if (autoFeld) {
      const autoMinuten = parseInt(autoFeld.value, 10);
      if (Number.isFinite(autoMinuten) && autoMinuten > 0) {
        return autoMinuten;
      }
    }

    // KI-Vorschlag aus Zeitschätzungs-Anzeige (Edit-Modal)
    const editAutoFeld = document.getElementById('edit_geschaetzte_zeit_auto');
    if (editAutoFeld) {
      const editAutoMinuten = parseInt(editAutoFeld.value, 10);
      if (Number.isFinite(editAutoMinuten) && editAutoMinuten > 0) {
        return editAutoMinuten;
      }
    }

    let summe = 0;
    arbeitenListe.forEach(arbeit => {
      const matchZeit = this.findArbeitszeit(arbeit);
      if (Number.isFinite(matchZeit)) {
        summe += matchZeit;
      } else {
        summe += 30;
      }
    });

    return summe > 0 ? summe : 30;
  }
```

- [ ] **Schritt 5.5: Frontend bauen und manuell testen**

```bash
cd frontend && npm run build && cd ..
```

Manueller Test:
1. Neuen Termin öffnen
2. Im Arbeiten-Feld eine unbekannte Arbeit eingeben (z.B. "Auspuff tauschen")
3. Nach ~1s: ⚠️-Zeile sollte durch `📊 Auspuff tauschen: 65 min (aus 8 Terminen)` ersetzt werden
4. Termin speichern → in DB prüfen: `geschaetzte_zeit` ≠ 30 (sollte die KI-Zeit zeigen)

```bash
# DB-Check nach dem Speichern:
sqlite3 backend/database/werkstatt.db "SELECT arbeit, geschaetzte_zeit, tatsaechliche_zeit FROM termine ORDER BY id DESC LIMIT 3;"
```

- [ ] **Schritt 5.6: Commit**

```bash
git add frontend/src/components/app.js
git commit -m "feat: KI-Zeitvorschlag aus Verlauf für unbekannte Arbeiten in Terminformular"
```

---

## Task 6: Deploy auf Produktivserver

- [ ] **Schritt 6.1: Frontend-Build erstellen und pushen**

```powershell
cd frontend ; npm run build ; cd ..
git add -A
git commit -m "feat: Zeitschätzung + Puffer-ML Verbesserung — Deploy"
git push
```

- [ ] **Schritt 6.2: Dateinamen für scp aus Build ermitteln**

```powershell
Get-ChildItem frontend\dist\assets\main-*.js | Select-Object Name
Get-ChildItem frontend\dist\assets\main-*.css | Select-Object Name
```

Notiere die exakten Hash-Dateinamen (z.B. `main-A1B2C3D4.js`).

- [ ] **Schritt 6.3: DB-Backup auf Server**

```powershell
ssh root@100.124.168.108 "cp /var/lib/werkstatt-terminplaner/database/werkstatt.db /var/lib/werkstatt-terminplaner/backups/pre-zeitki_$(date +%Y%m%d_%H%M%S).db && echo 'BACKUP OK'"
```

- [ ] **Schritt 6.4: Frontend-Dateien hochladen (Dateinamen anpassen!)**

```powershell
scp "frontend\dist\assets\main-XXXXXXXX.js" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\assets\main-XXXXXXXX.css" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/assets/
scp "frontend\dist\index.html" root@100.124.168.108:/opt/werkstatt-terminplaner/frontend/dist/
```

- [ ] **Schritt 6.5: Backend auf Server aktualisieren**

```powershell
ssh root@100.124.168.108 "cd /opt/werkstatt-terminplaner && git stash && git pull && systemctl restart werkstatt-terminplaner && echo 'DEPLOY OK'"
```

- [ ] **Schritt 6.6: Endpunkt auf Produktivserver testen**

```powershell
ssh root@100.124.168.108 "curl -s 'http://localhost:3001/api/ai/zeit-vorschlag?arbeit=%C3%96lwechsel'"
# Erwartet: {"minuten": ..., "basis": "...", "n": ...}

ssh root@100.124.168.108 "curl -s 'http://localhost:3001/api/ai/ki-lern-statistiken' | python3 -m json.tool"
# Prüfen: puffer_kategorien enthält jetzt Einträge (nicht leer)
```

- [ ] **Schritt 6.7: App im Browser prüfen**

1. Werkstatt-App öffnen (Strg+Shift+R für Hard-Reload)
2. Neuer Termin → Arbeiten-Feld: "Bremsen vorne" eingeben → ✓ mit Standardzeit
3. Darunter: "Irgendwas Unbekanntes" → nach ~1s muss `📊`-Symbol erscheinen
4. Termin speichern + direkt öffnen → `geschaetzte_zeit` ≠ 30 in der Detailansicht

---

## Appendix: Wo was liegt

| Symbol | Bedeutung |
|--------|-----------|
| ✓ | Aus lokalem `arbeitszeiten`-Table, bekannte Standardzeit |
| ⚠️ | Nicht in `arbeitszeiten` gefunden — wird durch KI-Abruf ersetzt |
| 📊 | KI-Zeitvorschlag aus historischen Terminen |

| `basis`-Wert | Bedeutung |
|-------------|-----------|
| `historisch` | Exakter Treffer im gelernten Modell (`avgMinutes` aus `tatsaechliche_zeit`) |
| `historisch_ähnlich` | Token-Overlap > 50% mit bekannter Arbeit |
| `kategorie` | Keine historischen Daten, Kategorie-Fallback (Bremsen=90 min, etc.) |
