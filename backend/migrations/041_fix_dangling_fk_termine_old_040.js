/**
 * Migration 041: Verwaiste FK-Referenzen auf "termine_old_040" reparieren
 *
 * Hintergrund:
 *   Migration 040 hat `ALTER TABLE termine RENAME TO termine_old_040` benutzt.
 *   Bei `legacy_alter_table=ON` (oder bestimmten SQLite-Versionen/Builds)
 *   schreibt SQLite die FK-References in abhängigen Tabellen mit um.
 *   Die neue `termine`-Tabelle wurde danach erstellt und Daten kopiert,
 *   aber die FK-Referenzen in 5 abhängigen Tabellen zeigen nach wie vor
 *   auf die nicht mehr existierende `termine_old_040`-Tabelle.
 *
 *   Symptom: Jede Schreiboperation auf eine der 5 Tabellen löst FK-Check aus
 *   und schlägt mit `SQLITE_ERROR: no such table: main.termine_old_040` fehl
 *   (z.B. POST/PUT /api/phasen/termin/:id/sync).
 *
 * Betroffene Tabellen (FK termin_id → termine):
 *   - termin_phasen
 *   - pause_tracking (Spalte: pause_naechster_termin_id)
 *   - teile_bestellungen
 *   - arbeitspausen
 *   - termine_arbeiten
 *
 * Reparatur:
 *   Direktes Patching via PRAGMA writable_schema (offiziell dokumentiert für
 *   genau diesen Fall: https://www.sqlite.org/lang_altertable.html
 *   Abschnitt "Making Other Kinds Of Table Schema Changes").
 *   Sicher, weil nur Strings im sqlite_master geändert werden — keine
 *   Datenmigration, keine Tabellen-Recreates.
 */

module.exports = {
  version: 41,
  skipTransaction: true,
  description: 'FK-References auf termine_old_040 zurück auf termine biegen (Reparatur nach Migration 040)',

  async up(db) {
    console.log('Migration 041: FK-References auf termine_old_040 reparieren...');

    // 1. Prüfen ob Reparatur überhaupt nötig
    const dangling = await new Promise((resolve, reject) => {
      db.all(
        "SELECT name, sql FROM sqlite_master WHERE sql LIKE '%termine_old_040%'",
        [],
        (err, rows) => err ? reject(err) : resolve(rows || [])
      );
    });

    if (dangling.length === 0) {
      console.log('✓ Migration 041: Keine verwaisten FK-Referenzen gefunden — übersprungen');
      return;
    }

    console.log(`Migration 041: ${dangling.length} Tabelle(n) mit verwaisten FK gefunden:`);
    dangling.forEach(d => console.log(`  - ${d.name}`));

    // 2. PRAGMA foreign_keys MUSS aus sein bevor writable_schema verwendet wird
    await new Promise((resolve, reject) =>
      db.run('PRAGMA foreign_keys = OFF', (err) => err ? reject(err) : resolve())
    );

    try {
      // 3. Aktuelles schema_version lesen (für Pflicht-Erhöhung am Ende)
      const schemaVersionRow = await new Promise((resolve, reject) =>
        db.get('PRAGMA schema_version', [], (err, row) => err ? reject(err) : resolve(row))
      );
      const oldSchemaVersion = schemaVersionRow.schema_version;

      // 4. Writable Schema einschalten
      await new Promise((resolve, reject) =>
        db.run('PRAGMA writable_schema = ON', (err) => err ? reject(err) : resolve())
      );

      // 5. FK-Referenzen umschreiben — sowohl mit Anführungszeichen als auch ohne
      await new Promise((resolve, reject) => {
        db.run(
          `UPDATE sqlite_master
             SET sql = REPLACE(REPLACE(sql, '"termine_old_040"', '"termine"'), 'termine_old_040', 'termine')
           WHERE sql LIKE '%termine_old_040%'`,
          (err) => err ? reject(err) : resolve()
        );
      });

      // 6. schema_version erhöhen (Pflicht, damit SQLite die Änderung sieht)
      await new Promise((resolve, reject) =>
        db.run(`PRAGMA schema_version = ${oldSchemaVersion + 1}`, (err) => err ? reject(err) : resolve())
      );

      // 7. Writable Schema wieder ausschalten
      await new Promise((resolve, reject) =>
        db.run('PRAGMA writable_schema = OFF', (err) => err ? reject(err) : resolve())
      );

      // 8. Verifikation: Sollte 0 Treffer ergeben
      const stillDangling = await new Promise((resolve, reject) => {
        db.all(
          "SELECT name FROM sqlite_master WHERE sql LIKE '%termine_old_040%'",
          [],
          (err, rows) => err ? reject(err) : resolve(rows || [])
        );
      });

      if (stillDangling.length > 0) {
        throw new Error(`Migration 041 unvollständig — noch verwaiste References in: ${stillDangling.map(r => r.name).join(', ')}`);
      }

      // 9. Integritätsprüfung
      const integrity = await new Promise((resolve, reject) =>
        db.get('PRAGMA integrity_check', [], (err, row) => err ? reject(err) : resolve(row))
      );

      if (integrity.integrity_check !== 'ok') {
        throw new Error(`Integritätsprüfung fehlgeschlagen: ${integrity.integrity_check}`);
      }

      console.log('✓ Migration 041: Alle FK-References repariert, Integrität bestätigt');
    } finally {
      // FK-Enforcement immer wieder aktivieren
      await new Promise((resolve) => db.run('PRAGMA foreign_keys = ON', resolve));
    }
  },

  async down(db) {
    // Kein sinnvolles Rollback — die Reparatur wieder rückgängig zu machen
    // würde die Datenbank erneut in einen kaputten Zustand versetzen.
    console.log('Migration 041: down() ist No-Op (Reparatur ist nicht reversibel)');
  }
};
