/**
 * Zentrale Validierungs-Helper und Middleware
 * Verwendet express-validator für robuste Input-Validierung
 */

const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors');

/**
 * Middleware: Validierungsergebnisse prüfen und Fehler werfen
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));
    
    throw new ValidationError('Validierung fehlgeschlagen', errorMessages);
  }
  
  next();
};

/**
 * Helper: Datum im Format YYYY-MM-DD validieren
 */
const isValidDate = (value) => {
  if (!value) return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  
  const date = new Date(value);
  return date instanceof Date && !isNaN(date);
};

/**
 * Helper: Zeit im Format HH:MM validieren
 */
const isValidTime = (value) => {
  if (!value) return false;
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(value);
};

/**
 * Helper: Positive Zahl validieren
 */
const isPositiveNumber = (value) => {
  const num = parseFloat(value);
  return !isNaN(num) && num > 0;
};

/**
 * Helper: Positive Ganzzahl validieren
 */
const isPositiveInteger = (value) => {
  const num = parseInt(value, 10);
  return !isNaN(num) && num > 0 && Number.isInteger(num);
};

/**
 * Helper: Prozentsatz validieren (0-100)
 */
const isValidPercentage = (value) => {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0 && num <= 100;
};

/**
 * Helper: String bereinigen (Trim & XSS-Protection)
 */
const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  // Trim und entferne potentiell gefährliche Zeichen
  return value.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

// =============================================================================
// VALIDIERUNGS-RULES FÜR VERSCHIEDENE ENTITIES
// =============================================================================

/**
 * Validierung: Kunden Create/Update
 */
const validateKunde = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name ist erforderlich')
    .isLength({ min: 2, max: 200 }).withMessage('Name muss zwischen 2 und 200 Zeichen lang sein'),
  body('telefon')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Telefonnummer zu lang'),
  body('email')
    .optional({ nullable: true })
    .trim()
    .isEmail().withMessage('Ungültige E-Mail-Adresse')
    .normalizeEmail(),
  body('adresse')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Adresse zu lang'),
  body('locosoft_id')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Locosoft-ID zu lang'),
  body('kennzeichen')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Kennzeichen zu lang'),
  body('vin')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 }).withMessage('VIN zu lang'),
  body('fahrzeugtyp')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Fahrzeugtyp zu lang'),
  validate
];

/**
 * Validierung: Kunden Search
 */
const validateKundenSearch = [
  query('q')
    .trim()
    .notEmpty().withMessage('Suchbegriff ist erforderlich')
    .isLength({ min: 2 }).withMessage('Suchbegriff muss mindestens 2 Zeichen lang sein')
    .isLength({ max: 100 }).withMessage('Suchbegriff zu lang'),
  validate
];

/**
 * Validierung: Termin Create/Update
 */
const validateTermin = [
  body('kunde_name')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('Kundenname muss zwischen 2 und 200 Zeichen lang sein'),
  body('kunde_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('Ungültige Kunden-ID'),
  body('kennzeichen')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Kennzeichen zu lang'),
  body('arbeit')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 1, max: 500 }).withMessage('Arbeit muss zwischen 1 und 500 Zeichen lang sein'),
  body('umfang')
    .optional({ nullable: true })
    .isIn(['klein', 'mittel', 'gross']).withMessage('Umfang muss klein, mittel oder gross sein'),
  body('geschaetzte_zeit')
    .optional({ nullable: true })
    .isInt({ min: 0 }).withMessage('Geschätzte Zeit muss eine positive Zahl sein'),
  body('datum')
    .optional({ nullable: true })
    .custom(isValidDate).withMessage('Ungültiges Datumsformat (YYYY-MM-DD erwartet)'),
  body('status')
    .optional({ nullable: true })
    .isIn(['geplant', 'in_arbeit', 'wartend', 'abgeschlossen', 'storniert'])
    .withMessage('Ungültiger Status'),
  body('ersatzauto')
    .optional({ nullable: true })
    .isBoolean().withMessage('Ersatzauto muss true oder false sein'),
  body('kilometerstand')
    .optional({ nullable: true })
    .isInt({ min: 0 }).withMessage('Kilometerstand muss eine positive Zahl sein'),
  body('abholung_zeit')
    .optional({ nullable: true })
    .custom(isValidTime).withMessage('Ungültiges Zeitformat (HH:MM erwartet)'),
  body('bring_zeit')
    .optional({ nullable: true })
    .custom(isValidTime).withMessage('Ungültiges Zeitformat (HH:MM erwartet)'),
  validate
];

