/**
 * Migrations Test Suite
 * 
 * Testet:
 * - Transaktions-Rollback bei Fehler
 * - Idempotente Mehrfach-Ausführung
 * - Lock-Handling mit Concurrent-Access
 * - Pre-Migration-Checks
 * - Timeout-Handling
 * - Dry-Run-Modus
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// Test-DB Pfad
const testDbPath = path.join(__dirname, 'test-migrations.db');

// Cleanup vor Tests
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Mock für broadcast (damit Tests ohne WebSocket laufen)
jest.mock('../src/utils/broadcast', () => ({
  broadcastEvent: jest.fn()
}));

describe('Migrations System Tests', () => {
  let db;

  beforeEach((done) => {
    // Erstelle neue Test-DB
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    db = new sqlite3.Database(testDbPath, (err) => {
      if (err) {
        console.error('Fehler beim Erstellen der Test-DB:', err);
        done(err);
      } else {
        done();
      }
    });
  });

  afterEach((done) => {
    if (db) {
      db.close((err) => {
        if (err) console.error('Fehler beim Schließen der DB:', err);
        
        // Lösche Test-DB
        if (fs.existsSync(testDbPath)) {
          try {
            fs.unlinkSync(testDbPath);
          } catch (e) {
            console.warn('Konnte Test-DB nicht löschen:', e.message);
          }
        }
        done();
      });
    } else {
      done();
    }
  });

  describe('Transaktions-Sicherheit', () => {
    test('Rollback bei Fehler in Migration', async () => {
      const { runMigrations } = require('../migrations');
      
      // Erstelle Test-Migration die fehlschlägt
      const testMigrations = [
        {
          version: 1,
          description: 'Test Migration - Erfolgreich',
          up: (db) => {
            return new Promise((resolve) => {
              db.run('CREATE TABLE test_table (id INTEGER)', resolve);
            });
          }
        },
        {
          version: 2,
          description: 'Test Migration - Fehlschlag',
          up: (db) => {
            return new Promise((resolve, reject) => {
              db.run('CREATE TABLE test_table2 (id INTEGER)', (err) => {
                if (err) return reject(err);
                // Simuliere Fehler nach CREATE
                reject(new Error('Simulierter Fehler'));
              });
            });
          }
        }
      ];

      // Mock migrations array
      const originalMigrations = require('../migrations/index');
      jest.spyOn(originalMigrations, 'getAllMigrations').mockReturnValue(testMigrations);

      try {
        await runMigrations(db, 0);
        fail('Migration sollte fehlgeschlagen sein');
      } catch (error) {
        expect(error.message).toContain('Simulierter Fehler');
      }

      // Prüfe ob test_table2 NICHT existiert (wegen Rollback)
      const tables = await new Promise((resolve) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
          resolve(rows.map(r => r.name));
        });
      });

      expect(tables).not.toContain('test_table2');
    });
  });

  describe('Idempotenz', () => {
    test('Mehrfache Ausführung derselben Migration', async () => {
      const { runMigrations } = require('../migrations');

      // Erstelle Test-Migration
      const testMigration = {
        version: 1,
        description: 'Idempotente Test Migration',
        up: (db) => {
          return new Promise((resolve) => {
            db.run('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)', (err) => {
              if (err) console.error(err);
              resolve();
            });
          });
        }
      };

      const originalMigrations = require('../migrations/index');
      jest.spyOn(originalMigrations, 'getAllMigrations').mockReturnValue([testMigration]);

      // Führe Migration zweimal aus
      await runMigrations(db, 0);
      await runMigrations(db, 0); // Sollte nicht fehlschlagen

      // Prüfe ob Tabelle existiert
      const tables = await new Promise((resolve) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'", (err, rows) => {
          resolve(rows);
        });
      });

      expect(tables.length).toBe(1);
    });
  });

  describe('Lock-Mechanismus', () => {
    test('Verhindert parallele Migrations-Ausführung', async () => {
      const { migrationLock } = require('../src/config/database');

      // Setze Connection für Lock
      const dbWrapper = { connection: db };
      global.dbWrapper = dbWrapper;

      // Erwerbe Lock
      await migrationLock.acquire();
      expect(migrationLock.locked).toBe(true);

      // Versuche erneut Lock zu erwerben (sollte fehlschlagen)
      try {
        await migrationLock.acquire();
        fail('Sollte Lock-Fehler werfen');
      } catch (error) {
        expect(error.code).toBe('MIGRATION_LOCKED');
      }

      // Gebe Lock frei
      await migrationLock.release();
      expect(migrationLock.locked).toBe(false);

      // Cleanup
      delete global.dbWrapper;
    });

    test('Stale Lock Detection (> 30 Min)', async () => {
      const { migrationLock } = require('../src/config/database');
      const dbWrapper = { connection: db };
      global.dbWrapper = dbWrapper;

      // Erstelle Lock-Tabelle
      await new Promise((resolve) => {
        db.run(`CREATE TABLE IF NOT EXISTS _migration_lock (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          locked_at DATETIME,
          process_id INTEGER,
          hostname TEXT
        )`, resolve);
      });

      // Insert Stale Lock (32 Minuten alt)
      const staleLockTime = new Date(Date.now() - 32 * 60 * 1000).toISOString();
      await new Promise((resolve) => {
        db.run(
          'INSERT INTO _migration_lock (id, locked_at, process_id, hostname) VALUES (1, ?, 99999, "stale-host")',
          [staleLockTime],
          resolve
        );
      });

      // Versuche Lock zu erwerben (sollte Stale Lock entfernen und erfolgreich sein)
      await migrationLock.acquire();
      expect(migrationLock.locked).toBe(true);

      await migrationLock.release();
      delete global.dbWrapper;
    });
  });

  describe('Pre-Migration-Checks', () => {
    test('Speicherplatz-Check', async () => {
      const { validateMigrationPreConditions } = require('../src/config/database');
      const dbWrapper = { connection: db, readyPromise: Promise.resolve() };
      global.dbWrapper = dbWrapper;
      global.dbPath = testDbPath;
      global.dbDir = path.dirname(testDbPath);
      global.dataDir = path.dirname(testDbPath);

      try {
        const checks = await validateMigrationPreConditions();
        expect(checks).toBeDefined();
        expect(Array.isArray(checks)).toBe(true);
        
        // Prüfe ob Speicherplatz-Check enthalten ist
        const diskCheck = checks.find(c => c.name === 'Speicherplatz');
        expect(diskCheck).toBeDefined();
      } catch (error) {
        // Bei fehlendem Speicher ist das ok - wir testen nur ob Check läuft
        expect(error.code).toBe('PRE_CHECK_FAILED');
      }

      delete global.dbWrapper;
      delete global.dbPath;
      delete global.dbDir;
      delete global.dataDir;
    });
  });

  describe('Dry-Run-Modus', () => {
    test('Dry-Run führt Rollback durch', async () => {
      const { runMigrations } = require('../migrations');

      const testMigration = {
        version: 1,
        description: 'Dry-Run Test Migration',
        up: (db) => {
          return new Promise((resolve) => {
            db.run('CREATE TABLE dry_run_test (id INTEGER)', resolve);
          });
        }
      };

      const originalMigrations = require('../migrations/index');
      jest.spyOn(originalMigrations, 'getAllMigrations').mockReturnValue([testMigration]);

      // Führe Migration im Dry-Run aus
      await runMigrations(db, 0, { dryRun: true });

      // Prüfe ob Tabelle NICHT existiert (wegen Rollback)
      const tables = await new Promise((resolve) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='dry_run_test'", (err, rows) => {
          resolve(rows);
        });
      });

      expect(tables.length).toBe(0);
    });
  });

  describe('Schema-Checksum', () => {
    test('Berechnet konsistente Checksumme', async () => {
      const { calculateSchemaChecksum } = require('../src/config/database');
      const dbWrapper = { connection: db, readyPromise: Promise.resolve() };
      global.dbWrapper = dbWrapper;

      // Erstelle Test-Tabelle
      await new Promise((resolve) => {
        db.run('CREATE TABLE checksum_test (id INTEGER, name TEXT)', resolve);
      });

      // Berechne Checksum zweimal
      const checksum1 = await calculateSchemaChecksum();
      const checksum2 = await calculateSchemaChecksum();

      expect(checksum1).toBe(checksum2);
      expect(checksum1).toHaveLength(64); // SHA256

      delete global.dbWrapper;
    });
  });

  describe('Timeout-Handling', () => {
    test('AsyncOperation wirft Timeout-Error', async () => {
      const { AsyncOperation } = require('../src/utils/asyncOperations');

      const operation = new AsyncOperation('Test Operation', 1000); // 1 Sekunde Timeout

      try {
        await operation.execute(async () => {
          // Simuliere lange Operation
          await new Promise(resolve => setTimeout(resolve, 2000));
        });
        fail('Sollte Timeout werfen');
      } catch (error) {
        expect(error.code).toBe('OPERATION_TIMEOUT');
      }
    }, 10000); // Test-Timeout: 10 Sekunden

    test('AsyncOperation erfolgreich innerhalb Timeout', async () => {
      const { AsyncOperation } = require('../src/utils/asyncOperations');

      const operation = new AsyncOperation('Test Operation', 2000);

      const result = await operation.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return 'success';
      });

      expect(result).toBe('success');
    }, 5000);
  });
});

console.log('✅ Migrations Test Suite erstellt');
console.log('📝 Zum Ausführen: npm test backend/tests/migrations.test.js');
