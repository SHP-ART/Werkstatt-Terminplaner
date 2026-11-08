jest.mock('../src/services/localAiService', () => ({
  parseTerminFromText: jest.fn(),
  estimateZeit: jest.fn()
}));

describe('Ollama-Zeitlimit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    delete process.env.OLLAMA_TIMEOUT_MS;
    delete process.env.OLLAMA_NUM_PREDICT;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.OLLAMA_TIMEOUT_MS;
    delete process.env.OLLAMA_NUM_PREDICT;
  });

  test('Bricht langsame CPU-Inferenz nicht bereits nach 15 Sekunden ab', async () => {
    const fetchMock = jest.fn().mockImplementation((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('abgebrochen');
        error.name = 'AbortError';
        reject(error);
      });
    }));
    global.fetch = fetchMock;
    const local = require('../src/services/localAiService');
    local.parseTerminFromText.mockResolvedValue({ termin: { uhrzeit: '09:30' } });

    const service = require('../src/services/ollamaService');
    let settled = false;
    const request = service.parseTerminFromText('Inspektion am 12.11.2026 um 09:30')
      .catch(error => error)
      .finally(() => { settled = true; });

    await jest.advanceTimersByTimeAsync(15000);
    expect(settled).toBe(false);

    await jest.advanceTimersByTimeAsync(105000);
    const result = await request;
    expect(result.fallback).toBe('local');
  });

  test('Begrenzt JSON-Antworten auf 400 Tokens für CPU-Inferenz', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"arbeiten":[]}' } })
    });
    global.fetch = fetchMock;

    const service = require('../src/services/ollamaService');
    await service.parseTerminFromText('Inspektion am 12.11.2026 um 09:30');

    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body).options.num_predict).toBe(400);
  });

  test('Nutzt bei ungültigem Ollama-JSON den gekennzeichneten lokalen Parser', async () => {
    const local = require('../src/services/localAiService');
    local.parseTerminFromText.mockResolvedValue({ termin: { uhrzeit: '09:30' } });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{ungültig' } })
    });

    const service = require('../src/services/ollamaService');
    const result = await service.parseTerminFromText('Inspektion am 12.11.2026 um 09:30');

    expect(result.termin.uhrzeit).toBe('09:30');
    expect(result.fallback).toBe('local');
  });

  test('Nutzt bei einem Ollama-Zeitfehler die lokale Zeitschätzung', async () => {
    const local = require('../src/services/localAiService');
    local.estimateZeit.mockResolvedValue({ zeiten: [], gesamtdauer: 0 });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{ungültig' } })
    });

    const service = require('../src/services/ollamaService');
    const result = await service.estimateZeit(['Querlenker prüfen'], 'Citroën C3');

    expect(result.gesamtdauer).toBe(0);
    expect(result.fallback).toBe('local');
  });
});
