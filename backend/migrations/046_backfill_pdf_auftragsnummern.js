const migration = {
  version: 46,
  description: 'PDF-Auftragsnummern in Termine nachtragen'
};

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => err ? reject(err) : resolve());
  });
}

async function up(db) {
  console.log('Migration 046: PDF-Auftragsnummern in Termine nachtragen...');

  const rows = await all(db, `
    SELECT ai.id, ai.termin_id, ai.erkannte_daten
      FROM auftragsimporte ai
      JOIN termine t ON t.id = ai.termin_id
     WHERE ai.termin_id IS NOT NULL
       AND (t.interne_auftragsnummer IS NULL OR TRIM(t.interne_auftragsnummer) = '')
       AND ai.erkannte_daten IS NOT NULL
  `);

  let updated = 0;
  for (const row of rows) {
    let daten = null;
    try {
      daten = JSON.parse(row.erkannte_daten);
    } catch (_) {
      continue;
    }

    const auftragsnummer = String(daten?.auftragsnummer || '').trim();
    if (!auftragsnummer) continue;

    await run(
      db,
      'UPDATE termine SET interne_auftragsnummer = ? WHERE id = ?',
      [auftragsnummer, row.termin_id]
    );
    updated += 1;
  }

  console.log(`Migration 046 abgeschlossen: ${updated} Termin(e) aktualisiert`);
}

async function down() {
  console.log('Migration 046 down: kein Rollback, Backfill bleibt erhalten');
}

migration.up = up;
migration.down = down;

module.exports = migration;
