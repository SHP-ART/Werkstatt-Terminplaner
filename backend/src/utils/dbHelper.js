/**
 * Database Helper mit Promise-Support für SQLite
 *
 * Wrapper-Funktionen die Callback-basierte SQLite-Methoden
 * in Promise-basierte Funktionen umwandeln für async/await Support.
 *
 * === Performance-Optimierungen v1.3.0 ===
 * - Prepared Statements Cache
 * - Query-Performance-Logger
 * - Batch Operations Support
 */

const { db, dbWrapper } = require('../config/database');

// ============================================================
// === PERFORMANCE-KONFIGURATION ===
// ============================================================

const PERFORMANCE_CONFIG = {
  // Log-Schwelle für langsame Queries (ms)
  slowQueryThreshold: 100,
  // Query-Performance-Logging aktivieren
  enableQueryLogging: process.env.NODE_ENV !== 'production',
  // Prepared Statements Cache aktivieren
  enableStatementCache: true,
  // Max Einträge im Statement Cache
  maxStatementCacheSize: 100
};

// Prepared Statements Cache
const statementCache = new Map();

// Query-Performance-Statistiken
const queryStats = {
  totalQueries: 0,
  slowQueries: 0,
  totalDuration: 0,
  queryHistory: [] // Letzte 100 Queries für Debugging
};

// ============================================================
// === QUERY-PERFORMANCE-LOGGER ===
// ============================================================

/**
 * Loggt Query-Performance und warnt bei langsamen Queries
 * @param {string} sql - SQL Query
 * @param {number} duration - Ausführungsdauer in ms
 * @param {Array} params - Query Parameter
 */
function logQueryPerformance(sql, duration, params = []) {
  queryStats.totalQueries++;
  queryStats.totalDuration += duration;

  const queryInfo = {
    sql: sql.substring(0, 200), // Gekürzt für Logging
    duration,
    timestamp: new Date().toISOString(),
    paramCount: params.length
  };

  // History aktualisieren (max 100 Einträge)
  queryStats.queryHistory.push(queryInfo);
  if (queryStats.queryHistory.length > 100) {
    queryStats.queryHistory.shift();
  }

  // Warnung bei langsamen Queries
  if (duration >= PERFORMANCE_CONFIG.slowQueryThreshold) {
    queryStats.slowQueries++;
    if (PERFORMANCE_CONFIG.enableQueryLogging) {
      console.warn(`[SLOW QUERY] ${duration}ms: ${sql.substring(0, 100)}...`);
    }
  }
}

/**
 * Gibt Query-Statistiken zurück
 * @returns {Object} Query-Statistiken
 */
function getQueryStats() {
  return {
    ...queryStats,
    averageDuration: queryStats.totalQueries > 0
      ? Math.round(queryStats.totalDuration / queryStats.totalQueries)
      : 0,
    slowQueryPercentage: queryStats.totalQueries > 0
      ? Math.round((queryStats.slowQueries / queryStats.totalQueries) * 100)
      : 0
  };
}

/**
 * Setzt Query-Statistiken zurück
 */
function resetQueryStats() {
  queryStats.totalQueries = 0;
  queryStats.slowQueries = 0;
  queryStats.totalDuration = 0;
  queryStats.queryHistory = [];
}

// ============================================================
// === PREPARED STATEMENTS CACHE ===
// ============================================================

/**
 * Holt oder erstellt ein Prepared Statement
 * @param {string} sql - SQL Query
 * @returns {Object} Statement Objekt oder null
 */
function getCachedStatement(sql) {
  if (!PERFORMANCE_CONFIG.enableStatementCache) return null;

  if (statementCache.has(sql)) {
    return statementCache.get(sql);
  }

  // Cache-Größe prüfen
  if (statementCache.size >= PERFORMANCE_CONFIG.maxStatementCacheSize) {
    // Ältesten Eintrag entfernen
    const firstKey = statementCache.keys().next().value;
    statementCache.delete(firstKey);
  }

  return null;
}

/**
 * Speichert ein Statement im Cache
 * @param {string} sql - SQL Query
 * @param {Object} stmt - Prepared Statement
 */
function cacheStatement(sql, stmt) {
  if (PERFORMANCE_CONFIG.enableStatementCache) {
    statementCache.set(sql, stmt);
  }
}

/**
 * Leert den Statement Cache
 */
function clearStatementCache() {
  statementCache.clear();
}

