/**
 * Migration Helpers
 * Hilfsfunktionen für Datenbank-Migrationen
 */

/**
 * Hilfsfunktion: Führt SQL-Statement aus und ignoriert "duplicate column" Fehler
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {string} sql - SQL Statement
 * @param {string} description - Beschreibung für Logging
 * @returns {Promise<void>}
 */
function safeAlterTable(db, sql, description) {
  return new Promise((resolve) => {
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column')) {
          // Spalte existiert bereits - das ist OK
          resolve();
        } else {
          console.error(`Fehler bei ${description}:`, err.message);
          resolve(); // Fortfahren trotz Fehler für Robustheit
        }
      } else {
        resolve();
      }
    });
  });
}

/**
 * Hilfsfunktion: Führt SQL-Statement aus
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {string} sql - SQL Statement
 * @returns {Promise<void>}
 */
function runSQL(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Hilfsfunktion: Führt CREATE TABLE IF NOT EXISTS aus
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {string} sql - SQL Statement
 * @returns {Promise<void>}
 */
function safeCreateTable(db, sql) {
  return new Promise((resolve) => {
    db.run(sql, (err) => {
      if (err && !err.message.includes('already exists')) {
        console.error('Fehler bei CREATE TABLE:', err.message);
      }
      resolve();
    });
  });
}

/**
 * Hilfsfunktion: Führt CREATE INDEX IF NOT EXISTS aus
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {string} sql - SQL Statement
 * @returns {Promise<void>}
 */
function safeCreateIndex(db, sql) {
  return new Promise((resolve) => {
    db.run(sql, (err) => {
      if (err) {
        console.error('Fehler bei CREATE INDEX:', err.message);
      }
      resolve();
    });
  });
}

module.exports = {
  safeAlterTable,
  safeCreateTable,
  safeCreateIndex,
  runSQL
};
