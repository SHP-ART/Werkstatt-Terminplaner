/**
 * Migration 017: Erstellt schicht_templates Tabelle für wiederverwendbare Schichtvorlagen
 */

const { safeCreateTable, safeRun } = require('./helpers');

module.exports = {
  version: 17,
  description: 'Erstellt schicht_templates Tabelle für wiederverwendbare Schichtvorlagen',
  
  async up(db) {
    console.log('Migration 017: Erstelle Schicht-Templates Tabelle...');

    // 1. Tabelle für Schicht-Templates erstellen
    await safeCreateTable(db, `
      CREATE TABLE IF NOT EXISTS schicht_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        beschreibung TEXT,
        arbeitszeit_start TEXT NOT NULL,
        arbeitszeit_ende TEXT NOT NULL,
        farbe TEXT DEFAULT '#667eea',
        sortierung INTEGER DEFAULT 0,
        aktiv INTEGER DEFAULT 1,
        erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, 'schicht_templates');

    console.log('  ✓ Tabelle schicht_templates erstellt');

    // 2. Prüfe ob bereits Schichten existieren
    const existingCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM schicht_templates', (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.count : 0);
      });
    });

    if (existingCount > 0) {
      console.log('  • Schicht-Templates existieren bereits');
      console.log('✓ Migration 017 erfolgreich abgeschlossen');
      return;
    }

    // 3. Standard-Schichten einfügen
    const defaultSchichten = [
      { name: 'Frühschicht', beschreibung: 'Standard Frühschicht', start: '06:00', ende: '14:30', farbe: '#fbbf24', sortierung: 1 },
      { name: 'Normalschicht', beschreibung: 'Standard Arbeitszeit', start: '08:00', ende: '16:30', farbe: '#10b981', sortierung: 2 },
      { name: 'Spätschicht', beschreibung: 'Standard Spätschicht', start: '14:00', ende: '22:30', farbe: '#f59e0b', sortierung: 3 },
      { name: 'Kurzschicht', beschreibung: 'Halbtags 4 Stunden', start: '08:00', ende: '12:30', farbe: '#6366f1', sortierung: 4 }
    ];

    let inserted = 0;
    for (const schicht of defaultSchichten) {
      await new Promise((resolve) => {
        db.run(`
          INSERT INTO schicht_templates (name, beschreibung, arbeitszeit_start, arbeitszeit_ende, farbe, sortierung)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [schicht.name, schicht.beschreibung, schicht.start, schicht.ende, schicht.farbe, schicht.sortierung], 
        (err) => {
          if (err) {
            console.error(`  ✗ Fehler bei ${schicht.name}:`, err.message);
          } else {
            inserted++;
          }
          resolve();
        });
      });
    }

    console.log(`  ✓ ${inserted} Standard-Schichten eingefügt`);
    console.log('✓ Migration 017 erfolgreich abgeschlossen');
  }
};
