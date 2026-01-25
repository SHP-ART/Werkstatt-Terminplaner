/**
 * Migration Runner
 * Verwaltet Datenbank-Migrationen für das Werkstatt-Terminplaner System
 */

const migrations = [
  require('./001_initial'),
  require('./002_termine_basis'),
  require('./003_ersatzauto'),
  require('./004_mitarbeiter'),
  require('./005_lehrlinge'),
  require('./006_termine_erweitert'),
  require('./007_ki_einstellungen'),
  require('./008_ersatzautos_sperren'),
  require('./009_performance_indizes'),
  require('./010_ki_training_quality'),
  require('./011_ki_external_url')
];

/**
 * Führt eine einzelne Migration aus
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {Object} migration - Migration-Objekt
 * @returns {Promise<void>}
 */
function runMigration(db, migration) {
  return new Promise((resolve, reject) => {
    console.log(`🔄 Starte Migration ${migration.version}: ${migration.description}`);

    migration.up(db)
      .then(() => {
        console.log(`✅ Migration ${migration.version} erfolgreich: ${migration.description}`);
        resolve();
      })
      .catch((err) => {
        console.error(`❌ Migration ${migration.version} fehlgeschlagen:`, err);
        reject(err);
      });
  });
}

/**
 * Führt alle ausstehenden Migrationen aus
 * @param {Object} db - SQLite Datenbank-Verbindung
 * @param {number} currentVersion - Aktuelle Schema-Version (0 = neue DB)
 * @returns {Promise<number>} - Neue Schema-Version
 */
async function runMigrations(db, currentVersion) {
  console.log(`📊 Aktuelle Schema-Version: ${currentVersion}`);
  console.log(`📊 Verfügbare Migrationen: ${migrations.length}`);

  let migrationsRun = 0;

  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i];

    // Überspringe Migrationen, die bereits ausgeführt wurden
    if (migration.version <= currentVersion) {
      continue;
    }

    try {
      await runMigration(db, migration);
      migrationsRun++;
    } catch (error) {
      console.error(`❌ Migration abgebrochen bei Version ${migration.version}`);
      throw error;
    }
  }

  if (migrationsRun === 0) {
    console.log('✅ Keine neuen Migrationen erforderlich');
  } else {
    console.log(`✅ ${migrationsRun} Migration(en) erfolgreich ausgeführt`);
  }

  return migrations.length;
}

/**
 * Gibt die aktuelle Migrations-Version zurück
 * @returns {number}
 */
function getLatestVersion() {
  return migrations.length;
}

/**
 * Prüft ob Migrationen ausstehen
 * @param {number} currentVersion - Aktuelle Schema-Version
 * @returns {boolean}
 */
function hasPendingMigrations(currentVersion) {
  return currentVersion < migrations.length;
}

module.exports = {
  runMigrations,
  getLatestVersion,
  hasPendingMigrations
};
