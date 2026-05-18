const migration = {
  version: 48,
  description: 'PDF AU/HU Dauer auf 30 Minuten korrigieren'
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

function fixDetails(value) {
  if (!value) return { value, changed: false };

  let details;
  try {
    details = JSON.parse(value);
  } catch (_) {
    return { value, changed: false };
  }

  let changed = false;
  if (details['AU/HU'] && typeof details['AU/HU'] === 'object') {
    const current = parseInt(details['AU/HU'].zeit, 10) || 0;
    if (current !== 30) {
      details['AU/HU'].zeit = 30;
      changed = true;
    }
  }

  if (Array.isArray(details._auftragsimport_arbeiten)) {
    details._auftragsimport_arbeiten.forEach((item) => {
      if (String(item?.name || '').trim().toUpperCase() !== 'AU/HU') return;
      const current = parseInt(item.dauer_minuten, 10) || 0;
      if (current !== 30) {
        item.dauer_minuten = 30;
        changed = true;
      }
    });
  }

  return {
    value: changed ? JSON.stringify(details) : value,
    changed
  };
}

async function up(db) {
  console.log('Migration 048: PDF AU/HU Dauer auf 30 Minuten korrigieren...');

  const rows = await all(db, `
    SELECT t.id, t.geschaetzte_zeit, t.arbeitszeiten_details
      FROM termine t
      JOIN auftragsimporte ai ON ai.termin_id = t.id
     WHERE (t.arbeit LIKE '%AU/HU%' OR t.umfang LIKE '%AU/HU%' OR t.arbeitszeiten_details LIKE '%AU/HU%')
  `);

  let updated = 0;
  for (const row of rows) {
    const details = fixDetails(row.arbeitszeiten_details);
    const currentTotal = parseInt(row.geschaetzte_zeit, 10) || 0;
    const nextTotal = currentTotal >= 30 ? currentTotal - 30 : currentTotal;

    if (!details.changed && nextTotal === currentTotal) continue;

    await run(
      db,
      'UPDATE termine SET geschaetzte_zeit = ?, arbeitszeiten_details = ? WHERE id = ?',
      [nextTotal, details.value, row.id]
    );
    updated += 1;
  }

  console.log(`Migration 048 abgeschlossen: ${updated} Termin(e) aktualisiert`);
}

async function down() {
  console.log('Migration 048 down: kein Rollback, Dauer-Korrektur bleibt erhalten');
}

migration.up = up;
migration.down = down;

module.exports = migration;
