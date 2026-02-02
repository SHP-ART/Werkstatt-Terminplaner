/**
 * Migration 015: Flexible Arbeitszeitenverwaltung
 * 
 * Erstellt neue Tabelle arbeitszeiten_plan für:
 * - Wiederkehrende Wochentag-Muster (z.B. "Montag immer 8h")
 * - Spezifische Datumseinträge (z.B. "15.02.-21.02.: 6h/Tag")
 * - Freie Tage und Ausnahmen
 * 
 * Priorität: Spezifisches Datum > Wochentag-Muster > Standard-Wochenarbeitszeit
 * 
 * Hinweis: Nur zukünftige Arbeitszeiten können bearbeitet werden.
 */

module.exports = {
  version: 15,
  description: 'Flexible Arbeitszeitenverwaltung mit Wochentag-Mustern und spezifischen Datumseinträgen',
  
  up: (db) => {
    return new Promise((resolve, reject) => {
      console.log('Migration 015: Flexible Arbeitszeitenverwaltung...');

      db.serialize(() => {
        // 1. Tabelle arbeitszeiten_plan erstellen
        db.run(`
          CREATE TABLE IF NOT EXISTS arbeitszeiten_plan (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mitarbeiter_id INTEGER,
            lehrling_id INTEGER,
            wochentag INTEGER,
            datum_von TEXT,
            datum_bis TEXT,
            arbeitsstunden REAL NOT NULL,
            pausenzeit_minuten INTEGER DEFAULT 30,
            ist_frei INTEGER DEFAULT 0,
            beschreibung TEXT,
            erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id) ON DELETE CASCADE,
            FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id) ON DELETE CASCADE,
            CHECK ((mitarbeiter_id IS NOT NULL AND lehrling_id IS NULL) OR 
                   (mitarbeiter_id IS NULL AND lehrling_id IS NOT NULL)),
            CHECK (wochentag IS NULL OR (wochentag >= 1 AND wochentag <= 7)),
            CHECK ((wochentag IS NOT NULL AND datum_von IS NULL AND datum_bis IS NULL) OR
                   (wochentag IS NULL AND datum_von IS NOT NULL))
          )
        `);

        console.log('  ✓ Tabelle arbeitszeiten_plan erstellt');

        // 2. Indizes für Performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_arbeitszeiten_mitarbeiter ON arbeitszeiten_plan(mitarbeiter_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_arbeitszeiten_lehrling ON arbeitszeiten_plan(lehrling_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_arbeitszeiten_wochentag ON arbeitszeiten_plan(wochentag)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_arbeitszeiten_datum ON arbeitszeiten_plan(datum_von, datum_bis)`);
        db.run(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_arbeitszeiten_unique_muster 
          ON arbeitszeiten_plan(
            COALESCE(mitarbeiter_id, -1), 
            COALESCE(lehrling_id, -1), 
            wochentag
          ) WHERE wochentag IS NOT NULL
        `);

        console.log('  ✓ Indizes erstellt');

        // 3. Prüfe ob bereits Muster existieren (für Idempotenz)
        db.get(`SELECT COUNT(*) as anzahl FROM arbeitszeiten_plan`, (err, row) => {
          if (err) return reject(err);

          if (row.anzahl > 0) {
            console.log(`  ℹ️  ${row.anzahl} Arbeitszeitenmuster bereits vorhanden - überspringe Datenmigration`);
            console.log('  ✓ Migration 015 erfolgreich abgeschlossen');
            return resolve();
          }

          // 4. Bestehende Mitarbeiter migrieren
          db.all(`
            SELECT id, wochenarbeitszeit_stunden, arbeitstage_pro_woche, 
                   pausenzeit_minuten, samstag_aktiv, samstag_start, samstag_ende, 
                   samstag_pausenzeit_minuten
            FROM mitarbeiter
            WHERE aktiv = 1
          `, (err, mitarbeiter) => {
            if (err) return reject(err);

            const insertPlan = db.prepare(`
              INSERT INTO arbeitszeiten_plan 
              (mitarbeiter_id, wochentag, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung)
              VALUES (?, ?, ?, ?, ?, ?)
            `);

            let musterErstellt = 0;

            mitarbeiter.forEach(ma => {
              const wochenstunden = ma.wochenarbeitszeit_stunden || 40;
              const arbeitstage = ma.arbeitstage_pro_woche || 5;
              const stundenProTag = wochenstunden / arbeitstage;
              const pause = ma.pausenzeit_minuten || 30;

              // Montag bis Freitag
              for (let tag = 1; tag <= 5; tag++) {
                insertPlan.run(
                  ma.id, tag, stundenProTag, pause, 0,
                  'Automatisch migriert aus Wochenarbeitszeit'
                );
                musterErstellt++;
              }

              // Samstag
              if (ma.samstag_aktiv === 1) {
                const [startH, startM] = (ma.samstag_start || '09:00').split(':').map(Number);
                const [endeH, endeM] = (ma.samstag_ende || '12:00').split(':').map(Number);
                const startMinuten = startH * 60 + startM;
                const endeMinuten = endeH * 60 + endeM;
                const arbeitszeitMinuten = endeMinuten - startMinuten - (ma.samstag_pausenzeit_minuten || 0);
                const samstagStunden = Math.max(0, arbeitszeitMinuten / 60);

                insertPlan.run(
                  ma.id, 6, samstagStunden, ma.samstag_pausenzeit_minuten || 0, 0,
                  'Automatisch migriert aus Samstag-Einstellungen'
                );
                musterErstellt++;
              } else {
                insertPlan.run(ma.id, 6, 0, 0, 1, 'Samstag frei');
                musterErstellt++;
              }

              // Sonntag immer frei
              insertPlan.run(ma.id, 7, 0, 0, 1, 'Sonntag frei');
              musterErstellt++;
            });

            insertPlan.finalize();
            console.log(`  ✓ ${musterErstellt} Wochentag-Muster für ${mitarbeiter.length} Mitarbeiter erstellt`);

            // 5. Bestehende Lehrlinge migrieren
            db.all(`
              SELECT id, wochenarbeitszeit_stunden, arbeitstage_pro_woche, 
                     pausenzeit_minuten, samstag_aktiv, samstag_start, samstag_ende, 
                     samstag_pausenzeit_minuten
              FROM lehrlinge
              WHERE aktiv = 1
            `, (err, lehrlinge) => {
              if (err) return reject(err);

              const insertPlanLehrling = db.prepare(`
                INSERT INTO arbeitszeiten_plan 
                (lehrling_id, wochentag, arbeitsstunden, pausenzeit_minuten, ist_frei, beschreibung)
                VALUES (?, ?, ?, ?, ?, ?)
              `);

              let lehrlingMusterErstellt = 0;

              lehrlinge.forEach(l => {
                const wochenstunden = l.wochenarbeitszeit_stunden || 40;
                const arbeitstage = l.arbeitstage_pro_woche || 5;
                const stundenProTag = wochenstunden / arbeitstage;
                const pause = l.pausenzeit_minuten || 30;

                // Montag bis Freitag
                for (let tag = 1; tag <= 5; tag++) {
                  insertPlanLehrling.run(
                    l.id, tag, stundenProTag, pause, 0,
                    'Automatisch migriert aus Wochenarbeitszeit'
                  );
                  lehrlingMusterErstellt++;
                }

                // Samstag
                if (l.samstag_aktiv === 1) {
                  const [startH, startM] = (l.samstag_start || '09:00').split(':').map(Number);
                  const [endeH, endeM] = (l.samstag_ende || '12:00').split(':').map(Number);
                  const startMinuten = startH * 60 + startM;
                  const endeMinuten = endeH * 60 + endeM;
                  const arbeitszeitMinuten = endeMinuten - startMinuten - (l.samstag_pausenzeit_minuten || 0);
                  const samstagStunden = Math.max(0, arbeitszeitMinuten / 60);

                  insertPlanLehrling.run(
                    l.id, 6, samstagStunden, l.samstag_pausenzeit_minuten || 0, 0,
                    'Automatisch migriert aus Samstag-Einstellungen'
                  );
                  lehrlingMusterErstellt++;
                } else {
                  insertPlanLehrling.run(l.id, 6, 0, 0, 1, 'Samstag frei');
                  lehrlingMusterErstellt++;
                }

                // Sonntag immer frei
                insertPlanLehrling.run(l.id, 7, 0, 0, 1, 'Sonntag frei');
                lehrlingMusterErstellt++;
              });

              insertPlanLehrling.finalize();
              console.log(`  ✓ ${lehrlingMusterErstellt} Wochentag-Muster für ${lehrlinge.length} Lehrlinge erstellt`);

              // 6. Validierung
              db.get(`SELECT COUNT(*) as anzahl FROM arbeitszeiten_plan`, (err, row) => {
                if (err) return reject(err);

                console.log(`  ✓ Gesamt: ${row.anzahl} Arbeitszeitenmuster in Datenbank`);
                console.log('  ✓ Migration 015 erfolgreich abgeschlossen');
                resolve();
              });
            });
          });
        });
      });
    });
  },

  down: (db) => {
    return new Promise((resolve, reject) => {
      console.log('Migration 015: Rollback...');
      
      db.run(`DROP TABLE IF EXISTS arbeitszeiten_plan`, (err) => {
        if (err) return reject(err);
        
        console.log('  ✓ Tabelle arbeitszeiten_plan gelöscht');
        console.log('  ✓ Rollback abgeschlossen');
        resolve();
      });
    });
  }
};
