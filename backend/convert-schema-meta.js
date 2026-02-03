const sqlite3 = require('sqlite3').verbose();

const dbPath = "C:\\test\\Test2\\Werkstatt Terminplaner\\database\\werkstatt.db";
console.log('📁 Prüfe Schema-Version:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('✗ Fehler:', err);
    process.exit(1);
  }
});

// Alte Schema-Version (key/value Format)
db.get("SELECT value FROM _schema_meta WHERE key = 'schema_version'", [], (err, row) => {
  if (err) {
    console.error('✗ Fehler:', err);
    db.close();
    process.exit(1);
  }
  
  if (row) {
    console.log(`📊 Aktuelle Schema-Version (altes Format): ${row.value}`);
    
    // Konvertiere _schema_meta zu neuem Format
    console.log('\n🔄 Konvertiere _schema_meta zu neuem Format...');
    
    db.serialize(() => {
      db.run('DROP TABLE IF EXISTS _schema_meta_old');
      db.run('ALTER TABLE _schema_meta RENAME TO _schema_meta_old');
      db.run('CREATE TABLE _schema_meta (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
      db.run('INSERT INTO _schema_meta (version, applied_at) VALUES (?, datetime("now"))', [parseInt(row.value)], (err) => {
        if (err) {
          console.error('✗ Fehler beim Konvertieren:', err);
          db.close();
          process.exit(1);
        }
        console.log('✓ _schema_meta konvertiert');
        
        // Prüfe neue Version
        db.get('SELECT version FROM _schema_meta ORDER BY version DESC LIMIT 1', [], (err, newRow) => {
          if (err) {
            console.error('✗ Fehler:', err);
          } else {
            console.log(`✓ Neue Schema-Version: ${newRow.version}`);
          }
          db.close();
        });
      });
    });
  } else {
    console.log('⚠️  Keine Schema-Version gefunden!');
    db.close();
  }
});
