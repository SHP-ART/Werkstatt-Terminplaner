const migration = {
  version: 36,
  description: 'Backfill termine_arbeiten.stempel_start/ende aus arbeitszeiten_details/fertigstellung_zeit'
};

function isoToHHMM(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function up(db) {
  console.log('Migration 036: Backfill Stempelzeiten aus arbeitszeiten_details...');

  const all = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
  const get = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
  const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

  const termine = await all(`
    SELECT id, arbeit, arbeitszeiten_details, fertigstellung_zeit,
           geschaetzte_zeit, mitarbeiter_id, lehrling_id, status
    FROM termine
    WHERE arbeitszeiten_details IS NOT NULL
      AND arbeitszeiten_details != ''
      AND geloescht_am IS NULL
      AND (status IN ('abgeschlossen', 'in_bearbeitung') OR fertigstellung_zeit IS NOT NULL)
  `);

  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const t of termine) {
    let details;
    try {
      details = JSON.parse(t.arbeitszeiten_details);
    } catch (_) { skipped++; continue; }
    if (!details || typeof details !== 'object') { skipped++; continue; }

    const fbStart = details._startzeit || null;

    for (const [arbeitName, value] of Object.entries(details)) {
      if (arbeitName.startsWith('_')) continue;

      let endeIso = null;
      if (value && typeof value === 'object' && value.fertigstellung_zeit) {
        endeIso = value.fertigstellung_zeit;
      }
      // Globaler Termin-Fallback (z. B. bei einer einzigen Arbeit)
      if (!endeIso && t.fertigstellung_zeit) endeIso = t.fertigstellung_zeit;

      const stempelEnde = isoToHHMM(endeIso);
      const stempelStart = fbStart;
      if (!stempelStart && !stempelEnde) continue;

      const ta = await get(
        `SELECT id, stempel_start, stempel_ende FROM termine_arbeiten
         WHERE termin_id = ? AND arbeit = ?`,
        [t.id, arbeitName]
      );

      if (ta) {
        // Nur ergänzen — echte Stempel NIE überschreiben
        const updates = [];
        const vals = [];
        if (stempelStart && !ta.stempel_start) { updates.push('stempel_start = ?'); vals.push(stempelStart); }
        if (stempelEnde  && !ta.stempel_ende)  { updates.push('stempel_ende = ?');  vals.push(stempelEnde);  }
        if (updates.length > 0) {
          vals.push(ta.id);
          await run(`UPDATE termine_arbeiten SET ${updates.join(', ')} WHERE id = ?`, vals);
          updated++;
        }
      } else {
        const zeit = (value && typeof value === 'object' ? value.zeit : value) || t.geschaetzte_zeit || 1;
        await run(
          `INSERT INTO termine_arbeiten
             (termin_id, arbeit, zeit, mitarbeiter_id, lehrling_id, reihenfolge, stempel_start, stempel_ende)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          [t.id, arbeitName, zeit, t.mitarbeiter_id || null, t.lehrling_id || null, stempelStart, stempelEnde]
        );
        inserted++;
      }
    }
  }

  console.log(`✓ Migration 036 abgeschlossen: ${updated} aktualisiert, ${inserted} eingefügt, ${skipped} übersprungen`);
}

async function down() {
  // Daten-Migration, kein sauberes Rückgängig. Neu angelegte Stempel lassen sich nicht
  // zuverlässig von manuell gesetzten unterscheiden. Daher: No-op.
  console.log('✓ Migration 036 rückgängig gemacht (Daten bleiben erhalten)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
