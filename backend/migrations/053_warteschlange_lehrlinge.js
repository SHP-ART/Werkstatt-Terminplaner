const { runSQL } = require('./helpers');

module.exports = {
  version: 53,
  description: 'Warteschlangenindex fuer Lehrlinge',

  async up(db) {
    await runSQL(db, `
      CREATE INDEX IF NOT EXISTS idx_termine_warteschlange_lehrlinge
      ON termine(lehrling_id, warteschlange_pos)
    `);
  },

  async down(db) {
    await runSQL(db, 'DROP INDEX IF EXISTS idx_termine_warteschlange_lehrlinge');
  }
};
