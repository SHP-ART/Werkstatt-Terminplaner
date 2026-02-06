#!/usr/bin/env pwsh
# ========================================
# Release Build v1.6.0
# All-in-One + Tablet App (32/64bit)
# PowerShell Version
# ========================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Werkstatt Terminplaner v1.6.0        ║" -ForegroundColor Cyan
Write-Host "║  Release Build                         ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Prüfe Git
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "❌ FEHLER: Git ist nicht installiert!" -ForegroundColor Red
    Read-Host "Enter drücken"
    exit 1
}

# Prüfe GitHub CLI
$hasGH = Get-Command gh -ErrorAction SilentlyContinue
if (!$hasGH) {
    Write-Host "⚠️  WARNUNG: GitHub CLI (gh) ist nicht installiert!" -ForegroundColor Yellow
    Write-Host "   GitHub Release muss manuell erstellt werden." -ForegroundColor Yellow
    Write-Host ""
}

# Git Status
Write-Host "[📋] Prüfe Git Status..." -ForegroundColor Green
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  WARNUNG: Es gibt nicht-committete Änderungen!" -ForegroundColor Yellow
    Write-Host ""
    git status --short
    Write-Host ""
    $continue = Read-Host "Trotzdem fortfahren? (Y/N)"
    if ($continue -ne "Y") { exit 0 }
}

Write-Host "✅ Git Status OK" -ForegroundColor Green
Write-Host ""

# Release-Verzeichnis
$releaseDir = "release\v1.6.0"
if (!(Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

# ========== Backend All-in-One ==========
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  [1/3] Backend All-in-One Build       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Push-Location backend

# Dependencies
if (!(Test-Path "node_modules")) {
    Write-Host "[📦] Installiere Backend Dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "❌ Backend npm install fehlgeschlagen!" -ForegroundColor Red
        Read-Host "Enter drücken"
        exit 1
    }
}

# Build
Write-Host "[🔨] Baue All-in-One Setup..." -ForegroundColor Yellow
npm run build:allinone
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "❌ All-in-One Build fehlgeschlagen!" -ForegroundColor Red
    Read-Host "Enter drücken"
    exit 1
}

Write-Host "✅ All-in-One Build erfolgreich!" -ForegroundColor Green
Write-Host ""

# Kopiere Dateien
Write-Host "[📦] Kopiere All-in-One Setup..." -ForegroundColor Yellow
$allinoneExe = "dist-allinone\Werkstatt-Terminplaner-Setup-1.6.0.exe"
if (Test-Path $allinoneExe) {
    Copy-Item $allinoneExe "..\$releaseDir\" -Force
    Write-Host "✅ Kopiert: Werkstatt-Terminplaner-Setup-1.6.0.exe" -ForegroundColor Green
} else {
    Pop-Location
    Write-Host "❌ All-in-One Setup nicht gefunden!" -ForegroundColor Red
    Read-Host "Enter drücken"
    exit 1
}

if (Test-Path "dist-allinone\latest.yml") {
    Copy-Item "dist-allinone\latest.yml" "..\$releaseDir\" -Force
    Write-Host "✅ Kopiert: latest.yml" -ForegroundColor Green
}

Pop-Location
Write-Host ""

# ========== Tablet App ==========
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  [2/3] Tablet App Build (32/64bit)    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Push-Location electron-intern-tablet

# Dependencies
if (!(Test-Path "node_modules")) {
    Write-Host "[📦] Installiere Tablet Dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "❌ Tablet npm install fehlgeschlagen!" -ForegroundColor Red
        Read-Host "Enter drücken"
        exit 1
    }
}

# Build
Write-Host "[🔨] Baue Tablet App (32-bit + 64-bit)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "❌ Tablet Build fehlgeschlagen!" -ForegroundColor Red
    Read-Host "Enter drücken"
    exit 1
}

Write-Host "✅ Tablet Build erfolgreich!" -ForegroundColor Green
Write-Host ""

# Kopiere Installer
Write-Host "[📦] Kopiere Tablet Installer..." -ForegroundColor Yellow
$tabletCopied = $false

