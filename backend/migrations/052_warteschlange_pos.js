const { runSQL } = require('./helpers');

module.exports = {
  version: 52,
  description: 'Warteschlangenposition fuer Zettel-Board',

  async up(db) {
    await runSQL(db, 'ALTER TABLE termine ADD COLUMN warteschlange_pos INTEGER');
    await runSQL(db, `
      CREATE INDEX IF NOT EXISTS idx_termine_warteschlange
      ON termine(mitarbeiter_id, warteschlange_pos)
    `);
  },

  async down(db) {
    await runSQL(db, 'DROP INDEX IF EXISTS idx_termine_warteschlange');
    await runSQL(db, 'ALTER TABLE termine DROP COLUMN warteschlange_pos');
  }
};