/**
 * Validierung: Mitarbeiter Create/Update
 */
const validateMitarbeiter = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name ist erforderlich')
    .isLength({ min: 2, max: 100 }).withMessage('Name muss zwischen 2 und 100 Zeichen lang sein'),
  body('arbeitsstunden_pro_tag')
    .optional({ nullable: true })
    .isFloat({ min: 1, max: 24 }).withMessage('Arbeitsstunden müssen zwischen 1 und 24 liegen'),
  body('nebenzeit_prozent')
    .optional({ nullable: true })
    .custom(isValidPercentage).withMessage('Nebenzeit muss zwischen 0 und 100% liegen'),
  body('aktiv')
    .optional({ nullable: true })
    .isBoolean().withMessage('Aktiv muss true oder false sein'),
  body('nur_service')
    .optional({ nullable: true })
    .isBoolean().withMessage('Nur Service muss true oder false sein'),
  body('mittagspause_start')
    .optional({ nullable: true })
    .custom(isValidTime).withMessage('Ungültiges Zeitformat (HH:MM erwartet)'),
  validate
];

/**
 * Validierung: Lehrlinge Create/Update
 */
const validateLehrling = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name ist erforderlich')
    .isLength({ min: 2, max: 100 }).withMessage('Name muss zwischen 2 und 100 Zeichen lang sein'),
  body('nebenzeit_prozent')
    .optional({ nullable: true })
    .custom(isValidPercentage).withMessage('Nebenzeit muss zwischen 0 und 100% liegen'),
  body('aufgabenbewaeltigung_prozent')
    .optional({ nullable: true })
    .isFloat({ min: 1, max: 200 }).withMessage('Aufgabenbewältigung muss zwischen 1 und 200% liegen'),
  body('aktiv')
    .optional({ nullable: true })
    .isBoolean().withMessage('Aktiv muss true oder false sein'),
  body('mittagspause_start')
    .optional({ nullable: true })
    .custom(isValidTime).withMessage('Ungültiges Zeitformat (HH:MM erwartet)'),
  validate
];

/**
 * Validierung: Arbeitszeit Create/Update
 */
const validateArbeitszeit = [
  body('bezeichnung')
    .trim()
    .notEmpty().withMessage('Bezeichnung ist erforderlich')
    .isLength({ min: 1, max: 200 }).withMessage('Bezeichnung muss zwischen 1 und 200 Zeichen lang sein'),
  body('standard_minuten')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('Standard-Minuten müssen mindestens 1 sein'),
  body('aliase')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Aliase zu lang'),
  validate
];

/**
 * Validierung: Ersatzauto Create/Update
 */
const validateErsatzauto = [
  body('kennzeichen')
    .trim()
    .notEmpty().withMessage('Kennzeichen ist erforderlich')
    .isLength({ min: 1, max: 20 }).withMessage('Kennzeichen muss zwischen 1 und 20 Zeichen lang sein')
    .matches(/^[A-Z0-9\-\s]+$/i).withMessage('Kennzeichen enthält ungültige Zeichen'),
  body('name')
    .trim()
    .notEmpty().withMessage('Name ist erforderlich')
    .isLength({ min: 2, max: 100 }).withMessage('Name muss zwischen 2 und 100 Zeichen lang sein'),
  body('typ')
    .optional({ nullable: true })
    .isIn(['klein', 'mittel', 'gross', 'transporter']).withMessage('Ungültiger Typ'),
  body('aktiv')
    .optional({ nullable: true })
    .isBoolean().withMessage('Aktiv muss true oder false sein'),
  validate
];

/**
 * Validierung: Abwesenheit Create
 */
