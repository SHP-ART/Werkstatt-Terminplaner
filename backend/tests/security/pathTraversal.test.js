const path = require('path');

// Simuliere die Validierungslogik
function isPathSafe(filePath, allowedDir) {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(allowedDir + path.sep) || resolved === allowedDir;
}

describe('Path Traversal Protection', () => {
  const allowedDir = path.resolve(__dirname, '../../tablet-updates');

  test('erlaubt Dateien im erlaubten Verzeichnis', () => {
    const safePath = path.join(allowedDir, 'update-v1.2.0.apk');
    expect(isPathSafe(safePath, allowedDir)).toBe(true);
  });

  test('blockiert Path-Traversal mit ../', () => {
    const evilPath = path.join(allowedDir, '..', '..', 'etc', 'passwd');
    expect(isPathSafe(evilPath, allowedDir)).toBe(false);
  });

  test('blockiert absolute Pfade ausserhalb', () => {
    expect(isPathSafe('/etc/passwd', allowedDir)).toBe(false);
  });

  test('blockiert Windows-Pfade ausserhalb', () => {
    expect(isPathSafe('C:\\Windows\\System32\\config\\sam', allowedDir)).toBe(false);
  });
});
