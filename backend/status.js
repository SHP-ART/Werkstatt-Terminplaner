document.addEventListener('DOMContentLoaded', () => {
    const statusEl = document.getElementById('status');
    const urlEl = document.getElementById('url');
    const clientsEl = document.getElementById('clients');
    const uptimeEl = document.getElementById('uptime');
    const cpuUsageEl = document.getElementById('cpuUsage');
    const cpuBarEl = document.getElementById('cpuBar');
    const memoryUsageEl = document.getElementById('memoryUsage');
    const memoryBarEl = document.getElementById('memoryBar');
    const totalRequestsEl = document.getElementById('totalRequests');
    const requestsPerMinEl = document.getElementById('requestsPerMin');
    const lastActivityEl = document.getElementById('lastActivity');
    const requestsListEl = document.getElementById('requestsList');
    const statusIndicatorEl = document.getElementById('statusIndicator');

    // Server URL laden
    window.electronAPI.getServerUrl().then(url => {
        urlEl.textContent = url;
    });

    // Client-Count Updates
    window.electronAPI.onClientCountUpdate((count) => {
        clientsEl.textContent = count;
    });

    // System-Stats Updates
    window.electronAPI.onSystemStats((stats) => {
        // CPU
        const cpuPercent = Math.round(stats.cpu);
        cpuUsageEl.textContent = cpuPercent + '%';
        cpuBarEl.style.width = Math.min(cpuPercent, 100) + '%';

        // Memory
        const memoryMB = Math.round(stats.memory / 1024 / 1024);
        memoryUsageEl.textContent = memoryMB + ' MB';
        // Annahme: Max 512MB für den Balken
        const memoryPercent = Math.min((memoryMB / 512) * 100, 100);
        memoryBarEl.style.width = memoryPercent + '%';

        // Uptime
        uptimeEl.textContent = formatUptime(stats.uptime);

        // Request-Statistiken
        totalRequestsEl.textContent = stats.totalRequests.toLocaleString();
        requestsPerMinEl.textContent = stats.requestsPerMin.toFixed(1);

        // Letzte Aktivität
        if (stats.lastActivity) {
            const lastTime = new Date(stats.lastActivity);
            lastActivityEl.textContent = lastTime.toLocaleTimeString('de-DE');
        }
    });

    // Request-Log Updates
    window.electronAPI.onRequestLog((request) => {
        // Letzte Aktivität aktualisieren
        lastActivityEl.textContent = new Date().toLocaleTimeString('de-DE');

        // Request zur Liste hinzufügen
        const requestItem = document.createElement('div');
        requestItem.className = 'request-item';
        requestItem.innerHTML = `
            <span><span class="request-method ${request.method}">${request.method}</span> ${request.path}</span>
            <span>${request.status} - ${request.duration}ms</span>
        `;

        // Platzhalter entfernen wenn vorhanden
        if (requestsListEl.querySelector('div[style]')) {
            requestsListEl.innerHTML = '';
        }

        // Neuen Request oben einfügen
        requestsListEl.insertBefore(requestItem, requestsListEl.firstChild);

        // Maximal 20 Einträge behalten
        while (requestsListEl.children.length > 20) {
            requestsListEl.removeChild(requestsListEl.lastChild);
        }
    });

    // Uptime formatieren
    function formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
});

// Tab-Wechsel
function showTab(tabName) {
    // Alle Tabs deaktivieren
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Gewählten Tab aktivieren
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    
    // Bei Backup-Tab: Liste laden
    if (tabName === 'backup') {
        loadBackupStatus();
        loadBackupList();
    }
    
    // Bei Datenbank-Tab: Pfad laden
    if (tabName === 'database') {
        loadDbPath();
    }
    
    // Bei Update-Tab: Status laden
    if (tabName === 'update') {
        loadUpdateStatus();
    }
    
    // Bei Settings-Tab: Autostart-Status laden
    if (tabName === 'settings') {
        loadAutostartStatus();
    }
}

