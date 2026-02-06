const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');
console.log('🔍 Prüfe Datenbank:', dbPath);

const db = new sqlite3.Database(dbPath);

console.log('\n=== TABELLEN ===');
db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`, [], (err, tables) => {
  if (err) {
    console.error('Fehler:', err);
    db.close();
    return;
  }
  
  console.log('Tabellen:', tables.map(t => t.name).join(', '));
  
  console.log('\n=== TERMINE ===');
  db.all(`SELECT COUNT(*) as anzahl, MAX(datum) as neuester, MIN(datum) as aeltester FROM termine`, [], (err2, rows) => {
    if (err2) {
      console.error('Fehler:', err2);
      db.close();
      return;
    }
    
    console.log('Anzahl:', rows[0].anzahl);
    console.log('Neuester Termin:', rows[0].neuester);
    console.log('Ältester Termin:', rows[0].aeltester);
    
    // Prüfe ob heute Termine vorhanden sind
    const heute = new Date().toISOString().split('T')[0];
    db.all(`SELECT COUNT(*) as anzahl_heute FROM termine WHERE datum = ?`, [heute], (err3, rows2) => {
      if (err3) {
        console.error('Fehler:', err3);
        db.close();
        return;
      }
      
      console.log(`\nTermine für HEUTE (${heute}):`, rows2[0].anzahl_heute);
      
      // Prüfe diese Woche
      const jetzt = new Date();
      const wochenStart = new Date(jetzt);
      wochenStart.setDate(jetzt.getDate() - jetzt.getDay() + 1); // Montag
      const wochenEnde = new Date(wochenStart);
      wochenEnde.setDate(wochenStart.getDate() + 6); // Sonntag
      
      const wochenStartStr = wochenStart.toISOString().split('T')[0];
      const wochenEndeStr = wochenEnde.toISOString().split('T')[0];
      
      db.all(`SELECT COUNT(*) as anzahl_woche FROM termine WHERE datum BETWEEN ? AND ?`, 
        [wochenStartStr, wochenEndeStr], (err4, rows3) => {
        if (err4) {
          console.error('Fehler:', err4);
          db.close();
          return;
        }
        
        console.log(`Termine diese Woche (${wochenStartStr} bis ${wochenEndeStr}):`, rows3[0].anzahl_woche);
        
        console.log('\n=== MITARBEITER ===');
        db.all(`SELECT id, name FROM mitarbeiter ORDER BY id`, [], (err5, ma) => {
          if (err5) {
            console.error('Fehler:', err5);
            db.close();
            return;
          }
          
          console.log('Mitarbeiter:', ma.map(m => `${m.id}: ${m.name}`).join(', '));
          
          console.log('\n=== FAHRZEUGE ===');
          db.all(`SELECT id, kunde, kennzeichen FROM fahrzeuge ORDER BY id LIMIT 10`, [], (err6, fz) => {
            if (err6) {
              console.error('Fehler:', err6);
              db.close();
              return;
            }
            
            console.log('Fahrzeuge (erste 10):', fz.length);
            fz.forEach(f => console.log(`  ${f.id}: ${f.kunde} (${f.kennzeichen})`));
            
            console.log('\n=== SCHEMA VERSION ===');
            db.all(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`, [], (err7, ver) => {
              if (err7) {
                console.log('Keine schema_migrations Tabelle gefunden');
              } else {
                console.log('Schema Version:', ver[0]?.version || 'unbekannt');
              }
              
              console.log('\n✅ Analyse abgeschlossen\n');
              db.close();
            });
          });
        });
      });
    });
  });
});
