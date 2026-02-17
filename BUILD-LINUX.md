# Linux deb-Paket Build-Anleitung

## Voraussetzungen

Zum Erstellen des Debian-Pakets benötigen Sie:

- **Linux-System**: Debian 11+, Ubuntu 20.04+ oder kompatible Distribution
- **Build-Tools**:
  ```bash
  sudo apt-get install build-essential fakeroot dpkg-dev lintian rsync
  ```
- **Node.js**: Version 18 oder höher
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

## Build-Prozess

### 1. Repository klonen
```bash
git clone https://github.com/SHP-ART/Werkstatt-Terminplaner.git
cd Werkstatt-Terminplaner
```

### 2. Build-Skript ausführbar machen
```bash
chmod +x build-debian-pkg.sh
```

### 3. Paket bauen
```bash
./build-debian-pkg.sh
```

Das Skript führt automatisch folgende Schritte aus:
1. ✅ Bereinigt alte Builds
2. ✅ Installiert Backend-Dependencies (production)
3. ✅ Baut das Frontend (optional, falls Vite verwendet wird)
4. ✅ Kopiert Backend, Frontend und systemd-Service in die Paket-Struktur
5. ✅ Aktualisiert die Control-Datei mit der aktuellen Version
6. ✅ Setzt die korrekten Permissions
7. ✅ Erstellt das deb-Paket mit `dpkg-deb`
8. ✅ Führt Lintian-Check durch (optional)

### 4. Paket prüfen

```bash
# Paket-Informationen anzeigen
dpkg-deb --info dist-linux/werkstatt-terminplaner_*.deb

# Paket-Inhalt auflisten
dpkg-deb --contents dist-linux/werkstatt-terminplaner_*.deb

# Lintian-Check für Konformität
lintian dist-linux/werkstatt-terminplaner_*.deb
```

## Output

Das fertige Paket wird erstellt unter:
```
dist-linux/werkstatt-terminplaner_1.6.2_amd64.deb
```

**Typische Größe**: ~80-100 MB (inkl. node_modules)

## Installation testen

```bash
# Auf Testsystem installieren
sudo dpkg -i dist-linux/werkstatt-terminplaner_*.deb
sudo apt-get install -f

# Status prüfen
systemctl status werkstatt-terminplaner

# Im Browser öffnen
firefox http://localhost:3001
```

## Troubleshooting

### Fehler: "dpkg-deb: command not found"
```bash
sudo apt-get install dpkg-dev
```

### Fehler: "fakeroot: command not found"
```bash
sudo apt-get install fakeroot
```

### Fehler: Backend-Dependencies fehlen
```bash
cd backend
npm install --production
cd ..
./build-debian-pkg.sh
```

### Paket ist zu groß
Das Paket enthält alle node_modules (~60-70 MB). Alternative:
- node_modules nicht bundlen (erfordert Node.js auf Zielsystem)
- Dependencies als separate Pakete deklarieren

### Lintian-Warnungen ignorieren
Häufige harmlose Warnungen:
- `embedded-javascript-library`: node_modules enthält JS-Bibliotheken (erwartet)
- `arch-dependent-file-in-usr-share`: Binäre Node-Module (SQLite3)
- `extra-license-file`: Lizenzen in node_modules (normal)

## CI/CD Integration

### GitHub Actions Beispiel

```yaml
name: Build Linux Package

on:
  push:
    tags:
      - 'v*'

jobs:
  build-deb:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Build Tools
        run: |
          sudo apt-get update
          sudo apt-get install -y build-essential fakeroot dpkg-dev rsync
      
      - name: Build Debian Package
        run: |
          chmod +x build-debian-pkg.sh
          ./build-debian-pkg.sh
      
      - name: Upload Package
        uses: actions/upload-artifact@v3
        with:
          name: debian-package
          path: dist-linux/*.deb
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist-linux/*.deb
```

## Paket-Struktur

Nach dem Build wird folgende Struktur erstellt:

```
packaging/linux/debian/
├── DEBIAN/
│   ├── control      # Paket-Metadaten
│   ├── postinst     # Nach-Installations-Skript
│   ├── prerm        # Vor-Deinstallations-Skript
│   └── postrm       # Nach-Deinstallations-Skript
├── opt/werkstatt-terminplaner/
│   ├── src/         # Backend-Code
│   ├── frontend/    # Frontend-Dateien
│   ├── node_modules/  # Dependencies
│   └── package.json
├── etc/werkstatt-terminplaner/
│   └── .env.example
└── lib/systemd/system/
    └── werkstatt-terminplaner.service
```

## Nächste Schritte

Nach erfolgreichem Build:

1. ✅ Paket testen auf Debian/Ubuntu-System
2. ✅ Zu GitHub Release hochladen
3. ✅ Installation dokumentieren
4. ✅ Update-Mechanismus testen
5. ✅ Benutzer informieren

## Support

Bei Problemen:
- [GitHub Issues](https://github.com/SHP-ART/Werkstatt-Terminplaner/issues)
- [Dokumentation](LINUX-HEADLESS-INSTALLATION.md)