// ============================================================
// === PROMISE-WRAPPER MIT PERFORMANCE-LOGGING ===
// ============================================================

/**
 * Promise-Wrapper für db.get() mit Performance-Logging
 * @param {string} sql - SQL Query
 * @param {Array} params - Query Parameter
 * @returns {Promise<Object>} Erste Zeile des Ergebnisses
 */
async function getAsync(sql, params = []) {
  // Warte auf Datenbank-Bereitschaft
  if (dbWrapper && dbWrapper.readyPromise) {
    await dbWrapper.readyPromise;
  }
  
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      const duration = Date.now() - startTime;
      logQueryPerformance(sql, duration, params);
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Promise-Wrapper für db.all() mit Performance-Logging
 * @param {string} sql - SQL Query
 * @param {Array} params - Query Parameter
 * @returns {Promise<Array>} Alle Zeilen des Ergebnisses
 */
async function allAsync(sql, params = []) {
  // Warte auf Datenbank-Bereitschaft
  if (dbWrapper && dbWrapper.readyPromise) {
    await dbWrapper.readyPromise;
  }
  
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      const duration = Date.now() - startTime;
      logQueryPerformance(sql, duration, params);
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Promise-Wrapper für db.run() mit Performance-Logging
 * @param {string} sql - SQL Query (INSERT, UPDATE, DELETE)
 * @param {Array} params - Query Parameter
 * @returns {Promise<Object>} { lastID, changes }
 */
async function runAsync(sql, params = []) {
  // Warte auf Datenbank-Bereitschaft
  if (dbWrapper && dbWrapper.readyPromise) {
    await dbWrapper.readyPromise;
  }
  
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      const duration = Date.now() - startTime;
      logQueryPerformance(sql, duration, params);
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
 * Promise-Wrapper für db.exec() mit Performance-Logging
 * @param {string} sql - SQL Query (ohne Parameter)
 * @returns {Promise<void>}
 */
function execAsync(sql) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      const duration = Date.now() - startTime;
      logQueryPerformance(sql, duration);
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// ============================================================
// === BATCH OPERATIONS (N+1 PROBLEM LÖSUNG) ===
// ============================================================

/**
 * Führt mehrere Queries in einer Transaktion aus
 * Löst das N+1 Query Problem durch Batching
 * @param {Array<{sql: string, params: Array}>} queries - Array von Queries
 * @returns {Promise<Array>} Array von Ergebnissen
 */
async function batchAsync(queries) {
  if (!queries || queries.length === 0) return [];

  const startTime = Date.now();
  const results = [];

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      let completed = 0;
      let hasError = false;

      queries.forEach((query, index) => {
        if (hasError) return;

        db.all(query.sql, query.params || [], (err, rows) => {
          if (err) {
            hasError = true;
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          results[index] = rows;
          completed++;

          if (completed === queries.length) {
            db.run('COMMIT', (err) => {
              const duration = Date.now() - startTime;
              logQueryPerformance(`BATCH(${queries.length} queries)`, duration);
              if (err) {
                reject(err);
              } else {
                resolve(results);
              }
            });
          }
        });
      });
    });
  });
}

/**
 * Lädt Daten für mehrere IDs in einer Query (statt N einzelne Queries)
 * @param {string} table - Tabellenname
 * @param {Array<number>} ids - Array von IDs
 * @param {string} idColumn - Name der ID-Spalte (default: 'id')
 * @returns {Promise<Array>} Gefundene Zeilen
 */
async function getByIdsAsync(table, ids, idColumn = 'id') {
  if (!ids || ids.length === 0) return [];

  // Sicherheitsprüfung für Tabellennamen (nur alphanumerisch und underscore)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error('Ungültiger Tabellenname');
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(idColumn)) {
    throw new Error('Ungültiger Spaltenname');
  }

  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT * FROM ${table} WHERE ${idColumn} IN (${placeholders})`;

  return allAsync(sql, ids);
}

// ============================================================
// === EXPORTS ===
// ============================================================

module.exports = {
  // Core async functions
  getAsync,
  allAsync,
  runAsync,
  execAsync,
  // Batch operations (N+1 lösung)
  batchAsync,
  getByIdsAsync,
  // Performance monitoring
  getQueryStats,
  resetQueryStats,
  // Statement cache
  clearStatementCache,
  // Configuration
  PERFORMANCE_CONFIG,
  // Export auch das raw DB-Objekt für spezielle Fälle
  db
};
