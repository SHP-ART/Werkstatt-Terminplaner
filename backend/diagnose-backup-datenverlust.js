const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const backupFile = 'C:\\Users\\Sven\\Documents\\Github\\Terminplaner\\Werkstatt-Terminplaner\\backend\\Datenbank\\werkstatt_backup_20260204T08-54-20.db';
const currentDb = path.join(__dirname, 'database', 'werkstatt.db');

console.log('🔍 Analysiere Datenverlust beim Backup\n');

if (!fs.existsSync(backupFile)) {
  console.error('❌ Backup-Datei nicht gefunden:', backupFile);
  process.exit(1);
}

if (!fs.existsSync(currentDb)) {
  console.error('❌ Aktuelle DB nicht gefunden:', currentDb);
  process.exit(1);
}

console.log('📊 Backup-Datei:', backupFile);
console.log('   Größe:', (fs.statSync(backupFile).size / 1024).toFixed(2), 'KB\n');

console.log('📊 Aktuelle DB:', currentDb);
console.log('   Größe:', (fs.statSync(currentDb).size / 1024).toFixed(2), 'KB\n');

// Analysiere Backup
const backupDb = new sqlite3.Database(backupFile);

// Analysiere aktuelle DB
const currentDatabase = new sqlite3.Database(currentDb);

console.log('═══════════════════════════════════════════════════════════════\n');

function analyzeDatabase(db, label, callback) {
  console.log(`📋 ${label}:\n`);
  
  const queries = {
    termine: 'SELECT COUNT(*) as anzahl, MAX(datum) as neuester, MIN(datum) as aeltester FROM termine',
    mitarbeiter: 'SELECT COUNT(*) as anzahl FROM mitarbeiter',
    fahrzeuge: 'SELECT COUNT(*) as anzahl FROM fahrzeuge',
    kunden: 'SELECT COUNT(*) as anzahl FROM kunden',
    teile: 'SELECT COUNT(*) as anzahl FROM teile_bestellungen',
    abwesenheiten: 'SELECT COUNT(*) as anzahl FROM abwesenheiten',
    ersatzautos: 'SELECT COUNT(*) as anzahl FROM ersatzautos',
    arbeitszeiten: 'SELECT COUNT(*) as anzahl FROM arbeitszeiten'
  };

  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;

  Object.keys(queries).forEach(key => {
    db.all(queries[key], [], (err, rows) => {
      if (err) {
        results[key] = { error: err.message };
      } else {
        results[key] = rows[0];
      }
      
      completed++;
      if (completed === total) {
        // Alle Queries abgeschlossen
        Object.keys(results).forEach(key => {
          const data = results[key];
          if (data.error) {
            console.log(`  ❌ ${key}: Fehler - ${data.error}`);
          } else if (data.anzahl !== undefined) {
            console.log(`  ✓ ${key}: ${data.anzahl}`);
            if (data.neuester) {
              console.log(`    → Neuester: ${data.neuester}, Ältester: ${data.aeltester}`);
            }
          }
        });
        console.log('');
        callback(results);
      }
    });
  });
}

analyzeDatabase(backupDb, 'BACKUP-DATEI', (backupResults) => {
  analyzeDatabase(currentDatabase, 'AKTUELLE DB', (currentResults) => {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 VERGLEICH (Backup vs. Aktuell):\n');
    
    Object.keys(backupResults).forEach(key => {
      const backup = backupResults[key];
      const current = currentResults[key];
      
      if (backup.error || current.error) {
        console.log(`  ⚠️  ${key}: Fehler beim Vergleich`);
        return;
      }
      
      const backupCount = backup.anzahl || 0;
      const currentCount = current.anzahl || 0;
      const diff = currentCount - backupCount;
      
      if (diff > 0) {
        console.log(`  ⚠️  ${key}: ${backupCount} → ${currentCount} (${diff} FEHLEN IM BACKUP!)`);
      } else if (diff < 0) {
        console.log(`  ℹ️  ${key}: ${backupCount} → ${currentCount} (${Math.abs(diff)} mehr im Backup)`);
      } else {
        console.log(`  ✓ ${key}: ${backupCount} (identisch)`);
      }
    });
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    
    // Prüfe Termine im Detail
    console.log('\n🔍 DETAILLIERTE TERMINE-ANALYSE:\n');
    
    backupDb.all('SELECT datum, COUNT(*) as anzahl FROM termine GROUP BY datum ORDER BY datum DESC LIMIT 20', [], (err1, backupTermine) => {
      currentDatabase.all('SELECT datum, COUNT(*) as anzahl FROM termine GROUP BY datum ORDER BY datum DESC LIMIT 20', [], (err2, currentTermine) => {
        if (!err1 && !err2) {
          console.log('📅 Backup - Termine nach Datum:');
          backupTermine.forEach(t => console.log(`   ${t.datum}: ${t.anzahl} Termine`));
          
          console.log('\n📅 Aktuelle DB - Termine nach Datum:');
          currentTermine.forEach(t => console.log(`   ${t.datum}: ${t.anzahl} Termine`));
        }
        
        console.log('\n✅ Analyse abgeschlossen');
        backupDb.close();
        currentDatabase.close();
      });
    });
  });
});
