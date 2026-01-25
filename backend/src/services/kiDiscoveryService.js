let mdns = null;

const SERVICE_TYPE = 'werkstatt-ki';
const DISCOVERY_STALE_MS = 5 * 60 * 1000;

const services = new Map();
let started = false;
let manualUrl = null;
let lastError = null;
let browser = null;

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

function pickAddress(addresses = [], host = '') {
  const ipv4 = addresses.find(addr => typeof addr === 'string' && addr.includes('.'));
  if (ipv4) return ipv4;
  if (typeof host === 'string' && host) {
    return host.replace(/\.local\.?$/i, '');
  }
  return null;
}

function cleanupStale() {
  const cutoff = Date.now() - DISCOVERY_STALE_MS;
  for (const [key, entry] of services.entries()) {
    if (entry.updatedAt < cutoff) {
      services.delete(key);
    }
  }
}

function getBestService() {
  cleanupStale();
  let best = null;
  for (const entry of services.values()) {
    if (!best || entry.updatedAt > best.updatedAt) {
      best = entry;
    }
  }
  return best;
}

function start() {
  if (started) return;
  started = true;

  try {
    mdns = require('mdns-js');
  } catch (err) {
    lastError = err;
    console.warn('⚠️ mDNS Discovery nicht verfuegbar (mdns-js fehlt).');
    return;
  }

  try {
    browser = mdns.createBrowser(mdns.tcp(SERVICE_TYPE));

    browser.on('ready', () => {
      browser.discover();
    });

    browser.on('update', (data) => {
      const address = pickAddress(data.addresses, data.host);
      if (!address || !data.port) return;
      const url = normalizeUrl(`${address}:${data.port}`);
      const key = data.fullname || url;
      services.set(key, {
        url,
        host: data.host,
        addresses: data.addresses || [],
        port: data.port,
        updatedAt: Date.now()
      });
    });
  } catch (err) {
    lastError = err;
    console.warn('⚠️ mDNS Discovery Fehler:', err.message);
  }
}

function setManualUrl(value) {
  manualUrl = normalizeUrl(value);
}

function getStatus() {
  const discovered = getBestService();
  const discoveredUrl = discovered?.url || null;
  const activeUrl = discoveredUrl || manualUrl || null;
  let source = null;
  if (discoveredUrl) {
    source = 'discovered';
  } else if (manualUrl) {
    source = 'manual';
  }

  return {
    activeUrl,
    source,
    discoveredUrl,
    manualUrl,
    lastError: lastError ? lastError.message : null,
    lastSeenAt: discovered?.updatedAt || null
  };
}

module.exports = {
  start,
  setManualUrl,
  getStatus,
  normalizeUrl
};
