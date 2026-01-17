# Plan: Windows Server Installer & Einrichtung

**Status:** 📋 Geplant  
**Priorität:** Mittel  
**Erstellt:** 16. Januar 2026

---

## 🎯 Ziel

Einen optimierten Installations- und Einrichtungsprozess für den Werkstatt-Terminplaner auf Windows Server erstellen, inklusive automatischer Dienst-Konfiguration.

---

## 📋 Voraussetzungen

### Systemanforderungen
| Anforderung | Beschreibung |
|-------------|--------------|
| OS | Windows Server 2016/2019/2022 **mit Desktop Experience** |
| RAM | Mindestens 4 GB |
| Speicher | 500 MB für Anwendung + Datenbank |
| Netzwerk | Statische IP-Adresse empfohlen |
| Ports | 3001 (Backend API) |

### ⚠️ Wichtig
- Windows Server **Core** (ohne GUI) wird **NICHT** unterstützt
- Electron-Apps benötigen Desktop Experience

---

## 🔧 Aufgaben

### Phase 1: Dokumentation
- [ ] Detaillierte Installationsanleitung für Windows Server schreiben
- [ ] Screenshots der wichtigen Schritte erstellen
- [ ] Troubleshooting-Sektion erweitern

### Phase 2: PowerShell-Scripts erstellen

#### Script 1: `server-setup.ps1` - Automatische Konfiguration
```powershell
# TODO: Implementieren
# - Firewall-Regel erstellen
# - Statische IP prüfen/warnen
# - .NET/Node.js Voraussetzungen prüfen
```

**Funktionen:**
- [ ] Firewall Port 3001 freigeben
- [ ] Prüfen ob Desktop Experience installiert ist
- [ ] Node.js Version prüfen
- [ ] Statische IP-Adresse empfehlen/warnen

#### Script 2: `install-service.ps1` - Als Windows-Dienst einrichten
```powershell
# TODO: Implementieren
# - NSSM herunterladen (falls nicht vorhanden)
# - Dienst registrieren
# - Autostart konfigurieren
```

**Funktionen:**
- [ ] NSSM (Non-Sucking Service Manager) automatisch herunterladen
- [ ] Werkstatt-Terminplaner als Dienst registrieren
- [ ] Automatischer Start bei Systemboot
- [ ] Automatischer Neustart bei Absturz
- [ ] Dienst-Logs konfigurieren

#### Script 3: `uninstall-service.ps1` - Dienst entfernen
```powershell
# TODO: Implementieren
# - Dienst stoppen
# - Dienst deregistrieren
# - Aufräumen
```

### Phase 3: Installer-Erweiterung

- [ ] Option im Installer für "Server-Installation"
- [ ] Automatische Dienst-Einrichtung als Checkbox
- [ ] Firewall-Regel automatisch anlegen (mit Admin-Rechten)
- [ ] Installationspfad-Vorschlag: `C:\Program Files\Werkstatt-Terminplaner`

### Phase 4: Remote Desktop Optimierung

- [ ] Session-Timeout Warnung/Konfiguration
- [ ] Headless-Modus für Backend (ohne Electron-GUI)
- [ ] Nur Backend als Dienst, Frontend per Browser

---

## 📝 Detaillierte Script-Spezifikationen

### `server-setup.ps1`

```powershell
#Requires -RunAsAdministrator

param(
    [int]$Port = 3001,
    [switch]$Force
)

# 1. Prüfe Windows Server Version
function Test-WindowsServer {
    $os = Get-CimInstance Win32_OperatingSystem
    if ($os.ProductType -ne 3) {
        Write-Warning "Dies ist kein Windows Server!"
        return $false
    }
    
    # Prüfe Desktop Experience
    $feature = Get-WindowsFeature -Name "Desktop-Experience" -ErrorAction SilentlyContinue
    if (-not $feature.Installed) {
        $feature = Get-WindowsFeature -Name "Server-Gui-Shell" -ErrorAction SilentlyContinue
    }
    
    return $true
}

# 2. Firewall-Regel erstellen
function Add-FirewallRule {
    param([int]$Port)
    
    $ruleName = "Werkstatt-Terminplaner-Backend"
    $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    
    if ($existingRule) {
        Write-Host "Firewall-Regel existiert bereits." -ForegroundColor Yellow
        return
    }
    
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Description "Erlaubt Zugriff auf Werkstatt-Terminplaner Backend API" `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $Port `
        -Action Allow `
        -Profile Domain,Private
    
    Write-Host "Firewall-Regel erstellt für Port $Port" -ForegroundColor Green
}

