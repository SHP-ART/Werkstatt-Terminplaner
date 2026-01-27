# Robustes Build-Skript mit isoliertem Prozess
$BackendPath = "C:\Users\Sven\Documents\Github\Terminplaner\Werkstatt-Terminplaner\backend"
$LogFile = Join-Path $PSScriptRoot "build-log.txt"

Write-Host "Starte isolierten Build-Prozess..." -ForegroundColor Cyan
Write-Host "Log-Datei: $LogFile" -ForegroundColor Gray

# Erstelle ein temporäres Skript für den Build
$TempScript = Join-Path $env:TEMP "werkstatt-build-temp.ps1"
@"
Set-Location '$BackendPath'
`$env:CI = 'true'
npm run build:allinone 2>&1 | Out-File -FilePath '$LogFile' -Encoding UTF8
exit `$LASTEXITCODE
"@ | Out-File -FilePath $TempScript -Encoding UTF8

# Starte den Build in einem neuen Prozess
$Process = Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass", "-File", "$TempScript" -Wait -PassThru -NoNewWindow

Write-Host ""
Write-Host "Build-Prozess beendet mit Exit-Code: $($Process.ExitCode)" -ForegroundColor $(if ($Process.ExitCode -eq 0) { "Green" } else { "Red" })
Write-Host ""

# Zeige die letzten 50 Zeilen des Logs
Write-Host "=== Letzte 50 Zeilen des Build-Logs ===" -ForegroundColor Cyan
if (Test-Path $LogFile) {
    Get-Content $LogFile -Tail 50
}

# Prüfe auf Installer
$InstallerPath = Join-Path $BackendPath "dist-allinone\Werkstatt-Terminplaner-Setup-1.4.0.exe"
if (Test-Path $InstallerPath) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "BUILD ERFOLGREICH!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Get-Item $InstallerPath | Select-Object Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB,2)}}, LastWriteTime | Format-Table -AutoSize
} else {
    Write-Host ""
    Write-Host "FEHLER: Installer wurde nicht erstellt!" -ForegroundColor Red
}

# Cleanup
Remove-Item $TempScript -ErrorAction SilentlyContinue