const validateAbwesenheit = [
  body('mitarbeiter_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('Ungültige Mitarbeiter-ID'),
  body('lehrling_id')
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('Ungültige Lehrling-ID'),
  body('typ')
    .trim()
    .notEmpty().withMessage('Typ ist erforderlich')
    .isIn(['urlaub', 'krank', 'sonstiges']).withMessage('Typ muss urlaub, krank oder sonstiges sein'),
  body('von_datum')
    .trim()
    .notEmpty().withMessage('Von-Datum ist erforderlich')
    .custom(isValidDate).withMessage('Ungültiges Von-Datum (YYYY-MM-DD erwartet)'),
  body('bis_datum')
    .trim()
    .notEmpty().withMessage('Bis-Datum ist erforderlich')
    .custom(isValidDate).withMessage('Ungültiges Bis-Datum (YYYY-MM-DD erwartet)')
    .custom((bis_datum, { req }) => {
      if (req.body.von_datum && bis_datum < req.body.von_datum) {
        throw new Error('Bis-Datum muss nach oder gleich Von-Datum sein');
      }
      return true;
    }),
  validate
];

/**
 * Validierung: Werkstatt-Einstellungen Update
 */
const validateWerkstattEinstellungen = [
  body('pufferzeit_minuten')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 120 }).withMessage('Pufferzeit muss zwischen 0 und 120 Minuten liegen'),
  body('servicezeit_minuten')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 120 }).withMessage('Servicezeit muss zwischen 0 und 120 Minuten liegen'),
  body('ersatzauto_anzahl')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 50 }).withMessage('Ersatzauto-Anzahl muss zwischen 0 und 50 liegen'),
  body('nebenzeit_prozent')
    .optional({ nullable: true })
    .custom(isValidPercentage).withMessage('Nebenzeit muss zwischen 0 und 100% liegen'),
  body('mittagspause_minuten')
    .optional({ nullable: true })
    .isInt({ min: 0, max: 120 }).withMessage('Mittagspause muss zwischen 0 und 120 Minuten liegen'),
  validate
];

/**
 * Validierung: ID-Parameter (für GET/DELETE)
 */
const validateId = [
  param('id')
    .isInt({ min: 1 }).withMessage('Ungültige ID'),
  validate
];

/**
 * Validierung: Datum-Parameter
 */
const validateDatumParam = [
  param('datum')
    .custom(isValidDate).withMessage('Ungültiges Datum (YYYY-MM-DD erwartet)'),
  validate
];

/**
 * Validierung: Datum-Query-Parameter
 */
const validateDatumQuery = [
  query('datum')
    .optional({ nullable: true })
    .custom(isValidDate).withMessage('Ungültiges Datum (YYYY-MM-DD erwartet)'),
  validate
];

/**
 * Validierung: Datums-Range (von/bis)
 */
const validateDateRange = [
  query('von_datum')
    .trim()
    .notEmpty().withMessage('Von-Datum ist erforderlich')
    .custom(isValidDate).withMessage('Ungültiges Von-Datum'),
  query('bis_datum')
    .trim()
    .notEmpty().withMessage('Bis-Datum ist erforderlich')
    .custom(isValidDate).withMessage('Ungültiges Bis-Datum')
    .custom((bis_datum, { req }) => {
      if (req.query.von_datum && bis_datum < req.query.von_datum) {
        throw new Error('Bis-Datum muss nach oder gleich Von-Datum sein');
      }
      return true;
    }),
  validate
];

module.exports = {
  // Middleware
  validate,
  
  // Helper-Funktionen
  isValidDate,
  isValidTime,
  isPositiveNumber,
  isPositiveInteger,
  isValidPercentage,
  sanitizeString,
  
  // Validierungs-Rules
  validateKunde,
  validateKundenSearch,
  validateTermin,
  validateMitarbeiter,
  validateLehrling,
  validateArbeitszeit,
  validateErsatzauto,
  validateAbwesenheit,
  validateWerkstattEinstellungen,
  validateId,
  validateDatumParam,
  validateDatumQuery,
  validateDateRange
};
