/**
 * Datenbank-Migrations-Skript
 * Fügt alle fehlenden Spalten zur Datenbank hinzu.
 * 
 * Verwendung:
 *   node migrate-database.js [Pfad zur Datenbank]
 * 
 * Beispiel:
 *   node migrate-database.js
 *   node migrate-database.js "C:\Users\...\AppData\Roaming\Werkstatt Terminplaner\database\werkstatt.db"
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Datenbank-Pfad ermitteln
let dbPath = process.argv[2];

if (!dbPath) {
  // Standard-Pfade prüfen
  const possiblePaths = [
    path.join(__dirname, 'backend', 'database', 'werkstatt.db'),
    path.join(process.env.APPDATA || '', 'Werkstatt Terminplaner', 'database', 'werkstatt.db'),
    path.join(process.env.LOCALAPPDATA || '', 'Werkstatt Terminplaner', 'database', 'werkstatt.db'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      dbPath = p;
      break;
    }
  }
}

if (!dbPath || !fs.existsSync(dbPath)) {
  console.error('Datenbank nicht gefunden!');
  console.log('\nBitte gib den Pfad zur Datenbank an:');
  console.log('  node migrate-database.js "C:\\Pfad\\zur\\werkstatt.db"');
  console.log('\nMögliche Speicherorte:');
  console.log('  - %APPDATA%\\Werkstatt Terminplaner\\database\\werkstatt.db');
  console.log('  - backend\\database\\werkstatt.db');
  process.exit(1);
}

console.log('Datenbank gefunden:', dbPath);
console.log('Starte Migration...\n');

const db = new sqlite3.Database(dbPath);

// Alle Spalten die für die termine-Tabelle benötigt werden
const termineColumns = [
  { name: 'kunde_name', type: 'TEXT' },
  { name: 'kunde_telefon', type: 'TEXT' },
  { name: 'abholung_typ', type: "TEXT DEFAULT 'abholung'" },
  { name: 'abholung_details', type: 'TEXT' },
  { name: 'abholung_zeit', type: 'TEXT' },
  { name: 'bring_zeit', type: 'TEXT' },
  { name: 'kontakt_option', type: 'TEXT' },
  { name: 'kilometerstand', type: 'INTEGER' },
  { name: 'ersatzauto', type: 'INTEGER DEFAULT 0' },
  { name: 'ersatzauto_tage', type: 'INTEGER' },
  { name: 'ersatzauto_bis_datum', type: 'DATE' },
  { name: 'ersatzauto_bis_zeit', type: 'TEXT' },
  { name: 'abholung_datum', type: 'DATE' },
  { name: 'termin_nr', type: 'TEXT' },
  { name: 'arbeitszeiten_details', type: 'TEXT' },
  { name: 'mitarbeiter_id', type: 'INTEGER' },
  { name: 'geloescht_am', type: 'DATETIME' },
  { name: 'dringlichkeit', type: 'TEXT' },
  { name: 'vin', type: 'TEXT' },
  { name: 'fahrzeugtyp', type: 'TEXT' },
  { name: 'ist_schwebend', type: 'INTEGER DEFAULT 0' },
  { name: 'parent_termin_id', type: 'INTEGER' },
  { name: 'split_teil', type: 'INTEGER' },
  { name: 'muss_bearbeitet_werden', type: 'INTEGER DEFAULT 0' },
  { name: 'erweiterung_von_id', type: 'INTEGER' },
  { name: 'ist_erweiterung', type: 'INTEGER DEFAULT 0' },
  { name: 'erweiterung_typ', type: 'TEXT' },
  { name: 'teile_status', type: "TEXT DEFAULT 'vorraetig'" },
  { name: 'interne_auftragsnummer', type: 'TEXT' },
  { name: 'startzeit', type: 'TEXT' },
  { name: 'endzeit_berechnet', type: 'TEXT' },
];

// Spalten für die kunden-Tabelle
const kundenColumns = [
  { name: 'vin', type: 'TEXT' },
  { name: 'fahrzeugtyp', type: 'TEXT' },
];

// Spalten für die mitarbeiter-Tabelle
const mitarbeiterColumns = [
  { name: 'nebenzeit_prozent', type: 'REAL DEFAULT 0' },
  { name: 'ist_lehrling', type: 'INTEGER DEFAULT 0' },
  { name: 'lehrjahr', type: 'INTEGER' },
  { name: 'mittagspause_start', type: 'TEXT' },
  { name: 'mittagspause_dauer', type: 'INTEGER DEFAULT 30' },
  { name: 'reihenfolge', type: 'INTEGER DEFAULT 0' },
];

let addedCount = 0;
let skippedCount = 0;

function addColumn(table, column, callback) {
  const sql = `ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type}`;
  db.run(sql, (err) => {
    if (err) {
      if (err.message.includes('duplicate column')) {
        console.log(`  ✓ ${table}.${column.name} - existiert bereits`);
        skippedCount++;
      } else {
        console.error(`  ✗ ${table}.${column.name} - FEHLER:`, err.message);
      }
    } else {
      console.log(`  + ${table}.${column.name} - HINZUGEFÜGT`);
      addedCount++;
    }
    callback();
  });
}

function processColumns(table, columns, callback) {
  console.log(`\n${table.toUpperCase()}-Tabelle:`);
  let index = 0;
  
  function next() {
    if (index >= columns.length) {
      callback();
      return;
    }
    addColumn(table, columns[index], () => {
      index++;
      next();
    });
  }
  
  next();
}

// Migrationen ausführen
processColumns('termine', termineColumns, () => {
  processColumns('kunden', kundenColumns, () => {
    processColumns('mitarbeiter', mitarbeiterColumns, () => {
      db.close(() => {
        console.log('\n========================================');
        console.log(`Migration abgeschlossen!`);
        console.log(`  ${addedCount} Spalten hinzugefügt`);
        console.log(`  ${skippedCount} Spalten existierten bereits`);
        console.log('========================================\n');
        console.log('Bitte starte die App neu.');
      });
    });
  });
});
