const sqlite3 = require('sqlite3').verbose();

const dbPath = "C:\\test\\Test2\\Werkstatt Terminplaner\\database\\werkstatt.db";
console.log('📁 Prüfe Datenbank:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('✗ Fehler:', err);
    process.exit(1);
  }
});

// Liste alle Tabellen
db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (err, tables) => {
  if (err) {
    console.error('✗ Fehler:', err);
    db.close();
    process.exit(1);
  }
  
  console.log('\n📋 Tabellen in der Datenbank:');
  tables.forEach(t => console.log(`  - ${t.name}`));
  
  // Prüfe _schema_meta Struktur
  db.all("PRAGMA table_info(_schema_meta)", [], (err, columns) => {
    if (err) {
      console.log('\n⚠️  _schema_meta Tabelle existiert nicht!');
    } else {
      console.log('\n📊 Spalten von _schema_meta:');
      columns.forEach(c => console.log(`  - ${c.name} : ${c.type}`));
    }
    
    db.close();
  });
});