$tablet32 = "dist\Werkstatt-Intern-Setup-1.6.0-ia32.exe"
if (Test-Path $tablet32) {
    Copy-Item $tablet32 "..\$releaseDir\" -Force
    Write-Host "✅ Kopiert: Werkstatt-Intern-Setup-1.6.0-ia32.exe (32-bit)" -ForegroundColor Green
    $tabletCopied = $true
}

$tablet64 = "dist\Werkstatt-Intern-Setup-1.6.0-x64.exe"
if (Test-Path $tablet64) {
    Copy-Item $tablet64 "..\$releaseDir\" -Force
    Write-Host "✅ Kopiert: Werkstatt-Intern-Setup-1.6.0-x64.exe (64-bit)" -ForegroundColor Green
    $tabletCopied = $true
}

if (!$tabletCopied) {
    Pop-Location
    Write-Host "❌ Keine Tablet Installer gefunden!" -ForegroundColor Red
    Read-Host "Enter drücken"
    exit 1
}

Pop-Location
Write-Host ""

# ========== Release Notes ==========
Write-Host "[📝] Erstelle Release Notes..." -ForegroundColor Yellow

$releaseNotes = @"
# Werkstatt Terminplaner v1.6.0

## 🎉 Neue Features

### Remote-Update-System für Tablet-Apps
- 🔄 Zentrale Update-Verwaltung vom Server aus
- 📱 Tablets prüfen automatisch alle 30 Minuten auf Updates
- 💡 Update-Benachrichtigung mit Ein-Klick-Installation
- 📊 Übersicht über alle Tablet-Versionen und Status

### Persistente Einstellungen
- 💾 Einstellungen bleiben bei Updates erhalten
- 🔧 Gespeichert im userData-Verzeichnis
- ✅ Kein Datenverlust mehr bei Neuinstallation

## 🔧 Technische Verbesserungen

### Backend
- Neue API-Endpunkte für Tablet-Update-Verwaltung
- ``GET /api/tablet-update/check`` - Update-Prüfung
- ``GET /api/tablet-update/download`` - Update-Download
- ``POST /api/tablet-update/register`` - Update registrieren
- ``GET /api/tablet-update/status`` - Status aller Tablets
- Automatische Datenbank-Tabellen für Update-Tracking

### Tablet-App
- Auto-Update-Check alle 30 Minuten
- Einstellungen in persistentem userData-Verzeichnis
- Update-Download und Installation mit einem Klick
- Automatische Status-Meldung an Server
- Node.js-kompatible HTTP-Requests (keine fetch-Abhängigkeit)

## 📦 Downloads

### Haupt-Anwendung (Server + Admin-Panel)
- ``Werkstatt-Terminplaner-Setup-1.6.0.exe`` - All-in-One Installer (64-bit)

### Tablet-App (Team-Übersicht Vollbild)
- ``Werkstatt-Intern-Setup-1.6.0-x64.exe`` - 64-bit Version
- ``Werkstatt-Intern-Setup-1.6.0-ia32.exe`` - 32-bit Version

## 📚 Dokumentation

- [TABLET-REMOTE-UPDATE.md](TABLET-REMOTE-UPDATE.md) - Komplette Dokumentation des Update-Systems
- [TABLET-EINSTELLUNGEN-FIX.md](TABLET-EINSTELLUNGEN-FIX.md) - Fix für persistente Einstellungen
- [electron-intern-tablet/README-UPDATE.md](electron-intern-tablet/README-UPDATE.md) - Build & Update Anleitung

## ⚙️ Installation

### Haupt-Anwendung
1. ``Werkstatt-Terminplaner-Setup-1.6.0.exe`` herunterladen
2. Als Administrator ausführen
3. Installationsanweisungen folgen

### Tablet-App
1. Passende Version herunterladen (32-bit oder 64-bit)
2. Auf Tablet installieren
3. Backend-URL in Einstellungen konfigurieren
4. Fertig! Auto-Updates funktionieren ab jetzt automatisch

## 🔄 Update von vorheriger Version

### Server/Admin-Panel
- Einfach neue Version installieren
- Datenbank wird automatisch migriert
- Einstellungen bleiben erhalten

### Tablet-App
- **NEU:** Ab sofort automatische Updates!
- Einstellungen bleiben bei Updates erhalten
- Für dieses erste Update: Manuell installieren
- Danach: Automatische Updates über Server

## 🐛 Bugfixes

