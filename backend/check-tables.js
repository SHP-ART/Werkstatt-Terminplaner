const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./node_modules/electron/dist/database/werkstatt.db');

db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
  if (err) {
    console.log('Error:', err);
  } else {
    console.log('Alle Tabellen in der Datenbank:');
    tables.forEach(t => console.log('  -', t.name));
  }
  
  // Auch die Spalten von arbeitszeiten_plan prüfen
  db.all("PRAGMA table_info(arbeitszeiten_plan)", (err, cols) => {
    if (err) {
      console.log('Error arbeitszeiten_plan:', err);
    } else {
      console.log('\nSpalten von arbeitszeiten_plan:');
      if (cols && cols.length > 0) {
        cols.forEach(c => console.log('  -', c.name, ':', c.type));
      } else {
        console.log('  Tabelle existiert nicht oder hat keine Spalten');
      }
    }
    
    // Auch abwesenheiten prüfen
    db.all("PRAGMA table_info(abwesenheiten)", (err, cols) => {
      if (err) {
        console.log('Error abwesenheiten:', err);
      } else {
        console.log('\nSpalten von abwesenheiten:');
        if (cols && cols.length > 0) {
          cols.forEach(c => console.log('  -', c.name, ':', c.type));
        } else {
          console.log('  Tabelle existiert nicht oder hat keine Spalten');
        }
      }
      db.close();
    });
  });
});
