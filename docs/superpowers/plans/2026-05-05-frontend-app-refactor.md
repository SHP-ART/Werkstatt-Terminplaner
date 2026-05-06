# Frontend App Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the maintenance risk in `frontend/src/components/app.js` by extracting stable shared utilities and high-change feature areas into focused modules without changing user-visible behavior.

**Architecture:** Keep `App` as the compatibility facade because existing inline handlers call `window.app.*`. New modules export plain functions or installer functions that receive the `app` instance, so behavior can be moved incrementally while preserving current public method names. Refactor in small slices: first pure helpers, then low-risk UI utilities, then feature modules for Auslastung, Termine, Planung, and Drag-and-drop.

**Tech Stack:** Plain JavaScript ES modules, Vite, Electron frontend, existing global `window.app`, existing backend `ApiService`.

---

## Current Risk Map

- `frontend/src/components/app.js`: about 38,752 lines. It owns initialization, UI rendering, event binding, date formatting, notifications, planning, drag-and-drop, time tracking, settings, backups, AI UI, tablet UI, and search.
- `frontend/src/services/api.js`: about 1,296 lines. It is already a useful API boundary and should remain the main backend access layer.
- `frontend/src/styles/style.css`: about 17,016 lines. This is a second large risk area, but do not split CSS in the first pass unless a moved feature requires a local style adjustment.
- Highest-risk functional clusters from `code-review-graph`: `frontend/src/components/app.js::App.showToast`, `bindEventListenerOnce`, `loadAuslastung*`, `setupTimeline*`, `handleTerminSubmit`, `showTerminDetails`, and drag/drop methods near the lower half of the file.

## Target File Structure

Create:

```text
frontend/src/shared/formatters.js
frontend/src/shared/dom.js
frontend/src/shared/notifications.js
frontend/src/features/auslastung/auslastungFeature.js
frontend/src/features/termine/terminDetailsFeature.js
frontend/src/features/termine/terminFormFeature.js
frontend/src/features/planung/planungFeature.js
frontend/src/features/planung/dragDropFeature.js
frontend/src/features/realtime/realtimeFeature.js
frontend/src/features/serverInfo/serverInfoFeature.js
frontend/tests/shared/formatters.test.js
frontend/tests/shared/dom.test.js
frontend/tests/shared/notifications.test.js
```

Modify:

```text
frontend/src/components/app.js
frontend/src/main.js
frontend/package.json
```

Do not modify backend files in this refactor.

## Refactoring Rules

- Preserve `window.app` and existing method names until the end. Existing inline `onclick="app.showTerminDetails(...)"` calls must keep working.
- Move behavior in vertical slices. After each slice, run tests and do one browser smoke test.
- Prefer exported pure functions for shared helpers.
- For feature modules, use installer functions:

```javascript
export function installAuslastungFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async loadAuslastung() {
      // moved unchanged from app.js
    }
  });
}
```

- In `app.js`, import installers before `window.app` is created, then call them once:

```javascript
import { installAuslastungFeature } from '../features/auslastung/auslastungFeature.js';

installAuslastungFeature(App);
```

This keeps the public `App` instance shape stable while code moves out of the monolith.

---

### Task 1: Add Frontend Test Harness

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/tests/shared/formatters.test.js`

- [ ] **Step 1: Add Vitest and jsdom to frontend dev dependencies**

Run:

```bash
cd frontend
npm install --save-dev vitest jsdom
```

Expected: `frontend/package.json` and `frontend/package-lock.json` update.

- [ ] **Step 2: Add test scripts**

Modify `frontend/package.json` scripts to include:

```json
{
  "test": "vitest run --environment jsdom",
  "test:watch": "vitest --environment jsdom"
}
```

Keep existing scripts unchanged.

- [ ] **Step 3: Add a first failing test file**

Create `frontend/tests/shared/formatters.test.js`:

```javascript
import { describe, expect, it } from 'vitest';
import { formatDateLocal, formatMinutesToHours, getToday } from '../../src/shared/formatters.js';

