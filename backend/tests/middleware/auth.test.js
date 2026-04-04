describe('Auth Middleware', () => {
  let requireAuth;

  beforeAll(() => {
    process.env.API_KEY = 'test-secret-key-12345';
    requireAuth = require('../../src/middleware/auth').requireAuth;
  });

  function createMockReqRes(apiKey) {
    const req = { headers: {} };
    if (apiKey) req.headers['x-api-key'] = apiKey;
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; }
    };
    const next = jest.fn();
    return { req, res, next };
  }

  test('laesst Anfragen mit korrektem API-Key durch', () => {
    const { req, res, next } = createMockReqRes('test-secret-key-12345');
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  test('blockiert Anfragen ohne API-Key', () => {
    const { req, res, next } = createMockReqRes(null);
    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('blockiert Anfragen mit falschem API-Key', () => {
    const { req, res, next } = createMockReqRes('wrong-key');
    requireAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('laesst Anfragen durch wenn kein API_KEY konfiguriert (Entwicklung)', () => {
    delete process.env.API_KEY;
    jest.resetModules();
    const { requireAuth: freshAuth } = require('../../src/middleware/auth');
    const { req, res, next } = createMockReqRes(null);
    freshAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
