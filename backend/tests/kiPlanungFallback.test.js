jest.mock('../src/models/einstellungenModel', () => ({
  getWerkstatt: jest.fn(async () => ({
    ki_enabled: 1,
    ki_mode: 'ollama',
    smart_scheduling_enabled: 1,
    anomaly_detection_enabled: 0
  }))
}));
jest.mock('../src/services/ollamaService', () => ({
  planungRequest: jest.fn()
}));
jest.mock('../src/services/localAiService', () => ({
  getZeitVorschlag: jest.fn(),
  kategorisiereArbeit: jest.fn(() => 'Sonstiges')
}));
jest.mock('../src/utils/dbHelper', () => ({
  getAsync: jest.fn(),
  allAsync: jest.fn(async () => [])
}));
jest.mock('../src/utils/websocket', () => ({
  broadcastEvent: jest.fn()
}));

const KIPlanungController = require('../src/controllers/kiPlanungController');
const ollamaService = require('../src/services/ollamaService');

async function jobErgebnis(jobId) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await KIPlanungController.getJobStatus({ params: { jobId } }, res);
    const payload = res.json.mock.calls[0]?.[0];
    if (payload?.status !== 'pending') {
      return { http: res.status.mock.calls[0]?.[0] || 200, payload };
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('Job wurde nicht abgeschlossen');
}

beforeEach(() => {
  jest.clearAllMocks();
  ollamaService.planungRequest.mockRejectedValue(new Error('Ollama ungültiges JSON'));
});

describe('Lokaler Fallback für Ollama-Planung', () => {
  test('Tagesplanung wird bei einem Ollama-Fehler lokal abgeschlossen', async () => {
    const res = { json: jest.fn() };
    await KIPlanungController.getPlanungsvorschlag({ params: { datum: '2026-11-09' } }, res);
    const { jobId } = res.json.mock.calls[0][0];

    const result = await jobErgebnis(jobId);

    expect(result.http).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.mode).toBe('local');
    expect(result.payload.fallback).toBe(true);
  });

  test('Wochenplanung wird bei einem Ollama-Fehler lokal abgeschlossen', async () => {
    const res = { json: jest.fn() };
    await KIPlanungController.getWochenvorschlag({ params: { startDatum: '2026-11-09' } }, res);
    const { jobId } = res.json.mock.calls[0][0];

    const result = await jobErgebnis(jobId);

    expect(result.http).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.mode).toBe('local');
    expect(result.payload.fallback).toBe(true);
  });
});
