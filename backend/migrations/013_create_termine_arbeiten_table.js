/**
 * Migration 013: Erstellt die termine_arbeiten Tabelle + automatische Datenmigration
 * 
 * Ersetzt das JSON-basierte arbeitszeiten_details Feld durch eine relationale Struktur.
 * Enthält alle Felder für Arbeitsdetails plus die 6 berechneten Zeitfelder.
 * Migriert automatisch alle existierenden Daten.
 */

// WICHTIG: Lazy Loading um zirkuläre Abhängigkeit zu vermeiden
// zeitBerechnung wird erst in der up()-Funktion geladen, nicht beim Modulimport
let berechneArbeitszeitFuerSpeicherung = null;

module.exports = {
  version: 14,
  description: 'Erstellt termine_arbeiten Tabelle für relationale Arbeitszeit-Speicherung + Datenmigration',
  
  up: (db) => {
    // Lazy load zeitBerechnung hier, nicht beim Modulimport
    if (!berechneArbeitszeitFuerSpeicherung) {
      berechneArbeitszeitFuerSpeicherung = require('../src/utils/zeitBerechnung').berechneArbeitszeitFuerSpeicherung;
    }
    
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
                
                // AUTOMATISCHE DATENMIGRATION
                migrateExistingData(db)
                  .then(() => {
                    console.log('✓ Datenmigration abgeschlossen');
                    resolve();
                  })
                  .catch((migrateErr) => {
                    console.error('❌ Fehler bei Datenmigration:', migrateErr);
                    // Migration trotzdem als erfolgreich markieren - Tabelle ist erstellt
                    // Daten können manuell migriert werden
                    resolve();
                  });
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

/**
 * Migriert existierende Daten von arbeitszeiten_details → termine_arbeiten
 */
async function migrateExistingData(db) {
  return new Promise((resolve, reject) => {
    // Prüfe ob schon Daten existieren
    db.get('SELECT COUNT(*) as count FROM termine_arbeiten', (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (row.count > 0) {
        console.log(`ℹ️  Datenmigration übersprungen: ${row.count} Einträge bereits vorhanden`);
        resolve();
        return;
      }
      
      // Lade Termine mit arbeitszeiten_details
      db.all(`
        SELECT id, arbeitszeiten_details 
        FROM termine 
        WHERE arbeitszeiten_details IS NOT NULL 
          AND arbeitszeiten_details != ''
          AND arbeitszeiten_details != '[]'
      `, (err, termine) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!termine || termine.length === 0) {
          console.log('ℹ️  Keine Arbeitszeitdaten zum Migrieren gefunden');
          resolve();
          return;
        }
        
        console.log(`🔄 Migriere ${termine.length} Termine...`);
        
        // Lade Personen-Daten für Berechnungen
        loadPersonenData(db).then(personen => {
          let migratedCount = 0;
          let errorCount = 0;
          
          const insertStmt = db.prepare(`
            INSERT INTO termine_arbeiten (
              termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id,
              startzeit, reihenfolge,
              berechnete_dauer_minuten, berechnete_endzeit,
              faktor_nebenzeit, faktor_aufgabenbewaeltigung,
              pause_enthalten, pause_minuten
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          
          termine.forEach(termin => {
            try {
              const arbeitszeitenObj = JSON.parse(termin.arbeitszeiten_details || '{}');
              const arbeitKeys = Object.keys(arbeitszeitenObj).filter(key => !key.startsWith('_'));
              
              if (arbeitKeys.length === 0) return;
              
              // Standard-Person aus Meta-Daten
              const gesamtPerson = arbeitszeitenObj._gesamt_mitarbeiter_id || null;
              let defaultMitarbeiterId = null;
              let defaultLehrlingId = null;
              
              if (gesamtPerson) {
                if (gesamtPerson.type === 'mitarbeiter') {
                  defaultMitarbeiterId = gesamtPerson.id;
                } else if (gesamtPerson.type === 'lehrling') {
                  defaultLehrlingId = gesamtPerson.id;
                }
              }
              
              let reihenfolge = 0;
              arbeitKeys.forEach(arbeitName => {
                const arbeitData = arbeitszeitenObj[arbeitName];
                
                let zeit = 0;
                let mitarbeiterId = defaultMitarbeiterId;
                let lehrlingId = defaultLehrlingId;
                let startzeit = arbeitszeitenObj._gesamt_startzeit || null;
                
                if (typeof arbeitData === 'number') {
                  zeit = arbeitData;
                } else if (typeof arbeitData === 'object' && arbeitData !== null) {
                  zeit = arbeitData.zeit || 0;
                  mitarbeiterId = arbeitData.mitarbeiter_id || defaultMitarbeiterId;
                  lehrlingId = arbeitData.lehrling_id || defaultLehrlingId;
                  startzeit = arbeitData.startzeit || startzeit;
                  
                  if (arbeitData.type === 'mitarbeiter' && arbeitData.mitarbeiter_id) {
                    mitarbeiterId = arbeitData.mitarbeiter_id;
                    lehrlingId = null;
                  } else if (arbeitData.type === 'lehrling' && arbeitData.lehrling_id) {
                    lehrlingId = arbeitData.lehrling_id;
                    mitarbeiterId = null;
                  }
                }
                
                if ((!mitarbeiterId && !lehrlingId) || !zeit || zeit <= 0) {
                  errorCount++;
                  return;
                }
                
                // Berechne Zeiten
                let berechneteWerte = {
                  berechnete_dauer_minuten: zeit,
                  berechnete_endzeit: null,
                  faktor_nebenzeit: null,
                  faktor_aufgabenbewaeltigung: null,
                  pause_enthalten: 0,
                  pause_minuten: 0
                };
                
                let person = null;
                if (mitarbeiterId) {
                  person = personen.mitarbeiter.find(m => m.id === mitarbeiterId);
                } else if (lehrlingId) {
                  person = personen.lehrlinge.find(l => l.id === lehrlingId);
                }
                
                if (person && startzeit && zeit) {
                  try {
                    berechneteWerte = berechneArbeitszeitFuerSpeicherung(person, startzeit, zeit);
                  } catch (calcErr) {
                    // Verwende Default-Werte bei Berechnungsfehlern
                  }
                }
                
                insertStmt.run(
                  termin.id, arbeitName, zeit, mitarbeiterId, lehrlingId,
                  startzeit, reihenfolge++,
                  berechneteWerte.berechnete_dauer_minuten,
                  berechneteWerte.berechnete_endzeit,
                  berechneteWerte.faktor_nebenzeit,
                  berechneteWerte.faktor_aufgabenbewaeltigung,
                  berechneteWerte.pause_enthalten ? 1 : 0,
                  berechneteWerte.pause_minuten,
                  (err) => {
                    if (err) errorCount++;
                    else migratedCount++;
                  }
                );
              });
            } catch (parseErr) {
              errorCount++;
            }
          });
          
          insertStmt.finalize((err) => {
            if (err) {
              reject(err);
              return;
            }
            
            console.log(`✅ Migriert: ${migratedCount} Arbeitszeiten (${errorCount} Fehler)`);
            resolve();
          });
        }).catch(reject);
      });
    });
  });
}

/**
 * Lädt alle Personen-Daten
 */
function loadPersonenData(db) {
  return new Promise((resolve, reject) => {
    const personen = { mitarbeiter: [], lehrlinge: [] };
    
    db.all('SELECT * FROM mitarbeiter', (err, mitarbeiter) => {
      if (err) {
        reject(err);
        return;
      }
      personen.mitarbeiter = mitarbeiter || [];
      
      db.all('SELECT * FROM lehrlinge', (err, lehrlinge) => {
        if (err) {
          reject(err);
          return;
        }
        personen.lehrlinge = lehrlinge || [];
        resolve(personen);
      });
    });
  });
}
