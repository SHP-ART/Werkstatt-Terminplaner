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
