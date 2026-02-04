/**
 * Migration Progress Monitor
 * 
 * Zeigt Migrations-Fortschritt mit:
 * - Progress-Bar
 * - Status-Text
 * - Timeout-Countdown
 * - Echtzeit-Updates via WebSocket
 */

class MigrationProgressMonitor {
  constructor() {
    this.modal = null;
    this.progressBar = null;
    this.statusText = null;
    this.timeoutText = null;
    this.isVisible = false;
    this.currentMigration = null;
    
    this.initModal();
    this.initWebSocketListener();
  }

  /**
   * Erstellt das Modal-HTML
   */
  initModal() {
    // Modal Container
    this.modal = document.createElement('div');
    this.modal.id = 'migrationProgressModal';
    this.modal.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 99999;
      justify-content: center;
      align-items: center;
    `;

    // Modal Content
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 30px;
      min-width: 400px;
      max-width: 600px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      animation: fadeInScale 0.3s ease-out;
    `;

    content.innerHTML = `
      <style>
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .migration-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #2196f3;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }
      </style>
      
      <div class="migration-spinner"></div>
      
      <h2 style="margin: 0 0 20px 0; color: #333; text-align: center; font-size: 24px;">
        🔄 Datenbank-Migration läuft
      </h2>
      
      <p id="migrationStatusText" style="color: #666; margin-bottom: 20px; text-align: center; min-height: 20px;">
        Migration wird vorbereitet...
      </p>
      
      <div style="background: #f5f5f5; border-radius: 8px; overflow: hidden; height: 30px; margin-bottom: 15px;">
        <div id="migrationProgressBar" style="
          height: 100%;
          background: linear-gradient(90deg, #2196f3, #4caf50);
          width: 0%;
          transition: width 0.3s ease-out;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
        ">0%</div>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; color: #666; font-size: 13px;">
        <span>⏱️ Verbleibende Zeit:</span>
        <span id="migrationTimeoutText" style="font-weight: bold;">-- Sekunden</span>
      </div>
      
      <p style="color: #999; font-size: 12px; margin-top: 20px; text-align: center;">
        Bitte nicht schließen oder aktualisieren
      </p>
    `;

    this.modal.appendChild(content);
    document.body.appendChild(this.modal);

    // Referenzen speichern
    this.statusText = document.getElementById('migrationStatusText');
    this.progressBar = document.getElementById('migrationProgressBar');
    this.timeoutText = document.getElementById('migrationTimeoutText');
  }

  /**
   * Initialisiert WebSocket-Listener für Migration-Events
   */
  initWebSocketListener() {
    // Warte auf WebSocket-Initialisierung
    const checkWebSocket = () => {
      if (window.ws && window.ws.readyState === WebSocket.OPEN) {
        this.attachWebSocketHandler();
      } else {
        setTimeout(checkWebSocket, 500);
      }
    };
    checkWebSocket();
  }

  /**
   * Hängt Handler an bestehende WebSocket-Verbindung
   */
  attachWebSocketHandler() {
    const originalOnMessage = window.ws.onmessage;
    
    window.ws.onmessage = (event) => {
      // Rufe original Handler auf
      if (originalOnMessage) {
        originalOnMessage.call(window.ws, event);
      }
      
      // Verarbeite Migration-Events
      try {
        const data = JSON.parse(event.data);
        
        switch(data.event) {
          case 'migration_progress':
            this.handleMigrationProgress(data.data);
            break;
          case 'operation_progress':
            if (data.data.name && data.data.name.startsWith('Migration')) {
              this.handleOperationProgress(data.data);
            }
            break;
          case 'operation_timeout_warning':
            this.handleTimeoutWarning(data.data);
            break;
          case 'migration_failed':
            this.handleMigrationFailed(data.data);
            break;
          case 'migrations_completed':
            this.handleMigrationsCompleted(data.data);
            break;
        }
      } catch (error) {
        console.warn('Fehler beim Parsen der WebSocket-Message:', error);
      }
    };
  }

  /**
   * Zeigt Modal an
   */
  show() {
    if (!this.isVisible) {
      this.modal.style.display = 'flex';
      this.isVisible = true;
      this.updateProgress(0, 'Migration startet...');
    }
  }

  /**
   * Versteckt Modal
   */
  hide() {
    if (this.isVisible) {
      this.modal.style.display = 'none';
      this.isVisible = false;
      this.currentMigration = null;
    }
  }

  /**
   * Aktualisiert Progress-Bar und Status
   */
  updateProgress(progress, status, remainingSeconds = null) {
    if (this.progressBar) {
      const progressPercent = Math.min(100, Math.max(0, progress));
      this.progressBar.style.width = `${progressPercent}%`;
      this.progressBar.textContent = `${Math.round(progressPercent)}%`;
    }
    
    if (this.statusText && status) {
      this.statusText.textContent = status;
    }
    
    if (this.timeoutText && remainingSeconds !== null) {
      this.timeoutText.textContent = `${remainingSeconds} Sekunden`;
      
      // Warnung bei wenig verbleibender Zeit
      if (remainingSeconds < 60) {
        this.timeoutText.style.color = '#f44336'; // Rot
      } else if (remainingSeconds < 120) {
        this.timeoutText.style.color = '#ff9800'; // Orange
      } else {
        this.timeoutText.style.color = '#666'; // Normal
      }
    }
  }

  /**
   * Handler für migration_progress Event
   */
  handleMigrationProgress(data) {
    if (!this.isVisible) {
      this.show();
    }
    
    const status = data.step || `Migration Version ${data.version}...`;
    this.updateProgress(data.progress, status);
  }

  /**
   * Handler für operation_progress Event
   */
  handleOperationProgress(data) {
    if (!this.isVisible && data.status === 'running') {
      this.show();
    }
    
    const status = data.currentStep || data.name;
    const remainingSeconds = data.remainingSeconds;
    
    this.updateProgress(data.progress, status, remainingSeconds);
  }

  /**
   * Handler für Timeout-Warning
   */
  handleTimeoutWarning(data) {
    const message = `⚠️ Migration nähert sich Timeout (noch ${data.remainingSeconds}s)`;
    this.updateProgress(data.progress, message, data.remainingSeconds);
    
    // Zeige zusätzlich Toast-Warnung
    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(message, 'warning');
    }
  }

  /**
   * Handler für Migration-Fehler
   */
  handleMigrationFailed(data) {
    this.updateProgress(data.progress || 0, `❌ Migration ${data.version} fehlgeschlagen: ${data.error}`);
    
    // Zeige Toast-Fehler
    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(`Migration fehlgeschlagen: ${data.error}`, 'error');
    }
    
    // Verstecke Modal nach 5 Sekunden
    setTimeout(() => this.hide(), 5000);
  }

  /**
   * Handler für erfolgreiche Migrations-Completion
   */
  handleMigrationsCompleted(data) {
    const message = data.dryRun 
      ? `✅ Dry-Run abgeschlossen: ${data.migrationsRun} Migration(en) getestet`
      : `✅ ${data.migrationsRun} Migration(en) erfolgreich abgeschlossen`;
    
    this.updateProgress(100, message);
    
    // Zeige Toast-Erfolg
    if (window.app && typeof window.app.showToast === 'function') {
      window.app.showToast(message, 'success');
    }
    
    // Verstecke Modal nach 3 Sekunden
    setTimeout(() => this.hide(), 3000);
  }
}

// Globale Instanz erstellen
window.migrationMonitor = new MigrationProgressMonitor();

// Export für Module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MigrationProgressMonitor;
}