# 3. Statische IP prüfen
function Test-StaticIP {
    $adapters = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null }
    
    foreach ($adapter in $adapters) {
        $dhcp = (Get-NetIPInterface -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4).Dhcp
        if ($dhcp -eq "Enabled") {
            Write-Warning "DHCP ist aktiviert auf $($adapter.InterfaceAlias)!"
            Write-Warning "Empfehlung: Statische IP-Adresse konfigurieren"
            Write-Host "Aktuelle IP: $($adapter.IPv4Address.IPAddress)" -ForegroundColor Cyan
            return $false
        }
    }
    
    Write-Host "Statische IP-Adresse konfiguriert." -ForegroundColor Green
    return $true
}

# Hauptprogramm
Write-Host "=== Werkstatt-Terminplaner Server Setup ===" -ForegroundColor Cyan
Write-Host ""

Test-WindowsServer
Add-FirewallRule -Port $Port
Test-StaticIP

Write-Host ""
Write-Host "Setup abgeschlossen!" -ForegroundColor Green
```

### `install-service.ps1`

```powershell
#Requires -RunAsAdministrator

param(
    [string]$InstallPath = "C:\Program Files\Werkstatt-Terminplaner",
    [string]$ServiceName = "WerkstattTerminplaner",
    [string]$DisplayName = "Werkstatt Terminplaner Backend"
)

$NssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
$NssmPath = "$env:ProgramData\nssm\nssm.exe"

# 1. NSSM herunterladen
function Install-NSSM {
    if (Test-Path $NssmPath) {
        Write-Host "NSSM bereits installiert." -ForegroundColor Green
        return
    }
    
    Write-Host "Lade NSSM herunter..." -ForegroundColor Cyan
    $zipPath = "$env:TEMP\nssm.zip"
    Invoke-WebRequest -Uri $NssmUrl -OutFile $zipPath
    
    Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\nssm" -Force
    
    New-Item -ItemType Directory -Path "$env:ProgramData\nssm" -Force | Out-Null
    Copy-Item "$env:TEMP\nssm\nssm-2.24\win64\nssm.exe" $NssmPath
    
    Remove-Item $zipPath -Force
    Remove-Item "$env:TEMP\nssm" -Recurse -Force
    
    Write-Host "NSSM installiert." -ForegroundColor Green
}

# 2. Dienst installieren
function Install-Service {
    # Prüfe ob Dienst bereits existiert
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service) {
        Write-Warning "Dienst '$ServiceName' existiert bereits!"
        $confirm = Read-Host "Dienst neu installieren? (j/n)"
        if ($confirm -ne "j") { return }
        
        & $NssmPath stop $ServiceName
        & $NssmPath remove $ServiceName confirm
    }
    
    # Node.js Pfad finden
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodePath) {
        Write-Error "Node.js nicht gefunden! Bitte installieren."
        return
    }
    
    # Dienst erstellen
    $backendPath = Join-Path $InstallPath "resources\app\backend"
    $serverJs = Join-Path $backendPath "src\server.js"
    
    if (-not (Test-Path $serverJs)) {
        Write-Error "Server.js nicht gefunden unter: $serverJs"
        return
    }
    
    & $NssmPath install $ServiceName $nodePath $serverJs
    & $NssmPath set $ServiceName AppDirectory $backendPath
    & $NssmPath set $ServiceName DisplayName $DisplayName
    & $NssmPath set $ServiceName Description "Backend-Server für Werkstatt Terminplaner"
    & $NssmPath set $ServiceName Start SERVICE_AUTO_START
    & $NssmPath set $ServiceName AppStdout "$InstallPath\logs\service-stdout.log"
    & $NssmPath set $ServiceName AppStderr "$InstallPath\logs\service-stderr.log"
    & $NssmPath set $ServiceName AppRotateFiles 1
    & $NssmPath set $ServiceName AppRotateBytes 1048576
    
    # Dienst starten
    & $NssmPath start $ServiceName
    
    Write-Host ""
    Write-Host "Dienst '$DisplayName' erfolgreich installiert und gestartet!" -ForegroundColor Green
    Write-Host "Status prüfen mit: Get-Service $ServiceName" -ForegroundColor Cyan
}