- ✅ Tablet-Einstellungen werden nicht mehr bei Installation gelöscht
- ✅ Fehlerbehandlung bei fehlender werkstatt_einstellungen Tabelle
- ✅ SQLite db.exec durch db.serialize ersetzt (Kompatibilität)

## 🚀 Für Entwickler

### Neue Dateien
- ``backend/src/controllers/tabletUpdateController.js``
- ``backend/src/models/tabletUpdateModel.js``
- ``backend/src/routes/tabletUpdateRoutes.js``
- ``electron-intern-tablet/build-and-register.bat``
- ``electron-intern-tablet/build-and-register.ps1``
- ``electron-intern-tablet/register-update.js``

### Build-Skripte
``````bash
# All-in-One Build
cd backend
npm run build:allinone

# Tablet App Build + Auto-Registrierung
cd electron-intern-tablet
npm run build:auto
``````

## ✅ Getestet auf

- Windows 10 (64-bit)
- Windows 11 (64-bit)
- Windows Tablets (32-bit und 64-bit)

## 📝 Version Info

- **Version:** 1.6.0
- **Release-Datum:** 2026-02-06
- **Branch:** master
- **Commit:** [wird automatisch gesetzt]

---

💡 **Tipp:** Vollständige Dokumentation in den verlinkten Markdown-Dateien!
"@

$releaseNotes | Out-File -FilePath "$releaseDir\RELEASE-NOTES.md" -Encoding UTF8

Write-Host "✅ Release Notes erstellt" -ForegroundColor Green
Write-Host ""

# ========== GitHub Release ==========
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  [3/3] GitHub Release                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Dateien anzeigen
Write-Host "📦 Release-Dateien:" -ForegroundColor Yellow
Write-Host ""
Get-ChildItem "$releaseDir\*.exe", "$releaseDir\*.yml", "$releaseDir\*.md" | ForEach-Object { 
    Write-Host "   $($_.Name)" -ForegroundColor White
}
Write-Host ""

if (!$hasGH) {
    Write-Host "⚠️  GitHub CLI nicht verfügbar - manuelle Schritte:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Git Tag erstellen:" -ForegroundColor Cyan
    Write-Host '   git tag -a v1.6.0 -m "Release v1.6.0: Remote-Update-System + Persistente Einstellungen"' -ForegroundColor White
    Write-Host "   git push origin v1.6.0" -ForegroundColor White
    Write-Host ""
    Write-Host "2. GitHub Release erstellen:" -ForegroundColor Cyan
    Write-Host "   https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/new?tag=v1.6.0" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Dateien hochladen aus: $releaseDir" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "[🏷️] Erstelle Git Tag..." -ForegroundColor Yellow
    git tag -a v1.6.0 -m "Release v1.6.0: Remote-Update-System + Persistente Einstellungen"
    
    Write-Host "[⬆️] Push Tag zu GitHub..." -ForegroundColor Yellow
    git push origin v1.6.0
    
    Write-Host "[🚀] Erstelle GitHub Release..." -ForegroundColor Yellow
    gh release create v1.6.0 `
        --title "v1.6.0 - Remote-Update-System + Persistente Einstellungen" `
        --notes-file "$releaseDir\RELEASE-NOTES.md" `
        "$releaseDir\Werkstatt-Terminplaner-Setup-1.6.0.exe" `
        "$releaseDir\Werkstatt-Intern-Setup-1.6.0-x64.exe" `
        "$releaseDir\Werkstatt-Intern-Setup-1.6.0-ia32.exe" `
        "$releaseDir\latest.yml"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ GitHub Release erfolgreich erstellt!" -ForegroundColor Green
    } else {
        Write-Host "❌ GitHub Release fehlgeschlagen!" -ForegroundColor Red
        Write-Host "   Erstelle Release manuell auf GitHub." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ RELEASE KOMPLETT!                  ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Release-Dateien: $releaseDir" -ForegroundColor White
Write-Host "🌐 GitHub: https://github.com/SHP-ART/Werkstatt-Terminplaner/releases/tag/v1.6.0" -ForegroundColor White
Write-Host ""
Write-Host "🎉 Version 1.6.0 ist bereit!" -ForegroundColor Cyan
Write-Host ""

Read-Host "Enter drücken zum Beenden"
