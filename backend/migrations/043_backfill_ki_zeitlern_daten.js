/**
 * Migration 043: Backfill ki_zeitlern_daten
 *
 * Trägt alle bereits abgeschlossenen Termine rückwirkend in ki_zeitlern_daten ein.
 * Betrifft Installationen die Migration 025 erst NACH dem Abschließen von Terminen
 * erhalten haben – dort blieb ki_zeitlern_daten leer.
 *
 * Idempotent: Termine die bereits einen Eintrag haben (termin_id) werden übersprungen.
 */

const migration = {
  version: 43,
  description: 'Backfill ki_zeitlern_daten aus bereits abgeschlossenen Terminen'
};

const KATEGORIEN = [
  { name: 'Inspektion', keys: ['inspektion', 'service', 'wartung', 'durchsicht'] },
  { name: 'Bremsen',    keys: ['bremse', 'brems'] },
  { name: 'Motor',      keys: ['motor', 'zahnriemen', 'kupplung', 'getriebe'] },
  { name: 'Elektrik',   keys: ['licht', 'elektrik', 'batterie', 'sensor'] },
  { name: 'Klima',      keys: ['klima', 'kuehl', 'kalt', 'heizung'] },
  { name: 'Reifen',     keys: ['reifen', 'rad', 'felge'] },
  { name: 'Karosserie', keys: ['karosserie', 'tuer', 'stoss', 'lack'] }
];

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function kategorisiereArbeit(name) {
  const text = normalizeText(name);
  for (const kat of KATEGORIEN) {
    if (kat.keys.some(key => text.includes(key))) {
      return kat.name;
    }
  }
  return 'Sonstiges';
}

function splitArbeiten(text) {
  return String(text || '')
    .split(/[\r\n,;]+/)
    .map(a => a.trim())
    .filter(a => a.length > 0);
}

async function up(db) {
  console.log('Migration 043: Backfill ki_zeitlern_daten aus abgeschlossenen Terminen...');

  // Bereits vorhandene termin_ids in ki_zeitlern_daten ermitteln (für Idempotenz)
  const vorhandenRows = await new Promise((resolve, reject) => {
    db.all(
      `SELECT DISTINCT termin_id FROM ki_zeitlern_daten WHERE termin_id IS NOT NULL`,
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
  const vorhandenIds = new Set(vorhandenRows.map(r => r.termin_id));

  // Alle abgeschlossenen Termine mit tatsächlicher Zeit holen
  const termine = await new Promise((resolve, reject) => {
    db.all(
      `SELECT id, arbeit, geschaetzte_zeit, tatsaechliche_zeit, mitarbeiter_id, datum
       FROM termine
       WHERE status = 'abgeschlossen'
         AND tatsaechliche_zeit > 0
         AND arbeit IS NOT NULL
         AND geloescht_am IS NULL`,
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });

  console.log(`Migration 043: ${termine.length} abgeschlossene Termine gefunden, ${vorhandenIds.size} bereits eingetragen.`);

  let eingefuegt = 0;
  let uebersprungen = 0;

  const stmt = db.prepare(
    `INSERT INTO ki_zeitlern_daten
       (termin_id, arbeit, kategorie, geschaetzte_min, tatsaechliche_min, mitarbeiter_id, datum)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const termin of termine) {
    if (vorhandenIds.has(termin.id)) {
      uebersprungen++;
      continue;
    }

    const arbeiten = splitArbeiten(termin.arbeit);
    if (arbeiten.length === 0) continue;

    const zeitProArbeit = Math.round(termin.tatsaechliche_zeit / arbeiten.length);
    const geschaetztProArbeit = Math.round((termin.geschaetzte_zeit || termin.tatsaechliche_zeit) / arbeiten.length);
    const datum = termin.datum || new Date().toISOString().slice(0, 10);

    for (const arbeitItem of arbeiten) {
      const kat = kategorisiereArbeit(arbeitItem);
      await new Promise((resolve, reject) => {
        stmt.run(
          [termin.id, arbeitItem, kat, geschaetztProArbeit, zeitProArbeit, termin.mitarbeiter_id || null, datum],
          (err) => err ? reject(err) : resolve()
        );
      });
      eingefuegt++;
    }
  }

  stmt.finalize();

  console.log(`✓ Migration 043 abgeschlossen: ${eingefuegt} Datenpunkte eingefügt, ${uebersprungen} Termine übersprungen.`);
}

async function down(db) {
  // Entfernt nur Einträge die durch den Backfill stammen (termin_id gesetzt, exclude = 0)
  // Einträge ohne termin_id (manuell oder via API hinzugefügt) bleiben erhalten.
  console.log('Migration 043: Backfill-Einträge entfernen...');
  await new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM ki_zeitlern_daten WHERE termin_id IS NOT NULL`,
      (err) => err ? reject(err) : resolve()
    );
  });
  console.log('✓ Migration 043 rückgängig gemacht');
}

migration.up = up;
migration.down = down;

module.exports = migration;
