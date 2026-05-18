const migration = {
  version: 47,
  description: 'PDF AU und HU als gemeinsame Aufgabe darstellen'
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

function normalizeLine(value) {
  return String(value || '').trim().toUpperCase();
}

function combineAuHuText(value) {
  if (!value) return value;
  const lines = String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.some(line => normalizeLine(line) === 'AU/HU')) return value;

  const auIndex = lines.findIndex(line => normalizeLine(line) === 'AU');
  const huIndex = lines.findIndex(line => normalizeLine(line) === 'HU');
  if (auIndex < 0 || huIndex < 0) return value;

  const firstIndex = Math.min(auIndex, huIndex);
  const combined = [];
  lines.forEach((line, index) => {
    if (index === firstIndex) {
      combined.push('AU/HU');
      return;
    }
    if (index === auIndex || index === huIndex) return;
    combined.push(line);
  });

  return combined.join('\n');
}

function hasSeparateAuHu(value) {
  if (!value) return false;
  const lines = String(value).split(/\r?\n/).map(line => normalizeLine(line)).filter(Boolean);
  return lines.includes('AU') && lines.includes('HU');
}

function combineAuHuDetails(value) {
  if (!value) return value;

  let details;
  try {
    details = JSON.parse(value);
  } catch (_) {
    return value;
  }

  const au = details.AU;
  const hu = details.HU;
  if (au && hu && !details['AU/HU']) {
    details['AU/HU'] = {
      ...(typeof au === 'object' ? au : {}),
      zeit: 30,
      reihenfolge: Math.min(
        typeof au === 'object' ? (parseInt(au.reihenfolge, 10) || 1) : 1,
        typeof hu === 'object' ? (parseInt(hu.reihenfolge, 10) || 2) : 2
      ),
      quelle: 'auftragsimport',
      originalText: 'AU/HU'
    };
    delete details.AU;
    delete details.HU;
  }

  if (Array.isArray(details._auftragsimport_arbeiten)) {
    const arbeiten = details._auftragsimport_arbeiten;
    const auIndex = arbeiten.findIndex(item => normalizeLine(item.name) === 'AU');
    const huIndex = arbeiten.findIndex(item => normalizeLine(item.name) === 'HU');
    if (auIndex >= 0 && huIndex >= 0 && !arbeiten.some(item => normalizeLine(item.name) === 'AU/HU')) {
      const firstIndex = Math.min(auIndex, huIndex);
      const auItem = arbeiten[auIndex];
      const huItem = arbeiten[huIndex];
      details._auftragsimport_arbeiten = arbeiten.reduce((result, item, index) => {
        if (index === firstIndex) {
          result.push({
            ...auItem,
            name: 'AU/HU',
            dauer_minuten: 30,
            originalText: 'AU/HU'
          });
          return result;
        }
        if (index === auIndex || index === huIndex) return result;
        result.push(item);
        return result;
      }, []);
    }
  }

  return JSON.stringify(details);
}

async function up(db) {
  console.log('Migration 047: PDF AU/HU als gemeinsame Aufgabe darstellen...');

  const rows = await all(db, `
    SELECT t.id, t.arbeit, t.umfang, t.geschaetzte_zeit, t.arbeitszeiten_details
      FROM termine t
      JOIN auftragsimporte ai ON ai.termin_id = t.id
  `);

  let updated = 0;
  for (const row of rows) {
    const arbeit = combineAuHuText(row.arbeit);
    const umfang = combineAuHuText(row.umfang);
    const details = combineAuHuDetails(row.arbeitszeiten_details);
    const geschaetzteZeit = hasSeparateAuHu(row.arbeit) || hasSeparateAuHu(row.umfang)
      ? Math.max(0, (parseInt(row.geschaetzte_zeit, 10) || 0) - 30)
      : row.geschaetzte_zeit;

    if (arbeit === row.arbeit && umfang === row.umfang && details === row.arbeitszeiten_details && geschaetzteZeit === row.geschaetzte_zeit) {
      continue;
    }

    await run(
      db,
      'UPDATE termine SET arbeit = ?, umfang = ?, geschaetzte_zeit = ?, arbeitszeiten_details = ? WHERE id = ?',
      [arbeit, umfang, geschaetzteZeit, details, row.id]
    );
    updated += 1;
  }

  console.log(`Migration 047 abgeschlossen: ${updated} Termin(e) aktualisiert`);
}

async function down() {
  console.log('Migration 047 down: kein Rollback, Textbereinigung bleibt erhalten');
}

migration.up = up;
migration.down = down;

module.exports = migration;
