const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'backend', 'database', 'werkstatt.db');
const db = new sqlite3.Database(dbPath);

db.get('SELECT COUNT(*) as cnt FROM termine', (err, row) => {
  if (err) {
    console.error('❌ Fehler:', err);
  } else {
    console.log('✅ Termine in DB:', row.cnt);
  }
  db.close();
});
