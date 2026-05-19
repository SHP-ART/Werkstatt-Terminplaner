const migration = {
  version: 50,
  description: 'PDF Reifen/Wartung AW-Erkennung fuer bestehende Termine korrigieren'
};

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve({ changes: this.changes });
    });
  });
}

function parseDetails(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}

async function up(db) {
  console.log('Migration 050: PDF Reifen/Wartung AW-Zeit korrigieren...');

  const rows = await all(db, `
    SELECT t.id, t.arbeitszeiten_details
      FROM termine t
      JOIN auftragsimporte ai ON ai.termin_id = t.id
     WHERE ai.erkannte_daten LIKE '%AUSWUCHTEN1012110,88%'
       AND t.arbeit LIKE '%Reifen erneuern%'
       AND t.arbeit LIKE '%Wartung%'
  `);

  let updated = 0;
  for (const row of rows) {
    const details = parseDetails(row.arbeitszeiten_details);
    let reifenAlt = null;
    let wartung = null;

    if (Array.isArray(details._auftragsimport_arbeiten)) {
      details._auftragsimport_arbeiten.forEach((item) => {
        if (item && item.name === 'Reifen erneuern') {
          reifenAlt = parseInt(item.dauer_minuten, 10) || 0;
          item.dauer_minuten = 72;
          item.zeit_quelle = 'pdf_aw';
        }
        if (item && item.name === 'Wartung') {
          wartung = parseInt(item.dauer_minuten, 10) || 0;
        }
      });
    }

    if (details['Reifen erneuern']) {
      details['Reifen erneuern'].zeit = 72;
      details['Reifen erneuern'].zeit_quelle = 'pdf_aw';
    }

    if (reifenAlt !== 6) continue;

    const gesamt = 72 + (wartung || 0);
    details._dauer_override = gesamt;

    await run(
      db,
      'UPDATE termine SET geschaetzte_zeit = ?, arbeitszeiten_details = ? WHERE id = ?',
      [gesamt, JSON.stringify(details), row.id]
    );
    await run(
      db,
      "UPDATE termine_arbeiten SET zeit = ? WHERE termin_id = ? AND arbeit = 'Reifen erneuern'",
      [72, row.id]
    );

    updated += 1;
  }

  console.log(`Migration 050 abgeschlossen: ${updated} Termin(e) aktualisiert`);
}

async function down() {
  console.log('Migration 050 down: No-Op');
}

migration.up = up;
migration.down = down;

module.exports = migration;
