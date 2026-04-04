const rateLimit = require('express-rate-limit');

/**
 * Rate-Limiter fuer KI-Endpunkte (teuer wegen OpenAI-Kosten)
 * Max 30 Anfragen pro Minute pro IP
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Zu viele KI-Anfragen — bitte 1 Minute warten' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate-Limiter fuer destruktive System-Endpunkte
 * Max 5 Anfragen pro Minute pro IP
 */
const systemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Zu viele System-Anfragen — bitte 1 Minute warten' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Allgemeiner API-Limiter
 * Max 200 Anfragen pro Minute pro IP
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: 'Zu viele Anfragen — bitte kurz warten' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { aiLimiter, systemLimiter, generalLimiter };
