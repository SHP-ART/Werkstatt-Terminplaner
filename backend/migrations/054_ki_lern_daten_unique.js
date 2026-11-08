const { runSQL } = require('./helpers');

module.exports = {
  version: 54,
  description: 'KI-Lerndaten pro Termin und Arbeit eindeutig machen',

  async up(db) {
    await runSQL(db, `
      DELETE FROM ki_zeitlern_daten
      WHERE termin_id IS NOT NULL
        AND id NOT IN (
          SELECT MAX(id)
          FROM ki_zeitlern_daten
          WHERE termin_id IS NOT NULL
          GROUP BY termin_id, arbeit
        )
    `);
    await runSQL(db, `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ki_lern_termin_arbeit_unique
      ON ki_zeitlern_daten(termin_id, arbeit)
    `);
  },

  async down(db) {
    await runSQL(db, 'DROP INDEX IF EXISTS idx_ki_lern_termin_arbeit_unique');
  }
};
