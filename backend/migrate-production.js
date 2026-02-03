const { getDatabase } = require('./src/config/database');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database', 'werkstatt_migration.db');

console.log('🔄 Starte Migration der Produktiv-Datenbank...');
console.log('📁 Datenbank:', dbPath);

// Temporär DB_PATH setzen
process.env.DB_PATH = dbPath;

const db = getDatabase();

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

// Migrations-Ordner
const migrationsDir = path.join(__dirname, 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

console.log(`📦 Verfügbare Migrationen: ${migrationFiles.length}`);

// Führe alle fehlenden Migrationen aus
let applied = 0;
for (const file of migrationFiles) {
  const match = file.match(/^(\d+)_/);
  if (!match) continue;
  
  const version = parseInt(match[1]);
  if (version <= currentVersion) continue;
  
  console.log(`\n⚙️  Migration ${version}: ${file}`);
  
  try {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    
    // Version speichern
    db.prepare('INSERT OR REPLACE INTO _schema_meta (version, applied_at) VALUES (?, datetime("now"))').run(version);
    
    console.log(`   ✓ Erfolgreich`);
    applied++;
  } catch (error) {
    console.error(`   ✗ Fehler:`, error.message);
    process.exit(1);
  }
}

const newVersion = getCurrentVersion();
console.log(`\n✅ Migration abgeschlossen!`);
console.log(`📊 Neue Schema-Version: ${newVersion}`);
console.log(`✓ ${applied} Migrationen angewendet`);

db.close();
