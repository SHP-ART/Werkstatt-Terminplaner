const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./database/werkstatt.db', (err) => {
  if (err) { console.error(err.message); process.exit(1); }
  db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", [], (err, rows) => {
    if (err) { console.error(err.message); process.exit(1); }
    console.log(rows.map(r => r.name).join(', '));
    db.close();
    process.exit(0);
  });
});
