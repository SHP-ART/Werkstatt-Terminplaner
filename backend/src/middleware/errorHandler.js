/**
 * Globales Error-Handler-Middleware
 * Fängt alle Fehler in der Express-App ab und liefert einheitliche Responses
 */

const { AppError } = require('../utils/errors');
const { sendError } = require('../utils/response');

/**
 * Behandelt SQLite-spezifische Fehler
 */
function handleSQLiteError(err) {
  // UNIQUE constraint failed
  if (err.message && err.message.includes('UNIQUE constraint failed')) {
    const field = err.message.split('.')[1] || 'Feld';
    return {
      message: `Ein Eintrag mit diesem ${field} existiert bereits`,
      statusCode: 409
    };
  }
  
  // FOREIGN KEY constraint failed
  if (err.message && err.message.includes('FOREIGN KEY constraint failed')) {
    return {
      message: 'Der Eintrag kann nicht gelöscht werden, da er noch verwendet wird',
      statusCode: 409
    };
  }
  
  // Allgemeiner DB-Fehler
  return {
    message: 'Datenbankfehler',
    statusCode: 500
  };
}

/**
 * Haupt-Error-Handler
 */
function errorHandler(err, req, res, next) {
  // Default-Werte
  let error = { ...err };
  error.message = err.message;
  
  // Log für Entwicklung
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error Handler:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode
    });
  }
  
  // Operational Errors (von uns geworfene Fehler)
  if (err.isOperational) {
    return sendError(res, err.message, err.statusCode, err.details);
  }
  
  // SQLite-Fehler
  if (err.code && err.code.startsWith('SQLITE')) {
    const sqliteError = handleSQLiteError(err);
    return sendError(res, sqliteError.message, sqliteError.statusCode);
  }
  
  // Validation Errors (von express-validator)
  if (err.name === 'ValidationError') {
    return sendError(res, err.message, 400, err.details);
  }
  
  // JSON Parse Errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(res, 'Ungültiges JSON-Format', 400);
  }
  
  // Unbekannte Fehler (500)
  console.error('Unerwarteter Fehler:', err);
  
  const message = process.env.NODE_ENV === 'production' 
    ? 'Ein unerwarteter Fehler ist aufgetreten' 
    : err.message;
  
  return sendError(res, message, 500);
}

/**
 * Handler für nicht gefundene Routen (404)
 */
function notFoundHandler(req, res, next) {
  sendError(res, `Route ${req.originalUrl} nicht gefunden`, 404);
}

/**
 * Async Error Wrapper - Fängt Fehler in async Funktionen ab
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};
