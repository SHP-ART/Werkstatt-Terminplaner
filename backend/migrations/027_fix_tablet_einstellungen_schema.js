/**
 * Migration 027: Repariert tablet_einstellungen-Schema bei alten Datenbanken
 *
 * Problem: Migration 020 nutzte CREATE TABLE IF NOT EXISTS. Wenn die Tabelle
 * bereits mit alten Spaltennamen (display_aus_zeit, display_ein_zeit,
 * manuell_status, aktualisiert_am) existierte, wurde die Migration übersprungen.
 *
 * Diese Migration prüft ob die alten Spaltennamen vorhanden sind und
 * migriert die Daten auf das korrekte Schema.
 */

const migration = {
  version: 27,
  description: 'Repariert tablet_einstellungen-Schema (alte Spaltennamen → neue Spaltennamen)'
};

async function up(db) {
  console.log('Migration 027: Prüfe tablet_einstellungen-Schema...');

  // Spalten der Tabelle abfragen
  const columns = await new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(tablet_einstellungen)', (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

  const columnNames = columns.map(c => c.name);

  // Prüfen ob alte Spaltennamen vorhanden sind
  const hasOldSchema = columnNames.includes('display_aus_zeit') ||
                       columnNames.includes('display_ein_zeit') ||
                       columnNames.includes('manuell_status');

  if (!hasOldSchema) {
    console.log('✓ tablet_einstellungen hat bereits das korrekte Schema – keine Änderung nötig');
    return;
  }

  console.log('⚠️  Altes Schema erkannt – migriere tablet_einstellungen auf neue Spaltennamen...');

  // Alte Daten sichern
  const oldRow = await new Promise((resolve) => {
    db.get('SELECT * FROM tablet_einstellungen WHERE id = 1', (err, row) => {
      resolve(row || null);
    });
  });

  const auszeit = oldRow ? (oldRow.display_aus_zeit || '18:10') : '18:10';
  const einzeit = oldRow ? (oldRow.display_ein_zeit || '07:30') : '07:30';
  const status  = oldRow ? (oldRow.manuell_status  || 'auto')  : 'auto';

  // Tabelle umbenennen, neu erstellen, Daten übernehmen
  await new Promise((resolve, reject) => {
    db.run('ALTER TABLE tablet_einstellungen RENAME TO tablet_einstellungen_old_027', (err) => {
      if (err) reject(err); else resolve();
    });
  });

  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE tablet_einstellungen (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_ausschaltzeit TEXT DEFAULT '18:10',
        display_einschaltzeit TEXT DEFAULT '07:30',
        manueller_display_status TEXT CHECK(manueller_display_status IN ('auto', 'an', 'aus')) DEFAULT 'auto',
        letztes_update DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err); else resolve();
    });
  });

  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO tablet_einstellungen (id, display_ausschaltzeit, display_einschaltzeit, manueller_display_status)
       VALUES (1, ?, ?, ?)`,
      [auszeit, einzeit, status],
      (err) => { if (err) reject(err); else resolve(); }
    );
  });

  await new Promise((resolve) => {
    db.run('DROP TABLE IF EXISTS tablet_einstellungen_old_027', () => resolve());
  });

  console.log(`✓ tablet_einstellungen migriert (aus: ${auszeit}, ein: ${einzeit}, status: ${status})`);
}

async function down(db) {
  console.log('Migration 027: Rückgängig nicht unterstützt (Schema-Reparatur)');
}

migration.up = up;
migration.down = down;

module.exports = migration;
