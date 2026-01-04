/**
 * Database Helper mit Promise-Support für SQLite
 * 
 * Wrapper-Funktionen die Callback-basierte SQLite-Methoden
 * in Promise-basierte Funktionen umwandeln für async/await Support.
 */

const { db } = require('../config/database');

/**
 * Promise-Wrapper für db.get()
 * @param {string} sql - SQL Query
 * @param {Array} params - Query Parameter
 * @returns {Promise<Object>} Erste Zeile des Ergebnisses
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
 * Promise-Wrapper für db.all()
 * @param {string} sql - SQL Query
 * @param {Array} params - Query Parameter
 * @returns {Promise<Array>} Alle Zeilen des Ergebnisses
 */
function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Promise-Wrapper für db.run()
 * @param {string} sql - SQL Query (INSERT, UPDATE, DELETE)
 * @param {Array} params - Query Parameter
 * @returns {Promise<Object>} { lastID, changes }
 */
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          lastID: this.lastID,
          changes: this.changes
        });
      }
    });
  });
}

/**
 * Promise-Wrapper für db.exec()
 * @param {string} sql - SQL Query (ohne Parameter)
 * @returns {Promise<void>}
 */
function execAsync(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

module.exports = {
  getAsync,
  allAsync,
  runAsync,
  execAsync,
  // Export auch das raw DB-Objekt für spezielle Fälle
  db
};
