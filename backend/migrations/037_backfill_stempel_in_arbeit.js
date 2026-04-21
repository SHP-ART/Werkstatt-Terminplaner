const migration = {
  version: 37,
  description: 'Backfill stempel_start für laufende Termine (Status in_arbeit + _startzeit)'
};

function isoToHHMM(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function up(db) {
  console.log('Migration 037: Backfill stempel_start/ende inkl. Status in_arbeit...');

  const all = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
  const get = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
  const run = (sql, params = []) => new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

  // Migration 036 deckte nur 'abgeschlossen' und 'in_bearbeitung' ab.
  // Der echte laufende Status heißt 'in_arbeit' — plus Termine mit _startzeit
  // aber ohne fertigstellung_zeit sollen wenigstens den Start-Stempel kriegen.
  const termine = await all(`
    SELECT id, arbeit, arbeitszeiten_details, fertigstellung_zeit,
           geschaetzte_zeit, mitarbeiter_id, lehrling_id, status
    FROM termine
    WHERE arbeitszeiten_details IS NOT NULL
      AND arbeitszeiten_details != ''
      AND geloescht_am IS NULL
      AND status IN ('in_arbeit', 'wartend', 'abgeschlossen', 'in_bearbeitung')
  `);

  let updated = 0;
  let inserted = 0;

  for (const t of termine) {
    let details;
    try { details = JSON.parse(t.arbeitszeiten_details); } catch (_) { continue; }
    if (!details || typeof details !== 'object') continue;

    const fbStart = details._startzeit || null;

    const arbeitEntries = Object.entries(details).filter(([k]) => !k.startsWith('_'));
    // Wenn keine expliziten Arbeiten in details, aber _startzeit vorhanden:
    // Backfill gegen termin.arbeit (Hauptarbeit) oder alle termine_arbeiten-Zeilen
    if (arbeitEntries.length === 0 && fbStart) {
      const tas = await all(
        `SELECT id, arbeit, stempel_start, stempel_ende FROM termine_arbeiten WHERE termin_id = ?`,
        [t.id]
      );
      for (const ta of tas) {
        if (!ta.stempel_start) {
          await run(`UPDATE termine_arbeiten SET stempel_start = ? WHERE id = ?`, [fbStart, ta.id]);
          updated++;
        }
      }
      continue;
    }

    for (const [arbeitName, value] of arbeitEntries) {
      let endeIso = null;
      if (value && typeof value === 'object' && value.fertigstellung_zeit) endeIso = value.fertigstellung_zeit;
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

  console.log(`✓ Migration 037 abgeschlossen: ${updated} aktualisiert, ${inserted} eingefügt`);
}

async function down() {
  console.log('✓ Migration 037 rückgängig gemacht (Daten bleiben erhalten)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
