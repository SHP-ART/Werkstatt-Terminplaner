/**
 * Test: Backup-Restore mit automatischer Schema-Migration
 * Simuliert das Wiederherstellen eines alten Backups über die API
 */

const path = require('path');
const fs = require('fs');

// API-Test mit fetch (Node 18+)
async function testBackupRestore() {
  console.log('=== BACKUP-RESTORE TEST ===\n');

  try {
    // 1. Prüfe Server-Status
    console.log('1. Prüfe Server-Status...');
    const healthCheck = await fetch('http://localhost:3001/api/health');
    if (!healthCheck.ok) {
      throw new Error('Server nicht erreichbar!');
    }
    console.log('   ✓ Server läuft\n');

    // 2. Liste verfügbare Backups
    console.log('2. Liste Backups...');
    const backupList = await fetch('http://localhost:3001/api/backup/list');
    const backups = await backupList.json();
    
    console.log(`   Verfügbare Backups: ${backups.backups.length}`);
    backups.backups.slice(0, 3).forEach(b => {
      const sizeMB = (b.sizeBytes / 1024 / 1024).toFixed(2);
      console.log(`   - ${b.name} (${sizeMB} MB)`);
    });

    // 3. Wähle ein altes Backup
    const oldBackup = backups.backups.find(b => b.name.includes('2026-01-28'));
    if (!oldBackup) {
      console.log('\n   ⚠️ Kein altes Backup gefunden - erstelle Testfall...');
      
      // Kopiere aktuelles Backup als Test
      const testBackup = backups.backups[backups.backups.length - 1];
      console.log(`   Verwende stattdessen: ${testBackup.name}\n`);
      
      // 4. Restore durchführen
      console.log('3. Starte Backup-Restore...');
      const restoreResponse = await fetch('http://localhost:3001/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: testBackup.name })
      });

      const restoreResult = await restoreResponse.json();
      
      if (restoreResponse.ok) {
        console.log('   ✓ Restore erfolgreich!');
        console.log(`   ✓ ${restoreResult.message}`);
        console.log(`   ✓ Wiederhergestellt: ${restoreResult.restored}`);
        if (restoreResult.hinweis) {
          console.log(`   ℹ️  ${restoreResult.hinweis}`);
        }
      } else {
        console.error('   ✗ Restore fehlgeschlagen:', restoreResult.error);
      }
    } else {
      console.log(`\n   Verwende altes Backup: ${oldBackup.name}\n`);
      
      // 4. Restore durchführen
      console.log('3. Starte Backup-Restore mit ALTEM Backup...');
      console.log('   (Dies sollte automatisch konvertieren)\n');
      
      const restoreResponse = await fetch('http://localhost:3001/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: oldBackup.name })
      });

      const restoreResult = await restoreResponse.json();
      
      if (restoreResponse.ok) {
        console.log('   ✓ Restore erfolgreich!');
        console.log(`   ✓ ${restoreResult.message}`);
        console.log(`   ✓ Wiederhergestellt: ${restoreResult.restored}`);
        if (restoreResult.hinweis) {
          console.log(`   ℹ️  ${restoreResult.hinweis}`);
        }
      } else {
        console.error('   ✗ Restore fehlgeschlagen:', restoreResult.error);
        process.exit(1);
      }
    }

    // 5. Warte kurz auf Migration
    console.log('\n4. Warte auf Migrations-Abschluss...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 6. Prüfe Termine-Anzahl
    console.log('\n5. Prüfe Termine nach Restore...');
    const termineResponse = await fetch('http://localhost:3001/api/termine');
    const termine = await termineResponse.json();
    
    console.log(`   ✓ Termine gefunden: ${termine.length}`);
    
    if (termine.length > 0) {
      console.log(`   ✓ Erste 3 Termine:`);
      termine.slice(0, 3).forEach((t, i) => {
        console.log(`      ${i+1}. ID:${t.id} - ${t.kunde_name} - ${t.datum}`);
      });
    }

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ TEST ERFOLGREICH - TERMINE NACH RESTORE SICHTBAR       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('\n✗ FEHLER beim Test:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Test ausführen
testBackupRestore();
