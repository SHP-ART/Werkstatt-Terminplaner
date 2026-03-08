/**
 * Migration 023: Automatisierungs-Grundlagen
 *
 * Fügt hinzu:
 * - Tabelle automation_log für Aktivitäts-Protokoll
 * - Tabelle wiederkehrende_termine für wiederkehrende Aufträge
 * - Neue Felder in werkstatt_einstellungen (Puffer, Autopilot, Duplikat-Erkennung)
 */

const { safeRun } = require('./helpers');

const migration = {
  version: 23,
  description: 'Automatisierungs-Grundlagen: automation_log, wiederkehrende_termine, neue Einstellungsfelder'
};

async function up(db) {
  console.log('Migration 023: Erstelle Automatisierungs-Tabellen...');

  // Automation-Log Tabelle
  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS automation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      typ TEXT NOT NULL,
      beschreibung TEXT,
      termin_id INTEGER,
      ergebnis TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Wiederkehrende Termine
  await safeRun(db, `
    CREATE TABLE IF NOT EXISTS wiederkehrende_termine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kunde_id INTEGER,
      kunde_name TEXT,
      kennzeichen TEXT,
      arbeit TEXT NOT NULL,
      geschaetzte_zeit INTEGER DEFAULT 60,
      wiederholung TEXT CHECK(wiederholung IN ('monatlich','quartal','halbjahr','jaehrlich')) NOT NULL,
      naechste_erstellung DATE NOT NULL,
      aktiv INTEGER DEFAULT 1,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Neue Felder in werkstatt_einstellungen
  await safeRun(db, `ALTER TABLE werkstatt_einstellungen ADD COLUMN dynamischer_puffer_enabled INTEGER DEFAULT 0`);
  await safeRun(db, `ALTER TABLE werkstatt_einstellungen ADD COLUMN autopilot_modus TEXT DEFAULT 'aus'`);
  await safeRun(db, `ALTER TABLE werkstatt_einstellungen ADD COLUMN slot_nachfuellung_enabled INTEGER DEFAULT 1`);
  await safeRun(db, `ALTER TABLE werkstatt_einstellungen ADD COLUMN duplikat_erkennung_enabled INTEGER DEFAULT 1`);

  // Index für Log-Abfragen
  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_automation_log_erstellt ON automation_log(erstellt_am DESC)`);
  await safeRun(db, `CREATE INDEX IF NOT EXISTS idx_wiederkehrende_naechste ON wiederkehrende_termine(naechste_erstellung) WHERE aktiv = 1`);

  console.log('✓ Migration 023 abgeschlossen');
}

async function down(db) {
  console.log('Migration 023: Rückgängig...');
  await safeRun(db, 'DROP TABLE IF EXISTS automation_log');
  await safeRun(db, 'DROP TABLE IF EXISTS wiederkehrende_termine');
  console.log('✓ Migration 021 rückgängig gemacht (Spalten in werkstatt_einstellungen bleiben)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
