# Werkstatt Terminplaner - Build Launcher
# Startet den Build in einem neuen, isolierten PowerShell-Fenster

$BuildScript = @'
Set-Location "C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner\backend"
$Host.UI.RawUI.WindowTitle = "Werkstatt Terminplaner Build v1.4.0"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Werkstatt Terminplaner Build v1.4.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Dieser Build läuft in einem isolierten Fenster." -ForegroundColor Yellow
Write-Host "Bitte NICHT schließen während des Builds!" -ForegroundColor Yellow
Write-Host ""

$env:CI = "true"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

Write-Host "[1/2] Starte Build..." -ForegroundColor Green
Write-Host "Dies dauert ca. 3-5 Minuten. Bitte warten..." -ForegroundColor Gray
Write-Host ""

npm run build:allinone 2>&1 | Tee-Object -Variable buildOutput

$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($exitCode -eq 0) {
    if (Test-Path "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe") {
        Write-Host "BUILD ERFOLGREICH!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Get-Item "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe" | Format-Table Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB,2)}}, LastWriteTime
        Write-Host ""
        Write-Host "Dateien für GitHub Release:" -ForegroundColor Cyan
        Get-ChildItem "dist-allinone" -Filter "Werkstatt-Terminplaner-Setup-1.4.0.*" | Format-Table Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB,2)}}
        if (Test-Path "dist-allinone\latest.yml") {
            Write-Host "latest.yml:" -ForegroundColor Cyan
            Get-Content "dist-allinone\latest.yml"
        }
        Write-Host ""
        Write-Host "Nächste Schritte:" -ForegroundColor Yellow
        Write-Host "1. Installer testen" -ForegroundColor White
        Write-Host "2. Git Tag: git tag -a v1.4.0 -m 'Release v1.4.0'" -ForegroundColor White
        Write-Host "3. Tag pushen: git push origin v1.4.0" -ForegroundColor White
        Write-Host "4. GitHub Release erstellen und Dateien hochladen" -ForegroundColor White
    } else {
        Write-Host "FEHLER: Installer nicht gefunden!" -ForegroundColor Red
    }
} else {
    Write-Host "BUILD FEHLGESCHLAGEN - Exit Code: $exitCode" -ForegroundColor Red
    Write-Host ""
    Write-Host "Letzte Zeilen der Ausgabe:" -ForegroundColor Yellow
    $buildOutput | Select-Object -Last 30 | ForEach-Object { Write-Host $_ }
}

Write-Host ""
Write-Host "Fenster kann geschlossen werden." -ForegroundColor Gray
Read-Host "Drücke ENTER zum Beenden"
'@

# Speichere das Build-Skript temporär
$TempScriptPath = Join-Path $env:TEMP "werkstatt-build-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
$BuildScript | Out-File -FilePath $TempScriptPath -Encoding UTF8

Write-Host "Starte Build in neuem Fenster..." -ForegroundColor Cyan
Write-Host "Pfad: $TempScriptPath" -ForegroundColor Gray

# Starte in neuem PowerShell-Fenster
Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$TempScriptPath`"" -Wait

Write-Host ""
Write-Host "Build-Prozess abgeschlossen." -ForegroundColor Green
Write-Host "Prüfe Ergebnis..."

$InstallerPath = "C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner\backend\dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe"

if (Test-Path $InstallerPath) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "ERFOLG! Installer erstellt." -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Get-Item $InstallerPath | Format-List Name, Length, LastWriteTime
} else {
    Write-Host ""
    Write-Host "Installer wurde nicht erstellt." -ForegroundColor Red
    Write-Host "Siehe Build-Fenster für Details." -ForegroundColor Yellow
}
