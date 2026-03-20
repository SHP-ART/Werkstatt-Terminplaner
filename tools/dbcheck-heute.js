const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/var/lib/werkstatt-terminplaner/database/werkstatt.db');
const datum = new Date().toISOString().split('T')[0];
console.log('Datum:', datum);
db.all(
  'SELECT id, termin_nr, kunde_name, mitarbeiter_id, bring_zeit, startzeit, status FROM termine WHERE datum=? AND geloescht_am IS NULL ORDER BY COALESCE(startzeit,bring_zeit)',
  [datum],
  (err, rows) => {
    if (err) { console.error(err); process.exit(1); }
    rows.forEach(r => {
      console.log(r.termin_nr, '#'+r.id, (r.kunde_name||'').substring(0,22).padEnd(22), 'MA:'+r.mitarbeiter_id, 'BZ:'+r.bring_zeit, 'SZ:'+r.startzeit, r.status);
    });
    db.close();
  }
);
