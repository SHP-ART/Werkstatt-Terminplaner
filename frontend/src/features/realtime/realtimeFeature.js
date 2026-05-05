export function installRealtimeFeature(AppClass) {
  Object.assign(AppClass.prototype, {
    setupWebSocket() {
      if (!this.realtimeEnabled) {
        console.log('Echtzeit-Updates deaktiviert. WebSocket wird nicht gestartet.');
        return;
      }

      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const serverConfig = CONFIG.getServerConfig();
      if (!serverConfig || !serverConfig.ip || !serverConfig.port) {
          console.error("Server-Konfiguration nicht gefunden. WebSocket kann nicht gestartet werden.");
          return;
      }
      
      const wsUrl = `ws://${serverConfig.ip}:${serverConfig.port}`;
      console.log(`Connecting WebSocket to ${wsUrl}`);

      const connect = () => {
          if (!this.realtimeEnabled) {
              return;
          }
          const ws = new WebSocket(wsUrl);
          this.ws = ws;

          ws.addEventListener('open', () => {
              if (!this.realtimeEnabled) {
                ws.close(1000, 'Realtime disabled');
                return;
              }
              console.log('WebSocket-Verbindung hergestellt.');
          });

          ws.addEventListener('message', (event) => {
              if (!this.realtimeEnabled) return;
              this.handleWebSocketMessage(event);
          });

          ws.addEventListener('close', (event) => {
              console.log(`WebSocket-Verbindung getrennt. Code: ${event.code}, Grund: '${event.reason}'. Erneuter Verbindungsversuch in 5 Sekunden...`);
              if (this.ws === ws) {
                this.ws = null;
              }
              if (this.realtimeEnabled) {
                this.clearWebSocketReconnect();
                this.wsReconnectTimer = setTimeout(connect, 5000);
              }
          });

          ws.addEventListener('error', (err) => {
              console.error('WebSocket-Fehler:', err);
          });
      }

      this.clearWebSocketReconnect();
      connect();
    },

    clearWebSocketReconnect() {
      if (this.wsReconnectTimer) {
        clearTimeout(this.wsReconnectTimer);
        this.wsReconnectTimer = null;
      }
    },

    stopWebSocket() {
      this.clearWebSocketReconnect();
      if (this.ws) {
        try {
          this.ws.close(1000, 'Realtime disabled');
        } catch (err) {
          // ignore close errors
        }
        this.ws = null;
      }
    },

    handleWebSocketMessage(event) {
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch (err) {
        return;
      }

      if (!message || !message.event) return;

      const eventName = message.event;
      const data = message.data || {};

      if (eventName.startsWith('kunde.')) {
        this.handleRealtimeKundenEvent(eventName, data);
        return;
      }

      if (eventName.startsWith('termin.')) {
        this.handleRealtimeTerminEvent(eventName, data);
      }

      if (eventName === 'stempel.updated') {
        if (document.getElementById('zeitstempelung')?.classList.contains('active')) {
          this.loadZeitstempelung();
        }
      }

      if (eventName === 'tagesstempel.auto_abstempelung') {
        if (document.getElementById('zeitstempelung')?.classList.contains('active')) {
          this.loadZeitstempelung();
        }
      }

      if (eventName === 'tagesstempel.kommen' || eventName === 'tagesstempel.gehen') {
        if (document.getElementById('zeitstempelung')?.classList.contains('active')) {
          this.loadZeitstempelung();
        }
      }

      if (eventName === 'tagesstempel.nachgestempelt' || eventName === 'tagesstempel.nachgefragt') {
        const ztPanelZeitkonto = document.getElementById('ztPanelZeitkonto');
        if (ztPanelZeitkonto && ztPanelZeitkonto.style.display !== 'none' && typeof this.loadZeitkonto === 'function') {
          this.loadZeitkonto();
        }
        if (document.getElementById('zeitstempelung')?.classList.contains('active')) {
          this.loadZeitstempelung();
        }
      }
    },

    handleRealtimeKundenEvent(eventName, data) {
      this.loadKunden();

      if (this.currentTab === 'dashboard') {
        this.loadDashboard();
      }
    },

    handleRealtimeTerminEvent(eventName, data) {
      const activeTab = this.currentTab;

      this.loadTermineCache();

      if (activeTab === 'dashboard') {
        this.loadDashboard();
      }

      if (activeTab === 'heute') {
        this.loadHeuteTermine();
      }

      if (activeTab === 'termine') {
        this.loadTerminAuslastungAnzeige();

        const activeSubTab = document.querySelector('#termine .sub-tab-button.active');
        const subTabName = activeSubTab ? activeSubTab.dataset.subtab : null;

        if (subTabName === 'terminBearbeiten') {
          this.loadEditTermine();
        }
        if (subTabName === 'wartendeAktionen') {
          this.loadWartendeAktionen();
        }
        if (subTabName === 'internerTermin') {
          this.loadInterneTermineImSubTab();
        }
      }

      if (activeTab === 'zeitverwaltung') {
        this.loadTermine();
        this.loadTermineZeiten();
      }

      if (activeTab === 'auslastung') {
        const selectedDatum = document.getElementById('auslastungDatum')?.value;
        if (!selectedDatum || this.eventTouchesDatum(data, selectedDatum)) {
          this.loadAuslastung();
        }
      }

      if (activeTab === 'auslastung-dragdrop') {
        const selectedDatum = document.getElementById('auslastungDragDropDatum')?.value;
        if (!selectedDatum || this.eventTouchesDatum(data, selectedDatum)) {
          this.loadAuslastungDragDrop();
        }
      }

      if (activeTab === 'papierkorb' && (eventName === 'termin.deleted' || eventName === 'termin.restored')) {
        this.loadPapierkorb();
      }
    },

    eventTouchesDatum(data, datum) {
      if (!datum) return true;
      return data.datum === datum || data.oldDatum === datum || data.newDatum === datum;
    },
  });
}
