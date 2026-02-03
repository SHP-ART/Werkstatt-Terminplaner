/**
 * Reparatur-Script: Korrigiert die abwesenheiten-Tabelle
 * 
 * Problem: Die alte abwesenheiten-Tabelle (mit datum, urlaub, krank)
 * sollte zu abwesenheiten_legacy umbenannt werden, und eine neue
 * abwesenheiten-Tabelle (mit id, mitarbeiter_id, etc.) erstellt werden.
 */

const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'node_modules/electron/dist/database/werkstatt.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Starte Datenbank-Reparatur...\n');
console.log('Datenbank:', dbPath);

db.serialize(() => {
  // 1. Prüfen ob abwesenheiten die alte Struktur hat
  db.all("PRAGMA table_info(abwesenheiten)", (err, cols) => {
    if (err) {
      console.error('Fehler:', err);
      db.close();
      return;
    }

    const hasOldStructure = cols.some(c => c.name === 'datum' && !cols.some(x => x.name === 'mitarbeiter_id'));
    
    if (!hasOldStructure) {
      console.log('✓ abwesenheiten-Tabelle hat bereits die neue Struktur');
      db.close();
      return;
    }

    console.log('→ Alte abwesenheiten-Struktur erkannt');
    console.log('→ Starte Umbenennung und Neuerstellung...\n');

    // 2. Alte Tabelle umbenennen zu abwesenheiten_legacy
    console.log('1. Benenne alte Tabelle um zu abwesenheiten_legacy...');
    db.run("ALTER TABLE abwesenheiten RENAME TO abwesenheiten_legacy", (err) => {
      if (err) {
        if (err.message.includes('already exists')) {
          console.log('   ℹ️  abwesenheiten_legacy existiert bereits, lösche alte abwesenheiten...');
          db.run("DROP TABLE abwesenheiten", (err) => {
            if (err) console.error('   ✗ Fehler beim Löschen:', err.message);
            else console.log('   ✓ Alte Tabelle gelöscht');
            createNewTable();
          });
        } else {
          console.error('   ✗ Fehler:', err.message);
          db.close();
        }
      } else {
        console.log('   ✓ Umbenannt zu abwesenheiten_legacy');
        createNewTable();
      }
    });
  });
});

function createNewTable() {
  // 3. Neue abwesenheiten-Tabelle erstellen
  console.log('\n2. Erstelle neue abwesenheiten-Tabelle...');
  db.run(`
    CREATE TABLE IF NOT EXISTS abwesenheiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      typ TEXT NOT NULL CHECK(typ IN ('urlaub', 'krank', 'berufsschule', 'lehrgang')),
      datum_von TEXT NOT NULL,
      datum_bis TEXT NOT NULL,
      beschreibung TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE CASCADE,
      FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE CASCADE,
      CHECK ((mitarbeiter_id IS NOT NULL AND lehrling_id IS NULL) OR 
             (mitarbeiter_id IS NULL AND lehrling_id IS NOT NULL))
    )
  `, (err) => {
    if (err) {
      console.error('   ✗ Fehler:', err.message);
    } else {
      console.log('   ✓ Neue abwesenheiten-Tabelle erstellt');
    }
    createIndexes();
  });
}

function createIndexes() {
  // 4. Indizes erstellen
  console.log('\n3. Erstelle Indizes...');
  db.run("CREATE INDEX IF NOT EXISTS idx_abwesenheiten_mitarbeiter ON abwesenheiten(mitarbeiter_id)", (err) => {
    if (err) console.error('   ✗ idx_mitarbeiter:', err.message);
    else console.log('   ✓ idx_abwesenheiten_mitarbeiter');
    
    db.run("CREATE INDEX IF NOT EXISTS idx_abwesenheiten_lehrling ON abwesenheiten(lehrling_id)", (err) => {
      if (err) console.error('   ✗ idx_lehrling:', err.message);
      else console.log('   ✓ idx_abwesenheiten_lehrling');
      
      db.run("CREATE INDEX IF NOT EXISTS idx_abwesenheiten_datum ON abwesenheiten(datum_von, datum_bis)", (err) => {
        if (err) console.error('   ✗ idx_datum:', err.message);
        else console.log('   ✓ idx_abwesenheiten_datum');
        
        verifyResult();
      });
    });
  });
}

function verifyResult() {
  // 5. Ergebnis verifizieren
  console.log('\n4. Verifiziere Ergebnis...');
  db.all("PRAGMA table_info(abwesenheiten)", (err, cols) => {
    if (err) {
      console.error('   ✗ Fehler:', err.message);
    } else {
      console.log('   Neue Spalten:');
      cols.forEach(c => console.log('     -', c.name, ':', c.type));
      
      const hasNewStructure = cols.some(c => c.name === 'mitarbeiter_id');
      if (hasNewStructure) {
        console.log('\n✅ Reparatur erfolgreich abgeschlossen!');
        console.log('   Die abwesenheiten-Tabelle hat nun die korrekte Struktur.');
        console.log('   Bitte starte den Server neu.');
      } else {
        console.log('\n❌ Reparatur fehlgeschlagen - bitte manuell prüfen');
      }
    }
    db.close();
  });
}
