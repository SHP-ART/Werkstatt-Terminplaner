export function installServerInfoFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    async loadServerVersion() {
      try {
        const response = await ApiService.get('/server-info');
        if (response && response.version) {
          const versionEl = document.getElementById('appVersion');
          if (versionEl) {
            versionEl.textContent = `v${response.version}`;
          }
        }
        // Server-Typ Badge anzeigen
        if (response && response.serverType) {
          const badgeEl = document.getElementById('serverTypeBadge');
          if (badgeEl) {
            const badges = {
              'linux-allinone': { icon: '🐧', text: 'Linux All-in-One KI', cls: 'badge-linux' },
              'windows-electron': { icon: '🖥️', text: 'Windows Desktop', cls: 'badge-windows' },
              'windows-server': { icon: '🪟', text: 'Windows Server', cls: 'badge-windows' },
              'macos': { icon: '🍎', text: 'macOS', cls: 'badge-macos' },
              'standalone': { icon: '⚙️', text: 'Standalone', cls: 'badge-standalone' }
            };
            const badge = badges[response.serverType] || badges['standalone'];
            badgeEl.innerHTML = `<span class="badge-icon">${badge.icon}</span> ${badge.text}`;
            badgeEl.className = `header-server-badge ${badge.cls}`;
            badgeEl.title = `Server: ${response.platform} (${response.arch}) | Node ${response.nodeVersion}`;
          }
          
          // Server-Auslastung Widget: nur noch im Server/Info Tab (Einstellungen) sichtbar
        }
      } catch (error) {
        console.warn('Server-Version konnte nicht geladen werden:', error);
      }
    },

    showServerStats(serverType) {
      const section = document.getElementById('serverStatsSection');
      if (section) {
        section.style.display = 'block';
      }
      // Badge-Text je nach Plattform setzen
      const badgeText = document.getElementById('serverStatsBadgeText');
      if (badgeText) {
        const labels = {
          'linux-allinone': 'Linux All-in-One',
          'macos': 'macOS'
        };
        badgeText.textContent = labels[serverType] || 'Server';
      }
      // Sofort laden und dann alle 30 Sekunden aktualisieren
      this.updateServerStats();
      if (!this._serverStatsInterval) {
        this._serverStatsInterval = setInterval(() => this.updateServerStats(), 30000);
      }
    },

    async loadServerInfoTab() {
      try {
        // Server-Info und System-Stats parallel laden
        const [serverInfo, systemStats, healthResult, ollamaResult] = await Promise.allSettled([
          ApiService.get('/server-info'),
          ApiService.get('/system-stats'),
          this._checkApiHealth(),
          AIService.getOllamaStatus()
        ]);

        // Server-Info
        if (serverInfo.status === 'fulfilled' && serverInfo.value) {
          const info = serverInfo.value;
          const typeLabels = {
            'linux-allinone': '🐧 Linux All-in-One KI',
            'windows-electron': '🖥️ Windows Desktop',
            'windows-server': '🪟 Windows Server',
            'macos': '🍎 macOS',
            'standalone': '⚙️ Standalone'
          };
          this._setTextIfExists('sinfoServerType', typeLabels[info.serverType] || info.serverType);
          this._setTextIfExists('sinfoPlatform', info.platform || '--');
          this._setTextIfExists('sinfoArch', info.arch || '--');
          this._setTextIfExists('sinfoNodeVersion', info.nodeVersion || '--');
          this._setTextIfExists('sinfoAppVersion', info.version || '--');
          // Verbindungs-Info Box
          const ip = info.ip || '--';
          const port = info.port || 3001;
          const ipEl = document.getElementById('sinfoLocalIp');
          const urlEl = document.getElementById('sinfoFrontendUrl');
          if (ipEl) ipEl.textContent = ip;
          if (urlEl) urlEl.textContent = `http://${ip}:${port}`;
        }

        // System-Stats
        if (systemStats.status === 'fulfilled' && systemStats.value) {
          this._updateServerInfoStats(systemStats.value);
        }

        // Health
        if (healthResult.status === 'fulfilled') {
          const h = healthResult.value;
          this._setTextIfExists('sinfoApiStatus', h.ok ? '✅ Online' : '❌ Fehler');
          this._setTextIfExists('sinfoDbStatus', h.dbOk ? '✅ Verbunden' : '❌ Getrennt');
          this._setTextIfExists('sinfoResponseTime', h.responseTime ? `${h.responseTime}ms` : '--');
          this._setTextIfExists('sinfoServerUrl', h.url || '--');
        }

        // Ollama-Status
        const ollamaEl = document.getElementById('sinfoOllamaStatus');
        if (ollamaEl) {
          if (ollamaResult.status === 'fulfilled' && ollamaResult.value) {
            const o = ollamaResult.value;
            if (o.success) {
              const model = o.konfiguriertes_modell || o.model || '';
              ollamaEl.innerHTML = `<span style="color:#4caf50;font-size:1.1em">&#9679;</span> Läuft${model ? ` <span style="color:#777;font-size:0.88em">(${model})</span>` : ''}`;
            } else {
              ollamaEl.innerHTML = `<span style="color:#f44336;font-size:1.1em">&#9679;</span> Nicht erreichbar`;
            }
          } else {
            ollamaEl.innerHTML = `<span style="color:#f44336;font-size:1.1em">&#9679;</span> Nicht erreichbar`;
          }
        }

        // Refresh-Button binden
        const refreshBtn = document.getElementById('sinfoRefreshBtn');
        if (refreshBtn && !refreshBtn.dataset.bound) {
          refreshBtn.dataset.bound = 'true';
          refreshBtn.addEventListener('click', () => this.loadServerInfoTab());
        }

        // Update-Button binden
        const updateBtn = document.getElementById('triggerUpdateBtn');
        if (updateBtn && !updateBtn.dataset.bound) {
          updateBtn.dataset.bound = 'true';
          updateBtn.addEventListener('click', () => this._triggerServerUpdate());
        }

        // Nur-Neustart-Button binden
        const restartBtn = document.getElementById('triggerRestartBtn');
        if (restartBtn && !restartBtn.dataset.bound) {
          restartBtn.dataset.bound = 'true';
          restartBtn.addEventListener('click', () => this._triggerServerRestart());
        }

        // Build-Frontend-Button binden
        const buildBtn = document.getElementById('triggerBuildFrontendBtn');
        if (buildBtn && !buildBtn.dataset.bound) {
          buildBtn.dataset.bound = 'true';
          buildBtn.addEventListener('click', () => this._buildFrontend());
        }

        // Shutdown-Button binden
        const shutdownBtn = document.getElementById('triggerShutdownBtn');
        if (shutdownBtn && !shutdownBtn.dataset.bound) {
          shutdownBtn.dataset.bound = 'true';
          shutdownBtn.addEventListener('click', () => this._triggerServerShutdown());
        }

        // Update-Status prüfen
        window._checkUpdateStatus = () => this._checkUpdateStatus();
        this._checkUpdateStatus();

        // Auto-Refresh starten (alle 15s während Tab aktiv)
        this._startServerInfoAutoRefresh();

      } catch (error) {
        console.warn('Server-Info konnte nicht geladen werden:', error);
      }
    },

    _updateServerInfoStats(stats) {
      // CPU
      const cpuPct = parseFloat(stats.cpuUsage) || 0;
      this._setTextIfExists('sinfoCpuValue', `${stats.cpuUsage}%`);
      const cpuBar = document.getElementById('sinfoCpuBar');
      if (cpuBar) {
        cpuBar.style.width = `${cpuPct}%`;
        cpuBar.className = `server-info-progress-fill ${this.getStatBarClass(cpuPct)}`;
      }

      // RAM
      const memPct = parseFloat(stats.memoryUsage) || 0;
      this._setTextIfExists('sinfoMemValue', `${stats.memoryUsage}%`);
      this._setTextIfExists('sinfoMemDetail', `${stats.memoryUsed} / ${stats.memoryTotal} GB belegt`);
      const memBar = document.getElementById('sinfoMemBar');
      if (memBar) {
        memBar.style.width = `${memPct}%`;
        memBar.className = `server-info-progress-fill ${this.getStatBarClass(memPct)}`;
      }

      // Uptime
      this._setTextIfExists('sinfoUptimeValue', this.formatUptime(stats.uptime));
      this._setTextIfExists('sinfoUptimeDetail', `Gestartet: ${this._uptimeToStartDate(stats.uptime)}`);

      // Hostname
      this._setTextIfExists('sinfoHostname', stats.hostname || '--');

      // Letztes Update
      this._setTextIfExists('sinfoLastUpdate', `Letztes Update: ${new Date().toLocaleTimeString('de-DE')}`);
    },

    _uptimeToStartDate(seconds) {
      if (!seconds || seconds < 0) return '--';
      const start = new Date(Date.now() - seconds * 1000);
      return start.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    async _checkApiHealth() {
      const serverConfig = CONFIG.getServerConfig();
      const url = serverConfig.url + '/health';
      const startTime = performance.now();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const responseTime = Math.round(performance.now() - startTime);
        const data = await res.json();
        return {
          ok: data.status === 'ok',
          dbOk: data.database === 'connected',
          responseTime,
          url: serverConfig.url
        };
      } catch {
        return { ok: false, dbOk: false, responseTime: null, url: serverConfig.url };
      }
    },

    _startServerInfoAutoRefresh() {
      // Stoppe vorherigen Timer
      if (this._serverInfoRefreshInterval) {
        clearInterval(this._serverInfoRefreshInterval);
      }
      // Nur aktualisieren wenn der Tab sichtbar ist
      this._serverInfoRefreshInterval = setInterval(async () => {
        const tab = document.getElementById('settingsServerInfo');
        if (tab && tab.style.display !== 'none') {
          try {
            const stats = await ApiService.get('/system-stats');
            if (stats) this._updateServerInfoStats(stats);
          } catch (e) { /* silent */ }
        } else {
          clearInterval(this._serverInfoRefreshInterval);
          this._serverInfoRefreshInterval = null;
        }
      }, 15000);
    },

    async updateServerStats() {
      try {
        const stats = await ApiService.get('/system-stats');
        if (!stats) return;

        // CPU
        const cpuValue = document.getElementById('serverCpuValue');
        const cpuBar = document.getElementById('serverCpuBar');
        if (cpuValue) cpuValue.textContent = `${stats.cpuUsage}%`;
        if (cpuBar) {
          cpuBar.style.width = `${stats.cpuUsage}%`;
          cpuBar.className = `server-stat-fill ${this.getStatBarClass(stats.cpuUsage)}`;
        }

        // RAM
        const memValue = document.getElementById('serverMemValue');
        const memBar = document.getElementById('serverMemBar');
        if (memValue) memValue.textContent = `${stats.memoryUsed} / ${stats.memoryTotal} GB`;
        if (memBar) {
          const memPct = parseFloat(stats.memoryUsage);
          memBar.style.width = `${memPct}%`;
          memBar.className = `server-stat-fill ${this.getStatBarClass(memPct)}`;
        }

        // Uptime
        const uptimeValue = document.getElementById('serverUptimeValue');
        if (uptimeValue) uptimeValue.textContent = this.formatUptime(stats.uptime);
        const hostnameEl = document.getElementById('serverHostname');
        if (hostnameEl) hostnameEl.textContent = stats.hostname || '';

        // Node.js
        const nodeValue = document.getElementById('serverNodeValue');
        if (nodeValue) nodeValue.textContent = stats.nodeVersion || '--';
        const platformInfo = document.getElementById('serverPlatformInfo');
        if (platformInfo) platformInfo.textContent = `${stats.platform || ''} (${stats.hostname || ''})`;
      } catch (error) {
        console.warn('Server-Stats konnten nicht geladen werden:', error);
      }
    },

    getStatBarClass(pct) {
      if (pct >= 90) return 'stat-critical';
      if (pct >= 70) return 'stat-warning';
      return 'stat-ok';
    },

    formatUptime(seconds) {
      if (!seconds || seconds < 0) return '--';
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      if (days > 0) return `${days}d ${hours}h ${mins}m`;
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    },
  });
}
