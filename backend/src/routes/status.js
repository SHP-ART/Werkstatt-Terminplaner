const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const { VERSION } = require('../config/version');

// System-Stats sammeln
function getSystemStats() {
    const uptime = process.uptime();
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // CPU-Auslastung berechnen (vereinfacht)
    let totalIdle = 0;
    let totalTick = 0;
    cpus.forEach(cpu => {
        for (let type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    });
    const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);
    
    return {
        uptime: Math.floor(uptime),
        cpuUsage: cpuUsage,
        memoryUsage: ((usedMem / totalMem) * 100).toFixed(1),
        memoryUsed: (usedMem / 1024 / 1024 / 1024).toFixed(2),
        memoryTotal: (totalMem / 1024 / 1024 / 1024).toFixed(2),
        platform: os.platform(),
        hostname: os.hostname(),
        nodeVersion: process.version
    };
}

// Request-Log (in Memory)
const requestLog = [];
const MAX_LOG_ENTRIES = 100;

function logRequest(method, path, statusCode) {
    requestLog.unshift({
        method,
        path,
        statusCode,
        timestamp: new Date().toISOString()
    });
    if (requestLog.length > MAX_LOG_ENTRIES) {
        requestLog.pop();
    }
}

// API-Endpunkte für Status-Daten
router.get('/api/server-status', (req, res) => {
    const stats = getSystemStats();
    res.json({
        version: VERSION,
        status: 'running',
        uptime: stats.uptime,
        hostname: stats.hostname,
        platform: stats.platform,
        nodeVersion: stats.nodeVersion,
        port: process.env.PORT || 3001
    });
});

router.get('/api/system-stats', (req, res) => {
    const stats = getSystemStats();
    res.json(stats);
});

router.get('/api/request-log', (req, res) => {
    res.json(requestLog.slice(0, 50));
});

// Update-Check-Endpunkt
router.get('/api/check-updates', async (req, res) => {
    try {
        const GITHUB_REPO = 'SHP-ART/Werkstatt-Terminplaner';
        
        // Aktuelle Version
        const currentVersion = VERSION;
        
        // Neueste Version von GitHub abrufen
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        
        if (!response.ok) {
            throw new Error('GitHub API nicht erreichbar');
        }
        
        const release = await response.json();
        const latestVersion = release.tag_name.replace(/^v/, '');
        const releaseNotes = release.body || 'Keine Release-Notes verfügbar';
        const publishedAt = release.published_at;
        
        // Versions-Vergleich
        const updateAvailable = currentVersion !== latestVersion;
        
        res.json({
            currentVersion,
            latestVersion,
            updateAvailable,
            releaseNotes,
            publishedAt,
            downloadUrl: release.html_url
        });
    } catch (error) {
        res.status(500).json({
            error: 'Update-Check fehlgeschlagen',
            message: error.message,
            currentVersion: VERSION
        });
    }
});

// Update ausführen (nur auf Linux mit installiertem Skript)
router.post('/api/perform-update', (req, res) => {
    // Prüfe ob wir auf Linux sind
    if (os.platform() !== 'linux') {
        return res.status(400).json({
            error: 'Updates werden nur auf Linux unterstützt'
        });
    }
    
    // Prüfe ob Update-Skript existiert
    const updateScript = '/opt/werkstatt-terminplaner/update-linux.sh';
    if (!fs.existsSync(updateScript)) {
        return res.status(404).json({
            error: 'Update-Skript nicht gefunden',
            hint: 'Bitte Update manuell durchführen: sudo /opt/werkstatt-terminplaner/update-linux.sh'
        });
    }
    
    // Führe Update-Skript im Hintergrund aus
    const { spawn } = require('child_process');
    const updateProcess = spawn('sudo', [updateScript], {
        detached: true,
        stdio: 'ignore'
    });
    
    updateProcess.unref();
    
    res.json({
        success: true,
        message: 'Update wurde gestartet. Server wird in wenigen Sekunden neu starten.'
    });
});

