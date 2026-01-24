/**
 * Migration 009: Performance-Indizes
 * Erstellt alle wichtigen Indizes für optimale Abfrage-Performance
 */

const { safeCreateIndex, safeCreateTable } = require('./helpers');

module.exports = {
  version: 9,
  description: 'Performance-Indizes und erweiterte Tabellen',

  async up(db) {
    // === Basis-Indizes für Termine ===
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_datum ON termine(datum)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_status ON termine(status)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_kunde_id ON termine(kunde_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_mitarbeiter_id ON termine(mitarbeiter_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_datum_status ON termine(datum, status)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_geloescht_am ON termine(geloescht_am)`
    );

    // === Composite Indizes für Performance-Optimierung ===
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_geloescht_datum ON termine(geloescht_am, datum)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_auslastung ON termine(datum, status, mitarbeiter_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_schwebend ON termine(ist_schwebend, datum)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_erweiterung ON termine(erweiterung_von_id, ist_erweiterung)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_termine_ersatzauto ON termine(ersatzauto, datum, ersatzauto_bis_datum)`
    );

    // === Kunden-Indizes ===
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_kunden_name ON kunden(name)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_kunden_kennzeichen ON kunden(kennzeichen)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_kunden_suche ON kunden(name, kennzeichen, telefon)`
    );

    // === Mitarbeiter/Lehrlinge Indizes ===
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_mitarbeiter_aktiv ON mitarbeiter(aktiv)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_lehrlinge_aktiv ON lehrlinge(aktiv)`
    );

    // === Mitarbeiter-Abwesenheiten Indizes ===
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_ma_abw_mitarbeiter ON mitarbeiter_abwesenheiten(mitarbeiter_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_ma_abw_lehrling ON mitarbeiter_abwesenheiten(lehrling_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_ma_abw_datum ON mitarbeiter_abwesenheiten(von_datum, bis_datum)`
    );

    // === Termin-Phasen Tabelle und Indizes ===
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS termin_phasen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER NOT NULL,
      phase_nr INTEGER NOT NULL,
      bezeichnung TEXT NOT NULL,
      datum DATE NOT NULL,
      geschaetzte_zeit INTEGER NOT NULL,
      tatsaechliche_zeit INTEGER,
      mitarbeiter_id INTEGER,
      lehrling_id INTEGER,
      status TEXT DEFAULT 'geplant',
      notizen TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE CASCADE,
      FOREIGN KEY (mitarbeiter_id) REFERENCES mitarbeiter(id),
      FOREIGN KEY (lehrling_id) REFERENCES lehrlinge(id)
    )`);

    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_phasen_termin ON termin_phasen(termin_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_phasen_datum ON termin_phasen(datum)`
    );

    // === Teile-Bestellungen Tabelle und Indizes ===
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS teile_bestellungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      termin_id INTEGER NOT NULL,
      teil_name TEXT NOT NULL,
      teil_oe_nummer TEXT,
      menge INTEGER DEFAULT 1,
      fuer_arbeit TEXT,
      status TEXT DEFAULT 'offen',
      bestellt_am DATETIME,
      geliefert_am DATETIME,
      notiz TEXT,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (termin_id) REFERENCES termine(id) ON DELETE CASCADE
    )`);

    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_teile_termin ON teile_bestellungen(termin_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_teile_status ON teile_bestellungen(status)`
    );

    // === Fahrzeuge Tabelle und Indizes ===
    await safeCreateTable(db, `CREATE TABLE IF NOT EXISTS fahrzeuge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kunde_id INTEGER,
      kennzeichen TEXT NOT NULL,
      vin TEXT UNIQUE,
      hersteller TEXT,
      modell TEXT,
      generation TEXT,
      baujahr INTEGER,
      motor_code TEXT,
      motor_typ TEXT,
      motor_ps TEXT,
      getriebe TEXT,
      werk TEXT,
      produktionsland TEXT,
      karosserie TEXT,
      oel_spezifikation TEXT,
      oelfilter_oe TEXT,
      besonderheiten TEXT,
      hinweise TEXT,
      vin_roh TEXT,
      aktualisiert_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      erstellt_am DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (kunde_id) REFERENCES kunden(id)
    )`);

    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_fahrzeuge_kunde ON fahrzeuge(kunde_id)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_fahrzeuge_kennzeichen ON fahrzeuge(kennzeichen)`
    );
    await safeCreateIndex(db,
      `CREATE INDEX IF NOT EXISTS idx_fahrzeuge_vin ON fahrzeuge(vin)`
    );

    console.log('✅ Performance-Indizes erstellt');
  },

  async down(db) {
    // Indizes können sicher gelöscht werden
    const indices = [
      'idx_termine_datum', 'idx_termine_status', 'idx_termine_kunde_id',
      'idx_termine_mitarbeiter_id', 'idx_termine_datum_status', 'idx_termine_geloescht_am',
      'idx_termine_geloescht_datum', 'idx_termine_auslastung', 'idx_termine_schwebend',
      'idx_termine_erweiterung', 'idx_termine_ersatzauto',
      'idx_kunden_name', 'idx_kunden_kennzeichen', 'idx_kunden_suche',
      'idx_mitarbeiter_aktiv', 'idx_lehrlinge_aktiv',
      'idx_ma_abw_mitarbeiter', 'idx_ma_abw_lehrling', 'idx_ma_abw_datum',
      'idx_phasen_termin', 'idx_phasen_datum',
      'idx_teile_termin', 'idx_teile_status',
      'idx_fahrzeuge_kunde', 'idx_fahrzeuge_kennzeichen', 'idx_fahrzeuge_vin'
    ];

    for (const idx of indices) {
      await new Promise((resolve) => {
        db.run(`DROP INDEX IF EXISTS ${idx}`, () => resolve());
      });
    }
  }
};
