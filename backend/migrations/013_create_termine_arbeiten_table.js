/**
 * Migration 013: Erstellt die termine_arbeiten Tabelle
 * 
 * Ersetzt das JSON-basierte arbeitszeiten_details Feld durch eine relationale Struktur.
 * Enthält alle Felder für Arbeitsdetails plus die 6 berechneten Zeitfelder.
 */

module.exports = {
  version: 13,
  description: 'Erstellt termine_arbeiten Tabelle für relationale Arbeitszeit-Speicherung',
  
  up: (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Erstelle termine_arbeiten Tabelle mit vollständiger Struktur
        db.run(`
          CREATE TABLE IF NOT EXISTS termine_arbeiten (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            termin_id INTEGER NOT NULL,
            
            -- Arbeitsdetails
            arbeit TEXT NOT NULL,
            zeit INTEGER NOT NULL,
            mitarbeiter_id INTEGER,
            lehrling_id INTEGER,
            startzeit TEXT,
            reihenfolge INTEGER DEFAULT 0,
            
            -- Berechnete Zeitfelder
            berechnete_dauer_minuten INTEGER,
            berechnete_endzeit TEXT,
            faktor_nebenzeit REAL,
            faktor_aufgabenbewaeltigung REAL,
            pause_enthalten INTEGER DEFAULT 0,
            pause_minuten INTEGER DEFAULT 0,
            
            -- Timestamps
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            
            -- Foreign Keys
            FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE CASCADE,
            FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE SET NULL,
            FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE SET NULL,
            
            -- Constraints
            CHECK (mitarbeiter_id IS NOT NULL OR lehrling_id IS NOT NULL),
            CHECK (zeit > 0)
          )
        `, (err) => {
          if (err) {
            console.error('Fehler beim Erstellen der termine_arbeiten Tabelle:', err);
            reject(err);
            return;
          }
          
          // Index für Performance
          db.run(`
            CREATE INDEX IF NOT EXISTS idx_termine_arbeiten_termin_id 
            ON termine_arbeiten(termin_id)
          `, (err) => {
            if (err) {
              console.error('Fehler beim Erstellen des Index:', err);
              reject(err);
              return;
            }
            
            db.run(`
              CREATE INDEX IF NOT EXISTS idx_termine_arbeiten_mitarbeiter 
              ON termine_arbeiten(mitarbeiter_id)
            `, (err) => {
              if (err) {
                console.error('Fehler beim Erstellen des Mitarbeiter-Index:', err);
                reject(err);
                return;
              }
              
              db.run(`
                CREATE INDEX IF NOT EXISTS idx_termine_arbeiten_lehrling 
                ON termine_arbeiten(lehrling_id)
              `, (err) => {
                if (err) {
                  console.error('Fehler beim Erstellen des Lehrling-Index:', err);
                  reject(err);
                  return;
                }
                
                console.log('✓ termine_arbeiten Tabelle mit Indizes erstellt');
                resolve();
              });
            });
          });
        });
      });
    });
  },
  
  down: (db) => {
    return new Promise((resolve, reject) => {
      db.run('DROP TABLE IF EXISTS termine_arbeiten', (err) => {
        if (err) {
          console.error('Fehler beim Löschen der termine_arbeiten Tabelle:', err);
          reject(err);
          return;
        }
        
        console.log('✓ termine_arbeiten Tabelle gelöscht');
        resolve();
      });
    });
  }
};
