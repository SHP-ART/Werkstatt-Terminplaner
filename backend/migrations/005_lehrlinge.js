/**
 * Migration 005: Lehrlinge-Erweiterungen
 * Fügt nebenzeit, arbeitsstunden, mittagspause und berufsschul_wochen hinzu
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 5,
  description: 'Lehrlinge-Erweiterungen (arbeitsstunden, mittagspause, berufsschul_wochen)',

  async up(db) {
    // Lehrlinge-Felder
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`,
      'lehrlinge.nebenzeit_prozent'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN arbeitsstunden_pro_tag INTEGER DEFAULT 8`,
      'lehrlinge.arbeitsstunden_pro_tag'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN mittagspause_start TEXT DEFAULT '12:00'`,
      'lehrlinge.mittagspause_start'
    );
    await safeAlterTable(db,
      `ALTER TABLE lehrlinge ADD COLUMN berufsschul_wochen TEXT`,
      'lehrlinge.berufsschul_wochen'
    );

    // Migration: ordnungszeit_prozent zu nebenzeit_prozent (falls vorhanden)
    await new Promise((resolve) => {
      db.all("PRAGMA table_info(lehrlinge)", (err, columns) => {
        if (!err && columns) {
          const hasOrdnungszeit = columns.some(c => c.name === 'ordnungszeit_prozent');
          const hasNebenzeit = columns.some(c => c.name === 'nebenzeit_prozent');
          if (hasOrdnungszeit && hasNebenzeit) {
            db.run(`UPDATE lehrlinge SET nebenzeit_prozent = ordnungszeit_prozent WHERE nebenzeit_prozent = 0 OR nebenzeit_prozent IS NULL`, () => resolve());
          } else {
            resolve();
          }
        } else {
          resolve();
        }
      });
    });
  },

  async down(db) {
    console.log('⚠️ Migration 005 Rollback nicht unterstützt');
  }
};
