#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'werkstatt.db');
const db = new Database(dbPath);

console.log('🔍 Status der Abwesenheits-Tabellen:\n');

// Zeige Tabellen
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name LIKE '%abwesenheit%' 
  ORDER BY name
`).all();

console.log('📋 Vorhandene Tabellen:');
tables.forEach(t => console.log(`  - ${t.name}`));

// Zeige Datenbestand
console.log('\n📊 Datenbestand:');

if (tables.find(t => t.name === 'mitarbeiter_abwesenheiten')) {
  const count = db.prepare('SELECT COUNT(*) as count FROM mitarbeiter_abwesenheiten').get();
  console.log(`  mitarbeiter_abwesenheiten: ${count.count} Einträge`);
}

if (tables.find(t => t.name === 'abwesenheiten')) {
  const count = db.prepare('SELECT COUNT(*) as count FROM abwesenheiten').get();
  console.log(`  abwesenheiten: ${count.count} Einträge`);
}

if (tables.find(t => t.name === 'abwesenheiten_legacy')) {
  const count = db.prepare('SELECT COUNT(*) as count FROM abwesenheiten_legacy').get();
  console.log(`  abwesenheiten_legacy: ${count.count} Einträge`);
}

// Zeige Indizes
console.log('\n🔑 Indizes:');
const indices = db.prepare(`
  SELECT name, tbl_name FROM sqlite_master 
  WHERE type='index' AND name LIKE '%abw%' 
  ORDER BY name
`).all();
indices.forEach(idx => console.log(`  - ${idx.name} (${idx.tbl_name})`));

db.close();

console.log('\n✓ Analyse abgeschlossen');
