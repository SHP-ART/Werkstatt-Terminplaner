# Werkstatt Terminplaner - Release Build Script
# Version 1.4.0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Werkstatt Terminplaner - Release Build" -ForegroundColor Cyan
Write-Host "Version 1.4.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$BackendPath = Join-Path $PSScriptRoot "backend"
Set-Location $BackendPath

Write-Host "[1/3] Pruefe Dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: npm install fehlgeschlagen" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] Erstelle All-in-One Installer..." -ForegroundColor Yellow
Write-Host "Dies kann mehrere Minuten dauern..." -ForegroundColor Gray

# Setze Umgebungsvariable um SIGINT zu vermeiden
$env:CI = "true"

npm run build:allinone
if ($LASTEXITCODE -ne 0) {
    Write-Host "FEHLER: Build fehlgeschlagen" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/3] Pruefe erstellte Dateien..." -ForegroundColor Yellow

$InstallerPath = Join-Path $BackendPath "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe"
$YmlPath = Join-Path $BackendPath "dist-allinone\latest.yml"

if (Test-Path $InstallerPath) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "BUILD ERFOLGREICH!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Installer erstellt:" -ForegroundColor White
    Get-Item $InstallerPath | Select-Object Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB,2)}}, LastWriteTime | Format-Table -AutoSize
    
    Write-Host ""
    Write-Host "latest.yml fuer Auto-Update:" -ForegroundColor White
    if (Test-Path $YmlPath) {
        Get-Content $YmlPath
    }
} else {
    Write-Host "WARNUNG: Installer-Datei nicht gefunden!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Fertig!" -ForegroundColor Green