# Hauptprogramm
Write-Host "=== Werkstatt-Terminplaner Dienst-Installation ===" -ForegroundColor Cyan
Write-Host ""

Install-NSSM
Install-Service

Write-Host ""
Write-Host "Installation abgeschlossen!" -ForegroundColor Green
```

### `uninstall-service.ps1`

```powershell
#Requires -RunAsAdministrator

param(
    [string]$ServiceName = "WerkstattTerminplaner"
)

$NssmPath = "$env:ProgramData\nssm\nssm.exe"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Host "Dienst '$ServiceName' nicht gefunden." -ForegroundColor Yellow
    exit
}

Write-Host "Stoppe Dienst..." -ForegroundColor Cyan
& $NssmPath stop $ServiceName

Write-Host "Entferne Dienst..." -ForegroundColor Cyan
& $NssmPath remove $ServiceName confirm

Write-Host ""
Write-Host "Dienst erfolgreich entfernt!" -ForegroundColor Green
```

---

## 📋 Installations-Checkliste für Benutzer

### Vor der Installation
- [ ] Windows Server mit Desktop Experience
- [ ] Administratorrechte verfügbar
- [ ] Statische IP-Adresse konfiguriert
- [ ] Node.js LTS installiert (v18+)

### Installation
- [ ] EXE als Administrator ausführen
- [ ] Installationspfad: `C:\Program Files\Werkstatt-Terminplaner`
- [ ] `server-setup.ps1` ausführen

### Nach der Installation
- [ ] `install-service.ps1` ausführen (optional, für Dienst-Betrieb)
- [ ] Firewall-Regel prüfen
- [ ] Verbindung von Client-PCs testen
- [ ] Backup-Strategie einrichten

### Session-Timeout deaktivieren (für RDP)
```
Group Policy: Computer Configuration 
  → Administrative Templates 
  → Windows Components 
  → Remote Desktop Services 
  → Remote Desktop Session Host 
  → Session Time Limits
  
  → "Set time limit for disconnected sessions" = Disabled
  → "Set time limit for active but idle sessions" = Disabled
```

---

## 🔄 Alternativer Ansatz: Headless Backend

Für reine Server-Nutzung (ohne GUI):

### Vorteile
- Kein Desktop Experience nötig
- Weniger Ressourcenverbrauch
- Stabiler für 24/7 Betrieb

### Umsetzung
- [ ] Separates Backend-Only Paket erstellen
- [ ] Nur Node.js + Backend-Code
- [ ] Kein Electron nötig
- [ ] Installation per MSI oder ZIP

### Script für Headless-Installation
```powershell
# TODO: Später implementieren
# - Node.js prüfen/installieren
# - Backend-Dateien kopieren
# - npm install ausführen
# - Als Dienst registrieren
```

---

## 📅 Zeitplan

| Phase | Beschreibung | Aufwand | Status |
|-------|--------------|---------|--------|
| 1 | Dokumentation | 2h | ⏳ |
| 2 | PowerShell-Scripts | 4h | ⏳ |
| 3 | Installer-Erweiterung | 6h | ⏳ |
| 4 | Headless-Modus | 8h | ⏳ |

**Geschätzter Gesamtaufwand:** ~20 Stunden

---

## 📚 Referenzen

- [NSSM - Non-Sucking Service Manager](https://nssm.cc/)
- [Electron Deployment Guide](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
- [Windows Server Desktop Experience](https://docs.microsoft.com/en-us/windows-server/get-started/getting-started-with-server-with-desktop-experience)

---

*Letzte Aktualisierung: 16. Januar 2026*
