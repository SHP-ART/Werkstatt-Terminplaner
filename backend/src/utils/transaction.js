/**
 * Transaction-Helper für sichere Datenbank-Transaktionen
 * Stellt sicher, dass mehrere DB-Operationen atomar ablaufen
 */

const { db } = require('../config/database');

/**
 * Führt eine Funktion innerhalb einer Transaktion aus
 * Bei Erfolg: COMMIT - alle Änderungen werden gespeichert
 * Bei Fehler: ROLLBACK - alle Änderungen werden rückgängig gemacht
 * 
 * @param {Function} callback - Async-Funktion mit DB-Operationen
 * @returns {Promise<any>} - Resultat der Callback-Funktion
 * 
 * @example
 * await withTransaction(async () => {
 *   await deleteOldData();
 *   await insertNewData();
 * });
 */
async function withTransaction(callback) {
  return new Promise((resolve, reject) => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('Fehler beim Starten der Transaktion:', err);
        return reject(err);
      }

      // Callback ausführen und Ergebnis abwarten
      Promise.resolve(callback())
        .then((result) => {
          // Erfolg: COMMIT
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              console.error('Fehler beim COMMIT:', commitErr);
              // Versuche Rollback bei COMMIT-Fehler
              db.run('ROLLBACK', () => {
                reject(commitErr);
              });
            } else {
              resolve(result);
            }
          });
        })
        .catch((error) => {
          // Fehler: ROLLBACK
          console.error('Fehler in Transaktion, führe ROLLBACK durch:', error);
          db.run('ROLLBACK', (rollbackErr) => {
            if (rollbackErr) {
              console.error('Fehler beim ROLLBACK:', rollbackErr);
            }
            reject(error);
          });
        });
    });
  });
}

/**
 * Promisifiziert db.run für async/await Verwendung
 */
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

/**
 * Promisifiziert db.get für async/await Verwendung
 */
function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Promisifiziert db.all für async/await Verwendung
 */
function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  withTransaction,
  runAsync,
  getAsync,
  allAsync
};
