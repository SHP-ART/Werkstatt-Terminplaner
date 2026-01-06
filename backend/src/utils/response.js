/**
 * Einheitliche Response-Helper für konsistente API-Antworten
 */

/**
 * Erfolgreiche Response
 * @param {Object} res - Express Response-Objekt
 * @param {*} data - Daten für Response
 * @param {String} message - Optionale Nachricht
 * @param {Number} statusCode - HTTP-Status (default: 200)
 */
function sendSuccess(res, data, message = null, statusCode = 200) {
  const response = {
    success: true,
    data: data
  };
  
  if (message) {
    response.message = message;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Fehler-Response
 * @param {Object} res - Express Response-Objekt
 * @param {String} error - Fehlermeldung
 * @param {Number} statusCode - HTTP-Status (default: 500)
 * @param {*} details - Optionale Details
 */
function sendError(res, error, statusCode = 500, details = null) {
  const response = {
    success: false,
    error: error
  };
  
  if (details) {
    response.details = details;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Response für Created (201)
 */
function sendCreated(res, data, message = 'Erfolgreich erstellt') {
  sendSuccess(res, data, message, 201);
}

/**
 * Response für No Content (204)
 */
function sendNoContent(res) {
  res.status(204).send();
}

module.exports = {
  sendSuccess,
  sendError,
  sendCreated,
  sendNoContent
};
