/**
 * Automatische Update-Registrierung nach dem Build
 * Registriert die neu gebaute Tablet-App automatisch am Server
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Konfiguration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const DIST_DIR = path.join(__dirname, 'dist');

console.log('\n========================================');
console.log('  Auto-Registrierung: Tablet-Update');
console.log('========================================\n');

// Version aus package.json laden
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = packageJson.version;

console.log(`Version: ${version}`);
console.log(`Server: ${SERVER_URL}\n`);

// Installer-Datei finden
console.log('[1/2] Suche Installer-Datei...');
let installerPath = null;

try {
  const files = fs.readdirSync(DIST_DIR, { recursive: true, withFileTypes: true });
  
  for (const file of files) {
    if (file.isFile() && file.name.match(/Werkstatt-Intern-Setup-.*\.exe$/)) {
      installerPath = path.join(file.path || file.parentPath || DIST_DIR, file.name);
      break;
    }
  }
} catch (error) {
  console.error('❌ Fehler beim Suchen der Datei:', error.message);
  process.exit(1);
}

if (!installerPath) {
  console.error('❌ Installer nicht gefunden!');
  console.error(`   Gesucht in: ${DIST_DIR}`);
  console.error(`   Pattern: Werkstatt-Intern-Setup-*.exe`);
  process.exit(1);
}

console.log(`✅ Gefunden: ${path.basename(installerPath)}\n`);

// Am Server registrieren
console.log('[2/2] Registriere am Server...');

const body = JSON.stringify({
  version: version,
  filePath: installerPath,
  releaseNotes: `Automatisches Update: Version ${version}`
});

const url = new URL('/api/tablet-update/register', SERVER_URL);

const options = {
  hostname: url.hostname,
  port: url.port || 80,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Update erfolgreich registriert!\n');
      console.log('========================================');
      console.log('  FERTIG!');
      console.log('========================================\n');
      console.log(`✓ Version ${version} ist jetzt verfügbar`);
      console.log('✓ Tablets werden beim nächsten Check benachrichtigt');
      console.log('  (innerhalb von 30 Minuten)\n');
      console.log('📊 Status prüfen:');
      console.log(`   ${SERVER_URL}/api/tablet-update/status\n`);
    } else {
      console.error(`❌ Fehler: HTTP ${res.statusCode}`);
      console.error('   Response:', data);
      console.error('\n💡 Ist der Server erreichbar?');
      console.error(`   ${SERVER_URL}\n`);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Verbindungsfehler:', error.message);
  console.error('\n💡 Mögliche Ursachen:');
  console.error('   • Server läuft nicht');
  console.error('   • Falsche URL:', SERVER_URL);
  console.error('   • Firewall blockiert Verbindung\n');
  console.error('ℹ️  Installer wurde trotzdem erstellt:');
  console.error(`   ${installerPath}\n`);
  console.error('📝 Manuell registrieren mit:');
  console.error(`   npm run register\n`);
  process.exit(1);
});

req.write(body);
req.end();
