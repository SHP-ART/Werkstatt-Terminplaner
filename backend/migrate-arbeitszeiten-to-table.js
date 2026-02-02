/**
 * Datenmigrations-Skript: JSON arbeitszeiten_details → termine_arbeiten Tabelle
 * 
 * Migriert alle existierenden Arbeitszeitdaten aus dem JSON-Feld arbeitszeiten_details
 * in die neue relationale termine_arbeiten Tabelle.
 * 
 * WICHTIG: Dieses Skript muss NACH Migration 013 ausgeführt werden!
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { berechneArbeitszeitFuerSpeicherung } = require('./src/utils/zeitBerechnung');

const dbPath = path.join(__dirname, 'database/werkstatt.db');

async function migrateData() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔄 Starte Datenmigration: arbeitszeiten_details → termine_arbeiten...\n');
    
    db.serialize(() => {
      // 1. Hole alle Termine mit arbeitszeiten_details
      db.all(`
        SELECT id, arbeitszeiten_details 
        FROM termine 
        WHERE arbeitszeiten_details IS NOT NULL 
          AND arbeitszeiten_details != ''
          AND arbeitszeiten_details != '[]'
      `, async (err, termine) => {
        if (err) {
          console.error('❌ Fehler beim Laden der Termine:', err);
          db.close();
          reject(err);
          return;
        }
        
        if (!termine || termine.length === 0) {
          console.log('ℹ️  Keine Termine mit Arbeitszeitdaten gefunden.');
          db.close();
          resolve();
          return;
        }
        
        console.log(`📊 ${termine.length} Termine mit Arbeitszeitdaten gefunden.\n`);
        
        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        // 2. Verarbeite jeden Termin
        const insertStmt = db.prepare(`
          INSERT INTO termine_arbeiten (
            termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id,
            startzeit, reihenfolge,
            berechnete_dauer_minuten, berechnete_endzeit,
            faktor_nebenzeit, faktor_aufgabenbewaeltigung,
            pause_enthalten, pause_minuten
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const termin of termine) {
          try {
            const arbeitszeitenObj = JSON.parse(termin.arbeitszeiten_details || '{}');
            
            // Entferne Meta-Felder (alle Keys die mit _ beginnen)
            const arbeitKeys = Object.keys(arbeitszeitenObj).filter(key => !key.startsWith('_'));
            
            if (arbeitKeys.length === 0) {
              skippedCount++;
              continue;
            }
            
            // 3. Hole Personen-Daten für Berechnungen (asynchron laden)
            const personen = await getPersonenData(db);
            
            // Standardwerte aus Meta-Daten
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
            
            // 4. Für jede Arbeit einen Datensatz erstellen
            let reihenfolge = 0;
            for (const arbeitName of arbeitKeys) {
              const arbeitData = arbeitszeitenObj[arbeitName];
              
              // Arbeitsdaten können entweder Zahl (Zeit) oder Objekt sein
              let zeit = 0;
              let mitarbeiterId = defaultMitarbeiterId;
              let lehrlingId = defaultLehrlingId;
              let startzeit = arbeitszeitenObj._gesamt_startzeit || null;
              
              if (typeof arbeitData === 'number') {
                zeit = arbeitData;
              } else if (typeof arbeitData === 'object' && arbeitData !== null) {
                zeit = arbeitData.zeit || 0;
                mitarbeiterId = arbeitData.mitarbeiter_id || arbeitData.mitarbeiterId || defaultMitarbeiterId;
                lehrlingId = arbeitData.lehrling_id || arbeitData.lehrlingId || defaultLehrlingId;
                startzeit = arbeitData.startzeit || startzeit;
                
                // Type-Check für Objekte mit type-Feld
                if (arbeitData.type === 'mitarbeiter' && arbeitData.mitarbeiter_id) {
                  mitarbeiterId = arbeitData.mitarbeiter_id;
                  lehrlingId = null;
                } else if (arbeitData.type === 'lehrling' && arbeitData.lehrling_id) {
                  lehrlingId = arbeitData.lehrling_id;
                  mitarbeiterId = null;
                }
              }
              
              if (!mitarbeiterId && !lehrlingId) {
                console.warn(`⚠️  Termin ${termin.id}, Arbeit "${arbeitName}": Keine Person zugeordnet`);
                errorCount++;
                continue;
              }
              
              if (!zeit || zeit <= 0) {
                console.warn(`⚠️  Termin ${termin.id}, Arbeit "${arbeitName}": Ungültige Zeit (${zeit})`);
                errorCount++;
                continue;
              }
              
              // Hole Person-Objekt für Berechnung
              let person = null;
              if (mitarbeiterId) {
                person = personen.mitarbeiter.find(m => m.id === mitarbeiterId);
              } else if (lehrlingId) {
                person = personen.lehrlinge.find(l => l.id === lehrlingId);
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
              
              if (person && startzeit && zeit) {
                try {
                  berechneteWerte = berechneArbeitszeitFuerSpeicherung(
                    person,
                    startzeit,
                    zeit
                  );
                } catch (calcErr) {
                  console.warn(`⚠️  Berechnung fehlgeschlagen für Termin ${termin.id}, Arbeit "${arbeitName}":`, calcErr.message);
                }
              }
              
              // Insert in neue Tabelle
              insertStmt.run(
                termin.id,
                arbeitName,
                zeit,
                mitarbeiterId,
                lehrlingId,
                startzeit,
                reihenfolge++,
                berechneteWerte.berechnete_dauer_minuten,
                berechneteWerte.berechnete_endzeit,
                berechneteWerte.faktor_nebenzeit,
                berechneteWerte.faktor_aufgabenbewaeltigung,
                berechneteWerte.pause_enthalten ? 1 : 0,
                berechneteWerte.pause_minuten,
                (err) => {
                  if (err) {
                    console.error(`❌ Fehler beim Einfügen: Termin ${termin.id}, Arbeit "${arbeitName}":`, err.message);
                    errorCount++;
                  } else {
                    migratedCount++;
                  }
                }
              );
            }
            
          } catch (parseErr) {
            console.error(`❌ Fehler beim Parsen von Termin ${termin.id}:`, parseErr.message);
            errorCount++;
          }
        }
        
        insertStmt.finalize((err) => {
          if (err) {
            console.error('❌ Fehler beim Finalisieren:', err);
            db.close();
            reject(err);
            return;
          }
          
          // 5. Zusammenfassung
          console.log('\n' + '='.repeat(60));
          console.log('📈 Migrations-Zusammenfassung:');
          console.log('='.repeat(60));
          console.log(`✅ Erfolgreich migriert: ${migratedCount} Arbeitszeiten`);
          console.log(`⏭️  Übersprungen: ${skippedCount} Termine`);
          console.log(`❌ Fehler: ${errorCount}`);
          console.log('='.repeat(60) + '\n');
          
          if (errorCount === 0) {
            console.log('✨ Datenmigration erfolgreich abgeschlossen!\n');
            console.log('💡 Nächster Schritt: arbeitszeiten_details Feld kann entfernt werden.');
          } else {
            console.warn('⚠️  Migration mit Fehlern abgeschlossen. Bitte prüfen!\n');
          }
          
          db.close();
          resolve();
        });
      });
    });
  });
}

// Hilfsfunktion: Lade alle Personen-Daten
function getPersonenData(db) {
  return new Promise((resolve, reject) => {
    const personen = {
      mitarbeiter: [],
      lehrlinge: []
    };
    
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

// Führe Migration aus wenn direkt aufgerufen
if (require.main === module) {
  migrateData()
    .then(() => {
      console.log('✅ Fertig!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Migration fehlgeschlagen:', err);
      process.exit(1);
    });
}

module.exports = { migrateData };
