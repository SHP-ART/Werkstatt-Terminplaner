/**
 * Migration 026 - ki_zeitlern_enabled
 * Fügt den Toggle für die KI-Lernkurven-Funktion in werkstatt_einstellungen hinzu.
 * Wenn deaktiviert, werden beim Terminabschluss keine Lerndaten in ki_zeitlern_daten gespeichert.
 */
module.exports = {
  version: 26,
  description: 'KI-Zeitlern aktivieren/deaktivieren Toggle',
  up: async (db) => {
    // Spalte hinzufügen (Standard: 1 = aktiv)
    await db.run(`ALTER TABLE werkstatt_einstellungen ADD COLUMN ki_zeitlern_enabled INTEGER DEFAULT 1`);
    // Bestehende Zeile auf Standardwert setzen
    await db.run(`UPDATE werkstatt_einstellungen SET ki_zeitlern_enabled = 1 WHERE id = 1`);
  }
};
