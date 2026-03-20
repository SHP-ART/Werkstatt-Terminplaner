const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/var/lib/werkstatt-terminplaner/database/werkstatt.db');
db.all("SELECT id,termin_nr,kunde_name,mitarbeiter_id,bring_zeit,startzeit,status,arbeitszeiten_details FROM termine WHERE id IN (489,490) ORDER BY id", [], (err,rows) => {
  rows.forEach(r => {
    console.log("\n---", r.termin_nr, r.kunde_name);
    console.log("MA:", r.mitarbeiter_id, "BZ:", r.bring_zeit, "SZ:", r.startzeit, "Status:", r.status);
    if(r.arbeitszeiten_details) {
      try { console.log("DETAILS:", JSON.stringify(JSON.parse(r.arbeitszeiten_details), null, 2)); }
      catch(e) { console.log("DETAILS:", r.arbeitszeiten_details); }
    }
  });
  db.close();
});
