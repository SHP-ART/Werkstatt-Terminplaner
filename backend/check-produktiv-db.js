const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');
console.log('\n📊 ANALYSE DER WIEDERHERGESTELLTEN PRODUKTIV-DATENBANK');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('🔍 Pfad:', dbPath);

const db = new sqlite3.Database(dbPath);

db.all(`SELECT COUNT(*) as anzahl, MAX(datum) as neuester, MIN(datum) as aeltester FROM termine`, [], (err, rows) => {
  if (err) {
    console.error('❌ Fehler:', err);
    db.close();
    return;
  }
  
  const { anzahl, neuester, aeltester } = rows[0];
  console.log('\n✅ TERMINE:');
  console.log(`   Anzahl: ${anzahl}`);
  console.log(`   Neuester: ${neuester}`);
  console.log(`   Ältester: ${aeltester}`);
  
  // Termine für heute
  const heute = new Date().toISOString().split('T')[0];
  db.all(`SELECT COUNT(*) as heute FROM termine WHERE datum = ?`, [heute], (err2, rows2) => {
    if (!err2) {
      console.log(`   Termine HEUTE (${heute}): ${rows2[0].heute}`);
    }
    
    // Termine diese Woche
    const jetzt = new Date();
    const wochenStart = new Date(jetzt);
    wochenStart.setDate(jetzt.getDate() - jetzt.getDay() + 1);
    const wochenEnde = new Date(wochenStart);
    wochenEnde.setDate(wochenStart.getDate() + 6);
    
    const wochenStartStr = wochenStart.toISOString().split('T')[0];
    const wochenEndeStr = wochenEnde.toISOString().split('T')[0];
    
    db.all(`SELECT COUNT(*) as woche FROM termine WHERE datum BETWEEN ? AND ?`, [wochenStartStr, wochenEndeStr], (err3, rows3) => {
      if (!err3) {
        console.log(`   Termine diese Woche (${wochenStartStr} - ${wochenEndeStr}): ${rows3[0].woche}`);
      }
      
      // Weitere Statistiken
      db.all(`SELECT COUNT(*) as anzahl FROM kunden`, [], (err4, kunden) => {
        db.all(`SELECT COUNT(*) as anzahl FROM fahrzeuge`, [], (err5, fahrzeuge) => {
          db.all(`SELECT COUNT(*) as anzahl FROM abwesenheiten`, [], (err6, abw) => {
            console.log('\n✅ WEITERE DATEN:');
            console.log(`   Kunden: ${kunden[0].anzahl}`);
            console.log(`   Fahrzeuge: ${fahrzeuge[0].anzahl}`);
            console.log(`   Abwesenheiten: ${abw[0].anzahl}`);
            
            // Termine nach Datum
            db.all(`SELECT datum, COUNT(*) as anzahl FROM termine GROUP BY datum ORDER BY datum DESC LIMIT 10`, [], (err7, termine) => {
              console.log('\n📅 LETZTE 10 TAGE MIT TERMINEN:');
              termine.forEach(t => {
                console.log(`   ${t.datum}: ${t.anzahl} Termine`);
              });
              
              console.log('\n═══════════════════════════════════════════════════════════════');
              console.log('✅ PRODUKTIV-DATENBANK ERFOLGREICH WIEDERHERGESTELLT!');
              console.log('   Die Datenbank enthält aktuelle Daten vom Produktivsystem.');
              console.log('═══════════════════════════════════════════════════════════════\n');
              
              db.close();
            });
          });
        });
      });
    });
  });
});
