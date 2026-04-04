/**
 * API-Key-Authentifizierung fuer destruktive Endpunkte
 *
 * Wenn API_KEY in .env gesetzt ist, muessen destruktive Endpunkte
 * den Header "x-api-key" mit dem korrekten Wert senden.
 *
 * Ohne API_KEY in .env (Entwicklung) wird alles durchgelassen.
 */

function requireAuth(req, res, next) {
  const configuredKey = process.env.API_KEY;

  // Kein API_KEY konfiguriert = Entwicklungsmodus, alles erlaubt
  if (!configuredKey) {
    return next();
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({
      error: 'Nicht autorisiert — API-Key fehlt oder ungueltig',
      hint: 'Sende den Header "x-api-key" mit dem konfigurierten Schluessel'
    });
  }

  next();
}

module.exports = { requireAuth };
