/**
 * Migration 004: Mitarbeiter-Erweiterungen
 * Fügt nebenzeit, nur_service und mittagspause Felder hinzu
 */

const { safeAlterTable } = require('./helpers');

module.exports = {
  version: 4,
  description: 'Mitarbeiter-Erweiterungen (nebenzeit, nur_service, mittagspause)',

  async up(db) {
    // Mitarbeiter-Felder
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`,
      'mitarbeiter.nebenzeit_prozent'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN nur_service INTEGER DEFAULT 0`,
      'mitarbeiter.nur_service'
    );
    await safeAlterTable(db,
      `ALTER TABLE mitarbeiter ADD COLUMN mittagspause_start TEXT DEFAULT '12:00'`,
      'mitarbeiter.mittagspause_start'
    );

    // Werkstatt-Einstellungen
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN pufferzeit_minuten INTEGER DEFAULT 15`,
      'werkstatt_einstellungen.pufferzeit_minuten'
    );
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN servicezeit_minuten INTEGER DEFAULT 10`,
      'werkstatt_einstellungen.servicezeit_minuten'
    );
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN nebenzeit_prozent REAL DEFAULT 0`,
      'werkstatt_einstellungen.nebenzeit_prozent'
    );
    await safeAlterTable(db,
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN mittagspause_minuten INTEGER DEFAULT 30`,
      'werkstatt_einstellungen.mittagspause_minuten'
    );

    // Migration: ordnungszeit_prozent zu nebenzeit_prozent (falls vorhanden)
    await new Promise((resolve) => {
      db.all("PRAGMA table_info(mitarbeiter)", (err, columns) => {
        if (!err && columns) {
          const hasOrdnungszeit = columns.some(c => c.name === 'ordnungszeit_prozent');
          const hasNebenzeit = columns.some(c => c.name === 'nebenzeit_prozent');
          if (hasOrdnungszeit && hasNebenzeit) {
            db.run(`UPDATE mitarbeiter SET nebenzeit_prozent = ordnungszeit_prozent WHERE nebenzeit_prozent = 0 OR nebenzeit_prozent IS NULL`, () => resolve());
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
    console.log('⚠️ Migration 004 Rollback nicht unterstützt');
  }
};
