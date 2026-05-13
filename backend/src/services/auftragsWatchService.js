const fs = require('fs');
const path = require('path');

const { broadcastEvent } = require('../utils/websocket');
const {
  IMPORT_DIR,
  ensureImportDirs,
  parseAndCreateImport
} = require('./auftragsImportService');

const STABILITY_DELAY_MS = 1500;
const DEBOUNCE_MS = 500;

let watcher = null;
const pending = new Map();

function isPdf(filePath) {
  return String(filePath || '').toLowerCase().endsWith('.pdf');
}

function readFileSignature(filePath) {
  const stat = fs.statSync(filePath);
  return `${stat.size}:${stat.mtimeMs}`;
}

function scheduleImport(filePath) {
  if (!isPdf(filePath)) return;

  const previous = pending.get(filePath);
  if (previous) {
    clearTimeout(previous);
  }

  const timeout = setTimeout(() => waitForStableFile(filePath).catch((error) => {
    pending.delete(filePath);
    console.error('[Auftragsimport] Watcher-Fehler:', error.message);
    broadcastEvent('auftragsimport.error', {
      dateiname: path.basename(filePath),
      fehler: error.message
    });
  }), DEBOUNCE_MS);

  pending.set(filePath, timeout);
}

async function waitForStableFile(filePath) {
  if (!fs.existsSync(filePath)) {
    pending.delete(filePath);
    return;
  }

  const firstSignature = readFileSignature(filePath);
  await new Promise(resolve => setTimeout(resolve, STABILITY_DELAY_MS));

  if (!fs.existsSync(filePath)) {
    pending.delete(filePath);
    return;
  }

  const secondSignature = readFileSignature(filePath);
  if (firstSignature !== secondSignature) {
    scheduleImport(filePath);
    return;
  }

  pending.delete(filePath);
  const result = await parseAndCreateImport(filePath);
  if (result.skipped) return;

  broadcastEvent('auftragsimport.created', {
    id: result.import.id,
    status: result.import.status,
    dateiname: result.import.original_dateiname
  });
}

function start() {
  if (watcher || process.env.AUFTRAGSIMPORT_WATCH === '0') {
    return false;
  }

  ensureImportDirs();
  watcher = fs.watch(IMPORT_DIR, (eventType, filename) => {
    if (!filename) return;
    scheduleImport(path.join(IMPORT_DIR, filename.toString()));
  });

  watcher.on('error', (error) => {
    console.error('[Auftragsimport] Watcher gestoppt:', error.message);
    watcher = null;
  });

  console.log(`[Auftragsimport] Watcher aktiv: ${IMPORT_DIR}`);
  return true;
}

function stop() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  for (const timeout of pending.values()) {
    clearTimeout(timeout);
  }
  pending.clear();
}

function isRunning() {
  return Boolean(watcher);
}

module.exports = {
  start,
  stop,
  isRunning,
  scheduleImport
};
