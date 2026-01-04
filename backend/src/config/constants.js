/**
 * Zentrale Konfigurationskonstanten für das Backend
 * Vermeidet Magic Numbers und zentralisiert Konfiguration
 */

// =============================================================================
// HTTP STATUS CODES
// =============================================================================

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
};

// =============================================================================
// TERMIN-KONFIGURATION
// =============================================================================

const TERMIN_STATUS = {
  GEPLANT: 'geplant',
  IN_ARBEIT: 'in_arbeit',
  WARTEND: 'wartend',
  ABGESCHLOSSEN: 'abgeschlossen',
  STORNIERT: 'storniert'
};

const TERMIN_UMFANG = {
  KLEIN: 'klein',
  MITTEL: 'mittel',
  GROSS: 'gross'
};

const TERMIN_DRINGLICHKEIT = {
  NORMAL: 'normal',
  HOCH: 'hoch',
  SEHR_HOCH: 'sehr_hoch'
};

// =============================================================================
// ABWESENHEITS-TYPEN
// =============================================================================

const ABWESENHEIT_TYP = {
  URLAUB: 'urlaub',
  KRANK: 'krank',
  SONSTIGES: 'sonstiges'
};

// =============================================================================
// ERSATZAUTO-TYPEN
// =============================================================================

const ERSATZAUTO_TYP = {
  KLEIN: 'klein',
  MITTEL: 'mittel',
  GROSS: 'gross',
  TRANSPORTER: 'transporter'
};

// =============================================================================
// VALIDIERUNGS-LIMITS
// =============================================================================

const VALIDATION_LIMITS = {
  // String-Längen
  NAME_MIN: 2,
  NAME_MAX: 200,
  TELEFON_MAX: 50,
  EMAIL_MAX: 255,
  ADRESSE_MAX: 500,
  KENNZEICHEN_MAX: 20,
  VIN_MAX: 50,
  FAHRZEUGTYP_MAX: 100,
  
  // Suchbegriffe
  SEARCH_MIN: 2,
  SEARCH_MAX: 100,
  
  // Numerische Werte
  ARBEITSSTUNDEN_MIN: 1,
  ARBEITSSTUNDEN_MAX: 24,
  PROZENT_MIN: 0,
  PROZENT_MAX: 100,
  AUFGABENBEWAELTIGUNG_MIN: 1,
  AUFGABENBEWAELTIGUNG_MAX: 200,
  MINUTEN_MIN: 0,
  MINUTEN_MAX: 1440, // 24h
  ERSATZAUTO_ANZAHL_MAX: 50,
  
  // Import
  IMPORT_MAX_ROWS: 1000
};

// =============================================================================
// STANDARD-WERTE
// =============================================================================

const DEFAULTS = {
  ARBEITSSTUNDEN_PRO_TAG: 8,
  NEBENZEIT_PROZENT: 0,
  AUFGABENBEWAELTIGUNG_PROZENT: 100,
  MITTAGSPAUSE_START: '12:00',
  MITTAGSPAUSE_MINUTEN: 30,
  PUFFERZEIT_MINUTEN: 15,
  SERVICEZEIT_MINUTEN: 10,
  ERSATZAUTO_ANZAHL: 2,
  GESCHAETZTE_ZEIT_MINUTEN: 30
};

// =============================================================================
// CACHE-KONFIGURATION
// =============================================================================

const CACHE_CONFIG = {
  AUSLASTUNG_TTL: 5 * 60 * 1000, // 5 Minuten in Millisekunden
  EINSTELLUNGEN_TTL: 60 * 60 * 1000, // 1 Stunde
  ARBEITSZEITEN_TTL: 30 * 60 * 1000 // 30 Minuten
};

// =============================================================================
// DATENBANK-KONFIGURATION
// =============================================================================

const DB_CONFIG = {
  BACKUP_RETENTION_DAYS: 30,
  BACKUP_INTERVAL_HOURS: 24,
  MAX_QUERY_TIME_MS: 5000
};

// =============================================================================
// TERMIN-NUMMERN-FORMAT
// =============================================================================

const TERMIN_NR_CONFIG = {
  PREFIX: 'T-',
  PADDING: 3, // T-2026-001
  SEPARATOR: '-'
};

// =============================================================================
// REGEX-PATTERNS
// =============================================================================

const REGEX = {
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  TIME: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
  KENNZEICHEN: /^[A-Z0-9\-\s]+$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

// =============================================================================
// FEHLERMELDUNGEN
// =============================================================================

const ERROR_MESSAGES = {
  // Validierung
  REQUIRED_FIELD: 'Dieses Feld ist erforderlich',
  INVALID_FORMAT: 'Ungültiges Format',
  INVALID_DATE: 'Ungültiges Datum (YYYY-MM-DD erwartet)',
  INVALID_TIME: 'Ungültige Uhrzeit (HH:MM erwartet)',
  INVALID_EMAIL: 'Ungültige E-Mail-Adresse',
  
  // Datenbank
  NOT_FOUND: 'Eintrag nicht gefunden',
  ALREADY_EXISTS: 'Eintrag existiert bereits',
  DATABASE_ERROR: 'Datenbankfehler',
  
  // Termine
  TERMIN_NOT_FOUND: 'Termin nicht gefunden',
  TERMIN_DATUM_PAST: 'Termin-Datum darf nicht in der Vergangenheit liegen',
  
  // Kunden
  KUNDE_NOT_FOUND: 'Kunde nicht gefunden',
  KENNZEICHEN_EXISTS: 'Kennzeichen existiert bereits',
  
  // Ersatzautos
  ERSATZAUTO_NOT_AVAILABLE: 'Kein Ersatzauto verfügbar',
  ERSATZAUTO_ALREADY_BOOKED: 'Ersatzauto bereits vergeben',
  
  // Mitarbeiter/Lehrlinge
  MITARBEITER_NOT_FOUND: 'Mitarbeiter nicht gefunden',
  LEHRLING_NOT_FOUND: 'Lehrling nicht gefunden',
  
  // Import
  IMPORT_FAILED: 'Import fehlgeschlagen',
  IMPORT_TOO_LARGE: 'Import zu groß (max. 1000 Einträge)'
};

// =============================================================================
// EXPORT
// =============================================================================

module.exports = {
  HTTP_STATUS,
  TERMIN_STATUS,
  TERMIN_UMFANG,
  TERMIN_DRINGLICHKEIT,
  ABWESENHEIT_TYP,
  ERSATZAUTO_TYP,
  VALIDATION_LIMITS,
  DEFAULTS,
  CACHE_CONFIG,
  DB_CONFIG,
  TERMIN_NR_CONFIG,
  REGEX,
  ERROR_MESSAGES
};
