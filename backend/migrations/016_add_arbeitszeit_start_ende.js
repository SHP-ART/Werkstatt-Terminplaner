/**
 * Migration 016: Fügt arbeitszeit_start und arbeitszeit_ende Felder zur arbeitszeiten_plan Tabelle hinzu
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 16,
  description: 'Fügt arbeitszeit_start und arbeitszeit_ende Felder zur arbeitszeiten_plan Tabelle hinzu',
  
  async up(db) {
    console.log('Migration 016: Füge Arbeitszeit Start/Ende Felder hinzu...');

    // 1. Spalten hinzufügen
    await safeAlterTable(db,
      `ALTER TABLE arbeitszeiten_plan ADD COLUMN arbeitszeit_start TEXT DEFAULT '08:00'`,
      'arbeitszeiten_plan.arbeitszeit_start'
    );
    
    await safeAlterTable(db,
      `ALTER TABLE arbeitszeiten_plan ADD COLUMN arbeitszeit_ende TEXT DEFAULT '16:30'`,
      'arbeitszeiten_plan.arbeitszeit_ende'
    );

    // 2. Berechne und setze Endzeiten für existierende Einträge
    const entries = await new Promise((resolve, reject) => {
      db.all(`
        SELECT id, arbeitsstunden, pausenzeit_minuten, arbeitszeit_start 
        FROM arbeitszeiten_plan 
        WHERE arbeitszeit_ende IS NULL OR arbeitszeit_ende = '16:30'
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    if (entries.length === 0) {
      console.log('  • Keine Einträge zum Aktualisieren');
      console.log('✓ Migration 016 erfolgreich abgeschlossen');
      return;
    }

    let updated = 0;
    for (const entry of entries) {
      // Parse Start-Zeit
      const [startHours, startMinutes] = (entry.arbeitszeit_start || '08:00').split(':').map(Number);
      
      // Berechne Ende-Zeit: Start + Arbeitsstunden + Pause
      const totalMinutes = startMinutes + (entry.arbeitsstunden * 60) + (entry.pausenzeit_minuten || 0);
      const endHours = startHours + Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      
      const arbeitszeit_ende = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
      
      await new Promise((resolve) => {
        db.run(`UPDATE arbeitszeiten_plan SET arbeitszeit_ende = ? WHERE id = ?`, 
          [arbeitszeit_ende, entry.id], 
          (err) => {
            if (err) {
              console.error(`  ✗ Fehler bei ID ${entry.id}:`, err.message);
            } else {
              updated++;
            }
            resolve();
          }
        );
      });
    }
    
    console.log(`  ✓ ${updated} Endzeiten berechnet und gesetzt`);
    console.log('✓ Migration 016 erfolgreich abgeschlossen');
  }
};
