const localAiService = require('./localAiService');
const kiDiscoveryService = require('./kiDiscoveryService');

const DEFAULT_TIMEOUT_MS = parseInt(process.env.KI_EXTERNAL_TIMEOUT_MS, 10) || 4000;

kiDiscoveryService.start();

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

function getResolvedConfig() {
  const discoveryStatus = kiDiscoveryService.getStatus();
  let activeUrl = discoveryStatus.activeUrl;
  let source = discoveryStatus.source;

  if (!activeUrl) {
    const envUrl = normalizeUrl(process.env.KI_EXTERNAL_URL || process.env.KI_SERVICE_URL || '');
    if (envUrl) {
      activeUrl = envUrl;
      source = 'env';
    }
  }

  return {
    activeUrl,
    source,
    discoveredUrl: discoveryStatus.discoveredUrl,
    manualUrl: discoveryStatus.manualUrl,
    discoveryError: discoveryStatus.lastError,
    lastSeenAt: discoveryStatus.lastSeenAt
  };
}

function isConfigured() {
  return !!getResolvedConfig().activeUrl;
}

function ensureFetchAvailable() {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API nicht verfuegbar. Bitte Node.js >= 18 verwenden.');
  }
}

function unwrapData(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.success === false) {
    throw new Error(payload.error || payload.message || 'Externer KI-Service Fehler');
  }
  if (payload.data !== undefined) return payload.data;
  return payload;
}

function normalizeZeitschaetzung(result) {
  if (!result || typeof result !== 'object') return result;
  const normalized = { ...result };
  if (normalized.gesamtdauer == null && normalized.gesamtdauer_stunden != null) {
    normalized.gesamtdauer = normalized.gesamtdauer_stunden;
  }
  if (Array.isArray(normalized.zeiten)) {
    normalized.zeiten = normalized.zeiten.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const mapped = { ...entry };
      if (mapped.dauer_stunden == null && mapped.dauer != null) {
        mapped.dauer_stunden = mapped.dauer;
      }
      return mapped;
    });
  }
  if (!normalized.quelle) {
    normalized.quelle = 'externer KI-Service';
  }
  return normalized;
}

async function requestJson(path, options = {}) {
  const config = getResolvedConfig();
  if (!config.activeUrl) {
    throw new Error('Externer KI-Service nicht konfiguriert (keine URL gefunden).');
  }

  ensureFetchAvailable();

  const url = `${config.activeUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const method = options.method || 'POST';
  const body = options.body;
  const hasBody = body !== undefined;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (err) {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      const message = payload?.error || payload?.message || text || `HTTP ${response.status}`;
      throw new Error(message);
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkHealth() {
  const config = getResolvedConfig();
  if (!config.activeUrl) {
    return {
      success: false,
      configured: false,
      error: 'Externer KI-Service nicht konfiguriert',
      ...config
    };
  }

  try {
    const payload = await requestJson('/health', { method: 'GET' });
    return {
      success: true,
      configured: true,
      device: payload?.device || payload?.device_name || null,
      status: payload?.status || 'ok',
      ...config
    };
  } catch (error) {
    return {
      success: false,
      configured: true,
      error: error.message,
      ...config
    };
  }
}

async function parseTerminFromText(text) {
  return localAiService.parseTerminFromText(text);
}

async function suggestArbeiten(beschreibung, fahrzeug = '') {
  try {
    const payload = await requestJson('/api/suggest-arbeiten', {
      body: { beschreibung, fahrzeug }
    });
    return unwrapData(payload);
  } catch (error) {
    console.warn(`[KI] Externer Service suggestArbeiten fehlgeschlagen: ${error.message}`);
    return localAiService.suggestArbeiten(beschreibung, fahrzeug);
  }
}

async function estimateZeit(arbeiten, fahrzeug = '') {
  try {
    const payload = await requestJson('/api/estimate-zeit', {
      body: { arbeiten, fahrzeug }
    });
    return normalizeZeitschaetzung(unwrapData(payload));
  } catch (error) {
    console.warn(`[KI] Externer Service estimateZeit fehlgeschlagen: ${error.message}`);
    return localAiService.estimateZeit(arbeiten, fahrzeug);
  }
}

async function erkenneTeilebedarf(beschreibung, fahrzeug = '') {
  try {
    const payload = await requestJson('/api/teile-bedarf', {
      body: { beschreibung, fahrzeug }
    });
    return unwrapData(payload);
  } catch (error) {
    console.warn(`[KI] Externer Service teile-bedarf fehlgeschlagen: ${error.message}`);
    return localAiService.erkenneTeilebedarf(beschreibung, fahrzeug);
  }
}

async function getWartungsplan(fahrzeugtyp, kmStand, fahrzeugalter = null) {
  return localAiService.getWartungsplan(fahrzeugtyp, kmStand, fahrzeugalter);
}

function decodeVIN(vin) {
  return localAiService.decodeVIN(vin);
}

function checkTeileKompatibilitaet(vin, arbeit) {
  return localAiService.checkTeileKompatibilitaet(vin, arbeit);
}

function erkenneFremdmarke(text) {
  return localAiService.erkenneFremdmarke(text);
}

async function testConnection() {
  return checkHealth();
}

function getConnectionStatus() {
  const config = getResolvedConfig();
  return {
    configured: !!config.activeUrl,
    ...config
  };
}

async function retrainModel() {
  const payload = await requestJson('/api/retrain', {
    method: 'POST',
    body: {}
  });
  return unwrapData(payload);
}

async function notifyBackendUrl() {
  try {
    const os = require('os');
    
    // Ermittle Server-IP
    function getLocalIPAddress() {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
      return 'localhost';
    }
    
    const port = process.env.PORT || 3001;
    const ip = getLocalIPAddress();
    const backendUrl = `http://${ip}:${port}`;
    
    // Informiere externe KI über Backend-URL
    const config = getResolvedConfig();
    if (!config.activeUrl) {
      return { success: false, message: 'Externe KI nicht konfiguriert' };
    }
    
    // Sende als Query-Parameter statt Body
    const response = await requestJson(`/api/configure-backend?backend_url=${encodeURIComponent(backendUrl)}`, {
      method: 'POST'
    });
    
    return response;
  } catch (error) {
    return { 
      success: false, 
      message: `Fehler beim Benachrichtigen der KI: ${error.message}` 
    };
  }
}

module.exports = {
  isConfigured,
  checkHealth,
  testConnection,
  getConnectionStatus,
  retrainModel,
  notifyBackendUrl,
  parseTerminFromText,
  suggestArbeiten,
  estimateZeit,
  erkenneTeilebedarf,
  getWartungsplan,
  decodeVIN,
  checkTeileKompatibilitaet,
  erkenneFremdmarke
};