// Status-HTML-Seite ausliefern
router.get('/status', (req, res) => {
    const html = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Werkstatt Terminplaner - Server Status</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .status-indicator {
            display: inline-block;
            width: 15px;
            height: 15px;
            border-radius: 50%;
            background: #28a745;
            box-shadow: 0 0 15px #28a745;
            animation: pulse 2s infinite;
            margin-right: 10px;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .card h2 {
            font-size: 1.3em;
            margin-bottom: 15px;
            color: #667eea;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 10px;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #f5f5f5;
        }
        .stat-row:last-child {
            border-bottom: none;
        }
        .stat-label { color: #666; }
        .stat-value { font-weight: 600; color: #333; }
        .progress-bar {
            background: #e9ecef;
            border-radius: 10px;
            height: 20px;
            margin: 10px 0;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            border-radius: 10px;
            transition: width 0.5s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 0.8em;
            font-weight: bold;
        }
        .progress-fill.cpu { background: linear-gradient(90deg, #28a745, #ffc107, #dc3545); }
        .progress-fill.memory { background: linear-gradient(90deg, #007bff, #6f42c1); }
        .url-box {
            background: #e7f3ff;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            font-size: 1.1em;
            text-align: center;
            margin: 15px 0;
            border: 2px solid #007bff;
            color: #007bff;
            font-weight: bold;
        }
        .request-list {
            max-height: 300px;
            overflow-y: auto;
            font-size: 0.9em;
        }
        .request-item {
            display: flex;
            justify-content: space-between;
            padding: 8px;
            border-bottom: 1px solid #f0f0f0;
        }
        .request-method {
            font-weight: 600;
            min-width: 60px;
        }
        .request-method.GET { color: #28a745; }
        .request-method.POST { color: #007bff; }
        .request-method.PUT { color: #ffc107; }
        .request-method.DELETE { color: #dc3545; }
        .request-path {
            flex: 1;
            color: #666;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin: 0 10px;
        }
        .request-time {
            color: #999;
            font-size: 0.85em;
        }
        .refresh-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1em;
            font-weight: 600;
            margin-top: 10px;
            width: 100%;
            transition: background 0.2s;
        }
        .refresh-btn:hover { background: #218838; }
        .auto-refresh {
            text-align: center;
            color: white;
            margin-top: 15px;
            font-size: 0.9em;
        }
        .update-badge {
            display: inline-block;
            background: #28a745;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
            animation: pulse-badge 2s infinite;
        }
        @keyframes pulse-badge {
            0%, 100% { box-shadow: 0 0 10px rgba(40, 167, 69, 0.5); }
            50% { box-shadow: 0 0 20px rgba(40, 167, 69, 0.8); }
        }
        .update-btn {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1.05em;
            font-weight: 600;
            width: 100%;
            margin-top: 15px;
            transition: all 0.3s;
            box-shadow: 0 4px 10px rgba(40, 167, 69, 0.3);
        }
        .update-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(40, 167, 69, 0.4);
        }
        .update-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
            transform: none;
        }
        .update-info {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 6px;
            margin-top: 10px;
            font-size: 0.9em;
            color: #666;
        }
        .release-notes {
            max-height: 150px;
            overflow-y: auto;
            margin-top: 10px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 6px;
            font-size: 0.85em;
            line-height: 1.5;
        }
        .loading-spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1><span class="status-indicator"></span>Werkstatt Terminplaner</h1>
            <p>Server Status Dashboard</p>
        </div>

        <div class="grid">
            <div class="card">
                <h2>📊 Server-Informationen</h2>
                <div class="stat-row">
                    <span class="stat-label">Version</span>
                    <span class="stat-value" id="version">-</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Status</span>
                    <span class="stat-value">🟢 Läuft</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Uptime</span>
                    <span class="stat-value" id="uptime">-</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Hostname</span>
                    <span class="stat-value" id="hostname">-</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Platform</span>
                    <span class="stat-value" id="platform">-</span>
                </div>
                <div class="url-box" id="url">http://localhost:3001</div>
            </div>

            <div class="card">
                <h2>💾 Ressourcen</h2>
                <div class="stat-row">
                    <span class="stat-label">CPU-Auslastung</span>
                    <span class="stat-value" id="cpuText">-</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill cpu" id="cpuBar" style="width: 0%">0%</div>
                </div>
                <div class="stat-row">
                    <span class="stat-label">RAM-Auslastung</span>
                    <span class="stat-value" id="memoryText">-</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill memory" id="memoryBar" style="width: 0%">0%</div>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Node.js Version</span>
                    <span class="stat-value" id="nodeVersion">-</span>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>&#128260; System-Updates</h2>
            <div class="stat-row">
                <span class="stat-label">Aktuelle Version</span>
                <span class="stat-value" id="currentVersion">-</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Neueste Version</span>
                <span class="stat-value" id="latestVersion">…</span>
            </div>
            <div id="updateStatus" style="padding: 10px 0;">
                <div class="loading-spinner"></div>
            </div>
            <button class="update-btn" id="updateBtn" onclick="performUpdate()" disabled>
                📥 Update installieren
            </button>
            <div class="update-info" id="updateInfo" style="display: none;">
                <strong>Hinweis:</strong> Update wird im Hintergrund gestartet. Der Server wird automatisch neu gestartet.
            </div>
        </div>

        <div class="card">
            <h2>&#128221; Letzte API-Anfragen</h2>
            <div class="request-list" id="requestLog">
                <p style="text-align: center; color: #999; padding: 20px;">Lade Daten...</p>
            </div>
            <button class="refresh-btn" onclick="loadData()">🔄 Aktualisieren</button>
        </div>

        <div class="auto-refresh">
            ⏱️ Automatische Aktualisierung alle 5 Sekunden
        </div>
    </div>

    <script>
        function formatUptime(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            if (days > 0) return \`\${days}d \${hours}h \${minutes}m\`;
            if (hours > 0) return \`\${hours}h \${minutes}m \${secs}s\`;
            if (minutes > 0) return \`\${minutes}m \${secs}s\`;
            return \`\${secs}s\`;
        }

        function formatTime(isoString) {
            const date = new Date(isoString);
            return date.toLocaleTimeString('de-DE');
        }

        async function loadData() {
            try {
                // Server-Status
                const statusRes = await fetch('/api/server-status');
                const status = await statusRes.json();
                
                document.getElementById('version').textContent = status.version;
                document.getElementById('uptime').textContent = formatUptime(status.uptime);
                document.getElementById('hostname').textContent = status.hostname;
                document.getElementById('platform').textContent = status.platform;
                document.getElementById('nodeVersion').textContent = status.nodeVersion;
                document.getElementById('url').textContent = \`http://\${status.hostname}:\${status.port}\`;
                
                // System-Stats
                const sysRes = await fetch('/api/system-stats');
                const sys = await sysRes.json();
                
                document.getElementById('cpuText').textContent = \`\${sys.cpuUsage}%\`;
                document.getElementById('cpuBar').style.width = \`\${sys.cpuUsage}%\`;
                document.getElementById('cpuBar').textContent = \`\${sys.cpuUsage}%\`;
                
                document.getElementById('memoryText').textContent = \`\${sys.memoryUsed} GB / \${sys.memoryTotal} GB (\${sys.memoryUsage}%)\`;
                document.getElementById('memoryBar').style.width = \`\${sys.memoryUsage}%\`;
                document.getElementById('memoryBar').textContent = \`\${sys.memoryUsage}%\`;
                
                // Request-Log
                const logRes = await fetch('/api/request-log');
                const log = await logRes.json();
                
                const logHtml = log.map(req => \`
                    <div class="request-item">
                        <span class="request-method \${req.method}">\${req.method}</span>
                        <span class="request-path">\${req.path}</span>
                        <span class="request-time">\${formatTime(req.timestamp)}</span>
                    </div>
                \`).join('');
                
                document.getElementById('requestLog').innerHTML = logHtml || '<p style="text-align: center; color: #999; padding: 20px;">Noch keine Anfragen</p>';
                
            } catch (error) {
                console.error('Fehler beim Laden der Status-Daten:', error);
            }
        }

        // Update-Check
        async function checkForUpdates() {
            try {
                const res = await fetch('/api/check-updates');
                const data = await res.json();
                
                document.getElementById('currentVersion').textContent = data.currentVersion;
                
                if (data.error) {
                    document.getElementById('latestVersion').textContent = 'Fehler';
                    document.getElementById('updateStatus').innerHTML = 
                        '<p style="color: #dc3545;">⚠️ ' + data.error + '</p>';
                    return;
                }
                
                document.getElementById('latestVersion').textContent = data.latestVersion;
                
                if (data.updateAvailable) {
                    document.getElementById('updateStatus').innerHTML = 
                        '<p style="color: #28a745; font-weight: 600;">✅ Update verfügbar!</p>' +
                        '<div class="release-notes"><strong>Release Notes:</strong><br>' + 
                        data.releaseNotes.substring(0, 500) + 
                        (data.releaseNotes.length > 500 ? '...' : '') + 
                        '</div>';
                    document.getElementById('updateBtn').disabled = false;
                } else {
                    document.getElementById('updateStatus').innerHTML = 
                        '<p style="color: #28a745;">✓ System ist aktuell</p>';
                    document.getElementById('updateBtn').disabled = true;
                    document.getElementById('updateBtn').textContent = '✓ Aktuell';
                }
                
            } catch (error) {
                console.error('Update-Check fehlgeschlagen:', error);
                document.getElementById('updateStatus').innerHTML = 
                    '<p style="color: #dc3545;">⚠️ Update-Check fehlgeschlagen</p>';
            }
        }

        // Update durchführen
        async function performUpdate() {
            if (!confirm('Möchten Sie das Update jetzt installieren? Der Server wird neu gestartet.')) {
                return;
            }
            
            document.getElementById('updateBtn').disabled = true;
            document.getElementById('updateBtn').textContent = '⏳ Update läuft...';
            document.getElementById('updateInfo').style.display = 'block';
            
            try {
                const res = await fetch('/api/perform-update', { method: 'POST' });
                const data = await res.json();
                
                if (data.success) {
                    document.getElementById('updateStatus').innerHTML = 
                        '<p style="color: #28a745;">✓ Update gestartet! Server startet neu...</p>';
                    
                    // Countdown und Auto-Reload
                    let countdown = 30;
                    const countdownInterval = setInterval(() => {
                        countdown--;
                        document.getElementById('updateStatus').innerHTML = 
                            '<p style="color: #007bff;">⏳ Server startet neu... (' + countdown + 's)</p>';
                        
                        if (countdown <= 0) {
                            clearInterval(countdownInterval);
                            window.location.reload();
                        }
                    }, 1000);
                } else {
                    document.getElementById('updateStatus').innerHTML = 
                        '<p style="color: #dc3545;">⚠️ ' + (data.error || 'Update fehlgeschlagen') + '</p>';
                    document.getElementById('updateBtn').disabled = false;
                    document.getElementById('updateBtn').textContent = '📥 Update installieren';
                }
            } catch (error) {
                console.error('Update fehlgeschlagen:', error);
                document.getElementById('updateStatus').innerHTML = 
                    '<p style="color: #dc3545;">⚠️ Update konnte nicht gestartet werden</p>';
                document.getElementById('updateBtn').disabled = false;
                document.getElementById('updateBtn').textContent = '📥 Update installieren';
            }
        }

        // Initial laden
        loadData();
        checkForUpdates();
        
        // Auto-Refresh alle 5 Sekunden (ohne Update-Check)
        setInterval(loadData, 5000);
        
        // Update-Check alle 5 Minuten
        setInterval(checkForUpdates, 300000);
    </script>
</body>
</html>
    `;
    
    res.send(html);
});

// Middleware zum Loggen aller Requests
function requestLogger(req, res, next) {
    // Nur API-Requests loggen (nicht statische Files)
    if (req.path.startsWith('/api')) {
        const originalSend = res.send;
        res.send = function(...args) {
            logRequest(req.method, req.path, res.statusCode);
            originalSend.apply(res, args);
        };
    }
    next();
}

module.exports = {
    router,
    requestLogger
};