describe('shared formatters', () => {
  it('formats a Date as local YYYY-MM-DD', () => {
    expect(formatDateLocal(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
  });

  it('formats minutes as German hour text', () => {
    expect(formatMinutesToHours(90)).toBe('1.5h');
    expect(formatMinutesToHours(45)).toBe('45min');
  });

  it('uses an injected date for getToday', () => {
    expect(getToday(new Date(2026, 4, 5, 10, 0)).toISOString()).toContain('2026-05-05');
  });
});
```

- [ ] **Step 4: Run the failing test**

Run:

```bash
cd frontend
npm test -- tests/shared/formatters.test.js
```

Expected: FAIL because `frontend/src/shared/formatters.js` does not exist.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tests/shared/formatters.test.js
git commit -m "test: add frontend refactor harness"
```

---

### Task 2: Extract Shared Formatters

**Files:**
- Create: `frontend/src/shared/formatters.js`
- Modify: `frontend/src/components/app.js`
- Test: `frontend/tests/shared/formatters.test.js`

- [ ] **Step 1: Create formatter module**

Create `frontend/src/shared/formatters.js`:

```javascript
export function getToday(now = new Date()) {
  return now;
}

export function formatDateLocal(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMinutesToHours(minutes) {
  const value = Number(minutes) || 0;
  if (value < 60) return `${value}min`;
  const hours = value / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export function getKalenderwoche(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
```

- [ ] **Step 2: Preserve App methods as wrappers**

At the top of `frontend/src/components/app.js`, add:

```javascript
import {
  formatDateLocal,
  formatMinutesToHours,
  getKalenderwoche,
  getToday
} from '../shared/formatters.js';
```

Replace the existing `App` methods with wrappers:

```javascript
getToday() {
  return this.testDatum || getToday();
}

formatDateLocal(date) {
  return formatDateLocal(date);
}

getKalenderwoche(date) {
  return getKalenderwoche(date);
}

formatMinutesToHours(minutes) {
  return formatMinutesToHours(minutes);
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd frontend
npm test -- tests/shared/formatters.test.js
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd frontend
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/formatters.js frontend/src/components/app.js frontend/tests/shared/formatters.test.js
git commit -m "refactor: extract shared date and time formatters"
```

---

### Task 3: Extract DOM Utilities

**Files:**
- Create: `frontend/src/shared/dom.js`
- Create: `frontend/tests/shared/dom.test.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Add DOM utility tests**

Create `frontend/tests/shared/dom.test.js`:

```javascript
import { describe, expect, it, vi } from 'vitest';
import { bindEventListenerOnce, escapeHtml, escapeSelector, setTextIfExists } from '../../src/shared/dom.js';

describe('shared dom helpers', () => {
  it('escapes html text', () => {
    expect(escapeHtml('<b>"x"&</b>')).toBe('&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
  });

  it('sets text only when element exists', () => {
    document.body.innerHTML = '<div id="target"></div>';
    expect(setTextIfExists('target', 'Hallo')).toBe(true);
    expect(document.getElementById('target').textContent).toBe('Hallo');
    expect(setTextIfExists('missing', 'Noop')).toBe(false);
  });

  it('binds the same listener only once per key', () => {
    document.body.innerHTML = '<button id="btn"></button>';
    const button = document.getElementById('btn');
    const handler = vi.fn();
    bindEventListenerOnce(button, 'click', handler, 'Save');
    bindEventListenerOnce(button, 'click', handler, 'Save');
    button.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('escapes selectors through CSS.escape when available', () => {
    expect(escapeSelector('abc')).toBe('abc');
  });
});
```

- [ ] **Step 2: Create DOM utility module**

Create `frontend/src/shared/dom.js`:

```javascript
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeSelector(value) {
  if (window.CSS && CSS.escape) {
    return CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

export function setTextIfExists(id, text) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.textContent = text;
  return true;
}

export function bindEventListenerOnce(element, event, handler, key) {
  if (!element) return false;
  const datasetKey = `bound${key || event}`;
  if (element.dataset[datasetKey]) return false;
  element.addEventListener(event, handler);
  element.dataset[datasetKey] = 'true';
  return true;
}
```

- [ ] **Step 3: Preserve App methods as wrappers**

Import in `app.js`:

```javascript
import {
  bindEventListenerOnce,
  escapeHtml,
  escapeSelector,
  setTextIfExists
} from '../shared/dom.js';
```

Replace existing methods:

```javascript
escapeSelector(value) {
  return escapeSelector(value);
}

bindEventListenerOnce(element, event, handler, key) {
  return bindEventListenerOnce(element, event, handler, key);
}

escapeHtml(value) {
  return escapeHtml(value);
}

_escapeHtml(value) {
  return escapeHtml(value);
}

_setTextIfExists(id, text) {
  return setTextIfExists(id, text);
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
cd frontend
npm test -- tests/shared/dom.test.js tests/shared/formatters.test.js
npm run build
```

Expected: all tests PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/dom.js frontend/tests/shared/dom.test.js frontend/src/components/app.js
git commit -m "refactor: extract shared DOM helpers"
```

---

### Task 4: Extract Notifications

**Files:**
- Create: `frontend/src/shared/notifications.js`
- Create: `frontend/tests/shared/notifications.test.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Add notification tests**

Create `frontend/tests/shared/notifications.test.js`:

```javascript
import { describe, expect, it, vi } from 'vitest';
import { showToast } from '../../src/shared/notifications.js';

describe('notifications', () => {
  it('creates a toast container and toast element', () => {
    vi.useFakeTimers();
    showToast('Gespeichert', 'success');
    expect(document.querySelector('.toast-container')).toBeTruthy();
    expect(document.querySelector('.toast').textContent).toContain('Gespeichert');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Move toast implementation**

Create `frontend/src/shared/notifications.js` by moving the current body of `App.showToast(message, type = 'info')` unchanged into:

```javascript
export function showToast(message, type = 'info') {
  // Paste the existing implementation from App.showToast here unchanged.
}
```

- [ ] **Step 3: Preserve App wrapper**

In `app.js`, import:

```javascript
import { showToast } from '../shared/notifications.js';
```

Replace `App.showToast` with:

```javascript
showToast(message, type = 'info') {
  return showToast(message, type);
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
cd frontend
npm test -- tests/shared/notifications.test.js tests/shared/dom.test.js tests/shared/formatters.test.js
npm run build
```

Expected: all tests PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/shared/notifications.js frontend/tests/shared/notifications.test.js frontend/src/components/app.js
git commit -m "refactor: extract shared notifications"
```

---

### Task 5: Extract Server Info Feature

**Files:**
- Create: `frontend/src/features/serverInfo/serverInfoFeature.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Create feature installer**

Create `frontend/src/features/serverInfo/serverInfoFeature.js`:

```javascript
export function installServerInfoFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async loadServerVersion() {
      // Move existing App.loadServerVersion body here unchanged.
    },

    showServerStats(serverType) {
      // Move existing App.showServerStats body here unchanged.
    },

    async loadServerInfoTab() {
      // Move existing App.loadServerInfoTab body here unchanged.
    },

    _updateServerInfoStats(stats) {
      // Move existing App._updateServerInfoStats body here unchanged.
    },

    _uptimeToStartDate(seconds) {
      // Move existing App._uptimeToStartDate body here unchanged.
    },

    async _checkApiHealth() {
      // Move existing App._checkApiHealth body here unchanged.
    },

    _startServerInfoAutoRefresh() {
      // Move existing App._startServerInfoAutoRefresh body here unchanged.
    },

    async updateServerStats() {
      // Move existing App.updateServerStats body here unchanged.
    },

    getStatBarClass(pct) {
      // Move existing App.getStatBarClass body here unchanged.
    },

    formatUptime(seconds) {
      // Move existing App.formatUptime body here unchanged.
    }
  });
}
```

- [ ] **Step 2: Register feature in app.js**

Import:

```javascript
import { installServerInfoFeature } from '../features/serverInfo/serverInfoFeature.js';
```

After the `App` class declaration and before `window.app = new App()`, add:

```javascript
installServerInfoFeature(App);
```

Remove the moved methods from the class body.

- [ ] **Step 3: Run build**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Smoke test**

Run the app and verify:

```bash
cd backend
npm run server
```

Open `http://localhost:3001`, navigate to server/status information, and confirm version, IP, health, and stats still render.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/serverInfo/serverInfoFeature.js frontend/src/components/app.js
git commit -m "refactor: extract server info frontend feature"
```

---

### Task 6: Extract Realtime/WebSocket Feature

**Files:**
- Create: `frontend/src/features/realtime/realtimeFeature.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Create realtime installer**

Create `frontend/src/features/realtime/realtimeFeature.js` and move these methods unchanged:

```javascript
export function installRealtimeFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    setupWebSocket() {},
    clearWebSocketReconnect() {},
    stopWebSocket() {},
    handleWebSocketMessage(event) {},
    handleRealtimeKundenEvent(eventName, data) {},
    handleRealtimeTerminEvent(eventName, data) {},
    eventTouchesDatum(data, datum) {}
  });
}
```

Replace each empty method with the exact current method body from `app.js`.

- [ ] **Step 2: Register in app.js**

Import and install:

```javascript
import { installRealtimeFeature } from '../features/realtime/realtimeFeature.js';

installRealtimeFeature(App);
```

Remove moved methods from `app.js`.

- [ ] **Step 3: Run build**

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Smoke test**

Start backend, open two browser windows, create or update a termin in one window, and verify the other window refreshes the relevant dashboard/termin view.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/realtime/realtimeFeature.js frontend/src/components/app.js
git commit -m "refactor: extract realtime frontend feature"
```

---

### Task 7: Extract Auslastung Feature

**Files:**
- Create: `frontend/src/features/auslastung/auslastungFeature.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Identify method block**

Use:

```bash
rg -n "loadAuslastung|navigateAuslastung|goToAuslastungHeute|AuslastungWarnungen|render.*Auslastung|formatMinutesToHours" frontend/src/components/app.js
```

Move only methods whose primary responsibility is the non-drag-drop Auslastung view.

- [ ] **Step 2: Create installer**

Create:

```javascript
export function installAuslastungFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async loadAuslastung() {},
    navigateAuslastung(offset, unit) {},
    goToAuslastungHeute() {},
    async _loadAuslastungWarnungen(datum) {}
  });
}
```

Replace empty bodies with exact moved bodies from `app.js`. Add additional Auslastung-only render helpers to this same object if they are only called by `loadAuslastung`.

- [ ] **Step 3: Register in app.js**

```javascript
import { installAuslastungFeature } from '../features/auslastung/auslastungFeature.js';

installAuslastungFeature(App);
```

- [ ] **Step 4: Run build**

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Smoke test**

Open the Auslastung tab and verify:

- changing date reloads data
- previous/next day works
- previous/next week works
- today button works
- warning cards still render

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/auslastung/auslastungFeature.js frontend/src/components/app.js
git commit -m "refactor: extract auslastung frontend feature"
```

---

### Task 8: Extract Termin Details Feature

**Files:**
- Create: `frontend/src/features/termine/terminDetailsFeature.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Locate details methods**

Use:

```bash
rg -n "showTerminDetails|closeTerminDetails|openTerminDetails|render.*Termin|teile|status.*Termin|TerminDetails" frontend/src/components/app.js
```

- [ ] **Step 2: Create installer**

Create:

```javascript
export function installTerminDetailsFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async showTerminDetails(terminId) {},
    closeTerminDetails() {}
  });
}
```

Move exact method bodies from `app.js`. Include helper methods in this file only when they are called solely by termin details. Shared helpers must stay in `frontend/src/shared`.

- [ ] **Step 3: Register in app.js**

```javascript
import { installTerminDetailsFeature } from '../features/termine/terminDetailsFeature.js';

installTerminDetailsFeature(App);
```

- [ ] **Step 4: Run build**

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Smoke test**

Open a termin details modal from dashboard, auslastung, and search. Verify close button, parts status, actual time correction, and extension actions still work.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/termine/terminDetailsFeature.js frontend/src/components/app.js
git commit -m "refactor: extract termin details frontend feature"
```

---

### Task 9: Extract Termin Forms Feature

**Files:**
- Create: `frontend/src/features/termine/terminFormFeature.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Locate form methods**

Use:

```bash
rg -n "handleTerminSubmit|handleSchnellerTerminSubmit|handleInternerTerminSubmit|handleTerminEditSubmit|resetTermin|toggleAbholung|checkErsatzauto|pruefeBringzeit|Phase" frontend/src/components/app.js
```

- [ ] **Step 2: Create installer**

Create:

```javascript
export function installTerminFormFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async handleTerminSubmit(event) {},
    async handleSchnellerTerminSubmit(event) {},
    async handleInternerTerminSubmit(event) {},
    async handleTerminEditSubmit(event) {}
  });
}
```

Move exact method bodies and their private form-only helpers from `app.js`.

- [ ] **Step 3: Register in app.js**

```javascript
import { installTerminFormFeature } from '../features/termine/terminFormFeature.js';

installTerminFormFeature(App);
```

- [ ] **Step 4: Run build**

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Smoke test**

Verify:

- new termin creation
- quick termin creation
- internal termin creation
- termin edit
- replacement car validation
- bring time overlap warning
- multi-day phases

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/termine/terminFormFeature.js frontend/src/components/app.js
git commit -m "refactor: extract termin form frontend feature"
```

---

### Task 10: Extract Planning Feature Without Drag-and-Drop

**Files:**
- Create: `frontend/src/features/planung/planungFeature.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Locate planning methods**

Use:

```bash
rg -n "Planung|planung|Zeitleiste|Kalender|navigatePlanung|goToPlanungHeute|loadZeitleiste|setupTimeline" frontend/src/components/app.js
```

Exclude methods that directly handle HTML drag/drop events, local drag/drop buffers, slot fill popups, or drop conflict decisions.

- [ ] **Step 2: Create installer**

Create:

```javascript
export function installPlanungFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    bindPlanungEventListeners() {},
    navigatePlanung(offset, unit) {},
    goToPlanungHeute() {},
    async loadZeitleiste() {},
    setupTimelineDropZone() {}
  });
}
```

Move exact method bodies and planning-only render helpers from `app.js`.

- [ ] **Step 3: Register in app.js**

```javascript
import { installPlanungFeature } from '../features/planung/planungFeature.js';

installPlanungFeature(App);
```

- [ ] **Step 4: Run build**

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Smoke test**

Verify planning date navigation, weekly navigation, timeline rendering, and tab switching.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/planung/planungFeature.js frontend/src/components/app.js
git commit -m "refactor: extract planning frontend feature"
```

---

### Task 11: Extract Drag-and-Drop Feature Last

**Files:**
- Create: `frontend/src/features/planung/dragDropFeature.js`
- Modify: `frontend/src/components/app.js`

- [ ] **Step 1: Locate drag/drop methods**

Use:

```bash
rg -n "Drag|Drop|drag|drop|slot|Slot|ueberlast|aufteilen|neuEinplanen|lokaler|Puffer|auslastungDragDrop" frontend/src/components/app.js
```

- [ ] **Step 2: Create installer**

Create:

```javascript
export function installDragDropFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async loadAuslastungDragDrop() {},
    async _loadAuslastungWarnungenZeitleiste(datum) {}
  });
}
```

Move all drag/drop-specific methods and helpers from `app.js`. Keep the local drag/drop state fields in the `App` constructor for compatibility unless every access has been moved.

- [ ] **Step 3: Register in app.js**

```javascript
import { installDragDropFeature } from '../features/planung/dragDropFeature.js';

installDragDropFeature(App);
```

- [ ] **Step 4: Run build**

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Smoke test**

Verify:

- open drag/drop Auslastung tab
- move a termin to another employee
- move a termin to another time slot
- overload warning appears
- split/next-day action still works
- local buffer refreshes correctly
- `loadAuslastungDragDrop()` rerenders after save

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/planung/dragDropFeature.js frontend/src/components/app.js
git commit -m "refactor: extract planning drag and drop feature"
```

---

### Task 12: Final Verification and Graph Update

**Files:**
- Modify: no source files expected unless verification finds issues.

- [ ] **Step 1: Run frontend build**

```bash
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run backend tests**

```bash
cd backend
npm test
```

Expected: PASS. If existing tests fail for unrelated database fixture reasons, capture the failing test names and error output before making any fix.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend
npm test
```

Expected: PASS.

- [ ] **Step 4: Rebuild code-review-graph**

```bash
code-review-graph build
code-review-graph status
```

Expected: `frontend/src/components/app.js` has materially fewer nodes than before, and new feature/shared modules appear in the graph.

- [ ] **Step 5: Manual smoke checklist**

Start backend:

```bash
cd backend
npm run server
```

Verify:

- dashboard loads
- customer list/search works
- termin details modal opens and closes
- new termin form submits
- auslastung date navigation works
- drag/drop planning still works
- tablet/internal view still opens if used in production
- server info/status still renders

- [ ] **Step 6: Commit final verification notes if docs were updated**

```bash
git status --short
git commit -m "docs: record frontend refactor verification"
```

Only commit if verification notes or docs were actually changed.

---

## Rollback Strategy

- Each task has its own commit. If a slice breaks behavior, revert only that commit.
- Do not continue from Task 7 onward if Task 1-6 are unstable.
- Drag-and-drop is last because it has the highest behavioral risk and should only move after shared helpers and planning boundaries are proven.

## Success Criteria

- `frontend/src/components/app.js` is reduced significantly without breaking existing `window.app.*` calls.
- Shared helpers have unit tests.
- Feature modules exist for server info, realtime, auslastung, termin details, termin forms, planning, and drag/drop.
- `npm run build` passes in `frontend`.
- Critical manual flows pass.
- `code-review-graph status` still succeeds after rebuild.

