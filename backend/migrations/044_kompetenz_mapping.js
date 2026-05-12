const migration = {
  version: 44,
  description: 'Kompetenz-Mapping Spalte in werkstatt_einstellungen'
};

async function up(db) {
  console.log('Migration 044: kompetenz_mapping Spalte hinzufügen...');
  await new Promise((resolve, reject) => {
    db.run(
      `ALTER TABLE werkstatt_einstellungen ADD COLUMN kompetenz_mapping TEXT DEFAULT NULL`,
      (err) => err ? reject(err) : resolve()
    );
  });
  console.log('✓ Migration 044 abgeschlossen');
}

async function down(db) {
  console.log('Migration 044 down: SQLite unterstützt kein DROP COLUMN, keine Aktion.');
}

migration.up = up;
migration.down = down;

module.exports = migration;
