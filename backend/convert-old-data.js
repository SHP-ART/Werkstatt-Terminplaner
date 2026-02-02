/**
 * Konvertierungs-Script für Migration von alten Versionen
 * Wandelt arbeitsstunden_pro_tag in wochenarbeitszeit_stunden um
 * 
 * Aufruf: node convert-old-data.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');

console.log('📦 Starte Datenkonvertierung von alten Versionen...');
console.log(`📂 Datenbank: ${dbPath}`);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Konvertiere Mitarbeiter: arbeitsstunden_pro_tag → wochenarbeitszeit_stunden
  db.all(`SELECT id, name, arbeitsstunden_pro_tag, wochenarbeitszeit_stunden FROM mitarbeiter`, [], (err, rows) => {
    if (err) {
      console.error('❌ Fehler beim Lesen der Mitarbeiter:', err.message);
      return;
    }

    console.log(`\n👷 Gefundene Mitarbeiter: ${rows.length}`);
    
    let konvertiert = 0;
    const stmt = db.prepare(`
      UPDATE mitarbeiter 
      SET wochenarbeitszeit_stunden = ?,
          arbeitstage_pro_woche = 5,
          pausenzeit_minuten = 30
      WHERE id = ?
    `);

    rows.forEach(row => {
      // Konvertiere nur wenn wochenarbeitszeit_stunden noch nicht gesetzt ist
      // oder gleich dem Standardwert ist (40) und arbeitsstunden_pro_tag existiert
      if (row.arbeitsstunden_pro_tag && 
          (!row.wochenarbeitszeit_stunden || row.wochenarbeitszeit_stunden === 40)) {
        
        // Berechnung: arbeitsstunden_pro_tag × 5 Tage = Wochenarbeitszeit
        const wochenStunden = row.arbeitsstunden_pro_tag * 5;
        
        stmt.run([wochenStunden, row.id], (err) => {
          if (err) {
            console.error(`  ❌ Fehler bei ${row.name}:`, err.message);
          } else {
            console.log(`  ✓ ${row.name}: ${row.arbeitsstunden_pro_tag}h/Tag → ${wochenStunden}h/Woche`);
            konvertiert++;
          }
        });
      } else if (row.wochenarbeitszeit_stunden) {
        console.log(`  ⏭️  ${row.name}: Bereits konfiguriert (${row.wochenarbeitszeit_stunden}h/Woche)`);
      }
    });

    stmt.finalize(() => {
      console.log(`\n📊 Mitarbeiter konvertiert: ${konvertiert} von ${rows.length}`);
    });
  });

  // 2. Konvertiere Lehrlinge
  setTimeout(() => {
    db.all(`SELECT id, name, arbeitsstunden_pro_tag, wochenarbeitszeit_stunden FROM lehrlinge`, [], (err, rows) => {
      if (err) {
        console.error('❌ Fehler beim Lesen der Lehrlinge:', err.message);
        return;
      }

      console.log(`\n🎓 Gefundene Lehrlinge: ${rows.length}`);
      
      let konvertiert = 0;
      const stmt = db.prepare(`
        UPDATE lehrlinge 
        SET wochenarbeitszeit_stunden = ?,
            arbeitstage_pro_woche = 5,
            pausenzeit_minuten = 30
        WHERE id = ?
      `);

      rows.forEach(row => {
        if (row.arbeitsstunden_pro_tag && 
            (!row.wochenarbeitszeit_stunden || row.wochenarbeitszeit_stunden === 40)) {
          
          const wochenStunden = row.arbeitsstunden_pro_tag * 5;
          
          stmt.run([wochenStunden, row.id], (err) => {
            if (err) {
              console.error(`  ❌ Fehler bei ${row.name}:`, err.message);
            } else {
              console.log(`  ✓ ${row.name}: ${row.arbeitsstunden_pro_tag}h/Tag → ${wochenStunden}h/Woche`);
              konvertiert++;
            }
          });
        } else if (row.wochenarbeitszeit_stunden) {
          console.log(`  ⏭️  ${row.name}: Bereits konfiguriert (${row.wochenarbeitszeit_stunden}h/Woche)`);
        }
      });

      stmt.finalize(() => {
        console.log(`\n📊 Lehrlinge konvertiert: ${konvertiert} von ${rows.length}`);
        
        // 3. Alte Abwesenheiten-Tabelle prüfen
        setTimeout(() => {
          db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name='abwesenheiten_legacy'`, [], (err, tables) => {
            if (tables && tables.length > 0) {
              console.log('\n📋 Legacy-Abwesenheiten gefunden!');
              console.log('ℹ️  Die alte Tabelle "abwesenheiten_legacy" bleibt erhalten.');
              console.log('ℹ️  Nutzen Sie die neue Tabelle "abwesenheiten" für zukünftige Einträge.');
              
              db.all(`SELECT COUNT(*) as count FROM abwesenheiten_legacy`, [], (err, result) => {
                if (result && result[0]) {
                  console.log(`   Alte Einträge: ${result[0].count}`);
                }
              });
            }
            
            console.log('\n✅ Konvertierung abgeschlossen!');
            console.log('\n💡 Nächste Schritte:');
            console.log('   1. Überprüfen Sie die Wochenarbeitszeiten in "⚙️ Werkstatt-Einstellungen"');
            console.log('   2. Passen Sie individuelle Werte bei Bedarf an');
            console.log('   3. Konfigurieren Sie Samstagsarbeit falls benötigt');
            console.log('   4. Tragen Sie Abwesenheiten im neuen System ein');
            
            db.close();
          });
        }, 500);
      });
    });
  }, 500);
});
