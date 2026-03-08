/**
 * Automation-Log Model
 * Protokolliert automatische Aktionen des Systems
 */

const { runAsync, allAsync } = require('../utils/dbHelper');

const TYPEN = [
  'slot_vorschlag',
  'puffer_berechnung',
  'duplikat_erkennung',
  'ueberlauf_warnung',
  'slot_nachfuellung',
  'wiederkehrender_termin',
  'training'
];

/**
 * Schreibt einen Log-Eintrag
 * @param {string} typ - Typ des Eintrags (siehe TYPEN)
 * @param {string} beschreibung - Beschreibung was passiert ist
 * @param {number|null} terminId - Optional: betroffene Termin-ID
 * @param {string} ergebnis - Ergebnis (z.B. 'OK', 'Keine Vorschläge', JSON)
 */
async function logAction(typ, beschreibung, terminId = null, ergebnis = null) {
  try {
    await runAsync(
      `INSERT INTO automation_log (typ, beschreibung, termin_id, ergebnis) VALUES (?, ?, ?, ?)`,
      [typ, beschreibung, terminId || null, ergebnis ? String(ergebnis).slice(0, 500) : null]
    );
  } catch (err) {
    // Logging-Fehler nie nach oben werfen
    console.warn('[AutomationLog] Fehler beim Schreiben:', err.message);
  }
}

/**
 * Letzte N Aktionen laden
 * @param {number} limit - Maximale Anzahl (default: 50)
 */
async function getLetzteAktionen(limit = 50) {
  return await allAsync(
    `SELECT * FROM automation_log ORDER BY erstellt_am DESC LIMIT ?`,
    [Math.min(parseInt(limit) || 50, 200)]
  );
}

/**
 * Log aufräumen (Einträge älter als N Tage löschen)
 * @param {number} tage - Alter in Tagen (default: 30)
 */
async function cleanupLog(tage = 30) {
  await runAsync(
    `DELETE FROM automation_log WHERE erstellt_am < datetime('now', '-' || ? || ' days')`,
    [tage]
  );
}

module.exports = {
  logAction,
  getLetzteAktionen,
  cleanupLog,
  TYPEN
};
