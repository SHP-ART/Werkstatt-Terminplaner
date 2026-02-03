/**
 * Einmalige Migration: Berechnet fehlende Endzeiten für bestehende Termine
 * Wird automatisch beim Server-Start ausgeführt wenn noch nicht durchgeführt
 */

const TermineModel = require('../models/termineModel');
const EinstellungenModel = require('../models/einstellungenModel');

async function migrateEndzeitenIfNeeded() {
  try {
    // Prüfe ob Migration bereits durchgeführt wurde
    // Da werkstatt_einstellungen anders strukturiert ist, prüfen wir ob es eine Spalte gibt
    const { dbWrapper } = require('../config/database');
    
    // Warte auf DB-Bereitschaft
    await dbWrapper.readyPromise;
    const db = dbWrapper.connection;
    
    // Prüfe ob endzeiten_migriert Spalte existiert
    const columns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(werkstatt_einstellungen)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    const hasColumn = columns.some(col => col.name === 'endzeiten_migriert');
    
    if (!hasColumn) {
      // Spalte hinzufügen
      await new Promise((resolve, reject) => {
        db.run("ALTER TABLE werkstatt_einstellungen ADD COLUMN endzeiten_migriert INTEGER DEFAULT 0", (err) => {
          if (err && !err.message.includes('duplicate column')) reject(err);
          else resolve();
        });
      });
    }
    
    // Prüfe Flag
    const einstellungen = await new Promise((resolve, reject) => {
      db.get("SELECT endzeiten_migriert FROM werkstatt_einstellungen WHERE id = 1", (err, row) => {
        if (err) reject(err);
        else resolve(row || {});
      });
    });
    
    if (einstellungen.endzeiten_migriert === 1) {
      console.log('✓ Endzeiten-Migration bereits durchgeführt');
      return { skipped: true, message: 'Bereits migriert' };
    }

    console.log('🔄 Starte Endzeiten-Migration...');
    
    // Lade berechneEndzeitFuerTermin Funktion
    const { berechneEndzeitFuerTermin } = require('../controllers/termineController');
    
    // Alle Termine mit arbeitszeiten_details aber ohne endzeit_berechnet - db ist bereits oben definiert
    
    const termine = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM termine 
        WHERE arbeitszeiten_details IS NOT NULL 
        AND arbeitszeiten_details != ''
        AND arbeitszeiten_details != '{}'
        AND (endzeit_berechnet IS NULL OR endzeit_berechnet = '')
        ORDER BY datum DESC
        LIMIT 1000
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (termine.length === 0) {
      console.log('✓ Keine Termine zur Migration gefunden');
      // Trotzdem Flag setzen
      await EinstellungenModel.set('endzeiten_migriert', '1');
      return { migrated: 0, message: 'Keine Termine benötigten Migration' };
    }

    console.log(`📊 ${termine.length} Termine gefunden, die Endzeiten benötigen`);

    let erfolg = 0;
    let fehler = 0;

    for (const termin of termine) {
      try {
        // Berechne Endzeit mit der exportierten Funktion
        const { startzeit, endzeit } = await berechneEndzeitFuerTermin(termin, termin.arbeitszeiten_details);
        
        if (endzeit) {
          // Update in DB
          await new Promise((resolve, reject) => {
            const updateData = { endzeit_berechnet: endzeit };
            if (startzeit) updateData.startzeit = startzeit;
            
            const fields = Object.keys(updateData);
            const values = fields.map(f => updateData[f]);
            values.push(termin.id);
            
            const sql = `UPDATE termine SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
            
            db.run(sql, values, function(err) {
              if (err) reject(err);
              else resolve({ changes: this.changes });
            });
          });
          
          erfolg++;
        }
      } catch (err) {
        console.warn(`⚠️ Fehler bei Termin ${termin.id}:`, err.message);
        fehler++;
      }
    }

    // Migration abgeschlossen - Flag setzen
    await new Promise((resolve, reject) => {
      db.run("UPDATE werkstatt_einstellungen SET endzeiten_migriert = 1 WHERE id = 1", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    const message = `Migration abgeschlossen: ${erfolg} Termine aktualisiert${fehler > 0 ? `, ${fehler} Fehler` : ''}`;
    console.log(`✅ ${message}`);
    
    return { migrated: erfolg, errors: fehler, message };
    
  } catch (err) {
    console.error('❌ Fehler bei Endzeiten-Migration:', err.message);
    // Fehler nicht weiterwerfen, damit Server trotzdem startet
    return { error: err.message };
  }
}

// Exportiere auch eine manuelle Funktion für forcierte Re-Migration
async function recalculateAllEndzeiten() {
  try {
    console.log('🔄 Starte manuelle Neuberechnung aller Endzeiten...');
    
    const { berechneEndzeitFuerTermin } = require('../controllers/termineController');
    const { dbWrapper } = require('../config/database');
    await dbWrapper.readyPromise;
    const db = dbWrapper.connection;
    
    // Alle Termine mit arbeitszeiten_details
    const termine = await new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM termine 
        WHERE arbeitszeiten_details IS NOT NULL 
        AND arbeitszeiten_details != ''
        AND arbeitszeiten_details != '{}'
        ORDER BY datum DESC
        LIMIT 2000
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    console.log(`📊 ${termine.length} Termine gefunden`);

    let erfolg = 0;
    let fehler = 0;

    for (const termin of termine) {
      try {
        const { startzeit, endzeit } = await berechneEndzeitFuerTermin(termin, termin.arbeitszeiten_details);
        
        if (endzeit) {
          await new Promise((resolve, reject) => {
            const updateData = { endzeit_berechnet: endzeit };
            if (startzeit) updateData.startzeit = startzeit;
            
            const fields = Object.keys(updateData);
            const values = fields.map(f => updateData[f]);
            values.push(termin.id);
            
            const sql = `UPDATE termine SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
            
            db.run(sql, values, function(err) {
              if (err) reject(err);
              else resolve({ changes: this.changes });
            });
          });
          
          erfolg++;
        }
      } catch (err) {
        console.warn(`⚠️ Fehler bei Termin ${termin.id}:`, err.message);
        fehler++;
      }
    }

    const message = `Neuberechnung abgeschlossen: ${erfolg} Termine aktualisiert${fehler > 0 ? `, ${fehler} Fehler` : ''}`;
    console.log(`✅ ${message}`);
    
    return { recalculated: erfolg, errors: fehler, message };
    
  } catch (err) {
    console.error('❌ Fehler bei Neuberechnung:', err.message);
    throw err;
  }
}

module.exports = {
  migrateEndzeitenIfNeeded,
  recalculateAllEndzeiten
};
