const { getDb } = require('./src/config/database');
const path = require('path');

const dbPath = "C:\\test\\Test2\\Werkstatt Terminplaner\\database\\werkstatt.db";
console.log('🔄 Manuelle Migration der Produktiv-Datenbank...');
console.log('📁 Datenbank:', dbPath);

// Setze DB_PATH
process.env.DB_PATH = dbPath;

const db = getDb();

// Aktuelle Schema-Version prüfen
const getCurrentVersion = () => {
  try {
    const result = db.prepare('SELECT version FROM _schema_meta ORDER BY version DESC LIMIT 1').get();
    return result ? result.version : 0;
  } catch (error) {
    return 0;
  }
};

const currentVersion = getCurrentVersion();
console.log(`📊 Aktuelle Schema-Version: ${currentVersion}`);

// Lade alle Migrationen
const migrations = require('./migrations');

console.log(`📦 Verfügbare Migrationen: ${Object.keys(migrations).length}`);

// Führe fehlende Migrationen aus
let applied = 0;
const migrationNumbers = Object.keys(migrations).map(Number).sort((a, b) => a - b);

for (const version of migrationNumbers) {
  if (version <= currentVersion) {
    console.log(`⏭️  Migration ${version}: Übersprungen (bereits angewendet)`);
    continue;
  }
  
  console.log(`\n⚙️  Migration ${version}: Wird ausgeführt...`);
  
  try {
    const migration = migrations[version];
    
    // Führe up() aus
    if (typeof migration.up === 'function') {
      migration.up(db);
      
      // Version in _schema_meta speichern
      db.prepare('INSERT OR REPLACE INTO _schema_meta (version, applied_at) VALUES (?, datetime("now"))').run(version);
      
      console.log(`   ✓ Erfolgreich`);
      applied++;
    } else {
      console.log(`   ⚠️  Keine up() Funktion gefunden`);
    }
  } catch (error) {
    console.error(`   ✗ Fehler:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

const newVersion = getCurrentVersion();
console.log(`\n✅ Migration abgeschlossen!`);
console.log(`📊 Neue Schema-Version: ${newVersion}`);
console.log(`✓ ${applied} Migrationen angewendet`);

db.close();