// Backup-Status laden
async function loadBackupStatus() {
    try {
        const result = await window.electronAPI.getBackupStatus();
        if (result.success) {
            document.getElementById('dbSize').textContent = formatBytes(result.dbSizeBytes);
            document.getElementById('backupCount').textContent = result.backupCount;
        }
    } catch (error) {
        console.error('Fehler beim Laden des Backup-Status:', error);
    }
}

// Backup-Liste laden
async function loadBackupList() {
    const listEl = document.getElementById('backupList');
    
    try {
        const result = await window.electronAPI.getBackupList();
        
        if (!result.success) {
            listEl.innerHTML = '<div class="empty-state">Fehler beim Laden</div>';
            return;
        }
        
        if (result.backups.length === 0) {
            listEl.innerHTML = '<div class="empty-state">Keine Backups vorhanden</div>';
            return;
        }
        
        listEl.innerHTML = result.backups.map(backup => `
            <div class="backup-item">
                <span class="backup-name" title="${backup.name}">${formatBackupName(backup.name)}</span>
                <span class="backup-size">${formatBytes(backup.sizeBytes)}</span>
                <div class="backup-actions">
                    <button class="btn-restore" onclick="restoreBackup('${backup.name}')" title="Wiederherstellen">↩️</button>
                    <button class="btn-delete" onclick="deleteBackup('${backup.name}')" title="Löschen">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        listEl.innerHTML = '<div class="empty-state">Fehler beim Laden</div>';
    }
}

// Backup erstellen
async function createBackup() {
    const btn = document.getElementById('btnCreateBackup');
    const msgEl = document.getElementById('backupMessage');
    
    btn.disabled = true;
    btn.textContent = '⏳ Erstelle Backup...';
    
    try {
        const result = await window.electronAPI.createBackup();
        
        if (result.success) {
            showBackupMessage('success', `✅ Backup erstellt: ${formatBackupName(result.backup.name)}`);
            loadBackupList();
            loadBackupStatus();
        } else {
            showBackupMessage('error', `❌ Fehler: ${result.error}`);
        }
    } catch (error) {
        showBackupMessage('error', `❌ Fehler: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '✨ Backup jetzt erstellen';
    }
}

// Backup wiederherstellen
async function restoreBackup(filename) {
    if (!confirm(`Backup "${formatBackupName(filename)}" wiederherstellen?\n\nDie aktuelle Datenbank wird überschrieben!`)) {
        return;
    }
    
    try {
        const result = await window.electronAPI.restoreBackup(filename);
        
        if (result.success) {
            showBackupMessage('success', `✅ Backup wiederhergestellt! Server-Neustart empfohlen.`);
        } else {
            showBackupMessage('error', `❌ Fehler: ${result.error}`);
        }
    } catch (error) {
        showBackupMessage('error', `❌ Fehler: ${error.message}`);
    }
}

// Backup löschen
async function deleteBackup(filename) {
    if (!confirm(`Backup "${formatBackupName(filename)}" wirklich löschen?`)) {
        return;
    }
    
    try {
        const result = await window.electronAPI.deleteBackup(filename);
        
        if (result.success) {
            showBackupMessage('success', `🗑️ Backup gelöscht`);
            loadBackupList();
            loadBackupStatus();
        } else {
            showBackupMessage('error', `❌ Fehler: ${result.error}`);
        }
    } catch (error) {
        showBackupMessage('error', `❌ Fehler: ${error.message}`);
    }
}

// Backup-Ordner öffnen
async function openBackupFolder() {
    try {
        await window.electronAPI.openBackupFolder();
    } catch (error) {
        showBackupMessage('error', `❌ Fehler: ${error.message}`);
    }
}

// Hilfsfunktionen
function showBackupMessage(type, message) {
    const msgEl = document.getElementById('backupMessage');
    msgEl.className = `backup-status ${type}`;
    msgEl.textContent = message;
    msgEl.style.display = 'block';
    
    setTimeout(() => {
        msgEl.style.display = 'none';
    }, 5000);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatBackupName(name) {
    // werkstatt-backup-2025-12-29T10-30-00-000Z.db -> 29.12.2025 10:30
    const match = name.match(/werkstatt-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
    if (match) {
        return `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}`;
    }
    return name;
}

// ========== Datenbank-Pfad Funktionen ==========

// Datenbank-Pfad laden
async function loadDbPath() {
    const pathEl = document.getElementById('currentDbPath');
    const statusEl = document.getElementById('dbStatus');
    
    try {
        const result = await window.electronAPI.getDbPath();
        
        if (result.success) {
            pathEl.textContent = result.dbPath;
            
            if (result.isCustom) {
                pathEl.classList.add('custom');
                statusEl.textContent = '✅ Benutzerdefiniert';
                statusEl.style.color = '#28a745';
            } else {
                pathEl.classList.remove('custom');
                statusEl.textContent = '📍 Standard';
                statusEl.style.color = '#666';
            }
        } else {
            pathEl.textContent = 'Fehler beim Laden';
            statusEl.textContent = '❌ Fehler';
        }
    } catch (error) {
        pathEl.textContent = 'Fehler: ' + error.message;
        statusEl.textContent = '❌ Fehler';
    }
}

// Datenbank auswählen
async function selectDatabase() {
    const btn = document.getElementById('btnSelectDb');
    
    btn.disabled = true;
    btn.textContent = '⏳ Auswählen...';
    
    try {
        const result = await window.electronAPI.selectDbFile();
        
        if (result.canceled) {
            // Abgebrochen, nichts tun
        } else if (result.success) {
            showDbMessage('success', result.message);
            loadDbPath();
        } else {
            showDbMessage('error', `❌ Fehler: ${result.error}`);
        }
    } catch (error) {
        showDbMessage('error', `❌ Fehler: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '📂 Datenbank auswählen';
    }
}

// Datenbank-Pfad zurücksetzen
async function resetDbPath() {
    if (!confirm('Datenbank-Pfad auf Standard zurücksetzen?')) {
        return;
    }
    
    try {
        const result = await window.electronAPI.resetDbPath();
        
        if (result.success) {
            showDbMessage('success', result.message);
            loadDbPath();
        } else {
            showDbMessage('error', `❌ Fehler: ${result.error}`);
        }
    } catch (error) {
        showDbMessage('error', `❌ Fehler: ${error.message}`);
    }
}

// Datenbank-Ordner öffnen
async function openDbFolder() {
    try {
        await window.electronAPI.openDbFolder();
    } catch (error) {
        showDbMessage('error', `❌ Fehler: ${error.message}`);
    }
}

// Anwendung neu starten
async function restartApp() {
    if (!confirm('Anwendung jetzt neu starten?')) {
        return;
    }
    
    try {
        await window.electronAPI.restartApp();
    } catch (error) {
        showDbMessage('error', `❌ Fehler: ${error.message}`);
    }
}

// Datenbank-Nachricht anzeigen
function showDbMessage(type, message) {
    const msgEl = document.getElementById('dbMessage');
    msgEl.className = `backup-status ${type}`;
    msgEl.textContent = message;
    msgEl.style.display = 'block';
    
    setTimeout(() => {
        msgEl.style.display = 'none';
    }, 5000);
}

// ========== Auto-Update Funktionen ==========

// Update-Status beim Start laden
document.addEventListener('DOMContentLoaded', () => {
    loadUpdateStatus();
    
    // Auf Update-Status-Events hören
    if (window.electronAPI.onUpdateStatus) {
        window.electronAPI.onUpdateStatus((status) => {
            updateUpdateUI(status);
        });
    }
});

// Update-Status laden
async function loadUpdateStatus() {
    try {
        const result = await window.electronAPI.getUpdateStatus();
        
        if (result.success) {
            document.getElementById('currentVersion').textContent = 'v' + result.currentVersion;
            updateUpdateUI(result.status);
            
            // Wenn nicht gepackt, Update-Button ausblenden
            if (!result.isPackaged) {
                document.getElementById('btnCheckUpdate').style.display = 'none';
                document.getElementById('updateStatusText').textContent = 'Nur in installierter Version';
            }
        }
    } catch (error) {
        console.error('Fehler beim Laden des Update-Status:', error);
    }
}

// Update-UI aktualisieren
function updateUpdateUI(status) {
    const statusTextEl = document.getElementById('updateStatusText');
    const availableEl = document.getElementById('updateAvailable');
    const progressEl = document.getElementById('updateProgress');
    const btnCheck = document.getElementById('btnCheckUpdate');
    const btnDownload = document.getElementById('btnDownloadUpdate');
    const btnInstall = document.getElementById('btnInstallUpdate');
    const tabBtn = document.getElementById('tabUpdate');
    
    // Status-Text
    if (status.checking) {
        statusTextEl.textContent = '🔍 Prüfe...';
    } else if (status.downloading) {
        statusTextEl.textContent = '⬇️ Lade herunter...';
    } else if (status.downloaded) {
        statusTextEl.textContent = '✅ Bereit zur Installation';
        statusTextEl.style.color = '#28a745';
    } else if (status.available) {
        statusTextEl.textContent = '🎉 Update verfügbar!';
        statusTextEl.style.color = '#007bff';
    } else if (status.error) {
        statusTextEl.textContent = '❌ ' + status.error;
        statusTextEl.style.color = '#dc3545';
    } else {
        statusTextEl.textContent = 'Aktuell';
        statusTextEl.style.color = '#28a745';
    }
    
    // Update-Verfügbar-Box
    if (status.available && status.version) {
        availableEl.style.display = 'block';
        document.getElementById('newVersion').textContent = 'v' + status.version;
        tabBtn.textContent = '🔄 Update ⬆️';
        tabBtn.style.background = '#28a745';
        tabBtn.style.color = 'white';
    } else {
        availableEl.style.display = 'none';
        tabBtn.textContent = '🔄 Update';
        tabBtn.style.background = '';
        tabBtn.style.color = '';
    }
    
    // Download-Progress
    if (status.downloading) {
        progressEl.style.display = 'block';
        document.getElementById('downloadPercent').textContent = Math.round(status.progress) + '%';
        document.getElementById('downloadBar').style.width = status.progress + '%';
    } else {
        progressEl.style.display = 'none';
    }
    
    // Buttons
    btnCheck.style.display = status.downloading || status.downloaded ? 'none' : 'block';
    btnCheck.disabled = status.checking;
    btnCheck.textContent = status.checking ? '⏳ Prüfe...' : '🔍 Auf Updates prüfen';
    
    btnDownload.style.display = status.available && !status.downloading && !status.downloaded ? 'block' : 'none';
    
    btnInstall.style.display = status.downloaded ? 'block' : 'none';
}

// Auf Updates prüfen
async function checkForUpdates() {
    const btn = document.getElementById('btnCheckUpdate');
    
    btn.disabled = true;
    btn.textContent = '⏳ Prüfe...';
    
    try {
        const result = await window.electronAPI.checkForUpdates();
        
        if (!result.success) {
            showUpdateMessage('error', `❌ ${result.error}`);
        }
    } catch (error) {
        showUpdateMessage('error', `❌ Fehler: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Auf Updates prüfen';
    }
}

// Update herunterladen
async function downloadUpdate() {
    const btn = document.getElementById('btnDownloadUpdate');
    
    btn.disabled = true;
    btn.textContent = '⏳ Starte Download...';
    
    try {
        const result = await window.electronAPI.downloadUpdate();
        
        if (!result.success) {
            showUpdateMessage('error', `❌ ${result.error}`);
        }
    } catch (error) {
        showUpdateMessage('error', `❌ Fehler: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = '⬇️ Update herunterladen';
    }
}

// Update installieren
async function installUpdate() {
    if (!confirm('Update jetzt installieren?\n\nDie Anwendung wird neu gestartet.')) {
        return;
    }
    
    try {
        await window.electronAPI.installUpdate();
    } catch (error) {
        showUpdateMessage('error', `❌ Fehler: ${error.message}`);
    }
}

// Update-Nachricht anzeigen
function showUpdateMessage(type, message) {
    const msgEl = document.getElementById('updateMessage');
    if (msgEl) {
        msgEl.className = `backup-status ${type}`;
        msgEl.textContent = message;
        msgEl.style.display = 'block';
        
        setTimeout(() => {
            msgEl.style.display = 'none';
        }, 5000);
    }
}

// ===== AUTOSTART FUNKTIONEN =====

// Autostart-Status laden
async function loadAutostartStatus() {
    try {
        const result = await window.electronAPI.getAutostartStatus();
        const statusEl = document.getElementById('autostartStatus');
        const btnEnable = document.getElementById('btnEnableAutostart');
        const btnDisable = document.getElementById('btnDisableAutostart');
        
        if (result.success) {
            statusEl.textContent = result.enabled ? '✅ Aktiviert' : '❌ Deaktiviert';
            statusEl.style.color = result.enabled ? '#28a745' : '#dc3545';
            
            // Buttons entsprechend aktualisieren
            btnEnable.disabled = result.enabled;
            btnDisable.disabled = !result.enabled;
            btnEnable.style.opacity = result.enabled ? '0.5' : '1';
            btnDisable.style.opacity = result.enabled ? '1' : '0.5';
        } else {
            statusEl.textContent = 'Fehler';
            statusEl.style.color = '#dc3545';
        }
    } catch (error) {
        console.error('Fehler beim Laden des Autostart-Status:', error);
        document.getElementById('autostartStatus').textContent = 'Fehler';
    }
}

// Autostart aktivieren
async function enableAutostart() {
    const btn = document.getElementById('btnEnableAutostart');
    btn.disabled = true;
    btn.textContent = '⏳ Aktiviere...';
    
    try {
        const result = await window.electronAPI.setAutostart(true);
        
        if (result.success) {
            showAutostartMessage('success', '✅ Autostart wurde aktiviert!');
            loadAutostartStatus();
        } else {
            showAutostartMessage('error', `❌ Fehler: ${result.error}`);
        }
    } catch (error) {
        showAutostartMessage('error', `❌ Fehler: ${error.message}`);
    } finally {
        btn.textContent = '✅ Aktivieren';
        loadAutostartStatus();
    }
}

// Autostart deaktivieren
async function disableAutostart() {
    const btn = document.getElementById('btnDisableAutostart');
    btn.disabled = true;
    btn.textContent = '⏳ Deaktiviere...';
    
    try {
        const result = await window.electronAPI.setAutostart(false);
        
        if (result.success) {
            showAutostartMessage('success', '✅ Autostart wurde deaktiviert!');
            loadAutostartStatus();
        } else {
            showAutostartMessage('error', `❌ Fehler: ${result.error}`);
        }
    } catch (error) {
        showAutostartMessage('error', `❌ Fehler: ${error.message}`);
    } finally {
        btn.textContent = '❌ Deaktivieren';
        loadAutostartStatus();
    }
}

// Autostart-Nachricht anzeigen
function showAutostartMessage(type, message) {
    const msgEl = document.getElementById('autostartMessage');
    if (msgEl) {
        msgEl.className = `backup-status ${type}`;
        msgEl.textContent = message;
        msgEl.style.display = 'block';
        
        setTimeout(() => {
            msgEl.style.display = 'none';
        }, 5000);
    }
}
