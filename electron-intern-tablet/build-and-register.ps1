#!/usr/bin/env pwsh
# ========================================
# Automatischer Build + Update-Registrierung
# Tablet-App (PowerShell Version)
# ========================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Tablet-App Build + Registrierung" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Version aus package.json auslesen
$packageJson = Get-Content -Path "package.json" | ConvertFrom-Json
$version = $packageJson.version

Write-Host "Version: $version" -ForegroundColor Yellow
Write-Host ""

# 1. Build erstellen
Write-Host "[1/3] Baue Tablet-App..." -ForegroundColor Green
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "FEHLER: Build fehlgeschlagen!" -ForegroundColor Red
    Read-Host "Drücken Sie Enter zum Beenden"
    exit 1
}

Write-Host ""
Write-Host "[OK] Build erfolgreich!" -ForegroundColor Green
Write-Host ""

# 2. Installer-Datei finden
Write-Host "[2/3] Suche Installer-Datei..." -ForegroundColor Green

$installerPattern = "Werkstatt-Intern-Setup-$version-x64.exe"
$installerPath = Get-ChildItem -Path "dist" -Filter $installerPattern -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName

if (-not $installerPath) {
    Write-Host ""
    Write-Host "WARNUNG: Installer nicht gefunden!" -ForegroundColor Yellow
    Write-Host "Erwartet: dist\$installerPattern" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Build-Dateien in dist:" -ForegroundColor Yellow
    Get-ChildItem -Path "dist" -Filter "*.exe" | ForEach-Object { Write-Host "  $_" }
    Write-Host ""
    Read-Host "Drücken Sie Enter zum Beenden"
    exit 1
}

Write-Host "[OK] Installer gefunden: $installerPath" -ForegroundColor Green
Write-Host ""

# 3. Am Server registrieren
Write-Host "[3/3] Registriere Update am Server..." -ForegroundColor Green
Write-Host ""

# Server-URL (anpassen falls nötig)
$serverUrl = "http://localhost:3001"

# Release Notes (optional anpassen)
$releaseNotes = "Automatisches Update: Version $version"

# JSON-Body erstellen
$body = @{
    version = $version
    filePath = $installerPath
    releaseNotes = $releaseNotes
} | ConvertTo-Json

# API-Call
try {
    $response = Invoke-RestMethod -Uri "$serverUrl/api/tablet-update/register" `
        -Method POST `
        -Body $body `
        -ContentType "application/json"
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  FERTIG!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Update erfolgreich registriert:" -ForegroundColor Green
    Write-Host "  Version:  $version" -ForegroundColor White
    Write-Host "  Datei:    $installerPath" -ForegroundColor White
    Write-Host "  Server:   $serverUrl" -ForegroundColor White
    Write-Host ""
    Write-Host "Die Tablets werden beim nächsten Check" -ForegroundColor Yellow
    Write-Host "(innerhalb von 30 Minuten) benachrichtigt." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Tablet-Status prüfen:" -ForegroundColor Cyan
    Write-Host "  $serverUrl/api/tablet-update/status" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "FEHLER bei der Registrierung:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Mögliche Ursachen:" -ForegroundColor Yellow
    Write-Host "  - Server läuft nicht auf $serverUrl" -ForegroundColor White
    Write-Host "  - Netzwerkverbindung unterbrochen" -ForegroundColor White
    Write-Host ""
    Write-Host "Installer wurde trotzdem erstellt:" -ForegroundColor Green
    Write-Host "  $installerPath" -ForegroundColor White
    Write-Host ""
    Write-Host "Sie können das Update später manuell registrieren:" -ForegroundColor Yellow
    Write-Host "  curl -X POST $serverUrl/api/tablet-update/register \" -ForegroundColor White
    Write-Host "    -H 'Content-Type: application/json' \" -ForegroundColor White
    Write-Host "    -d '{""version"":""$version"",""filePath"":""$installerPath"",""releaseNotes"":""Update""}'" -ForegroundColor White
    Write-Host ""
}

Read-Host "Drücken Sie Enter zum Beenden"
